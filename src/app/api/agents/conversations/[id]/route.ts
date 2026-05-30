import { NextRequest, NextResponse } from "next/server";
import {
  deleteConversation,
  finalizeConversation,
  readConversationDetail,
  readConversationMeta,
  updateConversationPrompt,
  writeConversationMeta,
} from "@/lib/agents/conversation-store";
import { closeDaemonSession, stopDaemonSession } from "@/lib/agents/daemon-client";
import {
  buildManualConversationPrompt,
  startConversationRun,
} from "@/lib/agents/conversation-runner";
import { normalizeRuntimeOverride } from "@/lib/agents/runtime-overrides";
import { publishConversationEvent } from "@/lib/agents/conversation-events";
import type { ConversationMeta } from "@/types/conversations";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;
  const withTurns = req.nextUrl.searchParams.get("withTurns") === "1";
  const detail = await readConversationDetail(id, cabinetPath, { withTurns });

  if (!detail) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const deleted = await deleteConversation(id, cabinetPath);
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  publishConversationEvent({
    type: "task.deleted",
    taskId: id,
    cabinetPath: meta.cabinetPath ?? cabinetPath,
  });

  return NextResponse.json({ ok: true });
}

interface PatchBody {
  action?: string;
  title?: string;
  summary?: string;
  doneAt?: string | null;
  archivedAt?: string | null;
  titlePinned?: boolean;
  // `done` / `archived` shortcuts that set the corresponding timestamp
  done?: boolean;
  archived?: boolean;
  // v2 board: within-lane sort index.
  boardOrder?: number;
  // v2 board: reassign the conversation to a different agent.
  agentSlug?: string;
  // v2 board: mute the task so done runs skip Just Finished.
  muted?: boolean;
  // action === "edit-draft": rewrite an unstarted inbox draft in place.
  userMessage?: string;
  mentionedPaths?: string[];
  mentionedSkills?: string[];
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
  runtimeMode?: "native" | "terminal";
  locale?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;

  if (action === "stop") {
    await stopDaemonSession(id);
    await finalizeConversation(id, { status: "failed", exitCode: 1 }, cabinetPath);
    publishConversationEvent({
      type: "task.updated",
      taskId: id,
      cabinetPath,
      payload: { action: "stop" },
    });
    return NextResponse.json({ ok: true });
  }

  // Graceful close for manual terminal-mode sessions. Writes `/exit` into
  // the PTY's stdin; the CLI shuts down cleanly, the PTY exits code 0,
  // and the daemon's `onExit` handler runs `finalizeConversation` with
  // `status: "completed"`. We intentionally do NOT call finalize here —
  // doing so would race the natural path and could flip the task to
  // failed before the PTY's exit handler lands.
  if (action === "close") {
    const ok = await closeDaemonSession(id);
    publishConversationEvent({
      type: "task.updated",
      taskId: id,
      cabinetPath,
      payload: { action: "close", ok },
    });
    return NextResponse.json({ ok });
  }

  if (action === "restart") {
    await stopDaemonSession(id);
    await finalizeConversation(id, { status: "failed", exitCode: 1 }, cabinetPath);

    const detail = await readConversationDetail(id, cabinetPath);
    if (!detail) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const { meta, prompt } = detail;
    const newConversation = await startConversationRun({
      agentSlug: meta.agentSlug,
      title: meta.title,
      trigger: meta.trigger,
      prompt,
      adapterType: meta.adapterType,
      adapterConfig: meta.adapterConfig,
      providerId: meta.providerId,
      cabinetPath: meta.cabinetPath ?? cabinetPath,
      jobId: meta.jobId,
      jobName: meta.jobName,
    });

    return NextResponse.json({ ok: true, conversation: newConversation });
  }

  // Rewrite an unstarted inbox draft in place — backs the board's "Edit"
  // affordance. Only idle drafts that never ran are editable; once a run
  // has started the prompt is history, not a draft. We deliberately do NOT
  // touch startedAt/lastActivityAt so the task keeps its Inbox lane + sort.
  if (action === "edit-draft") {
    const meta = await readConversationMeta(id, cabinetPath);
    if (!meta) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Mirrors lane-rules' Inbox derivation: an idle conversation with no
    // activity (never ran, never completed). `startedAt` is always set at
    // creation, so it is deliberately NOT part of this test.
    const editable =
      meta.status === "idle" &&
      !meta.lastActivityAt &&
      !meta.completedAt;
    if (!editable) {
      return NextResponse.json(
        { error: "Only unstarted inbox tasks can be edited" },
        { status: 409 }
      );
    }

    const userMessage =
      typeof body.userMessage === "string" ? body.userMessage.trim() : "";
    if (!userMessage) {
      return NextResponse.json(
        { error: "userMessage is required" },
        { status: 400 }
      );
    }

    const agentSlug =
      typeof body.agentSlug === "string" && body.agentSlug.trim()
        ? body.agentSlug.trim()
        : meta.agentSlug;
    const mentionedPaths = Array.isArray(body.mentionedPaths)
      ? body.mentionedPaths.filter((p): p is string => typeof p === "string")
      : [];
    const mentionedSkills = Array.isArray(body.mentionedSkills)
      ? body.mentionedSkills.filter((s): s is string => typeof s === "string")
      : [];
    const cp = meta.cabinetPath ?? cabinetPath;

    const draftInput = await buildManualConversationPrompt({
      agentSlug,
      userMessage,
      mentionedPaths,
      mentionedSkills,
      cabinetPath: cp,
      locale:
        body.locale === "en" || body.locale === "he" ? body.locale : undefined,
    });

    const runtime = normalizeRuntimeOverride(
      {
        providerId: body.providerId,
        adapterType: body.adapterType,
        model: body.model,
        effort: body.effort,
        runtimeMode: body.runtimeMode,
      },
      {
        providerId: draftInput.providerId,
        adapterType: draftInput.adapterType,
        adapterConfig: draftInput.adapterConfig,
      }
    );

    await updateConversationPrompt(id, draftInput.prompt, cp);

    const nextMeta: ConversationMeta = {
      ...meta,
      agentSlug,
      title: meta.titlePinned ? meta.title : draftInput.title,
      providerId: runtime.providerId,
      adapterType: runtime.adapterType,
      adapterConfig: runtime.adapterConfig,
      mentionedPaths,
    };
    await writeConversationMeta(nextMeta);

    publishConversationEvent({
      type: "task.updated",
      taskId: id,
      cabinetPath,
      payload: { action: "edit-draft" },
    });

    return NextResponse.json({ ok: true, conversation: nextMeta });
  }

  if (action) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Field-level update path (no action): summary, title, done/archived flags.
  const existing = await readConversationMeta(id, cabinetPath);
  if (!existing) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const updates: Partial<ConversationMeta> = {};
  if (typeof body.title === "string") {
    updates.title = body.title;
    if (body.titlePinned === true) updates.titlePinned = true;
  }
  if (typeof body.summary === "string") {
    updates.summary = body.summary;
    updates.summaryEditedAt = new Date().toISOString();
  }
  if (body.done === true) updates.doneAt = new Date().toISOString();
  else if (body.done === false) updates.doneAt = undefined;
  if (body.doneAt !== undefined) {
    updates.doneAt = body.doneAt === null ? undefined : body.doneAt;
  }
  if (body.archived === true) updates.archivedAt = new Date().toISOString();
  else if (body.archived === false) updates.archivedAt = undefined;
  if (body.archivedAt !== undefined) {
    updates.archivedAt = body.archivedAt === null ? undefined : body.archivedAt;
  }
  if (typeof body.boardOrder === "number" && Number.isFinite(body.boardOrder)) {
    updates.boardOrder = body.boardOrder;
  }
  if (typeof body.agentSlug === "string" && body.agentSlug.trim()) {
    updates.agentSlug = body.agentSlug.trim();
  }
  if (typeof body.muted === "boolean") {
    updates.muted = body.muted;
  }

  const nextMeta: ConversationMeta = {
    ...existing,
    ...updates,
    lastActivityAt: new Date().toISOString(),
  };
  await writeConversationMeta(nextMeta);

  publishConversationEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath,
    payload: updates as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, meta: nextMeta });
}
