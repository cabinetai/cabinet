import { HermesRunClient, HermesRunError } from "./run-client";
import type { HermesRunEvent, HermesRunProjection, HermesRunStatus } from "./types";

type StartInput = Parameters<HermesRunClient["start"]>[0] & {
  context: string;
  capability?: string;
  idempotencyKey: string;
};

const TERMINAL = new Set(["completed", "cancelled", "failed"]);
const MAX_EVENTS = 1_000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class HermesRunBridge {
  private readonly projections = new Map<string, HermesRunProjection>();
  private readonly pumps = new Map<string, Promise<void>>();
  private readonly starts = new Map<string, string>();

  constructor(private readonly client: HermesRunClient) {}

  async start(input: StartInput): Promise<HermesRunProjection> {
    const existingRunId = this.starts.get(input.idempotencyKey);
    if (existingRunId) {
      const existing = this.projections.get(existingRunId);
      if (existing) return this.copy(existing);
    }
    const started = await this.client.start(input);
    const now = new Date().toISOString();
    const projection: HermesRunProjection = {
      runId: started.runId,
      context: input.context,
      capability: input.capability?.trim() || null,
      startedAt: now,
      updatedAt: now,
      status: "queued",
      pendingDecision: null,
      events: [],
      result: null,
      error: null,
      usage: null,
    };
    this.projections.set(started.runId, projection);
    this.starts.set(input.idempotencyKey, started.runId);
    this.ensurePump(started.runId);
    return this.copy(projection);
  }

  list(): HermesRunProjection[] {
    return [...this.projections.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((item) => this.copy(item));
  }

  get(runId: string): HermesRunProjection | null {
    const value = this.projections.get(runId);
    return value ? this.copy(value) : null;
  }

  async approve(runId: string, requestId: string, choice: "once" | "session" | "always" | "deny") {
    const projection = this.projections.get(runId);
    if (!projection) throw new HermesRunError("run_not_found", "Run projection not found.", false, 404);
    if (!projection.pendingDecision || projection.pendingDecision.requestId !== requestId) {
      throw new HermesRunError("terminal", "The approval is no longer pending. Refresh before deciding.", false, 409);
    }
    const result = await this.client.approve(runId, requestId, choice);
    projection.pendingDecision = null;
    projection.status = "running";
    projection.updatedAt = new Date().toISOString();
    return result;
  }

  async stop(runId: string) {
    const result = await this.client.stop(runId);
    const projection = this.projections.get(runId);
    if (projection) { projection.status = "stopping"; projection.updatedAt = new Date().toISOString(); }
    return result;
  }

  private ensurePump(runId: string) {
    if (this.pumps.has(runId)) return;
    const pump = this.pump(runId).finally(() => this.pumps.delete(runId));
    this.pumps.set(runId, pump);
  }

  private async pump(runId: string): Promise<void> {
    const projection = this.projections.get(runId);
    if (!projection) return;
    try {
      for await (const event of this.client.stream(runId, { startingSequence: projection.events.at(-1)?.sequence ?? 0 })) {
        this.applyEvent(projection, event);
      }
    } catch (error) {
      projection.error = error instanceof Error ? error.message : "Hermes event stream disconnected.";
    }
    try {
      const status = await this.client.reconcile(runId);
      this.applyStatus(projection, status);
      this.append(projection, {
        sequence: (projection.events.at(-1)?.sequence ?? 0) + 1,
        event: "bridge.reconciled",
        runId,
        timestamp: Date.now() / 1000,
        payload: { status: status.status, exactReplay: false },
      });
    } catch (error) {
      projection.error = error instanceof Error ? error.message : "Hermes run reconciliation failed.";
      projection.updatedAt = new Date().toISOString();
    }
  }

  private applyEvent(projection: HermesRunProjection, event: HermesRunEvent) {
    this.append(projection, event);
    if (event.event === "approval.request") {
      const requestId = text(event.payload.request_id) ?? text(event.payload.id) ?? `${projection.runId}:approval:${event.sequence}`;
      projection.pendingDecision = {
        requestId,
        command: text(event.payload.command),
        description: text(event.payload.description) ?? text(event.payload.message),
        choices: Array.isArray(event.payload.choices) ? event.payload.choices.filter((item): item is string => typeof item === "string") : [],
      };
      projection.status = "waiting_for_approval";
    } else if (event.event === "approval.responded") {
      projection.pendingDecision = null;
      projection.status = "running";
    } else if (event.event === "run.completed") {
      projection.status = "completed";
      projection.result = text(event.payload.output);
      const usage = event.payload.usage as Record<string, unknown> | undefined;
      if (usage) projection.usage = {
        inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
        outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
        totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : 0,
      };
    } else if (event.event === "run.failed") {
      projection.status = "failed";
      projection.error = text(event.payload.error);
    } else if (event.event === "run.cancelled") projection.status = "cancelled";
    else if (!TERMINAL.has(projection.status)) projection.status = "running";
  }

  private applyStatus(projection: HermesRunProjection, status: HermesRunStatus) {
    projection.status = status.status;
    projection.result = status.output ?? projection.result;
    projection.error = status.error ?? projection.error;
    projection.usage = status.usage ?? projection.usage;
    projection.pendingDecision = status.pendingDecision ?? projection.pendingDecision;
    projection.updatedAt = new Date().toISOString();
  }

  private append(projection: HermesRunProjection, event: HermesRunEvent) {
    projection.events.push(event);
    if (projection.events.length > MAX_EVENTS) projection.events.splice(0, projection.events.length - MAX_EVENTS);
    projection.updatedAt = new Date().toISOString();
  }

  private copy(projection: HermesRunProjection): HermesRunProjection {
    return { ...projection, pendingDecision: projection.pendingDecision ? { ...projection.pendingDecision, choices: [...projection.pendingDecision.choices] } : null, events: projection.events.map((event) => ({ ...event, payload: { ...event.payload } })), usage: projection.usage ? { ...projection.usage } : null };
  }
}

const bridgeKey = Symbol.for("cabinet.hermes.run-bridge");
type GlobalWithBridge = typeof globalThis & { [bridgeKey]?: HermesRunBridge };

export function getHermesRunBridge(clientFactory: () => HermesRunClient): HermesRunBridge {
  const target = globalThis as GlobalWithBridge;
  return target[bridgeKey] ??= new HermesRunBridge(clientFactory());
}
