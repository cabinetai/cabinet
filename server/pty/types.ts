import type { WebSocket } from "ws";
import type * as pty from "node-pty";
import type { ClaudeStreamAccumulator } from "../../src/lib/agents/adapters/claude-stream";
import type { TaskTrigger } from "../../src/types/tasks";

export type SessionResolutionStatus = "completed" | "failed";

/**
 * Fields shared by every active session (PTY and structured). Kept here so
 * the PTY module can take `BaseSession`-typed arguments without having to
 * know about `StructuredSession`.
 */
export interface BaseSession {
  id: string;
  kind: "pty" | "structured";
  providerId: string;
  adapterType?: string;
  ws: WebSocket | null;
  createdAt: Date;
  output: string[];
  exited: boolean;
  exitCode: number | null;
  resolvedStatus?: SessionResolutionStatus;
  resolvingStatus?: boolean;
  stopFallbackTimer?: NodeJS.Timeout;
  stop: (signal?: NodeJS.Signals) => void;
}

export interface PtySession extends BaseSession {
  kind: "pty";
  pty: pty.IPty;
  timeoutHandle?: NodeJS.Timeout;
  initialPrompt?: string;
  initialPromptSent?: boolean;
  initialPromptTimer?: NodeJS.Timeout;
  promptSubmittedOutputLength?: number;
  autoExitRequested?: boolean;
  autoExitFallbackTimer?: NodeJS.Timeout;
  claudeCompletionTimer?: NodeJS.Timeout;
  readyStrategy?: "claude";
  outputMode?: "plain" | "claude-stream-json";
  structuredOutput?: ClaudeStreamAccumulator;
  /** Cabinet-block stream-extraction debounce timer. */
  streamExtractionTimer?: NodeJS.Timeout;
  /** Fingerprint of the last stream-extracted cabinet block, to avoid re-applying. */
  streamExtractionFingerprint?: string;
  /**
   * Trigger from the originating ConversationMeta — drives the "keep session
   * alive on idle" decision. Manual runs stay live until the user closes
   * them (Done button or /exit in the xterm); jobs/heartbeats keep the
   * classic 1.2s auto-exit so they don't stack up unclosed.
   */
  trigger?: TaskTrigger;
  /**
   * Mirrors `meta.awaitingInput`. Set to true when the claude-code TUI has
   * been at its idle `>` prompt for the grace window on a manual session;
   * cleared when new output starts streaming again (user typed more).
   * Lets the manager decide whether to flip the UI chip on each chunk
   * without re-reading meta from disk every time.
   */
  awaitingInput?: boolean;
  /** Debounce timer for the idle→awaiting-input flip (manual sessions). */
  awaitingInputIdleTimer?: NodeJS.Timeout;
  /** Debounce timer for the busy-again flip back to running (manual sessions). */
  awaitingInputBusyTimer?: NodeJS.Timeout;
}

export interface CompletedOutputEntry {
  output: string;
  completedAt: number;
  status?: "running" | "completed" | "failed";
  exitCode?: number | null;
  adapterErrorKind?: string | null;
  adapterErrorHint?: string | null;
  adapterErrorRetryAfterSec?: number | null;
}
