"use client";

import { invalidateDedupFetch } from "@/lib/api/dedup-fetch";
import { useAppStore } from "@/stores/app-store";

/**
 * Thin client helpers for the v2 task board's write actions. Each maps to a
 * PATCH on /api/agents/conversations/[id]. Server shape is defined in
 * src/app/api/agents/conversations/[id]/route.ts.
 */

type PatchBody = {
  archived?: boolean;
  archivedAt?: string | null;
  boardOrder?: number;
  agentSlug?: string;
  muted?: boolean;
};

async function patchConversation(
  id: string,
  body: PatchBody,
  cabinetPath?: string
): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`conversation PATCH ${id} failed: ${res.status} ${text}`);
  }
}

export async function archiveConversation(id: string, cabinetPath?: string): Promise<void> {
  await patchConversation(id, { archived: true }, cabinetPath);
}

export async function restoreConversation(id: string, cabinetPath?: string): Promise<void> {
  await patchConversation(id, { archived: false }, cabinetPath);
}

export async function setConversationBoardOrder(
  id: string,
  boardOrder: number,
  cabinetPath?: string
): Promise<void> {
  await patchConversation(id, { boardOrder }, cabinetPath);
}

/**
 * Reassigns a conversation to a different agent slug. Phase 4 handoff via
 * drag onto the People rail — the conversation stays in whatever lane it
 * was, but `agentSlug` changes so the agent pill + filter reflect the new
 * owner. The recipient sees it in their agent page view.
 */
export async function reassignConversation(
  id: string,
  toAgent: string,
  cabinetPath?: string
): Promise<void> {
  await patchConversation(id, { agentSlug: toAgent }, cabinetPath);
}

/** Mute a task so its done runs skip Just Finished and land in Archive. */
export async function setConversationMuted(
  id: string,
  muted: boolean,
  cabinetPath?: string
): Promise<void> {
  await patchConversation(id, { muted }, cabinetPath);
}

/**
 * Stops a live conversation. Backed by `PATCH { action: "stop" }` which
 * kills the daemon session and finalizes the conversation as failed.
 */
export async function stopConversation(id: string, cabinetPath?: string): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`stop ${id} failed: ${res.status} ${text}`);
  }
}

/**
 * Gracefully close a live terminal-mode conversation. The daemon writes
 * `/exit` into the PTY's stdin; the CLI shuts itself down and the PTY
 * exits code 0 — the task finalizes as `completed`, not `failed`. Used
 * by the Done button on manual terminal tasks.
 */
export async function closeConversation(id: string, cabinetPath?: string): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`close ${id} failed: ${res.status} ${text}`);
  }
}

/**
 * Deletes a conversation record (meta + transcript + artifacts). DELETE
 * handler is at /api/agents/conversations/[id]. No undo — the legacy board
 * didn't offer one either; the drag-to-archive flow is the soft-delete.
 */
export async function deleteConversation(
  id: string,
  cabinetPath?: string
): Promise<void> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(
    `/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`delete ${id} failed: ${res.status} ${text}`);
  }

  invalidateDedupFetch("/api/agents/conversations");

  const open = useAppStore.getState().taskPanelConversation;
  if (open?.id === id) {
    useAppStore.getState().setTaskPanelConversation(null);
  }
}

/**
 * Restarts a finalized conversation by spawning a fresh run from its
 * original prompt. Returns the new conversation meta.
 * Backed by `PATCH { action: "restart" }`.
 */
export async function restartConversation(
  id: string,
  cabinetPath?: string
): Promise<{ conversation: { id: string; cabinetPath?: string } }> {
  const params = new URLSearchParams();
  if (cabinetPath) params.set("cabinetPath", cabinetPath);
  const qs = params.toString();
  const res = await fetch(`/api/agents/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restart" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`restart ${id} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { conversation: { id: string; cabinetPath?: string } };
}
