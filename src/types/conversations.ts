import type { DispatchedAction, PendingAction } from "./actions";

export type ConversationTrigger = "manual" | "job" | "heartbeat" | "agent";
export type ConversationSource = "manual" | "editor";

export type ConversationStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TurnRole = "user" | "agent";

/**
 * Canonical error taxonomy for a failed conversation turn. Each adapter's
 * classifyError() maps stderr + exit code into one of these kinds so the UI
 * can offer targeted remediation without knowing which provider was used.
 */
export type ConversationErrorKind =
  | "cli_not_found"
  | "auth_expired"
  | "rate_limited"
  | "session_expired"
  | "context_exceeded"
  | "transport"
  | "timeout"
  | "model_unavailable"
  | "unknown";

export interface ConversationErrorClassification {
  kind: ConversationErrorKind;
  hint?: string;
  retryAfterSec?: number;
}

export interface ConversationResumeAttempt {
  at: string;
  result: "resumed" | "replayed" | "failed";
  reason?: string;
}

export interface ConversationArtifact {
  path: string;
  label?: string;
}

export interface TurnTokens {
  input: number;
  output: number;
  cache?: number;
}

export interface ConversationTurn {
  id: string;
  turn: number;
  role: TurnRole;
  ts: string;
  content: string;
  sessionId?: string;
  tokens?: TurnTokens;
  awaitingInput?: boolean;
  pending?: boolean;
  exitCode?: number | null;
  error?: string;
  mentionedPaths?: string[];
  /**
   * Composer attachments for this user turn. Virtual paths under DATA_DIR;
   * typically `{cabinet?}/.agents/.conversations/{id}/attachments/{file}`.
   */
  attachmentPaths?: string[];
  artifacts?: string[];
}

export interface SessionHandle {
  kind: string;
  resumeId?: string;
  threadId?: string;
  alive: boolean;
  lastUsedAt?: string;
  /**
   * Adapter-agnostic blob produced by `adapter.sessionCodec.serialize(result.sessionParams)`.
   * Rehydrated by `adapter.sessionCodec.deserialize(codecBlob)` on the next continue
   * and passed to `ctx.sessionParams`. Only populated for adapters that declare
   * a `sessionCodec`.
   */
  codecBlob?: Record<string, unknown> | null;
  /** Optional user-facing display id produced by `sessionCodec.getDisplayId`. */
  displayId?: string;
}

export interface ConversationTokens {
  input: number;
  output: number;
  cache?: number;
  total: number;
}

export interface ConversationMeta {
  id: string;
  agentSlug: string;
  cabinetPath?: string;
  title: string;
  trigger: ConversationTrigger;
  status: ConversationStatus;
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  jobId?: string;
  jobName?: string;
  scheduledAt?: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  promptPath: string;
  transcriptPath: string;
  mentionedPaths: string[];
  /**
   * Composer attachments carried on the kickoff (turn-1) user message.
   * Continuation turns store their own attachments on the turn file; this
   * field just backs the synthetic turn-1 render. Virtual paths under
   * DATA_DIR.
   */
  attachmentPaths?: string[];
  artifactPaths: string[];
  summary?: string;
  contextSummary?: string;

  // Multi-turn extensions (v2)
  turnCount?: number;
  lastActivityAt?: string;
  tokens?: ConversationTokens;
  runtime?: {
    contextWindow?: number;
  };
  doneAt?: string;
  archivedAt?: string;
  awaitingInput?: boolean;
  titlePinned?: boolean;
  summaryEditedAt?: string;

  /** Within-lane sort index for the v2 task board. Additive; default 0.
   *  Written by drag-to-reorder in Phase 2; read by the board in Phase 2+. */
  boardOrder?: number;

  /** When true, the v2 board skips the "Just Finished" lane for this task
   *  and sends done runs straight to Archive — useful for noisy heartbeats
   *  the user doesn't want to re-triage every hour. Set via the DetailPanel
   *  mute toggle. */
  muted?: boolean;

  /** Classified failure kind from the last failed run. Cleared on success. */
  errorKind?: ConversationErrorKind;
  /** Human-facing remediation hint for `errorKind`. */
  errorHint?: string;
  /** Seconds to wait before retry when `errorKind === "rate_limited"`. */
  errorRetryAfterSec?: number;
  /** Most recent resume/replay outcome. Written by the runner every turn. */
  lastResumeAttempt?: ConversationResumeAttempt;

  /** Conversation that dispatched this one via an agent action. */
  parentTaskId?: string;
  /** Agent slug of the dispatcher that spawned this conversation. */
  triggeringAgent?: string;
  /** Depth of the dispatch chain; 0 for user-triggered. */
  spawnDepth?: number;
  /** When agent-action proposals were first parsed out of this turn. */
  actionsProposedAt?: string;
  /** Proposed agent actions awaiting human approval. */
  pendingActions?: PendingAction[];
  /** Actions that have been dispatched or rejected by the human. */
  dispatchedActions?: DispatchedAction[];
}

export interface ConversationDetail {
  meta: ConversationMeta;
  prompt: string;
  request: string;
  transcript: string;
  rawTranscript: string;
  mentions: string[];
  artifacts: ConversationArtifact[];
  turns?: ConversationTurn[];
  session?: SessionHandle | null;
}

export type ConversationRuntimeMode = "native" | "terminal";

export interface ConversationRuntimeOverride {
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
  /**
   * "native" (default) runs through the structured adapter for the provider.
   * "terminal" launches the provider's legacy PTY adapter so the user can
   * watch the CLI stream live and continue the same session after it exits.
   */
  runtimeMode?: ConversationRuntimeMode;
}

export interface CreateConversationRequest extends ConversationRuntimeOverride {
  source?: ConversationSource;
  agentSlug?: string;
  userMessage: string;
  mentionedPaths?: string[];
  /**
   * Skill keys mentioned in the composer (`@skill-name`). Attached to this
   * one-shot run only — they are NOT saved to the persona's `skills:` list.
   * Per Decision §2 in docs/SKILLS_PLAN.md.
   */
  mentionedSkills?: string[];
  /**
   * Virtual paths of files the user attached to the composer. During
   * kickoff these sit under `.agents/.conversations/_pending/{stagingClientUuid}/attachments/`;
   * the server moves them to the newly-created conversation's dir and
   * rewrites the paths before building the adapter prompt.
   */
  attachmentPaths?: string[];
  /**
   * Client-generated UUID identifying the composer's staging dir. Only
   * set for kickoff turns that carry attachments; continuation turns
   * upload straight to the conversation dir and leave this undefined.
   */
  stagingClientUuid?: string;
  cabinetPath?: string;
  pagePath?: string;
  /** When true, creates the conversation with status "idle" without running it. */
  draftOnly?: boolean;
  /**
   * User's UI locale ("en" | "he"). The server adds a locale instruction to
   * the agent system prompt so replies and generated notes land in the right
   * language. Auto-injected by the conversation client from localStorage —
   * callers normally do not need to set this manually.
   */
  locale?: string;
}

export interface CreateConversationResponse {
  ok: boolean;
  conversation: ConversationMeta;
}
