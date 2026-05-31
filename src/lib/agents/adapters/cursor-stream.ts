import type { AdapterBillingType, AdapterUsageSummary } from "./types";

interface CursorEventPayload {
  type?: string;
  subtype?: string;
  session_id?: string;
  sessionId?: string;
  sessionID?: string;
  message?: unknown;
  result?: string;
  is_error?: boolean;
  error?: unknown;
  detail?: unknown;
  usage?: {
    input_tokens?: number;
    inputTokens?: number;
    output_tokens?: number;
    outputTokens?: number;
    cache_read_input_tokens?: number;
    cached_input_tokens?: number;
    cachedInputTokens?: number;
  };
  total_cost_usd?: number;
  cost_usd?: number;
  cost?: number;
}

export interface CursorStreamAccumulator {
  buffer: string;
  display: string;
  sessionId?: string | null;
  model?: string | null;
  usage?: AdapterUsageSummary;
  billingType?: AdapterBillingType | null;
  lastAssistantMessage?: string | null;
  errorMessage?: string | null;
}

function appendDisplay(
  accumulator: CursorStreamAccumulator,
  text: string
): string {
  if (!text) return "";
  accumulator.display = `${accumulator.display}${text}`;
  return text;
}

function collectAssistantText(message: unknown): string {
  if (typeof message === "string") return message.trim();
  if (!message || typeof message !== "object") return "";

  const record = message as Record<string, unknown>;
  const direct = typeof record.text === "string" ? record.text.trim() : "";
  const parts: string[] = direct ? [direct] : [];
  const content = Array.isArray(record.content) ? record.content : [];

  for (const partRaw of content) {
    if (!partRaw || typeof partRaw !== "object") continue;
    const part = partRaw as Record<string, unknown>;
    const type = typeof part.type === "string" ? part.type : "";
    if ((type === "output_text" || type === "text") && typeof part.text === "string") {
      const text = part.text.trim();
      if (text) parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function parseUsage(
  payload: CursorEventPayload["usage"]
): AdapterUsageSummary | undefined {
  if (!payload) return undefined;
  const inputTokens =
    typeof payload.input_tokens === "number"
      ? payload.input_tokens
      : typeof payload.inputTokens === "number"
        ? payload.inputTokens
        : undefined;
  const outputTokens =
    typeof payload.output_tokens === "number"
      ? payload.output_tokens
      : typeof payload.outputTokens === "number"
        ? payload.outputTokens
        : undefined;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return undefined;
  }

  const cachedInputTokens =
    typeof payload.cache_read_input_tokens === "number"
      ? payload.cache_read_input_tokens
      : typeof payload.cached_input_tokens === "number"
        ? payload.cached_input_tokens
        : typeof payload.cachedInputTokens === "number"
          ? payload.cachedInputTokens
          : undefined;

  return {
    inputTokens,
    outputTokens,
    ...(typeof cachedInputTokens === "number" ? { cachedInputTokens } : {}),
  };
}

function captureSession(
  accumulator: CursorStreamAccumulator,
  payload: CursorEventPayload
): void {
  const sessionId =
    (typeof payload.session_id === "string" && payload.session_id.trim()) ||
    (typeof payload.sessionId === "string" && payload.sessionId.trim()) ||
    (typeof payload.sessionID === "string" && payload.sessionID.trim()) ||
    null;
  if (sessionId) {
    accumulator.sessionId = sessionId;
  }
}

function consumeLine(
  accumulator: CursorStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  let payload: CursorEventPayload;
  try {
    payload = JSON.parse(trimmed) as CursorEventPayload;
  } catch {
    return "";
  }

  captureSession(accumulator, payload);

  if (payload.type === "assistant") {
    const text = collectAssistantText(payload.message);
    if (!text) return "";
    accumulator.lastAssistantMessage = text;
    return appendDisplay(accumulator, `${text}\n`);
  }

  if (payload.type === "result") {
    const usage = parseUsage(payload.usage);
    if (usage) accumulator.usage = usage;

    const subtypeIsError =
      typeof payload.subtype === "string" && payload.subtype.toLowerCase() === "error";
    if (payload.is_error === true || subtypeIsError) {
      const errText =
        typeof payload.error === "string"
          ? payload.error.trim()
          : typeof payload.result === "string"
            ? payload.result.trim()
            : "";
      if (errText) {
        accumulator.errorMessage = errText;
      }
    } else if (typeof payload.result === "string" && !accumulator.lastAssistantMessage) {
      const text = payload.result.trim();
      if (text) {
        accumulator.lastAssistantMessage = text;
        return appendDisplay(accumulator, `${text}\n`);
      }
    }
    return "";
  }

  if (payload.type === "error") {
    const msg =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.detail === "string"
          ? payload.detail
          : typeof payload.message === "string"
            ? payload.message
            : "";
    if (msg) {
      accumulator.errorMessage = msg.trim();
    }
    return "";
  }

  return "";
}

export function createCursorStreamAccumulator(): CursorStreamAccumulator {
  return {
    buffer: "",
    display: "",
    sessionId: null,
    model: null,
    usage: undefined,
    billingType: null,
    lastAssistantMessage: null,
    errorMessage: null,
  };
}

export function consumeCursorJsonStream(
  accumulator: CursorStreamAccumulator,
  chunk: string
): string {
  accumulator.buffer = `${accumulator.buffer}${chunk}`;
  const lines = accumulator.buffer.split(/\r?\n/);
  accumulator.buffer = lines.pop() || "";

  let display = "";
  for (const line of lines) {
    display += consumeLine(accumulator, line);
  }

  return display;
}

export function flushCursorJsonStream(
  accumulator: CursorStreamAccumulator
): string {
  if (!accumulator.buffer) return "";

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeLine(accumulator, buffered);
}

const CURSOR_UNKNOWN_SESSION = /unknown\s+(session|chat)|session\s+.*\s+not\s+found|chat\s+.*\s+not\s+found|resume\s+.*\s+not\s+found|could\s+not\s+resume/i;

export function isCursorUnknownSessionError(
  stdout: string,
  stderr: string
): boolean {
  return CURSOR_UNKNOWN_SESSION.test(`${stdout}\n${stderr}`);
}
