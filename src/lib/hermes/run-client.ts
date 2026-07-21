import type { HermesServerConfig } from "./server-config";
import type {
  HermesRunDecision,
  HermesRunEvent,
  HermesRunFailureCode,
  HermesRunState,
  HermesRunStatus,
} from "./types";

type Fetch = typeof fetch;

export class HermesRunError extends Error {
  constructor(
    readonly code: HermesRunFailureCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = "HermesRunError";
  }
}

type StartInput = {
  input: string;
  instructions?: string;
  sessionId?: string;
  previousResponseId?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
};

type StreamOptions = {
  signal?: AbortSignal;
  startingSequence?: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function runState(value: unknown): HermesRunState {
  const state = string(value);
  if (
    state === "queued" || state === "running" || state === "waiting_for_approval" ||
    state === "stopping" || state === "completed" || state === "cancelled" || state === "failed"
  ) return state;
  throw new HermesRunError("invalid_response", "Hermes returned an unknown run state.", false);
}

function decision(value: unknown): HermesRunDecision | null {
  const source = record(value);
  const requestId = string(source.request_id) ?? string(source.id);
  if (!requestId) return null;
  return {
    requestId,
    command: string(source.command),
    description: string(source.description) ?? string(source.message),
    choices: Array.isArray(source.choices)
      ? source.choices.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeStatus(value: unknown): HermesRunStatus {
  const source = record(value);
  const usage = record(source.usage);
  const runId = string(source.run_id);
  if (!runId) throw new HermesRunError("invalid_response", "Hermes omitted the run identifier.", false);
  const hasUsage = Object.keys(usage).length > 0;
  return {
    object: "hermes.run",
    runId,
    sessionId: string(source.session_id),
    status: runState(source.status),
    createdAt: number(source.created_at),
    updatedAt: number(source.updated_at),
    lastEvent: string(source.last_event),
    output: string(source.output),
    error: string(source.error),
    usage: hasUsage ? {
      inputTokens: number(usage.input_tokens) ?? 0,
      outputTokens: number(usage.output_tokens) ?? 0,
      totalTokens: number(usage.total_tokens) ?? 0,
    } : null,
    pendingDecision: decision(source.pending_decision) ?? decision(source.approval),
  };
}

export class HermesRunClient {
  constructor(
    private readonly config: HermesServerConfig,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  async start(input: StartInput): Promise<{ runId: string; status: "started" }> {
    const body: Record<string, unknown> = { input: input.input };
    if (input.instructions) body.instructions = input.instructions;
    if (input.sessionId) body.session_id = input.sessionId;
    if (input.previousResponseId) body.previous_response_id = input.previousResponseId;
    if (input.conversationHistory) body.conversation_history = input.conversationHistory;
    const source = record(await this.request(this.runPath("/v1/runs"), { method: "POST", body: JSON.stringify(body) }));
    const runId = string(source.run_id);
    if (!runId) throw new HermesRunError("invalid_response", "Hermes omitted the run identifier.", false);
    return { runId, status: "started" };
  }

  async get(runId: string): Promise<HermesRunStatus> {
    return normalizeStatus(await this.request(this.runPath(`/v1/runs/${encodeURIComponent(runId)}`)));
  }

  async approve(
    runId: string,
    requestId: string,
    choice: "once" | "session" | "always" | "deny"
  ): Promise<{ runId: string; choice: string; resolved: number }> {
    const current = await this.get(runId);
    if (current.pendingDecision && current.pendingDecision.requestId !== requestId) {
      throw new HermesRunError("terminal", "The pending approval identity changed. Refresh before deciding.", false, 409);
    }
    const source = record(await this.request(this.runPath(`/v1/runs/${encodeURIComponent(runId)}/approval`), {
      method: "POST",
      body: JSON.stringify({ choice, request_id: requestId }),
    }));
    return {
      runId: string(source.run_id) ?? runId,
      choice: string(source.choice) ?? choice,
      resolved: number(source.resolved) ?? 0,
    };
  }

  async stop(runId: string): Promise<{ runId: string; status: string }> {
    const source = record(await this.request(this.runPath(`/v1/runs/${encodeURIComponent(runId)}/stop`), { method: "POST" }));
    return { runId: string(source.run_id) ?? runId, status: string(source.status) ?? "stopping" };
  }

  async reconcile(runId: string): Promise<HermesRunStatus> {
    return this.get(runId);
  }

  async *stream(runId: string, options: StreamOptions = {}): AsyncGenerator<HermesRunEvent> {
    const response = await this.fetchWithTimeout(this.runPath(`/v1/runs/${encodeURIComponent(runId)}/events`), {
      headers: this.headers(),
      cache: "no-store",
      signal: options.signal,
    }, false);
    if (!response.ok) await this.throwResponse(response);
    if (!response.body) throw new HermesRunError("invalid_response", "Hermes returned an empty event stream.", true);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sequence = options.startingSequence ?? 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split("\n").filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim()).join("\n");
          if (data) {
            const payload = record(JSON.parse(data));
            yield {
              sequence: ++sequence,
              event: string(payload.event) ?? "unknown",
              runId: string(payload.run_id) ?? runId,
              timestamp: number(payload.timestamp),
              payload,
            };
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private headers(): HeadersInit {
    return { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json" };
  }

  private runPath(path: string): string {
    return `/p/${encodeURIComponent(this.config.profile)}${path}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetchWithTimeout(path, {
      ...init,
      headers: { ...this.headers(), "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
    if (!response.ok) await this.throwResponse(response);
    try { return await response.json(); }
    catch { throw new HermesRunError("invalid_response", "Hermes returned invalid JSON.", false); }
  }

  private async fetchWithTimeout(path: string, init: RequestInit, bounded = true): Promise<Response> {
    const controller = new AbortController();
    const signal = init.signal;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeoutId = bounded ? setTimeout(abort, this.config.timeoutMs) : null;
    try {
      return await this.fetchImpl(`${this.config.apiBaseUrl}${path}`, { ...init, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) throw new HermesRunError("timeout", "Hermes run request timed out or was cancelled.", true);
      throw new HermesRunError("retryable", "Hermes run service is unreachable.", true);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
    }
  }

  private async throwResponse(response: Response): Promise<never> {
    let message = `Hermes run request failed with HTTP ${response.status}.`;
    try {
      const body = record(await response.json());
      const error = record(body.error);
      message = string(error.message) ?? string(body.detail) ?? message;
    } catch {}
    if (response.status === 401 || response.status === 403) throw new HermesRunError("authentication_failure", message, false, response.status);
    if (response.status === 404 && /profile/i.test(message) && /(unknown|unavailable|unconfigured)/i.test(message)) throw new HermesRunError("unavailable_profile", message, false, response.status);
    if (response.status === 404) throw new HermesRunError("run_not_found", message, false, response.status);
    if (response.status === 409 || response.status === 400) throw new HermesRunError("terminal", message, false, response.status);
    if (response.status === 408 || response.status === 429 || response.status >= 500) throw new HermesRunError("retryable", message, true, response.status);
    throw new HermesRunError("terminal", message, false, response.status);
  }
}
