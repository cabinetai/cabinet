import type { AdapterUsageSummary } from "./types";

interface CodexTurnCompletedPayload {
  type?: string;
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  };
}

interface CodexItemPayload {
  type?: string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
  };
  thread_id?: string;
}

interface CodexErrorPayload {
  type?: string;
  message?: string;
  error?: {
    message?: string;
    type?: string;
  };
}

export interface CodexStreamAccumulator {
  buffer: string;
  display: string;
  threadId?: string | null;
  usage?: AdapterUsageSummary;
  lastAgentMessage?: string | null;
  startedCommands: Set<string>;
  /**
   * Human-readable error text captured from an in-stream `{"type":"error"}`
   * or `{"type":"turn.failed"}` event. Codex emits plan-gating and model-
   * availability failures this way (on stdout, not stderr), so `codex-local`
   * prefers this over filtered stderr when surfacing `errorMessage` to the
   * runner. Null until an error event is seen.
   */
  errorMessage?: string | null;
}

function appendDisplay(
  accumulator: CodexStreamAccumulator,
  text: string
): string {
  if (!text) return "";
  accumulator.display = `${accumulator.display}${text}`;
  return text;
}

function normalizeAgentMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `${trimmed}\n`;
}

/** Reasoning breadcrumbs (Codex `item.type === "reasoning"`). */
function normalizeReasoningLine(text: string): string {
  const trimmed = text.trim().replace(/\*\*/g, "").trim();
  if (!trimmed) return "";
  return `${trimmed}\n\n`;
}

function rememberAgentText(accumulator: CodexStreamAccumulator, raw: string): void {
  const trimmed = raw.trim().replace(/\*\*/g, "").trim();
  if (trimmed) {
    accumulator.lastAgentMessage = trimmed;
  }
}

function normalizeCommandStart(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  return `\n$ ${trimmed}\n`;
}

function normalizeCommandOutput(output: string): string {
  if (!output) return "";
  return output.endsWith("\n") ? output : `${output}\n`;
}

function parseUsage(
  payload: CodexTurnCompletedPayload["usage"]
): AdapterUsageSummary | undefined {
  if (!payload) return undefined;
  if (
    typeof payload.input_tokens !== "number" ||
    typeof payload.output_tokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens: payload.input_tokens,
    outputTokens: payload.output_tokens,
    ...(typeof payload.cached_input_tokens === "number"
      ? { cachedInputTokens: payload.cached_input_tokens }
      : {}),
  };
}

function extractErrorMessage(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Codex often wraps the upstream HTTP error as a JSON-stringified payload:
  //   `{"type":"error","status":400,"error":{"message":"...","type":"invalid_request_error"}}`
  // Try to unwrap to the innermost human-readable `message`; if parsing
  // fails we just fall back to the raw string.
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const inner = (parsed as { error?: { message?: string } }).error?.message;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
      const outer = (parsed as { message?: string }).message;
      if (typeof outer === "string" && outer.trim()) return outer.trim();
    }
  } catch {
    // not JSON — fall through
  }
  return trimmed;
}

function consumeCodexEvent(
  accumulator: CodexStreamAccumulator,
  line: string
): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed) as CodexItemPayload &
      CodexTurnCompletedPayload &
      CodexErrorPayload;

    if (payload.type === "thread.started" && typeof payload.thread_id === "string") {
      accumulator.threadId = payload.thread_id;
      return "";
    }

    if (payload.type === "turn.completed") {
      const usage = parseUsage(payload.usage);
      if (usage) {
        accumulator.usage = usage;
      }
      return "";
    }

    // In-stream error (e.g. model not supported by the user's Codex plan).
    // Prefer the first `"error"` event's message; only fall back to
    // `turn.failed` when nothing has been captured yet — the two typically
    // arrive in quick succession and carry identical text.
    // Surface the message in the display stream so the transcript + task
    // drawer show the failure immediately (previously errors were captured
    // only in errorMessage and the UI stayed "Running" until process exit).
    if (payload.type === "error") {
      const message = extractErrorMessage(payload.message);
      if (!accumulator.errorMessage) {
        accumulator.errorMessage = message;
      }
      return message ? appendDisplay(accumulator, `${message}\n`) : "";
    }
    if (payload.type === "turn.failed") {
      const message = extractErrorMessage(payload.error?.message);
      if (!accumulator.errorMessage) {
        accumulator.errorMessage = message;
      }
      return message ? appendDisplay(accumulator, `${message}\n`) : "";
    }

    if (!payload.item) {
      return "";
    }

    const itemId = payload.item.id || "";

    if (payload.type === "item.started" && payload.item.type === "command_execution") {
      if (!itemId) return "";
      accumulator.startedCommands.add(itemId);
      return appendDisplay(
        accumulator,
        normalizeCommandStart(payload.item.command || "")
      );
    }

    if (
      payload.type === "item.completed" &&
      (payload.item.type === "agent_message" ||
        payload.item.type === "message")
    ) {
      const raw = parseCodexItemText(payload.item);
      const text = normalizeAgentMessage(raw);
      if (!text) return "";
      rememberAgentText(accumulator, raw);
      return appendDisplay(accumulator, text);
    }

    if (payload.type === "item.completed" && payload.item.type === "reasoning") {
      const text = normalizeReasoningLine(payload.item.text || "");
      if (!text) return "";
      // Some Codex models (e.g. gpt-5.4-mini) emit reasoning lines but no
      // final agent_message — keep the last reasoning as a fallback answer.
      rememberAgentText(accumulator, payload.item.text || "");
      return appendDisplay(accumulator, text);
    }

    if (payload.type === "item.completed" && payload.item.type === "error") {
      const message = extractErrorMessage(
        (payload.item as { message?: string }).message
      );
      if (!message) return "";
      if (!accumulator.errorMessage) {
        accumulator.errorMessage = message;
      }
      return appendDisplay(accumulator, `${message}\n`);
    }

    if (payload.type === "item.completed" && payload.item.type === "command_execution") {
      let display = "";
      if (itemId && !accumulator.startedCommands.has(itemId)) {
        display += normalizeCommandStart(payload.item.command || "");
      }
      if (itemId) {
        accumulator.startedCommands.delete(itemId);
      }

      display += normalizeCommandOutput(payload.item.aggregated_output || "");
      return appendDisplay(accumulator, display);
    }
  } catch {
    // Codex may print a plain-text final line after the JSONL stream.
    if (!trimmed.startsWith("{")) {
      rememberAgentText(accumulator, trimmed);
      return appendDisplay(accumulator, normalizeAgentMessage(trimmed));
    }
    return "";
  }

  return "";
}

function parseCodexItemText(item: CodexItemPayload["item"]): string {
  if (!item) return "";
  if (typeof item.text === "string" && item.text.trim()) {
    return item.text.trim();
  }
  const content = (item as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: string }).text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return "";
}

export function createCodexStreamAccumulator(): CodexStreamAccumulator {
  return {
    buffer: "",
    display: "",
    threadId: null,
    usage: undefined,
    lastAgentMessage: null,
    startedCommands: new Set<string>(),
    errorMessage: null,
  };
}

export function consumeCodexJsonStream(
  accumulator: CodexStreamAccumulator,
  chunk: string
): string {
  accumulator.buffer = `${accumulator.buffer}${chunk}`;
  const lines = accumulator.buffer.split(/\r?\n/);
  accumulator.buffer = lines.pop() || "";

  let display = "";
  for (const line of lines) {
    display += consumeCodexEvent(accumulator, line);
  }

  return display;
}

export function flushCodexJsonStream(
  accumulator: CodexStreamAccumulator
): string {
  if (!accumulator.buffer) {
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeCodexEvent(accumulator, buffered);
}

/**
 * Reconstruct display text from a raw Codex JSONL transcript on disk. Used when
 * stream chunks never made it into `display` but JSON lines were appended.
 */
export function extractCodexJsonlDisplay(transcript: string): string {
  const agentMessages: string[] = [];
  const reasoning: string[] = [];
  const commandOutputs: string[] = [];
  const plainLines: string[] = [];

  for (const line of transcript.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("{")) {
      plainLines.push(trimmed);
      continue;
    }
    try {
      const event = JSON.parse(trimmed) as CodexItemPayload & {
        item?: CodexItemPayload["item"] & { message?: string };
      };
      if (event.type !== "item.completed" || !event.item?.type) continue;
      const text = parseCodexItemText(event.item);
      const message = (event.item as { message?: string }).message?.trim();
      if (event.item.type === "agent_message" || event.item.type === "message") {
        if (text) agentMessages.push(text);
      } else if (event.item.type === "reasoning") {
        if (text) reasoning.push(text.replace(/\*\*/g, "").trim());
      } else if (event.item.type === "command_execution") {
        const output = event.item.aggregated_output?.trim();
        if (output) commandOutputs.push(output);
      } else if (event.item.type === "error" && (message || text)) {
        agentMessages.push(message || text);
      }
    } catch {
      // not JSONL
    }
  }

  if (agentMessages.length > 0) {
    return agentMessages.join("\n\n");
  }
  if (commandOutputs.length > 0) {
    return commandOutputs[commandOutputs.length - 1];
  }
  if (reasoning.length > 0) {
    return reasoning[reasoning.length - 1];
  }
  if (plainLines.length > 0) {
    return plainLines.join("\n");
  }
  return "";
}

/** Recover display text from raw stdout when the live accumulator stayed empty. */
/** Normalize Codex stdout/transcript for storage and turn rendering. */
export function resolveCodexConversationOutput(output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return "";
  const fromJsonl = extractCodexJsonlDisplay(trimmed);
  if (fromJsonl.trim()) return fromJsonl;
  return trimmed;
}

export function recoverCodexStdoutOutput(
  rawStdout: string,
  accumulator?: CodexStreamAccumulator | null
): string {
  const fromAccumulator = accumulator
    ? resolveCodexDisplayOutput(accumulator)
    : "";
  if (fromAccumulator.trim()) return fromAccumulator;

  const fromJsonl = extractCodexJsonlDisplay(rawStdout);
  if (fromJsonl.trim()) return fromJsonl;

  const plainLines: string[] = [];
  for (const line of rawStdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{")) continue;
    plainLines.push(trimmed);
  }
  return plainLines.join("\n").trim();
}

export function resolveCodexDisplayOutput(
  accumulator: CodexStreamAccumulator
): string {
  return (
    accumulator.display.trim() ||
    accumulator.lastAgentMessage?.trim() ||
    ""
  );
}

const CODEX_STDERR_NOISE_PATTERNS = [
  /^Reading prompt from stdin\.\.\.$/,
  // Codex's Rust `tracing` diagnostics: `<ISO-8601>Z <LEVEL> <target>: msg`.
  // These are session/runtime logs (skill-load failures, state-db migration
  // warnings, snapshot cleanup) — never model output, which arrives on stdout
  // as JSON. Suppress the whole class so a malformed host skill (invalid
  // SKILL.md YAML) or any future codex log line can't leak into the turn or
  // pollute the error-classification input.
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+(?:TRACE|DEBUG|INFO|WARN|ERROR)\b/,
  /WARN codex_state::runtime: failed to open state db/,
  /WARN codex_rollout::list: state db discrepancy/,
  /WARN codex_core::plugins::manifest: ignoring interface\.defaultPrompt/,
  /WARN codex_core::shell_snapshot: Failed to delete shell snapshot/,
  /WARN codex_exec: thread\/read failed while backfilling turn items for turn completion/,
];

export interface CodexStderrAccumulator {
  buffer: string;
}

export function createCodexStderrAccumulator(): CodexStderrAccumulator {
  return {
    buffer: "",
  };
}

function shouldSuppressCodexStderrLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return CODEX_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function consumeCodexStderrLine(line: string): string {
  if (shouldSuppressCodexStderrLine(line)) {
    return "";
  }

  return line.endsWith("\n") ? line : `${line}\n`;
}

export function consumeCodexStderr(
  accumulator: CodexStderrAccumulator,
  chunk: string
): string {
  accumulator.buffer = `${accumulator.buffer}${chunk}`;
  const lines = accumulator.buffer.split(/\r?\n/);
  accumulator.buffer = lines.pop() || "";

  let display = "";
  for (const line of lines) {
    display += consumeCodexStderrLine(line);
  }

  return display;
}

export function flushCodexStderr(
  accumulator: CodexStderrAccumulator
): string {
  if (!accumulator.buffer) {
    return "";
  }

  const buffered = accumulator.buffer;
  accumulator.buffer = "";
  return consumeCodexStderrLine(buffered);
}
