import type {
  AppendTurnInput,
  Task,
  TaskMeta,
  UpdateTaskInput,
} from "@/types/tasks";
import type {
  ConversationDetail,
  ConversationMeta,
  ConversationRuntimeOverride,
  ConversationTurn,
  SessionHandle,
} from "@/types/conversations";
import {
  conversationMetaToTaskMeta,
  conversationToTaskView,
} from "./conversation-to-task-view";

/**
 * Browser helpers. Post-v2 these route to /api/agents/conversations/*;
 * the return shapes are mapped to the existing Task view-model so UI
 * components don't need to change.
 */

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // body not JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  return search.size ? `?${search}` : "";
}

export async function fetchTask(id: string, cabinetPath?: string): Promise<Task> {
  const query = buildQuery({ cabinetPath, withTurns: "1" });
  const url = `/api/agents/conversations/${encodeURIComponent(id)}${query}`;
  const res = await fetch(url, { cache: "no-store" });
  const detail = await jsonOrThrow<
    ConversationDetail & {
      turns?: ConversationTurn[];
      session?: SessionHandle | null;
    }
  >(res);
  return conversationToTaskView(detail);
}

export async function postTurn(
  id: string,
  input: AppendTurnInput & {
    mentionedPaths?: string[];
    mentionedSkills?: string[];
    attachmentPaths?: string[];
    runtime?: ConversationRuntimeOverride;
  },
  cabinetPath?: string
): Promise<{ turn: Task["turns"][number]; task: Task }> {
  // We only support user-role turns from the client; agent turns come
  // from the runner on the server side via SSE.
  if (input.role !== "user") {
    throw new Error(`postTurn only supports role=user, got ${input.role}`);
  }
  const runtime = input.runtime ?? {};
  const res = await fetch(
    `/api/agents/conversations/${encodeURIComponent(id)}/continue`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userMessage: input.content,
        cabinetPath,
        mentionedPaths: input.mentionedPaths,
        mentionedSkills: input.mentionedSkills,
        attachmentPaths: input.attachmentPaths,
        providerId: runtime.providerId,
        adapterType: runtime.adapterType,
        model: runtime.model,
        effort: runtime.effort,
        runtimeMode: runtime.runtimeMode,
      }),
    }
  );
  await jsonOrThrow(res);
  // Refetch the conversation to get the up-to-date view (optimistic updates
  // arrive via SSE anyway; the return value here is the baseline).
  const task = await fetchTask(id, cabinetPath);
  const lastTurn = task.turns[task.turns.length - 1];
  return { task, turn: lastTurn };
}

export async function patchTask(
  id: string,
  patch: UpdateTaskInput,
  cabinetPath?: string
): Promise<{ meta: TaskMeta }> {
  // Translate task-space patch into conversation-space PATCH body.
  const body: Record<string, unknown> = {};
  if (typeof patch.title === "string") {
    body.title = patch.title;
    if (patch.titlePinned === true) body.titlePinned = true;
  }
  if (typeof patch.summary === "string") body.summary = patch.summary;
  if (patch.status === "done") body.done = true;
  if (patch.status === "archived") body.archived = true;

  const query = buildQuery({ cabinetPath });
  const res = await fetch(
    `/api/agents/conversations/${encodeURIComponent(id)}${query}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await jsonOrThrow<{ ok: boolean; meta: ConversationMeta }>(res);
  return { meta: conversationMetaToTaskMeta(data.meta) };
}

export async function compactTask(
  id: string,
  cabinetPath?: string
): Promise<void> {
  const query = buildQuery({ cabinetPath });
  const res = await fetch(
    `/api/agents/conversations/${encodeURIComponent(id)}/compact${query}`,
    { method: "POST" }
  );
  await jsonOrThrow(res);
}

