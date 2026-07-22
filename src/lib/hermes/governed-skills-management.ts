import { createHash, randomBytes } from "node:crypto";
import { sanitizeHermesText } from "./control-center-sanitizer";
import { HermesSkillsAdapterError, type HermesSkillsAdapter } from "./skills-adapter";
import type {
  HermesManagedSkill,
  HermesCanonicalSkillsState,
  HermesExactSkillCandidate,
  HermesSkillAction,
  HermesSkillExecutionAuthority,
  HermesSkillOperation,
  HermesSkillsManagementPreview,
  HermesSkillsManagementResult,
  HermesSkillsSnapshot,
} from "./skills-management-types";

const DEFAULT_PREVIEW_TTL_MS = 120_000;
const DEFAULT_RECEIPT_RETENTION_MS = 30 * 60_000;
const DEFAULT_CANONICAL_FRESHNESS_MS = 60_000;
const DEFAULT_MAX_PREVIEWS = 100;
const DEFAULT_MAX_RECEIPTS = 200;

type ServiceOptions = {
  previewTtlMs?: number;
  receiptRetentionMs?: number;
  canonicalFreshnessMs?: number;
  maxPreviews?: number;
  maxReceipts?: number;
  opaqueToken?: () => string;
};

type StoredPreview = {
  public: HermesSkillsManagementPreview;
  actorScope: string;
  stateFingerprint: string;
  authority: HermesSkillExecutionAuthority;
  candidate: HermesExactSkillCandidate | null;
  createdAt: number;
  lastAccessAt: number;
};

type Receipt = {
  lifecycle: "pending" | "completed";
  previewKey: string;
  promise: Promise<HermesSkillsManagementResult>;
  result: HermesSkillsManagementResult | null;
  createdAt: number;
  completedAt: number | null;
  lastAccessAt: number;
};

type CanonicalAssessment =
  | { ok: true }
  | { ok: false; status: "blocked_no_action" | "failed_before_dispatch"; summary: string };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeReason(value: string): string {
  const reason = sanitizeHermesText(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim(), 240);
  if (reason.length < 8) throw new HermesSkillsManagementError("invalid_request", "A specific reason of at least 8 characters is required.");
  return reason;
}

function fingerprint(action: HermesSkillAction, skill: HermesManagedSkill): string {
  return hash(JSON.stringify({
    action,
    identity: skill.identity,
    name: skill.name,
    installed: skill.installed,
    enabled: skill.enabled,
    version: skill.version,
    source: skill.source,
    provenance: skill.provenance,
    hubIdentifier: skill.hubIdentifier,
    profile: skill.profile,
    updateAvailable: skill.updateAvailable,
    supportedActions: [...skill.supportedActions].sort(),
  }));
}

function desiredState(action: HermesSkillAction): string {
  if (action === "install") return "Installed and verified in Hermes";
  if (action === "enable") return "Installed and enabled in Hermes";
  if (action === "disable") return "Installed and disabled in Hermes";
  if (action === "update") return "Update remains audit-only for this Hermes contract";
  return "The exact hub-installed skill is absent from Hermes";
}

function consequence(action: HermesSkillAction, name: string): string {
  if (action === "install") return `Hermes will scan and install ${name} for the selected profile.`;
  if (action === "enable") return `Hermes will allow ${name} to load for new work in the selected profile.`;
  if (action === "disable") return `Hermes will stop loading ${name} for new work in the selected profile.`;
  if (action === "update") return `Hermes update remains audit-only until exact target readback is available.`;
  return `Hermes will remove the exact hub-installed copy of ${name} from the selected profile.`;
}

function reversibility(action: HermesSkillAction): string {
  if (action === "install") return "Reversible by a separately confirmed removal while the exact hub identity remains available.";
  if (action === "enable") return "Reversible by a separately confirmed disable action.";
  if (action === "disable") return "Reversible by a separately confirmed enable action.";
  if (action === "remove") return "Reversible only by a new reviewed installation from the same exact Hermes hub identity.";
  return "Update is not operational in this audited contract.";
}

function confirmation(action: HermesSkillAction, name: string, profile: string): string {
  return `${action.toUpperCase()} SKILL ${name} IN ${profile}`;
}

function hubIdentifier(action: HermesSkillAction, identity: string, profile: string): string | null {
  if (action === "install") return identity;
  const prefix = `${profile}:hub:`;
  return identity.startsWith(prefix) ? identity.slice(prefix.length) : null;
}

function candidateTarget(candidate: HermesExactSkillCandidate, profile: string): HermesManagedSkill {
  return {
    identity: candidate.identifier,
    name: candidate.name,
    category: null,
    installed: false,
    enabled: null,
    version: null,
    source: candidate.source,
    provenance: "hub",
    hubIdentifier: candidate.identifier,
    profile,
    updateAvailable: null,
    observedAt: candidate.observedAt,
    supportedActions: ["install"],
  };
}

function candidateAllowsSecretSourceSkip(candidate: HermesExactSkillCandidate | null): boolean {
  return Boolean(
    candidate
    && candidate.identifier.startsWith("official/")
    && candidate.source === "official"
    && (candidate.trust === "builtin" || candidate.trust === "official")
    && candidate.prerequisiteClassification === "none_declared"
    && candidate.installPolicy === "allow"
    && candidate.scanVerdict === "safe"
    && candidate.findingCount === 0,
  );
}

function canonicalTarget(state: HermesCanonicalSkillsState, identity: string, candidate: HermesExactSkillCandidate | null): HermesManagedSkill | null {
  if (!candidate) return state.installed.find((skill) => skill.identity === identity) ?? null;
  const matches = state.installed.filter((skill) => skill.profile === state.profile && skill.name === candidate.name && skill.provenance === "hub");
  if (matches.length !== 1 || state.duplicateNames.includes(candidate.name)) return null;
  const match = matches[0];
  if (match.hubIdentifier && match.hubIdentifier !== candidate.identifier) return null;
  return { ...match, identity: `${state.profile}:hub:${candidate.identifier}`, hubIdentifier: candidate.identifier, source: candidate.source };
}

export class HermesSkillsManagementError extends Error {
  constructor(
    readonly code: "invalid_request" | "preview_expired" | "target_mismatch" | "not_confirmed" | "unsupported_action" | "stale_target" | "fixture_forbidden",
    message: string,
  ) {
    super(message);
    this.name = "HermesSkillsManagementError";
  }
}

export class HermesSkillsManagementService {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly previewTtlMs: number;
  private readonly receiptRetentionMs: number;
  private readonly canonicalFreshnessMs: number;
  private readonly maxPreviews: number;
  private readonly maxReceipts: number;
  private readonly opaqueToken: () => string;

  constructor(
    private readonly adapter: HermesSkillsAdapter,
    private readonly now: () => Date = () => new Date(),
    options: ServiceOptions = {},
  ) {
    this.previewTtlMs = options.previewTtlMs ?? DEFAULT_PREVIEW_TTL_MS;
    this.receiptRetentionMs = options.receiptRetentionMs ?? DEFAULT_RECEIPT_RETENTION_MS;
    this.canonicalFreshnessMs = options.canonicalFreshnessMs ?? DEFAULT_CANONICAL_FRESHNESS_MS;
    this.maxPreviews = options.maxPreviews ?? DEFAULT_MAX_PREVIEWS;
    this.maxReceipts = options.maxReceipts ?? DEFAULT_MAX_RECEIPTS;
    this.opaqueToken = options.opaqueToken ?? (() => randomBytes(16).toString("hex"));
  }

  async snapshot(query = ""): Promise<HermesSkillsSnapshot> {
    return this.adapter.discoverCatalog(query);
  }

  async prepare(input: { action: HermesSkillAction; targetIdentity: string; reason: string; actorIdentity: string; query?: string }): Promise<HermesSkillsManagementPreview> {
    this.cleanup();
    const profile = this.adapter.configuredProfile();
    const identifier = hubIdentifier(input.action, input.targetIdentity, profile);
    const candidate = identifier ? await this.adapter.inspectExactCandidate(identifier, profile) : null;
    if (input.action === "install" && (!candidate || candidate.identifier !== input.targetIdentity)) {
      throw new HermesSkillsManagementError("target_mismatch", "Hermes did not preserve the exact prepared Hub identifier.");
    }
    if (candidate && (candidate.installPolicy !== "allow" || candidate.scanVerdict !== "safe" || candidate.findingCount !== 0)) {
      throw new HermesSkillsManagementError("stale_target", "The exact Hermes Skills Hub candidate does not retain valid trust and scan authority.");
    }
    const canonical = await this.adapter.readCanonicalInstalledState(profile);
    const assessment = this.assessCanonical(canonical, profile);
    if (!assessment.ok) throw new HermesSkillsManagementError("stale_target", assessment.summary);
    const target = input.action === "install" && candidate
      ? candidateTarget(candidate, profile)
      : canonicalTarget(canonical, input.targetIdentity, candidate);
    if (!target) throw new HermesSkillsManagementError("target_mismatch", "Hermes no longer reports the selected exact skill target.");
    if (canonical.profile !== target.profile) throw new HermesSkillsManagementError("target_mismatch", "The canonical Hermes profile does not match the selected target.");
    if (canonical.duplicateIdentities.includes(target.identity) || canonical.duplicateNames.includes(target.name)) throw new HermesSkillsManagementError("stale_target", "Hermes reported a duplicate or ambiguous canonical skill identity. No action can be prepared safely.");
    if (input.action === "install" && canonical.installed.some((skill) => skill.name === target.name)) throw new HermesSkillsManagementError("stale_target", "The exact install target is no longer absent from canonical Hermes state.");
    if (!target.supportedActions.includes(input.action)) throw new HermesSkillsManagementError("unsupported_action", "The installed Hermes contract does not support this action for the selected skill.");
    if ((input.action === "install" || input.action === "remove") && !target.hubIdentifier) {
      throw new HermesSkillsManagementError("unsupported_action", "The exact Hermes hub identifier is required for this action.");
    }
    const authority = await this.adapter.inspectExecutionAuthority(input.action, profile);
    const reason = safeReason(input.reason);
    const stateFingerprint = fingerprint(input.action, target);
    const actorScope = hash(input.actorIdentity);
    const previewId = this.uniqueIdentity("hermes-preview");
    const requestIdentity = this.uniqueIdentity("hermes-request");
    const createdAt = this.now().getTime();
    const preview: HermesSkillsManagementPreview = {
      previewId,
      requestIdentity,
      action: input.action,
      targetIdentity: target.identity,
      targetName: target.name,
      currentState: {
        identity: target.identity,
        name: target.name,
        installed: target.installed,
        enabled: target.enabled,
        version: target.version,
        source: target.source,
        provenance: target.provenance,
        hubIdentifier: target.hubIdentifier,
        profile: target.profile,
        updateAvailable: target.updateAvailable,
      },
      targetState: desiredState(input.action),
      profile: target.profile,
      expectedConsequence: consequence(input.action, target.name),
      reversibility: reversibility(input.action),
      sourceEvidence: canonical.interface,
      evidenceObservedAt: canonical.observedAt,
      expiresAt: new Date(createdAt + this.previewTtlMs).toISOString(),
      confirmationPhrase: confirmation(input.action, target.name, target.profile),
      reason,
      phase: "prepared",
    };
    const key = this.previewKey(actorScope, previewId);
    this.previews.set(key, { public: preview, actorScope, stateFingerprint, authority, candidate, createdAt, lastAccessAt: createdAt });
    this.cleanup();
    return preview;
  }

  async commit(input: { previewId: string; targetIdentity: string; confirmationPhrase: string; actorIdentity: string }): Promise<HermesSkillsManagementResult> {
    this.cleanup();
    const actorScope = hash(input.actorIdentity);
    const previewKey = this.previewKey(actorScope, input.previewId);
    const stored = this.previews.get(previewKey);
    if (!stored) throw new HermesSkillsManagementError("preview_expired", "The prepared operation is unavailable. Prepare it again.");
    if (stored.public.targetIdentity !== input.targetIdentity) throw new HermesSkillsManagementError("target_mismatch", "The confirmed skill does not match the prepared target.");
    if (stored.public.confirmationPhrase !== input.confirmationPhrase) throw new HermesSkillsManagementError("not_confirmed", "Type the exact server-issued confirmation phrase.");
    stored.lastAccessAt = this.now().getTime();
    const receiptKey = this.receiptKey(stored);
    const prior = this.receipts.get(receiptKey);
    if (prior) {
      prior.lastAccessAt = stored.lastAccessAt;
      return prior.promise;
    }
    if (Date.parse(stored.public.expiresAt) < this.now().getTime()) throw new HermesSkillsManagementError("preview_expired", "The prepared state is stale. Prepare it again.");

    const receipt: Receipt = {
      lifecycle: "pending",
      previewKey,
      promise: Promise.resolve(null as never),
      result: null,
      createdAt: stored.lastAccessAt,
      completedAt: null,
      lastAccessAt: stored.lastAccessAt,
    };
    receipt.promise = this.execute(stored).then((result) => {
      receipt.lifecycle = "completed";
      receipt.result = result;
      receipt.completedAt = this.now().getTime();
      receipt.lastAccessAt = receipt.completedAt;
      this.cleanup();
      return result;
    });
    this.receipts.set(receiptKey, receipt);
    this.cleanup();
    return receipt.promise;
  }

  async recheck(input: { previewId: string; targetIdentity: string; actorIdentity: string }): Promise<HermesSkillsManagementResult> {
    this.cleanup();
    const actorScope = hash(input.actorIdentity);
    const stored = this.previews.get(this.previewKey(actorScope, input.previewId));
    if (!stored || stored.public.targetIdentity !== input.targetIdentity) {
      throw new HermesSkillsManagementError("target_mismatch", "The reconciliation target does not match this authenticated session.");
    }
    const receipt = this.receipts.get(this.receiptKey(stored));
    if (!receipt) throw new HermesSkillsManagementError("invalid_request", "No dispatched operation is available to reconcile.");
    const prior = await receipt.promise;
    if (prior.status !== "outcome_unknown") return prior;
    const verification = await this.verify(stored);
    const result = verification.verified
      ? this.result(stored, "verified_success", "verified", "Hermes now verifies the exact requested skill state. No mutation retry was attempted.", true, prior.mutationResponseReceived, verification.observedAt)
      : { ...prior, summary: "Hermes still does not verify the exact requested skill state. No mutation retry was attempted.", verificationObservedAt: verification.observedAt, completedAt: this.now().toISOString() };
    receipt.lifecycle = "completed";
    receipt.result = result;
    receipt.completedAt = this.now().getTime();
    receipt.lastAccessAt = receipt.completedAt;
    receipt.promise = Promise.resolve(result);
    return result;
  }

  private uniqueIdentity(prefix: "hermes-preview" | "hermes-request"): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const token = this.opaqueToken();
      if (!/^[a-f0-9]{32}$/i.test(token)) throw new HermesSkillsManagementError("invalid_request", "The server could not create a secure operation identity.");
      const identity = `${prefix}-${token.toLowerCase()}`;
      const inPreviews = [...this.previews.values()].some((preview) => preview.public.previewId === identity || preview.public.requestIdentity === identity);
      const inReceipts = [...this.receipts.keys()].some((key) => key.endsWith(`:${identity}`));
      if (!inPreviews && !inReceipts) return identity;
    }
    throw new HermesSkillsManagementError("invalid_request", "The server could not create a unique operation identity.");
  }

  private previewKey(actorScope: string, previewId: string): string {
    return `${actorScope}:${previewId}`;
  }

  private receiptKey(stored: StoredPreview): string {
    return `${stored.actorScope}:${stored.public.requestIdentity}`;
  }

  private result(stored: StoredPreview, status: HermesSkillsManagementResult["status"], phase: HermesSkillsManagementResult["phase"], summary: string, attempted: boolean, responseReceived: boolean, verifiedAt: string | null): HermesSkillsManagementResult {
    return {
      requestIdentity: stored.public.requestIdentity,
      action: stored.public.action,
      targetIdentity: stored.public.targetIdentity,
      targetName: stored.public.targetName,
      profile: stored.public.profile,
      status,
      phase,
      summary,
      mutationAttempted: attempted,
      mutationResponseReceived: responseReceived,
      retryAttempted: false,
      verificationObservedAt: verifiedAt,
      completedAt: this.now().toISOString(),
    };
  }

  private assessCanonical(snapshot: HermesCanonicalSkillsState, expectedProfile: string): CanonicalAssessment {
    if (snapshot.profile !== expectedProfile) return { ok: false, status: "blocked_no_action", summary: "Hermes reported a different canonical profile. No mutation was dispatched." };
    if (snapshot.sourceState !== "success" && snapshot.sourceState !== "connected_empty") {
      return { ok: false, status: "failed_before_dispatch", summary: `Canonical Hermes Skills state is ${snapshot.sourceState}. No mutation was dispatched.` };
    }
    const observedAt = Date.parse(snapshot.observedAt);
    const now = this.now().getTime();
    if (!Number.isFinite(observedAt)) return { ok: false, status: "failed_before_dispatch", summary: "Canonical Hermes Skills state has a malformed observation time. No mutation was dispatched." };
    if (observedAt > now + 5_000) return { ok: false, status: "failed_before_dispatch", summary: "Canonical Hermes Skills state has a future observation time. No mutation was dispatched." };
    if (now - observedAt > this.canonicalFreshnessMs) return { ok: false, status: "failed_before_dispatch", summary: "Canonical Hermes Skills state is stale. No mutation was dispatched." };
    return { ok: true };
  }

  private async execute(stored: StoredPreview): Promise<HermesSkillsManagementResult> {
    let currentAuthority: HermesSkillExecutionAuthority;
    try {
      currentAuthority = await this.adapter.inspectExecutionAuthority(stored.public.action, stored.public.profile);
    } catch {
      return this.result(stored, "failed_before_dispatch", "precondition_check", "The audited Hermes execution authority is unavailable. No mutation was dispatched.", false, false, null);
    }
    if (currentAuthority.opaqueIdentity !== stored.authority.opaqueIdentity) {
      return this.result(stored, "blocked_no_action", "precondition_check", "The audited Hermes execution authority changed after preview. No mutation was dispatched.", false, false, null);
    }
    let candidate = stored.candidate;
    if (candidate) {
      try {
        candidate = await this.adapter.inspectExactCandidate(candidate.identifier, stored.public.profile);
      } catch {
        return this.result(stored, "failed_before_dispatch", "precondition_check", "Hermes could not revalidate the exact Skills Hub candidate. No mutation was dispatched.", false, false, null);
      }
      if (candidate.fingerprint !== stored.candidate?.fingerprint || candidate.installPolicy !== "allow" || candidate.scanVerdict !== "safe" || candidate.findingCount !== 0) {
        return this.result(stored, "blocked_no_action", "precondition_check", "The exact Skills Hub candidate trust or scan authority changed after preview. No mutation was dispatched.", false, false, null);
      }
    }
    let snapshot: HermesCanonicalSkillsState;
    try {
      snapshot = await this.adapter.readCanonicalInstalledState(stored.public.profile);
    } catch {
      return this.result(stored, "failed_before_dispatch", "precondition_check", "Hermes Agent Skills installed-state read did not complete. No mutation was dispatched.", false, false, null);
    }
    const assessment = this.assessCanonical(snapshot, stored.public.profile);
    if (!assessment.ok) return this.result(stored, assessment.status, "precondition_check", assessment.summary, false, false, null);
    if (snapshot.duplicateIdentities.includes(stored.public.targetIdentity) || snapshot.duplicateNames.includes(stored.public.targetName)) {
      return this.result(stored, "blocked_no_action", "precondition_check", "Hermes reported a duplicate or ambiguous canonical target. No mutation was dispatched.", false, false, null);
    }
    if (this.alreadyDesired(stored, snapshot)) {
      return this.result(stored, "verified_success", "verified", "Hermes already verifies the exact requested skill state. No mutation was dispatched.", false, false, snapshot.observedAt);
    }
    const current = stored.public.action === "install" ? null : canonicalTarget(snapshot, stored.public.currentState.identity, candidate);
    const installAbsent = stored.public.action === "install" && !snapshot.installed.some((skill) => skill.name === stored.public.targetName);
    if ((stored.public.action === "install" && !installAbsent) || (stored.public.action !== "install" && (!current || fingerprint(stored.public.action, current) !== stored.stateFingerprint))) {
      return this.result(stored, "blocked_no_action", "precondition_check", "Canonical Hermes skill state changed after preview. No mutation was dispatched.", false, false, null);
    }

    const operation: HermesSkillOperation = {
      action: stored.public.action,
      targetIdentity: stored.public.targetIdentity,
      targetName: stored.public.targetName,
      profile: stored.public.profile,
      reason: stored.public.reason,
      skipExternalSecretSources: candidateAllowsSecretSourceSkip(candidate),
    };
    let responseReceived = false;
    try {
      const response = await this.adapter.execute(operation, currentAuthority);
      responseReceived = response.responseReceived;
    } catch (error) {
      const dispatched = error instanceof HermesSkillsAdapterError && error.dispatched;
      if (!dispatched) return this.result(stored, "failed_before_dispatch", "precondition_check", "Hermes could not start the requested skill operation. No mutation was dispatched.", false, false, null);
      return this.result(stored, "outcome_unknown", "mutation_dispatch_attempted", "The Hermes operation was dispatched, but its outcome is unknown. Use read-only reconciliation; do not repeat the mutation.", true, error instanceof HermesSkillsAdapterError && error.responseReceived, null);
    }
    const verification = await this.verify(stored);
    return verification.verified
      ? this.result(stored, "verified_success", "verified", "Hermes readback verifies the exact requested skill state.", true, responseReceived, verification.observedAt)
      : this.result(stored, "outcome_unknown", "verification_attempted", "Hermes responded, but canonical readback did not verify the exact requested skill state. No retry was attempted.", true, responseReceived, verification.observedAt);
  }

  private alreadyDesired(stored: StoredPreview, snapshot: HermesCanonicalSkillsState): boolean {
    if (stored.public.action === "install") {
      const matches = snapshot.installed.filter((skill) => skill.profile === stored.public.profile && skill.name === stored.public.targetName);
      return matches.length === 1
        && matches[0].provenance === "hub"
        && (!matches[0].hubIdentifier || matches[0].hubIdentifier === stored.candidate?.identifier)
        && !snapshot.duplicateNames.includes(stored.public.targetName);
    }
    if (stored.public.action === "remove") {
      return !snapshot.installed.some((skill) =>
        skill.profile === stored.public.profile
        && skill.name === stored.public.targetName
        && skill.provenance === "hub"
      );
    }
    if (stored.public.action === "update") return false;
    const installed = canonicalTarget(snapshot, stored.public.currentState.identity, stored.candidate);
    return stored.public.action === "enable" ? installed?.enabled === true : installed?.enabled === false;
  }

  private async verify(stored: StoredPreview): Promise<{ verified: boolean; observedAt: string | null }> {
    try {
      const snapshot = await this.adapter.readCanonicalInstalledState(stored.public.profile);
      const assessment = this.assessCanonical(snapshot, stored.public.profile);
      if (!assessment.ok || snapshot.duplicateIdentities.includes(stored.public.targetIdentity) || snapshot.duplicateNames.includes(stored.public.targetName)) return { verified: false, observedAt: Number.isFinite(Date.parse(snapshot.observedAt)) ? snapshot.observedAt : null };
      return { verified: this.alreadyDesired(stored, snapshot), observedAt: snapshot.observedAt };
    } catch {
      return { verified: false, observedAt: null };
    }
  }

  private cleanup(): void {
    const now = this.now().getTime();
    const evictReceipt = (key: string, receipt: Receipt) => {
      if (receipt.lifecycle !== "completed") return;
      this.receipts.delete(key);
      this.previews.delete(receipt.previewKey);
    };

    for (const [key, receipt] of this.receipts) {
      if (receipt.lifecycle === "completed" && receipt.completedAt !== null && now - receipt.completedAt > this.receiptRetentionMs) evictReceipt(key, receipt);
    }

    const completedByAge = [...this.receipts.entries()]
      .filter(([, receipt]) => receipt.lifecycle === "completed")
      .sort((a, b) => (a[1].completedAt ?? a[1].createdAt) - (b[1].completedAt ?? b[1].createdAt));
    for (let index = 0; index < completedByAge.length - this.maxReceipts; index += 1) {
      const [key, receipt] = completedByAge[index];
      evictReceipt(key, receipt);
    }

    for (const [key, preview] of this.previews) {
      const receipt = this.receipts.get(this.receiptKey(preview));
      if (receipt?.lifecycle === "pending" || receipt?.lifecycle === "completed") continue;
      if (now > Date.parse(preview.public.expiresAt)) this.previews.delete(key);
    }
    const removablePreviews = [...this.previews.entries()]
      .filter(([, preview]) => !this.receipts.has(this.receiptKey(preview)))
      .sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
    for (const [key] of removablePreviews) {
      if (this.previews.size <= this.maxPreviews) break;
      this.previews.delete(key);
    }
  }
}
