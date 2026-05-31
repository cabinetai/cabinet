import { NextRequest, NextResponse } from "next/server";
import { continueConversationRun } from "@/lib/agents/conversation-runner";
import { readConversationMeta } from "@/lib/agents/conversation-store";
import { normalizeRuntimeOverride } from "@/lib/agents/runtime-overrides";

interface ContinueBody {
  userMessage?: string;
  mentionedPaths?: string[];
  /**
   * Skill keys @-mentioned in the composer for this turn. Run-only — they
   * are not persisted to the persona. NOTE: continuation re-uses the prior
   * session's mounted skills directory; new mentions take effect for the
   * next agent message but a live PTY session may not pick up newly-added
   * skills until it respawns. See docs/SKILLS_PLAN.md.
   */
  mentionedSkills?: string[];
  attachmentPaths?: string[];
  cabinetPath?: string;
  providerId?: string;
  adapterType?: string;
  model?: string;
  effort?: string;
  runtimeMode?: "native" | "terminal";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: ContinueBody = {};
  try {
    body = (await req.json()) as ContinueBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", errorKind: "unknown" },
      { status: 400 }
    );
  }

  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";
  if (!userMessage) {
    return NextResponse.json(
      { ok: false, error: "userMessage is required", errorKind: "unknown" },
      { status: 400 }
    );
  }

  const cabinetPath =
    typeof body.cabinetPath === "string" && body.cabinetPath.trim()
      ? body.cabinetPath.trim()
      : req.nextUrl.searchParams.get("cabinetPath") || undefined;

  const existing = await readConversationMeta(id, cabinetPath);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Conversation not found", errorKind: "unknown" },
      { status: 404 }
    );
  }

  const mentionedPaths = Array.isArray(body.mentionedPaths)
    ? body.mentionedPaths.filter((v): v is string => typeof v === "string")
    : [];
  const mentionedSkills = Array.isArray(body.mentionedSkills)
    ? body.mentionedSkills.filter((v): v is string => typeof v === "string")
    : [];
  const attachmentPaths = Array.isArray(body.attachmentPaths)
    ? body.attachmentPaths.filter((v): v is string => typeof v === "string")
    : [];

  // Runtime override: users can switch provider/model/effort per turn.
  // Normalization (legacy-adapter swap, model/effort stripping in terminal
  // mode, provider/adapter inheritance) lives in a shared helper so this
  // route and the new-task POST can't drift.
  const runtime = normalizeRuntimeOverride(
    {
      providerId: body.providerId,
      adapterType: body.adapterType,
      model: body.model,
      effort: body.effort,
      runtimeMode: body.runtimeMode,
    },
    {
      providerId: existing.providerId,
      adapterType: existing.adapterType,
      adapterConfig: existing.adapterConfig,
    }
  );

  // Fire the continuation in the background; the UI streams updates via SSE.
  // continueConversationRun takes model/effort as separate overrides (it
  // merges them into the per-turn adapterConfig). In terminal mode the
  // normalizer strips both — pass undefined so the PTY adapter uses defaults.
  void continueConversationRun(id, {
    userMessage,
    mentionedPaths,
    mentionedSkills,
    attachmentPaths,
    cabinetPath: existing.cabinetPath ?? cabinetPath,
    providerId: runtime.providerId,
    adapterType: runtime.adapterType,
    model: runtime.isTerminal ? undefined : body.model?.trim() || undefined,
    effort: runtime.isTerminal ? undefined : body.effort?.trim() || undefined,
  }).catch((err) => {
    console.error(`[conversation-runner] ${id} continue failed`, err);
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
