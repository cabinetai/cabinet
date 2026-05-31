import path from "path";
import fs from "fs";
import { DATA_DIR } from "../../src/lib/storage/path-utils";
import {
  consumeClaudeStreamJson,
  createClaudeStreamAccumulator,
  flushClaudeStreamJson,
} from "../../src/lib/agents/adapters/claude-stream";
import {
  finalizeConversation,
  parseCabinetBlock,
  readConversationMeta,
  transcriptShowsCompletedRun,
  writeConversationMeta,
} from "../../src/lib/agents/conversation-store";
import { publishConversationEvent } from "../../src/lib/agents/conversation-events";
import { stripAnsi } from "./ansi";
import type { CompletedOutputEntry, PtySession } from "./types";

export const CLAUDE_AUTO_EXIT_GRACE_MS = 1200;
const STREAM_EXTRACTION_DEBOUNCE_MS = 1000;

/**
 * Detect whether Claude's TUI has settled at its input prompt. Two signals:
 * the welcome footer ("shift+tab to cycle") rendered on boot, or a bare
 * `>`/`❯` glyph on its own line (input cursor).
 */
export function claudePromptReady(output: string): boolean {
  const plain = stripAnsi(output).replace(/\r/g, "\n");
  return (
    plain.includes("shift+tab to cycle") ||
    /(?:^|\n)[❯>]\s*$/.test(plain)
  );
}

export function clearClaudeCompletionTimer(session: PtySession): void {
  if (!session.claudeCompletionTimer) return;
  clearTimeout(session.claudeCompletionTimer);
  delete session.claudeCompletionTimer;
}

/**
 * Claude Code runs in one-shot mode emit their stream as line-delimited
 * stream-json. We wrap the Claude-stream accumulator so `term.onData` can
 * feed it PTY chunks and get back a "display" string (the human-readable
 * transcript that falls out of the JSON events).
 */
export function consumeStructuredOutput(session: PtySession, chunk: string): string {
  if (session.outputMode !== "claude-stream-json") {
    return chunk;
  }

  if (!session.structuredOutput) {
    session.structuredOutput = createClaudeStreamAccumulator();
  }

  return consumeClaudeStreamJson(session.structuredOutput, chunk);
}

export function flushStructuredOutput(session: PtySession): string {
  if (session.outputMode !== "claude-stream-json" || !session.structuredOutput) {
    return "";
  }

  return flushClaudeStreamJson(session.structuredOutput);
}

/**
 * Type the initial prompt into the CLI, then send Enter after the paste
 * window closes (see comment inline — Claude groups rapid input as a paste).
 */
export function submitInitialPrompt(session: PtySession): void {
  if (!session.initialPrompt || session.initialPromptSent || session.exited) {
    return;
  }

  session.initialPromptSent = true;
  session.promptSubmittedOutputLength = session.output.join("").length;
  if (session.initialPromptTimer) {
    clearTimeout(session.initialPromptTimer);
    delete session.initialPromptTimer;
  }

  session.pty.write(session.initialPrompt);
  // Claude Code's TUI groups rapidly-arriving input into a `[Pasted text
  // #N +X lines]` block; while paste mode is active a trailing `\r`
  // becomes part of the paste instead of a submit keystroke, and the
  // prompt sits in the input waiting for the user to hit Enter. The
  // paste window is ~100-200ms of quiet, so wait comfortably past it
  // before sending Enter.
  setTimeout(() => {
    if (!session.exited) {
      session.pty.write("\r");
    }
  }, 600);
}

/**
 * Interactive CLIs (Claude session mode, Codex, etc.) print the cabinet
 * epilogue block ( ```cabinet / SUMMARY: / ARTIFACT: / ``` ) and then sit at
 * an idle prompt waiting for more input. We debounce-poll the accumulated
 * stdout for ~1s after each chunk; when a cabinet block with a SUMMARY is
 * detected, we:
 *   1. Write meta.summary / meta.contextSummary / meta.artifactPaths
 *   2. Publish task.updated so the Details tab refetches
 *
 * We do NOT exit the CLI — keeping the terminal open preserves the full
 * interactive experience. The user continues typing or manually exits
 * (Ctrl-D / /exit) when they're done; PTY exit then runs the daemon's
 * finalize path which is idempotent with the values already written here.
 *
 * The fingerprint guard lets us re-apply when a later turn emits a new
 * cabinet block (e.g. user follows up and the agent produces a fresh
 * SUMMARY + ARTIFACT set).
 */
export function scheduleStreamCabinetExtraction(session: PtySession): void {
  if (session.exited || session.resolvedStatus) return;

  if (session.streamExtractionTimer) {
    clearTimeout(session.streamExtractionTimer);
  }
  session.streamExtractionTimer = setTimeout(() => {
    delete session.streamExtractionTimer;
    void runStreamCabinetExtraction(session).catch(() => {});
  }, STREAM_EXTRACTION_DEBOUNCE_MS);
}

function buildStreamExtractionFingerprint(parsed: {
  summary?: string;
  contextSummary?: string;
  artifactPaths: string[];
}): string {
  return [
    parsed.summary ?? "",
    parsed.contextSummary ?? "",
    parsed.artifactPaths.join("|"),
  ].join("§");
}

async function runStreamCabinetExtraction(session: PtySession): Promise<void> {
  if (session.exited || session.resolvedStatus) return;

  const plain = stripAnsi(session.output.join(""));
  if (!/```cabinet[\s\S]*?```/i.test(plain)) return;

  const meta = await readConversationMeta(session.id).catch(() => null);
  if (!meta || meta.status !== "running") return;

  let prompt = "";
  try {
    if (meta.promptPath) {
      const fsPath = path.resolve(DATA_DIR, meta.promptPath);
      if (fsPath.startsWith(DATA_DIR)) {
        prompt = await fs.promises.readFile(fsPath, "utf8");
      }
    }
  } catch {
    prompt = "";
  }

  const parsed = parseCabinetBlock(plain, prompt);
  if (!parsed.summary) return;

  const fingerprint = buildStreamExtractionFingerprint(parsed);
  if (session.streamExtractionFingerprint === fingerprint) return;
  session.streamExtractionFingerprint = fingerprint;

  meta.summary = parsed.summary;
  meta.contextSummary = parsed.contextSummary;
  meta.artifactPaths = parsed.artifactPaths;

  try {
    await writeConversationMeta(meta);
  } catch {
    session.streamExtractionFingerprint = undefined;
    return;
  }

  publishConversationEvent({
    type: "task.updated",
    taskId: session.id,
    cabinetPath: meta.cabinetPath,
    payload: { streaming: true, streamExtracted: true },
  });
}

/**
 * Distill raw PTY output into a 1-line summary suitable for the task detail
 * header. PTY output is full of TUI chrome (box-drawing, CLI banners, prompt
 * strings) that makes "first non-blank line" rules useless for terminal-mode
 * tasks. Build a deterministic synthetic line keyed off exit code + line
 * count + any extracted agent-looking response.
 */
export function distillPtyOutput(
  plain: string,
  exitCode: number | null,
  providerId: string | undefined
): string {
  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lineCount = lines.length;
  const providerLabel = providerId ? `${providerId} ` : "";
  const status = exitCode === 0 ? "exited cleanly" : `exited with code ${exitCode ?? "?"}`;
  const chromePattern =
    /^[\s│┃┆┊╎╏║┋╿╽─━┄┅┈┉━╌╍═╴╸╼╾┎┏┒┓┖┗┚┛┤├┬┴┼╋╬╏╢╠╣╦╩╬>❯•●○◦·.…:;,!?\-*+=^~`'"]*$/;
  let preview: string | null = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i];
    if (candidate.length < 20) continue;
    if (chromePattern.test(candidate)) continue;
    if (/^\s*\[Process exited/.test(candidate)) continue;
    preview = candidate.slice(0, 160);
    break;
  }
  const tail = preview ? ` — last output: ${preview}` : "";
  return `Terminal ${providerLabel}session ${status} · ${lineCount} line${lineCount === 1 ? "" : "s"}${tail}`;
}

/**
 * Finalize a Claude terminal-mode session once its transcript shows a
 * completed run. Idempotent — guarded by `resolvedStatus` / `autoExitRequested`.
 */
export function completeClaudeSession(
  session: PtySession,
  output: string,
  deps: { completedOutput: Map<string, CompletedOutputEntry> }
): void {
  if (session.exited || session.autoExitRequested || session.resolvedStatus) {
    return;
  }

  clearClaudeCompletionTimer(session);
  session.resolvedStatus = "completed";
  session.resolvingStatus = true;
  session.autoExitRequested = true;
  const plain = stripAnsi(output);
  deps.completedOutput.set(session.id, { output: plain, completedAt: Date.now() });
  // Pass a distilled one-liner — NOT the raw plain transcript — to
  // finalizeConversation. Claude's TUI redraws its animated spinner many
  // times per second; even after ANSI stripping, the transcript is full
  // of "thinking with Xhigh effort" lines plus echoes of the system
  // prompt. Feeding that to parseCabinetBlock's fallback regex produces
  // garbage artifactPaths like "line per file you touched…" and
  // summaries full of box-drawing chars. The one-liner has no SUMMARY:
  // or ARTIFACT: tokens so the fallback correctly extracts nothing, and
  // any fenced cabinet block the agent actually emitted has already
  // been captured via scheduleStreamCabinetExtraction during the run.
  const summaryOutput = distillPtyOutput(plain, 0, session.providerId);
  void finalizeConversation(session.id, {
    status: "completed",
    exitCode: 0,
    output: summaryOutput,
  }).finally(() => {
    session.resolvingStatus = false;
  });
  session.pty.write("/exit\r");
  session.autoExitFallbackTimer = setTimeout(() => {
    if (session.exited) return;
    try {
      session.pty.kill();
    } catch {}
  }, 1500);
}

/**
 * After each chunk, check whether the transcript since the initial prompt
 * submission shows a completed run. If yes:
 *   - manual trigger → flip meta.awaitingInput=true; keep PTY alive until
 *     the user closes it (Done button or /exit in the xterm)
 *   - any other trigger (job/heartbeat/agent) → schedule the 1.2s grace
 *     completion timer and force-exit the CLI, preserving the
 *     fire-and-forget semantics scheduled jobs depend on.
 */
export function maybeAutoExitClaudeSession(
  session: PtySession,
  deps: { completedOutput: Map<string, CompletedOutputEntry> }
): void {
  if (
    !session.initialPrompt ||
    !session.initialPromptSent ||
    session.exited ||
    session.autoExitRequested ||
    session.resolvedStatus
  ) {
    return;
  }

  const submittedLength = session.promptSubmittedOutputLength ?? 0;
  const currentOutput = session.output.join("");
  if (currentOutput.length <= submittedLength) {
    clearClaudeCompletionTimer(session);
    if (session.trigger === "manual") {
      scheduleClaudeBusyFlip(session);
    }
    return;
  }

  const outputSincePrompt = currentOutput.slice(submittedLength);
  if (!transcriptShowsCompletedRun(outputSincePrompt, session.initialPrompt)) {
    clearClaudeCompletionTimer(session);
    if (session.trigger === "manual") {
      scheduleClaudeBusyFlip(session);
    }
    return;
  }

  // Idle detected. For manual runs, don't kill — flip awaitingInput.
  if (session.trigger === "manual") {
    scheduleClaudeIdleFlip(session);
    return;
  }

  if (session.claudeCompletionTimer) {
    return;
  }

  session.claudeCompletionTimer = setTimeout(() => {
    delete session.claudeCompletionTimer;
    if (session.exited || session.autoExitRequested || session.resolvedStatus) {
      return;
    }

    const latestOutput = session.output.join("");
    const latestSubmittedLength = session.promptSubmittedOutputLength ?? 0;
    if (latestOutput.length <= latestSubmittedLength) {
      return;
    }

    const latestSincePrompt = latestOutput.slice(latestSubmittedLength);
    if (!transcriptShowsCompletedRun(latestSincePrompt, session.initialPrompt)) {
      return;
    }

    completeClaudeSession(session, latestOutput, deps);
  }, CLAUDE_AUTO_EXIT_GRACE_MS);
}

/**
 * Manual terminal-mode idle flip: debounced write of
 * `meta.awaitingInput = true` once the TUI has been idle for the grace
 * window. Reuses CLAUDE_AUTO_EXIT_GRACE_MS (1.2s) so the UI feel is
 * consistent with the previous kill-timer cadence — the user sees the
 * status chip flip at the same moment they used to see "Session ended".
 */
function scheduleClaudeIdleFlip(session: PtySession): void {
  if (session.awaitingInput) return;
  // Cancel any pending busy-flip so we don't bounce between states.
  if (session.awaitingInputBusyTimer) {
    clearTimeout(session.awaitingInputBusyTimer);
    delete session.awaitingInputBusyTimer;
  }
  if (session.awaitingInputIdleTimer) return;
  session.awaitingInputIdleTimer = setTimeout(() => {
    delete session.awaitingInputIdleTimer;
    if (session.exited || session.resolvedStatus) return;
    if (session.awaitingInput) return;
    session.awaitingInput = true;
    void flipAwaitingInput(session, true);
  }, CLAUDE_AUTO_EXIT_GRACE_MS);
}

/**
 * Inverse: once new output starts streaming after idle (user typed into
 * the xterm and Claude is responding), flip meta.awaitingInput=false so
 * the UI shows "running" again. Claude's idle prompt continuously
 * re-renders (status hints, cursor blinks) which briefly makes
 * `transcriptShowsCompletedRun` return false even when nothing
 * substantive is happening. So require a longer sustained-busy window
 * (2s — strictly longer than the 1.2s idle window) to avoid flicker,
 * and only flip if the output actually grew by a meaningful amount.
 */
const CLAUDE_BUSY_FLIP_GRACE_MS = 2000;
const CLAUDE_BUSY_MIN_NEW_BYTES = 120;
function scheduleClaudeBusyFlip(session: PtySession): void {
  if (!session.awaitingInput) return;
  if (session.awaitingInputIdleTimer) {
    clearTimeout(session.awaitingInputIdleTimer);
    delete session.awaitingInputIdleTimer;
  }
  if (session.awaitingInputBusyTimer) return;
  // Snapshot output length at the moment busy is suspected. After the
  // grace window, require growth >= CLAUDE_BUSY_MIN_NEW_BYTES to flip —
  // otherwise it's just the idle prompt re-rendering, not real input.
  const snapshotLen = session.output.join("").length;
  session.awaitingInputBusyTimer = setTimeout(() => {
    delete session.awaitingInputBusyTimer;
    if (session.exited || session.resolvedStatus) return;
    if (!session.awaitingInput) return;
    const nowLen = session.output.join("").length;
    if (nowLen - snapshotLen < CLAUDE_BUSY_MIN_NEW_BYTES) return;
    session.awaitingInput = false;
    void flipAwaitingInput(session, false);
  }, CLAUDE_BUSY_FLIP_GRACE_MS);
}

async function flipAwaitingInput(session: PtySession, value: boolean): Promise<void> {
  const meta = await readConversationMeta(session.id).catch(() => null);
  if (!meta || meta.status !== "running") return;
  if ((meta.awaitingInput ?? false) === value) return;
  meta.awaitingInput = value;
  try {
    await writeConversationMeta(meta);
  } catch {
    return;
  }
  publishConversationEvent({
    type: "task.updated",
    taskId: session.id,
    cabinetPath: meta.cabinetPath,
    payload: {
      status: meta.status,
      awaitingInput: value,
    },
  });
}
