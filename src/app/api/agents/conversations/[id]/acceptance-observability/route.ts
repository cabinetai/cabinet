import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getPendingRequiredConversationWrites,
  readConversationDetail,
} from "@/lib/agents/conversation-store";
import {
  acceptanceObservabilityEnabled,
  readAcceptanceRuntimeObservation,
} from "@/lib/agents/acceptance-observability";
import type { ConversationTurn } from "@/types/conversations";

export const dynamic = "force-dynamic";

function fingerprint(value: string | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function lifecycle(turn: ConversationTurn): "running" | "failed" | "completed" {
  if (turn.pending) return "running";
  if (turn.error || (typeof turn.exitCode === "number" && turn.exitCode !== 0)) {
    return "failed";
  }
  return "completed";
}

function counts(turns: ConversationTurn[]) {
  return {
    user: turns.filter((turn) => turn.role === "user").length,
    assistant: turns.filter((turn) => turn.role === "agent").length,
    running: turns.filter((turn) => lifecycle(turn) === "running").length,
    failed: turns.filter((turn) => lifecycle(turn) === "failed").length,
    completed: turns.filter((turn) => lifecycle(turn) === "completed").length,
    completedAssistant: turns.filter(
      (turn) => turn.role === "agent" && lifecycle(turn) === "completed",
    ).length,
    total: turns.length,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!acceptanceObservabilityEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  const detail = await readConversationDetail(id, undefined, { withTurns: true });
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const turns = detail.turns ?? [];
  const durableStoreCounts = counts(turns);
  const runtime = readAcceptanceRuntimeObservation(id);

  return NextResponse.json({
    contract: "cabinet.acceptance.conversation-observability",
    schemaVersion: 1,
    conversationIdentity: fingerprint(detail.meta.id),
    nativeSessionIdentity: fingerprint(detail.session?.resumeId),
    conversationStatus: detail.meta.status,
    turnIdentities: turns.map((turn) => fingerprint(turn.id)),
    requestIdentities: turns.map((turn) => fingerprint(turn.requestId)),
    durableStoreCounts,
    inMemoryCounts: { ...durableStoreCounts },
    inMemoryCountSource: "post_flush_projection",
    pendingRequiredWrites: getPendingRequiredConversationWrites(id),
    acpChildState: runtime?.acpChildState ?? "unknown",
    readinessState: runtime?.readinessState ?? "unknown",
    provider: runtime?.provider ?? null,
    model: runtime?.model ?? null,
    modelRequestsAttempted: runtime?.modelRequestsAttempted ?? 0,
    providerRetries: runtime?.providerRetries ?? 0,
    fallbackAttempts: runtime?.fallbackAttempts ?? 0,
    lastProviderHttpStatus: runtime?.lastProviderHttpStatus ?? "none",
    lastFailureClass: runtime?.lastFailureClass ?? "none",
  });
}
