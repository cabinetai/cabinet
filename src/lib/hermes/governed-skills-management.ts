import { createHash } from "node:crypto";
import { sanitizeHermesText } from "./control-center-sanitizer";
import { HermesSkillsAdapterError, type HermesSkillsAdapter } from "./skills-adapter";
import type {
  HermesManagedSkill,
  HermesSkillAction,
  HermesSkillOperation,
  HermesSkillsManagementPreview,
  HermesSkillsManagementResult,
  HermesSkillsSnapshot,
} from "./skills-management-types";

const PREVIEW_TTL_MS = 120_000;
const RECEIPT_TTL_MS = 30 * 60_000;
const MAX_PREVIEWS = 100;
const MAX_RECEIPTS = 200;

type StoredPreview = {
  public: HermesSkillsManagementPreview;
  actorIdentity: string;
  query: string;
  stateFingerprint: string;
  createdAt: number;
  lastAccessAt: number;
};

type Receipt = {
  promise: Promise<HermesSkillsManagementResult>;
  result: HermesSkillsManagementResult | null;
  createdAt: number;
  lastAccessAt: number;
};

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
    provenance: skill.provenance,
    profile: skill.profile,
    updateAvailable: skill.updateAvailable,
    supportedActions: [...skill.supportedActions].sort(),
  }));
}

function desiredState(action: HermesSkillAction): string {
  if (action === "install") return "Installed and verified in Hermes";
  if (action === "enable") return "Installed and enabled in Hermes";
  if (action === "disable") return "Installed and disabled in Hermes";
  if (action === "update") return "Installed with no update reported by Hermes";
  return "Not installed in Hermes";
}

function consequence(action: HermesSkillAction, name: string): string {
  if (action === "install") return `Hermes will scan and install ${name} for the selected profile.`;
  if (action === "enable") return `Hermes will allow ${name} to load for new work in the selected profile.`;
  if (action === "disable") return `Hermes will stop loading ${name} for new work in the selected profile.`;
  if (action === "update") return `Hermes will replace the hub-installed copy of ${name} with the current upstream version.`;
  return `Hermes will remove the hub-installed copy of ${name} from the selected profile.`;
}

function reversibility(action: HermesSkillAction): string {
  if (action === "install") return "Reversible by a separately confirmed removal while the hub identity remains available.";
  if (action === "enable") return "Reversible by a separately confirmed disable action.";
  if (action === "disable") return "Reversible by a separately confirmed enable action.";
  if (action === "remove") return "Reversible only by a new reviewed installation from the same Hermes hub identity.";
  return "Not automatically reversible. Hermes does not expose a version rollback operation in this contract.";
}

function confirmation(action: HermesSkillAction, name: string, profile: string): string {
  return `${action.toUpperCase()} SKILL ${name} IN ${profile}`;
}

function findTarget(snapshot: HermesSkillsSnapshot, action: HermesSkillAction, identity: string, name?: string): HermesManagedSkill | null {
  if (action === "install") return snapshot.available.find((skill) => skill.identity === identity) ?? null;
  return snapshot.installed.find((skill) => skill.identity === identity || (name && skill.name === name)) ?? null;
}

export class HermesSkillsManagementError extends Error {
  constructor(
    readonly code: "invalid_request" | "preview_expired" | "actor_mismatch" | "target_mismatch" | "not_confirmed" | "unsupported_action" | "stale_target" | "fixture_forbidden",
    message: string,
  ) {
    super(message);
    this.name = "HermesSkillsManagementError";
  }
}

export class HermesSkillsManagementService {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly receipts = new Map<string, Receipt>();

  constructor(
    private readonly adapter: HermesSkillsAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async snapshot(query = ""): Promise<HermesSkillsSnapshot> {
    return this.adapter.read(query);
  }

  async prepare(input: { action: HermesSkillAction; targetIdentity: string; reason: string; actorIdentity: string; query?: string }): Promise<HermesSkillsManagementPreview> {
    this.cleanup();
    const query = (input.query ?? "").trim().slice(0, 80);
    const snapshot = await this.adapter.read(query);
    if (snapshot.sourceState !== "success" && snapshot.sourceState !== "connected_empty") {
      throw new HermesSkillsManagementError("stale_target", "A fresh canonical Hermes Skills observation is required.");
    }
    const target = findTarget(snapshot, input.action, input.targetIdentity);
    if (!target) throw new HermesSkillsManagementError("target_mismatch", "Hermes no longer reports the selected skill target.");
    if (!target.supportedActions.includes(input.action)) throw new HermesSkillsManagementError("unsupported_action", "The installed Hermes contract does not support this action for the selected skill.");
    if (snapshot.duplicateIdentities.includes(target.identity)) throw new HermesSkillsManagementError("stale_target", "Hermes reported a duplicate skill identity. No action can be prepared safely.");
    if (input.action === "update") {
      const updateAvailable = await this.adapter.checkUpdate(target.name);
      if (updateAvailable !== true) throw new HermesSkillsManagementError("unsupported_action", updateAvailable === false ? "Hermes reports that this skill is already current." : "Hermes did not provide authoritative update availability for this skill.");
      target.updateAvailable = true;
    }
    const reason = safeReason(input.reason);
    const stateFingerprint = fingerprint(input.action, target);
    const requestIdentity = `hermes-skills-${hash(JSON.stringify({ action: input.action, identity: target.identity, name: target.name, profile: target.profile, stateFingerprint, reason })).slice(0, 32)}`;
    const createdAt = this.now().getTime();
    const preview: HermesSkillsManagementPreview = {
      previewId: requestIdentity,
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
        profile: target.profile,
        updateAvailable: target.updateAvailable,
      },
      targetState: desiredState(input.action),
      profile: target.profile,
      expectedConsequence: consequence(input.action, target.name),
      reversibility: reversibility(input.action),
      sourceEvidence: snapshot.interface,
      evidenceObservedAt: snapshot.observedAt,
      expiresAt: new Date(createdAt + PREVIEW_TTL_MS).toISOString(),
      confirmationPhrase: confirmation(input.action, target.name, target.profile),
      reason,
      phase: "prepared",
    };
    this.previews.set(preview.previewId, { public: preview, actorIdentity: input.actorIdentity, query, stateFingerprint, createdAt, lastAccessAt: createdAt });
    this.cleanup();
    return preview;
  }

  async commit(input: { previewId: string; targetIdentity: string; confirmationPhrase: string; actorIdentity: string }): Promise<HermesSkillsManagementResult> {
    this.cleanup();
    const stored = this.previews.get(input.previewId);
    if (!stored) throw new HermesSkillsManagementError("preview_expired", "The prepared operation is unavailable. Prepare it again.");
    if (stored.actorIdentity !== input.actorIdentity) throw new HermesSkillsManagementError("actor_mismatch", "This preview belongs to a different authenticated Cabinet session.");
    if (stored.public.targetIdentity !== input.targetIdentity) throw new HermesSkillsManagementError("target_mismatch", "The confirmed skill does not match the prepared target.");
    if (stored.public.confirmationPhrase !== input.confirmationPhrase) throw new HermesSkillsManagementError("not_confirmed", "Type the exact server-issued confirmation phrase.");
    stored.lastAccessAt = this.now().getTime();
    const prior = this.receipts.get(stored.public.requestIdentity);
    if (prior) {
      prior.lastAccessAt = stored.lastAccessAt;
      return prior.promise;
    }
    if (Date.parse(stored.public.expiresAt) < this.now().getTime()) throw new HermesSkillsManagementError("preview_expired", "The prepared state is stale. Prepare it again.");
    const receipt: Receipt = { promise: Promise.resolve(null as never), result: null, createdAt: stored.lastAccessAt, lastAccessAt: stored.lastAccessAt };
    receipt.promise = this.execute(stored).then((result) => {
      receipt.result = result;
      return result;
    });
    this.receipts.set(stored.public.requestIdentity, receipt);
    return receipt.promise;
  }

  async recheck(input: { previewId: string; targetIdentity: string; actorIdentity: string }): Promise<HermesSkillsManagementResult> {
    this.cleanup();
    const stored = this.previews.get(input.previewId);
    if (!stored || stored.actorIdentity !== input.actorIdentity || stored.public.targetIdentity !== input.targetIdentity) {
      throw new HermesSkillsManagementError("target_mismatch", "The reconciliation target does not match this authenticated session.");
    }
    const receipt = this.receipts.get(stored.public.requestIdentity);
    if (!receipt) throw new HermesSkillsManagementError("invalid_request", "No dispatched operation is available to reconcile.");
    const prior = await receipt.promise;
    if (prior.status !== "outcome_unknown") return prior;
    const verification = await this.verify(stored);
    const result = verification
      ? this.result(stored, "verified_success", "verified", "Hermes now verifies the requested skill state. No mutation retry was attempted.", true, prior.mutationResponseReceived, this.now().toISOString())
      : { ...prior, summary: "Hermes still does not verify the requested skill state. No mutation retry was attempted.", verificationObservedAt: this.now().toISOString(), completedAt: this.now().toISOString() };
    receipt.result = result;
    receipt.promise = Promise.resolve(result);
    return result;
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

  private async execute(stored: StoredPreview): Promise<HermesSkillsManagementResult> {
    let snapshot: HermesSkillsSnapshot;
    try {
      snapshot = await this.adapter.read(stored.query);
    } catch {
      return this.result(stored, "failed_before_dispatch", "precondition_check", "Hermes could not complete the canonical precondition read. No mutation was dispatched.", false, false, null);
    }
    const current = findTarget(snapshot, stored.public.action, stored.public.targetIdentity, stored.public.targetName);
    if (await this.alreadyDesired(stored, snapshot)) {
      return this.result(stored, "verified_success", "verified", "Hermes already verifies the requested skill state. No mutation was dispatched.", false, false, this.now().toISOString());
    }
    if (stored.public.action === "update" && current) current.updateAvailable = await this.adapter.checkUpdate(current.name);
    if (!current || fingerprint(stored.public.action, current) !== stored.stateFingerprint) {
      return this.result(stored, "blocked_no_action", "precondition_check", "Hermes skill state changed after preview. No mutation was dispatched.", false, false, null);
    }
    const operation: HermesSkillOperation = {
      action: stored.public.action,
      targetIdentity: stored.public.targetIdentity,
      targetName: stored.public.targetName,
      profile: stored.public.profile,
      reason: stored.public.reason,
    };
    let responseReceived = false;
    try {
      const response = await this.adapter.execute(operation);
      responseReceived = response.responseReceived;
    } catch (error) {
      const dispatched = error instanceof HermesSkillsAdapterError && error.dispatched;
      if (!dispatched) return this.result(stored, "failed_before_dispatch", "precondition_check", "Hermes could not start the requested skill operation. No mutation was dispatched.", false, false, null);
      return this.result(stored, "outcome_unknown", "mutation_dispatch_attempted", "The Hermes operation was dispatched, but its outcome is unknown. Use read-only reconciliation; do not repeat the mutation.", true, error instanceof HermesSkillsAdapterError && error.responseReceived, null);
    }
    const verified = await this.verify(stored);
    return verified
      ? this.result(stored, "verified_success", "verified", "Hermes readback verifies the requested skill state.", true, responseReceived, this.now().toISOString())
      : this.result(stored, "outcome_unknown", "verification_attempted", "Hermes responded, but canonical readback did not verify the requested skill state. No retry was attempted.", true, responseReceived, this.now().toISOString());
  }

  private async alreadyDesired(stored: StoredPreview, snapshot: HermesSkillsSnapshot): Promise<boolean> {
    const installedByName = snapshot.installed.find((skill) => skill.name === stored.public.targetName) ?? null;
    if (stored.public.action === "install") return Boolean(installedByName);
    if (stored.public.action === "remove") return !installedByName;
    if (stored.public.action === "enable") return installedByName?.enabled === true;
    if (stored.public.action === "disable") return installedByName?.enabled === false;
    if (!installedByName) return false;
    return (await this.adapter.checkUpdate(stored.public.targetName)) === false;
  }

  private async verify(stored: StoredPreview): Promise<boolean> {
    try {
      const snapshot = await this.adapter.read(stored.query);
      return this.alreadyDesired(stored, snapshot);
    } catch {
      return false;
    }
  }

  private cleanup(): void {
    const now = this.now().getTime();
    for (const [key, preview] of this.previews) if (now - preview.lastAccessAt > RECEIPT_TTL_MS) this.previews.delete(key);
    for (const [key, receipt] of this.receipts) if (now - receipt.lastAccessAt > RECEIPT_TTL_MS) this.receipts.delete(key);
    for (const [key] of [...this.previews.entries()].sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt).slice(0, Math.max(0, this.previews.size - MAX_PREVIEWS))) this.previews.delete(key);
    for (const [key] of [...this.receipts.entries()].sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt).slice(0, Math.max(0, this.receipts.size - MAX_RECEIPTS))) this.receipts.delete(key);
  }
}
