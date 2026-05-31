import type { AdapterUsageSummary } from "./types";

interface GeminiInitPayload {
  type?: string;
  session_id?: string;
  model?: string;
}

interface GeminiMessagePayload {
  type?: string;
  role?: string;
  content?: string;
  delta?: boolean;
}

interface GeminiToolUsePayload {
  type?: string;
  tool_name?: string;
  tool_id?: string;
  parameters?: {
    command?: string;
  };
}

interface GeminiToolResultPayload {
  type?: string;
  status?: string;
}

interface GeminiResultPayload {
  type?: string;
  status?: string;
  stats?: {
    input_tokens?: number;
    output_tokens?: number;
    cached?: number;
    models?: Record<
      string,
      {
        input_tokens?: number;
        output_tokens?: number;
        cached?: number;
      }
    >;
  };
}

export interface GeminiStreamAccumulator {
  buffer: string;
  display: string;
  sessionId?: string | null;
  model?: string | null;
  usage?: AdapterUsageSummary;
  lastAssistantMessage?: string | null;
  currentAssistantMessage: string;
}

function appendDisplay(
  accumulator: GeminiStreamAccumulator,
  text: string
): string {
  if (!text) return "";
  accumulator.display = `${accumulator.display}${text}`;
  return text;
}

function commitAssistantMessage(accumulator: GeminiStreamAccumulator): void {
  const trimmed = accumulator.currentAssistantMessage.trim();
  if (trimmed) {
    accumulator.lastAssistantMessage = trimmed;
  }
  accumulator.currentAssistantMessage = "";
}

function parseUsage(
  payload: GeminiResultPayload["stats"]
): AdapterUsageSummary | undefined {
  if (
    !payload ||
    typeof payload.input_tokens !== "number" ||
    typeof payload.output_tokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens: payload.input_tokens,
    outputTokens: payload.output_tokens,
    ...(typeof payload.cached === "number" && payload.cached > 0
      ? { cachedInputTokens: payload.cached }
      : {}),
  };
}

function consumeGeminiEvent(
  accumulator: GeminiStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed) as { type?: string };

    if (payload.type === "init") {
      const initPayload = payload as GeminiInitPayload;
      if (typeof initPayload.session_id === "string") {
        accumulator.sessionId = initPayload.session_id;
      }
      if (typeof initPayload.model === "string") {
        accumulator.model = initPayload.model;
      }
      return "";
    }

    if (payload.type === "message") {
      const messagePayload = payload as GeminiMessagePayload;
      if (
        messagePayload.role !== "assistant" ||
        typeof messagePayload.content !== "string"
      ) {
        return "";
      }
      accumulator.currentAssistantMessage = `${accumulator.currentAssistantMessage}${messagePayload.content}`;
      return appendDisplay(accumulator, messagePayload.content);
    }

    if (payload.type === "tool_use") {
      const toolUsePayload = payload as GeminiToolUsePayload;
      commitAssistantMessage(accumulator);
      if (
        toolUsePayload.tool_name === "run_shell_command" &&
        typeof toolUsePayload.parameters?.command === "string"
      ) {
        const prefix = accumulator.display && !accumulator.display.endsWith("\n")
          ? "\n"
          : "";
        return appendDisplay(
          accumulator,
          `${prefix}$ ${toolUsePayload.parameters.command.trim()}\n`
        );
      }
      return "";
    }

    if (payload.type === "tool_result") {
      const toolResultPayload = payload as GeminiToolResultPayload;
      if (
        toolResultPayload.status &&
        toolResultPayload.status !== "success"
      ) {
        const prefix = accumulator.display && !accumulator.display.endsWith("\n")
          ? "\n"
          : "";
        return appendDisplay(
          accumulator,
          `${prefix}[tool failed: ${toolResultPayload.status}]\n`
        );
      }
      return "";
    }

    if (payload.type === "result") {
      const resultPayload = payload as GeminiResultPayload;
      commitAssistantMessage(accumulator);
      const usage = parseUsage(resultPayload.stats);
      if (usage) {
        accumulator.usage = usage;
      }

      if (!accumulator.model && resultPayload.stats?.models) {
        const [firstModel] = Object.keys(resultPayload.stats.models);
        if (firstModel) {
          accumulator.model = firstModel;
        }
      }
    }
  } catch {
    return "";
  }

  return "";
}

export function createGeminiStreamAccumulator(): GeminiStreamAccumulator {
  return {
    buffer: "",
    display: "",
    sessionId: null,
    model: null,
    usage: undefined,
    lastAssistantMessage: null,
    currentAssistantMessage: "",
  };
}

export function consumeGeminiJsonStream(
  accumulator: GeminiStreamAccumulator,
  chunk: string
): string {
  accumulator.buffer = `${accumulator.buffer}${chunk}`;
  const lines = accumulator.buffer.split(/\r?\n/);
  accumulator.buffer = lines.pop() || "";

  let display = "";
  for (const line of lines) {
    display += consumeGeminiEvent(accumulator, line);
  }

  return display;
}

export function flushGeminiJsonStream(
  accumulator: GeminiStreamAccumulator
): string {
  if (!accumulator.buffer) {
    commitAssistantMessage(accumulator);
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeGeminiEvent(accumulator, buffered);
}

const GEMINI_STDERR_NOISE_PATTERNS = [
  /^YOLO mode is enabled\./,
  /^Skill conflict detected:/,
];

export interface GeminiStderrAccumulator {
  buffer: string;
}

export function createGeminiStderrAccumulator(): GeminiStderrAccumulator {
  return {
    buffer: "",
  };
}

function shouldSuppressGeminiStderrLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return GEMINI_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function consumeGeminiStderrLine(line: string): string {
  if (shouldSuppressGeminiStderrLine(line)) {
    return "";
  }

  return line.endsWith("\n") ? line : `${line}\n`;
}

export function consumeGeminiStderr(
  accumulator: GeminiStderrAccumulator,
  chunk: string
): string {
  accumulator.buffer = `${accumulator.buffer}${chunk}`;
  const lines = accumulator.buffer.split(/\r?\n/);
  accumulator.buffer = lines.pop() || "";

  let display = "";
  for (const line of lines) {
    display += consumeGeminiStderrLine(line);
  }

  return display;
}

export function flushGeminiStderr(
  accumulator: GeminiStderrAccumulator
): string {
  if (!accumulator.buffer) {
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeGeminiStderrLine(buffered);
}

export function filterGeminiStderr(stderr: string): string {
  const accumulator = createGeminiStderrAccumulator();
  const display = consumeGeminiStderr(accumulator, stderr);
  const trailing = flushGeminiStderr(accumulator);
  return `${display}${trailing}`.trim();
}
