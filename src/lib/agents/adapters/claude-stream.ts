import type { AdapterBillingType, AdapterUsageSummary } from "./types";
import { wrapToolOutput } from "../tool-output-markers";

interface ClaudeUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ClaudeAssistantPayload {
  type?: string;
  session_id?: string;
  apiKeySource?: string;
  message?: {
    model?: string;
    usage?: ClaudeUsagePayload;
    content?: Array<{ type?: string; text?: string }>;
  };
  event?: {
    type?: string;
    message?: {
      model?: string;
      usage?: ClaudeUsagePayload;
    };
    delta?: { type?: string; text?: string };
  };
  tool_use_result?: {
    stdout?: string;
    stderr?: string;
  };
  usage?: ClaudeUsagePayload;
  result?: string;
}

export interface ClaudeStreamAccumulator {
  buffer: string;
  streamedText: string;
  finalText?: string | null;
  sessionId?: string | null;
  model?: string | null;
  usage?: AdapterUsageSummary;
  billingType?: AdapterBillingType | null;
}

export function createClaudeStreamAccumulator(): ClaudeStreamAccumulator {
  return {
    buffer: "",
    streamedText: "",
    finalText: null,
    sessionId: null,
    model: null,
    usage: undefined,
    billingType: null,
  };
}

function extractClaudeDeltaText(payload: ClaudeAssistantPayload): string {
  if (
    payload.type === "stream_event" &&
    payload.event?.type === "content_block_delta" &&
    payload.event.delta?.type === "text_delta"
  ) {
    return payload.event.delta.text || "";
  }

  return "";
}

function extractClaudeToolResultText(payload: ClaudeAssistantPayload): string {
  if (payload.type === "user" && payload.tool_use_result) {
    return [payload.tool_use_result.stdout, payload.tool_use_result.stderr]
      .filter((value) => typeof value === "string" && value.trim())
      .join("\n");
  }

  return "";
}

function extractClaudeFinalText(payload: ClaudeAssistantPayload): string {
  if (payload.type === "assistant") {
    return (
      payload.message?.content
        ?.filter((item) => item?.type === "text" && typeof item.text === "string")
        .map((item) => item.text || "")
        .join("") || ""
    );
  }

  if (payload.type === "result" && typeof payload.result === "string") {
    return payload.result;
  }

  return "";
}

function parseUsage(payload?: ClaudeUsagePayload): AdapterUsageSummary | undefined {
  if (!payload) return undefined;

  const inputTokens =
    typeof payload.input_tokens === "number" ? payload.input_tokens : undefined;
  const outputTokens =
    typeof payload.output_tokens === "number" ? payload.output_tokens : undefined;
  const cachedInputTokens =
    typeof payload.cache_read_input_tokens === "number"
      ? payload.cache_read_input_tokens
      : undefined;

  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    ...(typeof cachedInputTokens === "number" ? { cachedInputTokens } : {}),
  };
}

function captureMetadata(
  accumulator: ClaudeStreamAccumulator,
  payload: ClaudeAssistantPayload
): void {
  if (typeof payload.session_id === "string" && payload.session_id.trim()) {
    accumulator.sessionId = payload.session_id;
  }

  if (typeof payload.apiKeySource === "string" && !accumulator.billingType) {
    accumulator.billingType = payload.apiKeySource === "none" ? "subscription" : "api";
  }

  const model =
    payload.message?.model ||
    payload.event?.message?.model ||
    null;
  if (model) {
    accumulator.model = model;
  }

  const usage =
    parseUsage(payload.usage) ||
    parseUsage(payload.message?.usage) ||
    parseUsage(payload.event?.message?.usage);
  if (usage) {
    accumulator.usage = usage;
  }

  const finalText = extractClaudeFinalText(payload);
  if (finalText) {
    accumulator.finalText = finalText;
  }
}

function consumeLine(
  accumulator: ClaudeStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed) as ClaudeAssistantPayload;
    captureMetadata(accumulator, payload);

    const deltaText = extractClaudeDeltaText(payload);
    if (deltaText) {
      accumulator.streamedText = `${accumulator.streamedText}${deltaText}`;
      return deltaText;
    }

    const toolText = extractClaudeToolResultText(payload);
    if (toolText) {
      // Fence tool stdout/stderr (incl. shell-init noise + `ls` dumps) so the
      // renderer can collapse it instead of flattening it into the prose.
      const wrapped = wrapToolOutput(toolText.trimEnd());
      accumulator.streamedText = `${accumulator.streamedText}${wrapped}`;
      return wrapped;
    }

    if (!accumulator.streamedText && accumulator.finalText) {
      accumulator.streamedText = accumulator.finalText;
      return accumulator.finalText;
    }
  } catch {
    return "";
  }

  return "";
}

export function consumeClaudeStreamJson(
  accumulator: ClaudeStreamAccumulator,
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

export function flushClaudeStreamJson(
  accumulator: ClaudeStreamAccumulator
): string {
  if (!accumulator.buffer) {
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeLine(accumulator, buffered);
}
