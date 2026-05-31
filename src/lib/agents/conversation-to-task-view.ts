import type {
  ConversationArtifact,
  ConversationDetail,
  ConversationMeta,
  ConversationTurn,
  SessionHandle,
} from "@/types/conversations";
import type {
  Task,
  TaskMeta,
  TaskStatus,
  TurnArtifact,
  Turn,
} from "@/types/tasks";
import { rememberTaskRuntime } from "./terminal-mode-cache";

/**
 * Map ConversationMeta → TaskMeta (UI shape). The UI status is derived:
 * - meta.archivedAt → "archived"
 * - unresolved pendingActions OR awaitingInput → "awaiting-input"
 *   (pending approval blocks "done" — the user still owes a decision)
 * - meta.doneAt → "done"
 * - meta.status === "running" → "running"
 * - meta.status === "failed" → "failed"
 * - otherwise (completed) → "idle"
 */
export function conversationMetaToTaskMeta(meta: ConversationMeta): TaskMeta {
  const status = deriveStatus(meta);
  // Warm the client-side runtime-mode cache so TaskConversationPage can
  // mount the xterm shell without waiting on its own detail fetch. No-op
  // on the server — hydrate() guards the sessionStorage touch.
  rememberTaskRuntime(meta.id, meta.adapterType);
  return {
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    status,
    trigger: meta.trigger,
    agentSlug: meta.agentSlug,
    cabinetPath: meta.cabinetPath,
    providerId: meta.providerId,
    adapterType: meta.adapterType,
    adapterConfig: meta.adapterConfig,
    runtime: meta.runtime,
    tokens: meta.tokens,
    createdAt: meta.startedAt,
    startedAt: meta.startedAt,
    lastActivityAt: meta.lastActivityAt ?? meta.completedAt,
    completedAt: meta.completedAt,
    jobId: meta.jobId,
    jobName: meta.jobName,
    mentionedPaths: meta.mentionedPaths,
    artifactPaths: meta.artifactPaths,
    titlePinned: meta.titlePinned,
    summaryEditedAt: meta.summaryEditedAt,
    errorKind: meta.errorKind,
    errorHint: meta.errorHint,
    errorRetryAfterSec: meta.errorRetryAfterSec,
    lastResumeAttempt: meta.lastResumeAttempt,
    archivedAt: meta.archivedAt,
    boardOrder: meta.boardOrder,
    muted: meta.muted,
    pendingActions: meta.pendingActions,
    dispatchedActions: meta.dispatchedActions,
  };
}

export function deriveStatus(meta: ConversationMeta): TaskStatus {
  if (meta.archivedAt) return "archived";
  const hasPendingActions = (meta.pendingActions?.length ?? 0) > 0;
  if (meta.awaitingInput || hasPendingActions) return "awaiting-input";
  if (meta.doneAt) return "done";
  if (meta.status === "running") return "running";
  if (meta.status === "failed") return "failed";
  return "idle";
}

function kbArtifact(path: string): TurnArtifact {
  // The UI used to render file-edit / command / tool-call variants. We now
  // treat every conversation artifact as a KB page (file-edit without stats).
  return { kind: "file-edit", path, added: 0, removed: 0 };
}

export function conversationTurnToTaskTurn(turn: ConversationTurn): Turn {
  return {
    id: turn.id,
    turn: turn.turn,
    role: turn.role,
    ts: turn.ts,
    content: turn.content,
    tokens: turn.tokens,
    awaitingInput: turn.awaitingInput,
    pending: turn.pending,
    attachmentPaths: turn.attachmentPaths,
    artifacts: turn.artifacts?.map(kbArtifact),
  };
}

export function conversationToTaskView(
  detail: ConversationDetail & { turns?: ConversationTurn[]; session?: SessionHandle | null }
): Task {
  const meta = conversationMetaToTaskMeta(detail.meta);
  const turns = (detail.turns ?? []).map(conversationTurnToTaskTurn);

  // Build the artifacts index from meta.artifactPaths (KB files only).
  const filesEdited = Array.from(new Set(detail.meta.artifactPaths ?? []));
  const artifactsIndex = {
    filesEdited,
    filesCreated: [] as string[],
    commandsRun: [] as { cmd: string; exit: number; durationMs: number }[],
    pagesTouched: [] as { path: string; title: string }[],
    toolCalls: 0,
    generatedAt: meta.lastActivityAt ?? meta.startedAt,
  };

  return {
    meta,
    notes: detail.prompt || "",
    turns,
    session: detail.session ?? null,
    artifactsIndex,
  };
}

export function conversationArtifactsToStrings(
  artifacts: ConversationArtifact[] | undefined
): string[] {
  return (artifacts ?? []).map((a) => a.path);
}
