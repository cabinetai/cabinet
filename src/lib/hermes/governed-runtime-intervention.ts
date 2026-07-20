import { createHash } from "node:crypto";
import { sanitizeHermesText } from "./control-center-sanitizer";
import type { HermesControlCenterSnapshot } from "./control-center-types";
import {
  HermesManagementClient,
  HermesManagementRequestError,
  type HermesKanbanRunState,
} from "./management-client";
import type { HermesServerConfig } from "./server-config";

export const HERMES_RUNTIME_INTERVENTION_ACTION = "terminate_kanban_run" as const;
const PREVIEW_TTL_MS = 120_000;
const AUTHORITY_TTL_MS = 30_000;
const RECEIPT_TTL_MS = 30 * 60_000;
const MAX_RECEIPTS = 200;

export type HermesInterventionPhase =
  | "prepared"
  | "precondition_check"
  | "mutation_dispatch_attempted"
  | "mutation_response_received"
  | "verification_attempted"
  | "verified";

export type HermesLiveInterventionAuthority = {
  kind: "live_runtime";
  targetRunId: string;
  source: "Hermes active workers";
  interface: "/api/plugins/kanban/workers/active";
  observedAt: string;
  authorityIdentity: string;
};

export type HermesRuntimeInterventionPreview = {
  previewId: string;
  idempotencyIdentity: string;
  action: typeof HERMES_RUNTIME_INTERVENTION_ACTION;
  targetRunId: string;
  targetTaskId: string;
  currentState: string;
  reason: string;
  expectedConsequence: string;
  contractExpectation: string;
  reversible: false;
  evidenceObservedAt: string;
  expiresAt: string;
  confirmationPhrase: string;
  phase: "prepared";
};

export type HermesRuntimeInterventionResult = {
  idempotencyIdentity: string;
  targetRunId: string;
  status: "verified_success" | "blocked_no_action" | "failed_before_dispatch" | "outcome_unknown";
  phase: HermesInterventionPhase;
  summary: string;
  contractExpectation: string;
  mutationAttempted: boolean;
  mutationResponseReceived: boolean;
  retryAttempted: false;
  verificationScope: "run_reclaimed" | "none";
  lastReconciliationAt: string | null;
  completedAt: string;
};

export type HermesRuntimeInterventionClient = Pick<HermesManagementClient, "readKanbanRun" | "terminateKanbanRun">;

type StoredPreview = {
  public: HermesRuntimeInterventionPreview;
  stateFingerprint: string;
  actorIdentity: string;
  authorityIdentity: string;
};

type Receipt = {
  promise: Promise<HermesRuntimeInterventionResult>;
  result: HermesRuntimeInterventionResult | null;
  createdAt: number;
  lastAccessAt: number;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stateFingerprint(run: HermesKanbanRunState): string {
  return hash(JSON.stringify({
    action: HERMES_RUNTIME_INTERVENTION_ACTION,
    runId: run.runId,
    taskId: run.taskId,
    status: run.status,
    startedAt: run.startedAt,
    claimIdentity: run.claimIdentity,
  }));
}

function boundedReason(value: string): string {
  const normalized = sanitizeHermesText(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim(), 240);
  if (normalized.length < 8) throw new HermesRuntimeInterventionError("invalid_request", "A specific reason of at least 8 characters is required.");
  return normalized;
}

function isActive(run: HermesKanbanRunState): boolean {
  return run.status.toLowerCase() === "running" && run.endedAt === null && Boolean(run.claimIdentity);
}

function isReclaimed(run: HermesKanbanRunState): boolean {
  return run.endedAt !== null && (run.status.toLowerCase() === "reclaimed" || run.outcome?.toLowerCase() === "reclaimed");
}

function boundedFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Hermes could not complete the intervention.";
  return sanitizeHermesText(message, 200);
}

export class HermesRuntimeInterventionError extends Error {
  constructor(
    readonly code: "invalid_request" | "fixture_forbidden" | "stale_target" | "target_mismatch" | "preview_expired" | "not_confirmed" | "actor_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "HermesRuntimeInterventionError";
  }
}

export function establishHermesLiveInterventionAuthority(
  snapshot: HermesControlCenterSnapshot,
  targetRunId: string,
  now = new Date(),
): HermesLiveInterventionAuthority {
  if (snapshot.provenance.kind !== "live_runtime") {
    throw new HermesRuntimeInterventionError("fixture_forbidden", "Acceptance fixtures cannot prepare or execute Hermes mutations.");
  }
  const target = targetRunId.trim();
  const run = snapshot.runtimeExecution.runs.find((candidate) =>
    candidate.intervention?.category === HERMES_RUNTIME_INTERVENTION_ACTION
    && candidate.intervention.targetRunId === target
    && candidate.state === "active"
    && candidate.source === "Hermes active workers"
    && candidate.interface === "/api/plugins/kanban/workers/active",
  );
  const observedAt = Date.parse(snapshot.runtimeExecution.observedAt);
  if (!run || !Number.isFinite(observedAt) || observedAt > now.getTime() + 30_000 || now.getTime() - observedAt > AUTHORITY_TTL_MS) {
    throw new HermesRuntimeInterventionError("stale_target", "A fresh live Hermes active-worker observation did not authorize this run.");
  }
  return {
    kind: "live_runtime",
    targetRunId: target,
    source: "Hermes active workers",
    interface: "/api/plugins/kanban/workers/active",
    observedAt: new Date(observedAt).toISOString(),
    authorityIdentity: `hermes-live-${hash(JSON.stringify({ target, observedAt, source: run.source, interface: run.interface })).slice(0, 32)}`,
  };
}

export class HermesRuntimeInterventionService {
  private readonly previews = new Map<string, StoredPreview>();
  private readonly receipts = new Map<string, Receipt>();

  constructor(
    private readonly client: HermesRuntimeInterventionClient,
    private readonly now: () => Date = () => new Date(),
    private readonly retention: { receiptTtlMs: number; maxReceipts: number } = { receiptTtlMs: RECEIPT_TTL_MS, maxReceipts: MAX_RECEIPTS },
  ) {}

  async prepare(input: { targetRunId: string; reason: string; authority: HermesLiveInterventionAuthority; actorIdentity: string }): Promise<HermesRuntimeInterventionPreview> {
    const targetRunId = input.targetRunId.trim();
    if (!/^\d+$/.test(targetRunId)) throw new HermesRuntimeInterventionError("invalid_request", "A numeric Hermes run identity is required.");
    if (input.authority.kind !== "live_runtime" || input.authority.targetRunId !== targetRunId) {
      throw new HermesRuntimeInterventionError("target_mismatch", "The server authority does not match the requested run.");
    }
    if (this.now().getTime() - Date.parse(input.authority.observedAt) > AUTHORITY_TTL_MS) {
      throw new HermesRuntimeInterventionError("stale_target", "The live Hermes authority is stale. Refresh and prepare again.");
    }
    const reason = boundedReason(input.reason);
    const run = await this.client.readKanbanRun(targetRunId);
    if (!isActive(run)) throw new HermesRuntimeInterventionError("stale_target", "Hermes no longer reports this run as actively claimed.");
    const evidenceObservedAt = this.now().toISOString();
    const fingerprint = stateFingerprint(run);
    const idempotencyIdentity = `hermes-terminate-${hash(JSON.stringify({ fingerprint, reason })).slice(0, 32)}`;
    const preview: HermesRuntimeInterventionPreview = {
      previewId: idempotencyIdentity,
      idempotencyIdentity,
      action: HERMES_RUNTIME_INTERVENTION_ACTION,
      targetRunId: run.runId,
      targetTaskId: run.taskId,
      currentState: run.status,
      reason,
      expectedConsequence: "Hermes will attempt to stop this worker and reclaim this run.",
      contractExpectation: "The installed contract normally returns the associated task to ready; this preview does not claim that task state is verified.",
      reversible: false,
      evidenceObservedAt,
      expiresAt: new Date(this.now().getTime() + PREVIEW_TTL_MS).toISOString(),
      confirmationPhrase: `TERMINATE RUN ${run.runId}`,
      phase: "prepared",
    };
    this.previews.set(preview.previewId, { public: preview, stateFingerprint: fingerprint, actorIdentity: input.actorIdentity, authorityIdentity: input.authority.authorityIdentity });
    return preview;
  }

  async commit(input: { previewId: string; targetRunId: string; confirmationPhrase: string; actorIdentity: string }): Promise<HermesRuntimeInterventionResult> {
    this.cleanup();
    const stored = this.previews.get(input.previewId);
    if (!stored) throw new HermesRuntimeInterventionError("preview_expired", "The prepared intervention is unavailable. Prepare a new preview.");
    if (stored.actorIdentity !== input.actorIdentity) throw new HermesRuntimeInterventionError("actor_mismatch", "This preview belongs to a different authenticated Cabinet session.");
    if (stored.public.targetRunId !== input.targetRunId) throw new HermesRuntimeInterventionError("target_mismatch", "The confirmed target does not match the prepared run.");
    if (input.confirmationPhrase !== stored.public.confirmationPhrase) throw new HermesRuntimeInterventionError("not_confirmed", "Type the exact server-issued confirmation phrase.");

    const existing = this.receipts.get(stored.public.idempotencyIdentity);
    if (existing) {
      existing.lastAccessAt = this.now().getTime();
      return existing.promise;
    }
    if (Date.parse(stored.public.expiresAt) < this.now().getTime()) throw new HermesRuntimeInterventionError("preview_expired", "The prepared state is stale. Prepare a new preview.");

    const receipt: Receipt = { promise: Promise.resolve(null as never), result: null, createdAt: this.now().getTime(), lastAccessAt: this.now().getTime() };
    receipt.promise = this.execute(stored).then((result) => {
      receipt.result = result;
      return result;
    });
    this.receipts.set(stored.public.idempotencyIdentity, receipt);
    this.cleanup();
    return receipt.promise;
  }

  async recheck(input: { previewId: string; targetRunId: string; actorIdentity: string }): Promise<HermesRuntimeInterventionResult> {
    const stored = this.previews.get(input.previewId);
    if (!stored || stored.actorIdentity !== input.actorIdentity || stored.public.targetRunId !== input.targetRunId) {
      throw new HermesRuntimeInterventionError("target_mismatch", "The outcome receipt does not match this authenticated session and run.");
    }
    const receipt = this.receipts.get(stored.public.idempotencyIdentity);
    if (!receipt) throw new HermesRuntimeInterventionError("invalid_request", "No dispatched intervention is available to recheck.");
    const prior = await receipt.promise;
    if (prior.status !== "outcome_unknown") return prior;
    const checkedAt = this.now().toISOString();
    try {
      const run = await this.client.readKanbanRun(stored.public.targetRunId);
      const result: HermesRuntimeInterventionResult = isReclaimed(run)
        ? this.result(stored, "verified_success", "verified", `Hermes verified that run ${stored.public.targetRunId} ended with the reclaimed outcome.`, true, true, "run_reclaimed", checkedAt)
        : { ...prior, summary: "Hermes still does not provide authoritative proof of the final outcome. No mutation retry was attempted.", lastReconciliationAt: checkedAt, completedAt: checkedAt };
      receipt.result = result;
      receipt.promise = Promise.resolve(result);
      return result;
    } catch {
      const result = { ...prior, summary: "The read-only outcome recheck failed. The final outcome remains unknown and no mutation retry was attempted.", lastReconciliationAt: checkedAt, completedAt: checkedAt };
      receipt.result = result;
      receipt.promise = Promise.resolve(result);
      return result;
    }
  }

  private result(stored: StoredPreview, status: HermesRuntimeInterventionResult["status"], phase: HermesInterventionPhase, summary: string, attempted: boolean, responseReceived: boolean, verificationScope: HermesRuntimeInterventionResult["verificationScope"], reconciliation: string | null): HermesRuntimeInterventionResult {
    return {
      idempotencyIdentity: stored.public.idempotencyIdentity,
      targetRunId: stored.public.targetRunId,
      status,
      phase,
      summary,
      contractExpectation: stored.public.contractExpectation,
      mutationAttempted: attempted,
      mutationResponseReceived: responseReceived,
      retryAttempted: false,
      verificationScope,
      lastReconciliationAt: reconciliation,
      completedAt: this.now().toISOString(),
    };
  }

  private async execute(stored: StoredPreview): Promise<HermesRuntimeInterventionResult> {
    let current: HermesKanbanRunState;
    try {
      current = await this.client.readKanbanRun(stored.public.targetRunId);
    } catch (error) {
      return this.result(stored, "failed_before_dispatch", "precondition_check", `Hermes precondition check failed: ${boundedFailure(error)}`, false, false, "none", null);
    }
    if (!isActive(current) || stateFingerprint(current) !== stored.stateFingerprint) {
      return this.result(stored, "blocked_no_action", "precondition_check", "Hermes state changed after preview. No mutation was dispatched.", false, false, "none", null);
    }

    try {
      await this.client.terminateKanbanRun(stored.public.targetRunId, stored.public.reason);
    } catch (error) {
      return this.reconcileAfterDispatch(stored, error);
    }

    const checkedAt = this.now().toISOString();
    try {
      const run = await this.client.readKanbanRun(stored.public.targetRunId);
      return isReclaimed(run)
        ? this.result(stored, "verified_success", "verified", `Hermes verified that run ${stored.public.targetRunId} ended with the reclaimed outcome.`, true, true, "run_reclaimed", checkedAt)
        : this.result(stored, "outcome_unknown", "verification_attempted", "Hermes responded, but the run-reclaimed outcome was not verified. No mutation retry was attempted.", true, true, "run_reclaimed", checkedAt);
    } catch {
      return this.result(stored, "outcome_unknown", "verification_attempted", "Hermes responded, but read-only verification failed. No mutation retry was attempted.", true, true, "run_reclaimed", checkedAt);
    }
  }

  private async reconcileAfterDispatch(stored: StoredPreview, dispatchError: unknown): Promise<HermesRuntimeInterventionResult> {
    const responseReceived = dispatchError instanceof HermesManagementRequestError && dispatchError.status !== 504;
    const checkedAt = this.now().toISOString();
    try {
      const run = await this.client.readKanbanRun(stored.public.targetRunId);
      if (isReclaimed(run)) return this.result(stored, "verified_success", "verified", `Hermes verified that run ${stored.public.targetRunId} ended with the reclaimed outcome after an ambiguous dispatch response.`, true, responseReceived, "run_reclaimed", checkedAt);
      const explicitConflict = dispatchError instanceof HermesManagementRequestError && dispatchError.status === 409;
      if (explicitConflict && isActive(run) && stateFingerprint(run) === stored.stateFingerprint) {
        return this.result(stored, "blocked_no_action", "verification_attempted", "Hermes returned an explicit conflict and the exact run remains unchanged. No mutation was applied or retried.", true, false, "run_reclaimed", checkedAt);
      }
    } catch {
      // The single allowed read-only reconciliation failed; uncertainty remains.
    }
    return this.result(stored, "outcome_unknown", "verification_attempted", `The mutation dispatch was attempted, but its final outcome is unknown: ${boundedFailure(dispatchError)} No mutation retry was attempted.`, true, responseReceived, "run_reclaimed", checkedAt);
  }

  private cleanup(): void {
    const now = this.now().getTime();
    for (const [identity, receipt] of this.receipts) {
      if (now - receipt.lastAccessAt > this.retention.receiptTtlMs) {
        this.receipts.delete(identity);
        this.previews.delete(identity);
      }
    }
    if (this.receipts.size <= this.retention.maxReceipts) return;
    const oldest = [...this.receipts.entries()].sort((left, right) => left[1].lastAccessAt - right[1].lastAccessAt);
    for (const [identity] of oldest.slice(0, this.receipts.size - this.retention.maxReceipts)) {
      this.receipts.delete(identity);
      this.previews.delete(identity);
    }
  }
}

const serviceKey = Symbol.for("cabinet.hermes.runtime-intervention-service");
type ServiceGlobal = typeof globalThis & { [serviceKey]?: { configIdentity: string; service: HermesRuntimeInterventionService } };

export function getHermesRuntimeInterventionService(config: HermesServerConfig): HermesRuntimeInterventionService {
  const target = globalThis as ServiceGlobal;
  const configIdentity = hermesRuntimeInterventionConfigIdentity(config);
  if (!target[serviceKey] || target[serviceKey]?.configIdentity !== configIdentity) {
    target[serviceKey] = { configIdentity, service: new HermesRuntimeInterventionService(new HermesManagementClient(config)) };
  }
  return target[serviceKey]!.service;
}

export function hermesRuntimeInterventionConfigIdentity(config: HermesServerConfig): string {
  const credentialDigest = hash(config.managementToken ?? "no-management-token");
  return hash(`${config.managementBaseUrl}|${config.profile}|${config.timeoutMs}|${credentialDigest}`);
}
