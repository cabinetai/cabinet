import { NextRequest, NextResponse } from "next/server";
import { compactConversation } from "@/lib/agents/conversation-runner";
import { readConversationMeta } from "@/lib/agents/conversation-store";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinetPath") || undefined;

  const existing = await readConversationMeta(id, cabinetPath);
  if (!existing) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Kick off in background so SSE delivers the compaction turn.
  void compactConversation(id, {
    cabinetPath: existing.cabinetPath ?? cabinetPath,
  }).catch((err) => {
    console.error(`[conversation-runner] ${id} compact failed`, err);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
