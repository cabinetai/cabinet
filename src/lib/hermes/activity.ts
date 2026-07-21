export type HermesDecisionKind = "clarification" | "approval" | "secret" | "sudo";
export type HermesDecisionStatus =
  | "pending"
  | "resolved"
  | "commented"
  | "expired"
  | "cancelled";

export type HermesToolActivity = {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  runId: string | null;
  eventSeq: number;
  context: string | null;
  preview: string | null;
  summary: string | null;
  error: string | null;
  durationSeconds: number | null;
  inlineDiff: string | null;
  artifacts: string[];
  screenshots: string[];
  links: string[];
  retryable: boolean;
};

export type HermesDecisionRequest = {
  id: string;
  kind: HermesDecisionKind;
  requestId: string | null;
  runId: string | null;
  sessionId: string | null;
  eventSeq: number;
  status: HermesDecisionStatus;
  question: string | null;
  choices: string[];
  command: string | null;
  description: string | null;
  envVar: string | null;
  prompt: string | null;
  risk: string;
  expiresAt: string | null;
  decision: string | null;
};

export type HermesActivitySnapshot = {
  tools: HermesToolActivity[];
  decisions: HermesDecisionRequest[];
};

export function hermesDisplayStatus(
  status: string,
  decisions: HermesDecisionRequest[]
): string {
  const waiting = decisions.find(
    (item) => item.status === "pending" || item.status === "commented"
  );
  if (!waiting) {
    if (status === "streaming") return "running";
    if (status === "interrupted") return "cancelled";
    return status;
  }
  if (waiting.kind === "approval") return "awaiting approval";
  if (waiting.kind === "clarification") return "awaiting input";
  return `awaiting ${waiting.kind}`;
}

type EventLine = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && !!item.trim());
}

function seq(event: EventLine): number {
  return typeof event.seq === "number" ? event.seq : 0;
}

function sudoExpiry(event: EventLine, payload: Record<string, unknown>): string | null {
  const explicit = text(payload.expires_at);
  if (explicit) return explicit;
  const occurredAt = text(event.occurredAt) || text(event.ts);
  if (!occurredAt) return null;
  const timestamp = Date.parse(occurredAt);
  return Number.isFinite(timestamp) ? new Date(timestamp + 120_000).toISOString() : null;
}

function decisionKind(runtimeType: string): HermesDecisionKind | null {
  if (runtimeType === "clarify.request") return "clarification";
  if (runtimeType === "approval.request") return "approval";
  if (runtimeType === "secret.request") return "secret";
  if (runtimeType === "sudo.request") return "sudo";
  return null;
}

function requestKey(input: {
  kind: HermesDecisionKind;
  requestId: string | null;
  sessionId: string | null;
  eventSeq: number;
}): string {
  return input.requestId || `${input.kind}:${input.sessionId || "session"}:${input.eventSeq}`;
}

const SAFE_RETRY_TOOLS = new Set([
  "read_file",
  "search_files",
  "find_files",
  "list_files",
  "grep",
  "glob",
  "status",
  "health",
]);

function resultSummary(result: Record<string, unknown>): string | null {
  const direct =
    text(result.summary) || text(result.output) || text(result.content) || text(result.message);
  if (direct) return direct;
  if (Object.keys(result).length === 0) return null;
  const serialized = JSON.stringify(result, null, 2);
  return serialized.length > 8_000 ? `${serialized.slice(0, 8_000)}\n…` : serialized;
}

export function normalizeHermesActivity(events: EventLine[]): HermesActivitySnapshot {
  const tools = new Map<string, HermesToolActivity>();
  const decisions = new Map<string, HermesDecisionRequest>();

  for (const event of events) {
    if (event.type === "runtime.decision") {
      const kind = text(event.kind) as HermesDecisionKind | null;
      if (!kind) continue;
      const requestId = text(event.requestId);
      const eventSeq = typeof event.requestEventSeq === "number" ? event.requestEventSeq : 0;
      const sessionId = text(event.sessionId);
      const key = requestKey({ kind, requestId, sessionId, eventSeq });
      const current = decisions.get(key);
      if (current) {
        current.status = (text(event.status) as HermesDecisionStatus | null) || "resolved";
        current.decision = text(event.decision);
      }
      continue;
    }

    if (event.type !== "runtime.event") continue;
    const runtimeType = text(event.runtimeType) || "";
    const payload = record(event.payload);
    const eventSeq = seq(event);
    const runId = text(event.runId);
    const sessionId = text(event.sessionId);

    if (runtimeType.startsWith("tool.")) {
      // Hermes emits this speculative event before it has assigned a tool call
      // identity. The subsequent tool.start is the authoritative card; showing
      // both creates a duplicate operation in Cabinet.
      if (runtimeType === "tool.generating") continue;
      const name = text(payload.name) || "Hermes tool";
      const id = text(payload.tool_id) || `${name}:${eventSeq}`;
      const result = record(payload.result);
      const current = tools.get(id) || {
        id,
        name,
        status: "running" as const,
        runId,
        eventSeq,
        context: null,
        preview: null,
        summary: null,
        error: null,
        durationSeconds: null,
        inlineDiff: null,
        artifacts: [],
        screenshots: [],
        links: [],
        retryable: false,
      };
      current.eventSeq = eventSeq;
      current.context = text(payload.context) || current.context;
      current.preview =
        text(payload.preview) ||
        text(payload.args_text) ||
        (payload.args && typeof payload.args === "object"
          ? JSON.stringify(payload.args, null, 2)
          : current.preview);
      current.summary =
        text(payload.summary) ||
        text(payload.result_text) ||
        resultSummary(result) ||
        current.summary;
      current.inlineDiff = text(payload.inline_diff) || current.inlineDiff;
      current.artifacts = texts(payload.artifacts).length ? texts(payload.artifacts) : current.artifacts;
      current.screenshots = texts(payload.screenshots).length
        ? texts(payload.screenshots)
        : current.screenshots;
      current.links = texts(payload.links).length ? texts(payload.links) : current.links;
      if (runtimeType === "tool.complete") {
        const error = text(payload.error) || text(result.error);
        current.error = error;
        current.status = error ? "failed" : "completed";
        current.durationSeconds =
          typeof payload.duration_s === "number" ? payload.duration_s : null;
        current.retryable = !!error && SAFE_RETRY_TOOLS.has(name.toLowerCase());
      }
      tools.set(id, current);
      continue;
    }

    const kind = decisionKind(runtimeType);
    if (kind) {
      const requestId = text(payload.request_id) || text(event.requestId);
      const key = requestKey({ kind, requestId, sessionId, eventSeq });
      const activeTool = [...tools.values()].reverse().find(
        (tool) => tool.runId === runId && tool.status === "running"
      );
      decisions.set(key, {
        id: key,
        kind,
        requestId,
        runId,
        sessionId,
        eventSeq,
        status: "pending",
        question: text(payload.question),
        choices: texts(payload.choices),
        command:
          text(payload.command) ||
          (kind === "sudo" && activeTool
            ? `${activeTool.name}${activeTool.context ? `: ${activeTool.context}` : ""}`
            : null),
        description:
          text(payload.description) ||
          (kind === "sudo" && activeTool
            ? `Hermes requested sudo while running ${activeTool.name}.`
            : null),
        envVar: text(payload.env_var),
        prompt: text(payload.prompt),
        risk:
          kind === "sudo"
            ? "Privileged access"
            : kind === "secret"
              ? "Sensitive value"
              : kind === "approval"
                ? "Consequential action"
                : "Input required",
        expiresAt: kind === "sudo" ? sudoExpiry(event, payload) : text(payload.expires_at),
        decision: null,
      });
      continue;
    }

    if (runtimeType === "secret.expire" || runtimeType === "sudo.expire") {
      const kind: HermesDecisionKind = runtimeType.startsWith("secret") ? "secret" : "sudo";
      const requestId = text(payload.request_id);
      for (const decision of decisions.values()) {
        if (decision.kind === kind && decision.requestId === requestId) decision.status = "expired";
      }
    }
  }

  return {
    tools: [...tools.values()].sort((a, b) => a.eventSeq - b.eventSeq),
    decisions: [...decisions.values()].sort((a, b) => a.eventSeq - b.eventSeq),
  };
}
