import type { AdapterUsageSummary } from "./types";

interface OpenCodeEventPayload {
  type?: string;
  sessionID?: string;
  session_id?: string;
  part?: {
    text?: string;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache?: { read?: number };
    };
    state?: { status?: string; error?: string };
    cost?: number;
  };
  error?: unknown;
  message?: unknown;
}

export interface OpenCodeStreamAccumulator {
  buffer: string;
  display: string;
  sessionId?: string | null;
  usage: AdapterUsageSummary;
  hasUsage: boolean;
  costUsd: number;
  messages: string[];
  errors: string[];
  lastAssistantMessage?: string | null;
}

export function createOpenCodeStreamAccumulator(): OpenCodeStreamAccumulator {
  return {
    buffer: "",
    display: "",
    sessionId: null,
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    hasUsage: false,
    costUsd: 0,
    messages: [],
    errors: [],
    lastAssistantMessage: null,
  };
}

function appendDisplay(
  accumulator: OpenCodeStreamAccumulator,
  text: string
): string {
  if (!text) return "";
  accumulator.display = `${accumulator.display}${text}`;
  return text;
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  if (typeof record.code === "string" && record.code.trim()) {
    return record.code.trim();
  }
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

function consumeLine(
  accumulator: OpenCodeStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  let payload: OpenCodeEventPayload;
  try {
    payload = JSON.parse(trimmed) as OpenCodeEventPayload;
  } catch {
    return "";
  }

  const sessionId =
    (typeof payload.sessionID === "string" && payload.sessionID.trim()) ||
    (typeof payload.session_id === "string" && payload.session_id.trim()) ||
    null;
  if (sessionId) {
    accumulator.sessionId = sessionId;
  }

  if (payload.type === "text" && payload.part && typeof payload.part.text === "string") {
    const text = payload.part.text.trim();
    if (text) {
      accumulator.messages.push(text);
      accumulator.lastAssistantMessage = text;
      return appendDisplay(accumulator, `${text}\n`);
    }
    return "";
  }

  if (payload.type === "step_finish" && payload.part) {
    const tokens = payload.part.tokens;
    if (tokens) {
      if (typeof tokens.input === "number") {
        accumulator.usage.inputTokens += tokens.input;
        accumulator.hasUsage = true;
      }
      if (typeof tokens.output === "number") {
        accumulator.usage.outputTokens += tokens.output;
        accumulator.hasUsage = true;
      }
      if (typeof tokens.reasoning === "number") {
        accumulator.usage.outputTokens += tokens.reasoning;
        accumulator.hasUsage = true;
      }
      const cacheRead = tokens.cache?.read;
      if (typeof cacheRead === "number") {
        accumulator.usage.cachedInputTokens =
          (accumulator.usage.cachedInputTokens || 0) + cacheRead;
      }
    }
    if (typeof payload.part.cost === "number") {
      accumulator.costUsd += payload.part.cost;
    }
    return "";
  }

  if (payload.type === "tool_use" && payload.part?.state?.status === "error") {
    const text = errorText(payload.part.state.error).trim();
    if (text) accumulator.errors.push(text);
    return "";
  }

  if (payload.type === "error") {
    const text = errorText(payload.error ?? payload.message).trim();
    if (text) accumulator.errors.push(text);
    return "";
  }

  return "";
}

export function consumeOpenCodeJsonStream(
  accumulator: OpenCodeStreamAccumulator,
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

export function flushOpenCodeJsonStream(
  accumulator: OpenCodeStreamAccumulator
): string {
  if (!accumulator.buffer) return "";

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeLine(accumulator, buffered);
}

const OPENCODE_UNKNOWN_SESSION =
  /unknown\s+session|session\b.*\bnot\s+found|resource\s+not\s+found:.*[\\/]session[\\/].*\.json|notfounderror|no session/i;

export function isOpenCodeUnknownSessionError(
  stdout: string,
  stderr: string
): boolean {
  return OPENCODE_UNKNOWN_SESSION.test(`${stdout}\n${stderr}`);
}

export function getOpenCodeUsage(
  accumulator: OpenCodeStreamAccumulator
): AdapterUsageSummary | undefined {
  if (!accumulator.hasUsage) return undefined;
  const usage: AdapterUsageSummary = {
    inputTokens: accumulator.usage.inputTokens,
    outputTokens: accumulator.usage.outputTokens,
  };
  if (
    typeof accumulator.usage.cachedInputTokens === "number" &&
    accumulator.usage.cachedInputTokens > 0
  ) {
    usage.cachedInputTokens = accumulator.usage.cachedInputTokens;
  }
  return usage;
}
