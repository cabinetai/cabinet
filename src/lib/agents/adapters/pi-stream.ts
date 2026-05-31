import type { AdapterUsageSummary } from "./types";

interface PiEventPayload {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  delta?: string;
  message?: unknown;
  assistantMessageEvent?: { type?: string; delta?: string };
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cost?: { total?: number };
  };
  success?: boolean;
  finalError?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  toolResults?: Array<{ toolCallId?: string; content?: unknown; isError?: boolean }>;
  isError?: boolean;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: string; text?: string } =>
      Boolean(
        part &&
          typeof part === "object" &&
          (part as { type?: unknown }).type === "text"
      )
    )
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface PiStreamAccumulator {
  buffer: string;
  display: string;
  currentMessage: string;
  messages: string[];
  errors: string[];
  usage: AdapterUsageSummary;
  hasUsage: boolean;
  costUsd: number;
  finalMessage?: string | null;
  lastEventEndedWithNewline: boolean;
}

export function createPiStreamAccumulator(): PiStreamAccumulator {
  return {
    buffer: "",
    display: "",
    currentMessage: "",
    messages: [],
    errors: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    hasUsage: false,
    costUsd: 0,
    finalMessage: null,
    lastEventEndedWithNewline: true,
  };
}

function appendDisplay(
  accumulator: PiStreamAccumulator,
  text: string
): string {
  if (!text) return "";
  accumulator.display = `${accumulator.display}${text}`;
  accumulator.lastEventEndedWithNewline = accumulator.display.endsWith("\n");
  return text;
}

function commitCurrentMessage(accumulator: PiStreamAccumulator): void {
  const trimmed = accumulator.currentMessage.trim();
  if (trimmed) {
    accumulator.messages.push(trimmed);
    accumulator.finalMessage = trimmed;
  }
  accumulator.currentMessage = "";
}

function consumeLine(
  accumulator: PiStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  let payload: PiEventPayload;
  try {
    payload = JSON.parse(trimmed) as PiEventPayload;
  } catch {
    return "";
  }

  const type = payload.type || "";

  if (
    type === "response" ||
    type === "extension_ui_request" ||
    type === "extension_ui_response" ||
    type === "extension_error" ||
    type === "agent_start" ||
    type === "turn_start"
  ) {
    return "";
  }

  if (type === "message_update" && payload.assistantMessageEvent) {
    const assistantEvent = payload.assistantMessageEvent;
    if (assistantEvent.type === "text_delta" && typeof assistantEvent.delta === "string") {
      accumulator.currentMessage += assistantEvent.delta;
      return appendDisplay(accumulator, assistantEvent.delta);
    }
    return "";
  }

  if (type === "tool_execution_start") {
    const toolName = payload.toolName || "tool";
    commitCurrentMessage(accumulator);
    const prefix = accumulator.lastEventEndedWithNewline ? "" : "\n";
    return appendDisplay(accumulator, `${prefix}[pi:${toolName}]\n`);
  }

  if (type === "tool_execution_end" && payload.isError === true) {
    const prefix = accumulator.lastEventEndedWithNewline ? "" : "\n";
    return appendDisplay(accumulator, `${prefix}[pi:tool failed]\n`);
  }

  if (type === "turn_end") {
    const message = asRecord(payload.message);
    if (message) {
      const text = extractTextContent(message.content);
      if (text) {
        commitCurrentMessage(accumulator);
        accumulator.finalMessage = text;
        if (!accumulator.messages.includes(text)) {
          accumulator.messages.push(text);
        }
      }
      const usage = asRecord(message.usage);
      if (usage) {
        const input = typeof usage.input === "number" ? usage.input : 0;
        const output = typeof usage.output === "number" ? usage.output : 0;
        const cacheRead = typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
        accumulator.usage.inputTokens += input;
        accumulator.usage.outputTokens += output;
        accumulator.usage.cachedInputTokens =
          (accumulator.usage.cachedInputTokens || 0) + cacheRead;
        accumulator.hasUsage = accumulator.hasUsage || input > 0 || output > 0;
        const cost = asRecord(usage.cost);
        if (cost && typeof cost.total === "number") {
          accumulator.costUsd += cost.total;
        }
      }
    }
    return "";
  }

  if (type === "agent_end") {
    commitCurrentMessage(accumulator);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant") {
        const text = extractTextContent(last.content);
        if (text) accumulator.finalMessage = text;
      }
    }
    return "";
  }

  if (type === "auto_retry_end") {
    if (payload.success === false) {
      const finalError = (payload.finalError || "").trim();
      accumulator.errors.push(
        finalError || "Pi exhausted automatic retries without producing a response."
      );
    }
    return "";
  }

  if (type === "error") {
    const msg = typeof payload.message === "string" ? payload.message.trim() : "";
    if (msg) accumulator.errors.push(msg);
    return "";
  }

  return "";
}

export function consumePiJsonStream(
  accumulator: PiStreamAccumulator,
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

export function flushPiJsonStream(
  accumulator: PiStreamAccumulator
): string {
  if (!accumulator.buffer) {
    commitCurrentMessage(accumulator);
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  const out = consumeLine(accumulator, buffered);
  commitCurrentMessage(accumulator);
  return out;
}

export function getPiUsage(
  accumulator: PiStreamAccumulator
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
