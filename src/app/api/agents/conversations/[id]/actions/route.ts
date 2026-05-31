import { NextRequest, NextResponse } from "next/server";
import {
  readConversationMeta,
  writeConversationMeta,
  appendEventLog,
} from "@/lib/agents/conversation-store";
import { publishConversationEvent } from "@/lib/agents/conversation-events";
import { dispatchApprovedActions } from "@/lib/agents/action-dispatcher";
import { hasHardWarnings } from "@/lib/agents/action-validator";
import type {
  AgentAction,
  DispatchedAction,
  PendingAction,
} from "@/types/actions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  return NextResponse.json({
    pending: meta.pendingActions || [],
    dispatched: meta.dispatchedActions || [],
  });
}

interface ActionsPatchBody {
  approve?: string[];
  reject?: string[];
  edits?: Record<string, Partial<AgentAction>>;
  cabinetPath?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: ActionsPatchBody = {};
  try {
    body = (await req.json()) as ActionsPatchBody;
  } catch {
    // Empty body is fine — treat as a no-op.
  }

  const cabinetPath =
    body.cabinetPath || req.nextUrl.searchParams.get("cabinetPath") || undefined;
  const meta = await readConversationMeta(id, cabinetPath);
  if (!meta) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const pending: PendingAction[] = meta.pendingActions || [];
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, dispatched: [], pending: [] });
  }

  const approveSet = new Set(body.approve || []);
  const rejectSet = new Set(body.reject || []);
  const edits = body.edits || {};

  const toDispatch: PendingAction[] = [];
  const rejected: DispatchedAction[] = [];
  const remaining: PendingAction[] = [];

  for (const item of pending) {
    if (rejectSet.has(item.id)) {
      rejected.push({
        id: item.id,
        action: item.action,
        status: "rejected",
        dispatchedAt: new Date().toISOString(),
      });
      continue;
    }
    if (approveSet.has(item.id)) {
      if (hasHardWarnings(item.warnings)) {
        rejected.push({
          id: item.id,
          action: item.action,
          status: "rejected",
          reason: item.warnings.find((w) => w.severity === "hard")?.code,
          dispatchedAt: new Date().toISOString(),
        });
        continue;
      }
      const edit = edits[item.id];
      const merged: PendingAction = edit
        ? { ...item, action: { ...item.action, ...edit } as AgentAction }
        : item;
      toDispatch.push(merged);
      continue;
    }
    remaining.push(item);
  }

  const results = await dispatchApprovedActions(
    meta,
    toDispatch.map((item) => ({ id: item.id, action: item.action }))
  );

  const allDispatched = [...(meta.dispatchedActions || []), ...rejected, ...results];
  const updated = {
    ...meta,
    pendingActions: remaining,
    dispatchedActions: allDispatched,
  };
  await writeConversationMeta(updated);

  const seq = await appendEventLog(
    id,
    {
      type: "task.updated",
      pendingActions: remaining.length,
      dispatchedActions: allDispatched.length,
    },
    meta.cabinetPath
  );
  publishConversationEvent({
    type: "task.updated",
    taskId: id,
    cabinetPath: meta.cabinetPath,
    seq: seq ?? undefined,
    payload: {
      pendingActions: remaining.length,
      dispatchedActions: allDispatched.length,
    },
  });

  return NextResponse.json({
    ok: true,
    dispatched: results,
    rejected,
    pending: remaining,
  });
}
