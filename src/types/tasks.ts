export type TaskStatus =
  | "idle"
  | "running"
  | "awaiting-input"
  | "done"
  | "failed"
  | "archived";

export type TaskTrigger = "manual" | "job" | "heartbeat" | "agent";

export type TurnRole = "user" | "agent";

export type ArtifactKind =
  | "file-edit"
  | "file-create"
  | "command"
  | "tool-call"
  | "page-edit";

export interface FileEditArtifact {
  kind: "file-edit";
  path: string;
  added: number;
  removed: number;
  commit?: string;
}

export interface FileCreateArtifact {
  kind: "file-create";
  path: string;
  added: number;
  commit?: string;
}

export interface CommandArtifact {
  kind: "command";
  cmd: string;
  exit: number;
  durationMs: number;
  output?: string;
}

export interface ToolCallArtifact {
  kind: "tool-call";
  tool: string;
  target: string;
}

export interface PageEditArtifact {
  kind: "page-edit";
  path: string;
  title: string;
}

export type TurnArtifact =
  | FileEditArtifact
  | FileCreateArtifact
  | CommandArtifact
  | ToolCallArtifact
  | PageEditArtifact;

export interface TurnTokens {
  input: number;
  output: number;
  cache?: number;
}

export interface TurnMeta {
  id: string;
  turn: number;
  role: TurnRole;
  ts: string;
  sessionId?: string;
  tokens?: TurnTokens;
  awaitingInput?: boolean;
  pending?: boolean;
  exitCode?: number | null;
  error?: string;
  artifacts?: TurnArtifact[];
  /**
   * Virtual paths of files the user attached to this turn via the composer.
   * Populated on user turns; always empty for agent turns. UI renders these
   * as inline thumbnails/chips in the turn bubble via `/api/assets/...`.
   */
  attachmentPaths?: string[];
}

export interface Turn extends TurnMeta {
  content: string;
}

export interface TaskRuntimeMeta {
  contextWindow?: number;
}

export interface TaskTokens {
  input: number;
  output: number;
  cache?: number;
  total: number;
}

export interface SessionHandle {
  kind: string;
  resumeId?: string;
  threadId?: string;
  alive: boolean;
  lastUsedAt?: string;
}

export interface TaskMeta {
  id: string;
  title: string;
  summary?: string;
  status: TaskStatus;
  trigger: TaskTrigger;
  agentSlug?: string;
  cabinetPath?: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  runtime?: TaskRuntimeMeta;
  tokens?: TaskTokens;
  createdAt: string;
  startedAt: string;
  lastActivityAt?: string;
  completedAt?: string;
  jobId?: string;
  jobName?: string;
  mentionedPaths?: string[];
  /**
   * KB pages the agent wrote/edited during this task. Mirrors
   * ConversationMeta.artifactPaths. Surfaced so the sidebar Tasks drawer can
   * show task artifacts inline (one less click than the right-side panel).
   */
  artifactPaths?: string[];
  titlePinned?: boolean;
  summaryEditedAt?: string;
  errorKind?: string;
  errorHint?: string;
  errorRetryAfterSec?: number;
  lastResumeAttempt?: {
    at: string;
    result: "resumed" | "replayed" | "failed";
    reason?: string;
  };
  /** Soft-archive timestamp. Mirrors ConversationMeta.archivedAt. */
  archivedAt?: string;
  /** Within-lane sort index for the v2 task board. Default 0. */
  boardOrder?: number;
  /**
   * Non-persistent UI-only: when a card represents a collapsed group of
   * related conversations (e.g. recurring heartbeats from one agent), this
   * is the total member count including the visible latest. Set by the
   * board's group-collapsing pass; never written to disk.
   */
  groupSize?: number;
  /** Mirrors ConversationMeta.muted. Muted tasks bypass Just Finished. */
  muted?: boolean;
  /** Agent-proposed actions awaiting human approval. Mirrors ConversationMeta. */
  pendingActions?: import("./actions").PendingAction[];
  /** Already dispatched or rejected actions. Mirrors ConversationMeta. */
  dispatchedActions?: import("./actions").DispatchedAction[];
}

export interface ArtifactsIndex {
  filesEdited: string[];
  filesCreated: string[];
  commandsRun: { cmd: string; exit: number; durationMs: number }[];
  pagesTouched: { path: string; title: string }[];
  toolCalls: number;
  generatedAt: string;
}

export interface Task {
  meta: TaskMeta;
  notes: string;
  turns: Turn[];
  session: SessionHandle | null;
  artifactsIndex: ArtifactsIndex;
}

export interface CreateTaskInput {
  title: string;
  trigger: TaskTrigger;
  initialPrompt: string;
  agentSlug?: string;
  cabinetPath?: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  runtime?: TaskRuntimeMeta;
  mentionedPaths?: string[];
  jobId?: string;
  jobName?: string;
  startedAt?: string;
}

export interface AppendTurnInput {
  role: TurnRole;
  content: string;
  ts?: string;
  sessionId?: string;
  tokens?: TurnTokens;
  awaitingInput?: boolean;
  pending?: boolean;
  exitCode?: number | null;
  error?: string;
  artifacts?: TurnArtifact[];
}

export interface UpdateTaskInput {
  title?: string;
  summary?: string;
  status?: TaskStatus;
  tokens?: TaskTokens;
  lastActivityAt?: string;
  completedAt?: string | null;
  titlePinned?: boolean;
  summaryEditedAt?: string;
  runtime?: TaskRuntimeMeta;
}

export interface ListTasksFilters {
  cabinetPath?: string;
  status?: TaskStatus;
  trigger?: TaskTrigger;
  agentSlug?: string;
  limit?: number;
}

export interface TaskEvent {
  type:
    | "turn.appended"
    | "turn.updated"
    | "task.updated"
    | "task.deleted"
    | "task.error";
  taskId: string;
  cabinetPath?: string;
  ts: string;
  payload?: Record<string, unknown>;
}
