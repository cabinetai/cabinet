import { NextRequest, NextResponse } from "next/server";
import {
  buildEditorConversationPrompt,
  buildManualConversationPrompt,
  startConversationRun,
} from "@/lib/agents/conversation-runner";
import { buildConversationInstanceKey } from "@/lib/agents/conversation-identity";
import { createConversation, listConversationMetas } from "@/lib/agents/conversation-store";
import { normalizeAgentSlug, readMemory, writeMemory } from "@/lib/agents/persona-manager";
import { normalizeRuntimeOverride } from "@/lib/agents/runtime-overrides";
import { readCabinetOverview } from "@/lib/cabinets/overview";
import { findOwningCabinetPathForPage } from "@/lib/cabinets/server-paths";
import type { CabinetVisibilityMode } from "@/types/cabinets";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentSlug = searchParams.get("agent") || undefined;
  const pagePath = searchParams.get("pagePath") || undefined;
  const trigger = searchParams.get("trigger") as
    | "manual"
    | "job"
    | "heartbeat"
    | null;
  const status = searchParams.get("status") as
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | null;
  const cabinetPath = searchParams.get("cabinetPath") || undefined;
  const visibilityMode = (searchParams.get("visibilityMode") || "own") as CabinetVisibilityMode;
  const limit = parseInt(searchParams.get("limit") || "200", 10);

  const filters = {
    agentSlug: agentSlug && agentSlug !== "all" ? agentSlug : undefined,
    pagePath: pagePath || undefined,
    trigger: trigger || undefined,
    status: status || undefined,
    limit: 1000,
  };

  // When viewing a cabinet with visibility that includes descendants, aggregate
  // conversations from all visible cabinet directories.
  if (cabinetPath && visibilityMode !== "own") {
    try {
      const overview = await readCabinetOverview(cabinetPath, { visibilityMode });
      const visiblePaths = overview.visibleCabinets.map((c) => c.path);

      const all = await Promise.all(
        visiblePaths.map((cp) => listConversationMetas({ ...filters, cabinetPath: cp }))
      );

      const deduped = new Map<string, (typeof all)[number][number]>();
      for (const conversation of all.flat()) {
        const key = buildConversationInstanceKey(conversation);
        if (!deduped.has(key)) {
          deduped.set(key, conversation);
        }
      }

      const merged = Array.from(deduped.values());
      merged.sort(
        (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );

      return NextResponse.json({ conversations: merged.slice(0, limit) });
    } catch {
      // Fall through to single-cabinet fetch on error
    }
  }

  const conversations = await listConversationMetas({
    ...filters,
    cabinetPath,
    limit,
  });

  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const source = body.source === "editor" ? "editor" : "manual";
    const agentSlug =
      source === "editor" ? "editor" : normalizeAgentSlug(body.agentSlug);
    const userMessage = (body.userMessage || "").trim();
    const mentionedPaths = Array.isArray(body.mentionedPaths)
      ? body.mentionedPaths.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const mentionedSkills = Array.isArray(body.mentionedSkills)
      ? body.mentionedSkills.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const attachmentPaths = Array.isArray(body.attachmentPaths)
      ? body.attachmentPaths.filter(
          (value: unknown): value is string => typeof value === "string"
        )
      : [];
    const stagingClientUuid =
      typeof body.stagingClientUuid === "string" && body.stagingClientUuid.trim()
        ? body.stagingClientUuid.trim()
        : undefined;
    const pagePath =
      typeof body.pagePath === "string" && body.pagePath.trim()
        ? body.pagePath.trim()
        : undefined;
    const cabinetPath =
      typeof body.cabinetPath === "string" && body.cabinetPath.trim()
        ? body.cabinetPath.trim()
        : undefined;
    if (!userMessage) {
      return NextResponse.json(
        { error: "userMessage is required" },
        { status: 400 }
      );
    }

    if (source === "editor" && !pagePath) {
      return NextResponse.json(
        { error: "pagePath is required for editor conversations" },
        { status: 400 }
      );
    }

    // draftOnly: create idle conversation without starting the runner.
    if (body.draftOnly === true) {
      const draftInput = await buildManualConversationPrompt({
        agentSlug,
        userMessage,
        mentionedPaths,
        cabinetPath,
      });
      const runtime = normalizeRuntimeOverride(
        { providerId: body.providerId, adapterType: body.adapterType, model: body.model, effort: body.effort, runtimeMode: body.runtimeMode },
        { providerId: draftInput.providerId, adapterType: draftInput.adapterType, adapterConfig: draftInput.adapterConfig }
      );
      const conversation = await createConversation({
        agentSlug,
        title: draftInput.title,
        trigger: "manual",
        prompt: draftInput.prompt,
        cabinetPath: draftInput.cabinetPath ?? cabinetPath,
        mentionedPaths,
        providerId: runtime.providerId,
        adapterType: runtime.adapterType,
        adapterConfig: runtime.adapterConfig,
        initialStatus: "idle",
      });
      return NextResponse.json({ ok: true, conversation }, { status: 201 });
    }

    const editorCabinetPath =
      source === "editor" && pagePath
        ? await findOwningCabinetPathForPage(pagePath)
        : undefined;

    const conversationInput =
      source === "editor" && pagePath
        ? await buildEditorConversationPrompt({
            pagePath,
            userMessage,
            mentionedPaths,
            mentionedSkills,
            cabinetPath: editorCabinetPath,
          })
        : await buildManualConversationPrompt({
            agentSlug,
            userMessage,
            mentionedPaths,
            mentionedSkills,
            cabinetPath,
          });

    const conversationCabinetPath =
      editorCabinetPath ??
      ("cabinetPath" in conversationInput ? conversationInput.cabinetPath : cabinetPath);

    const runtime = normalizeRuntimeOverride(
      {
        providerId: body.providerId,
        adapterType: body.adapterType,
        model: body.model,
        effort: body.effort,
        runtimeMode: body.runtimeMode,
      },
      {
        providerId: conversationInput.providerId,
        adapterType: conversationInput.adapterType,
        adapterConfig: conversationInput.adapterConfig,
      }
    );

    const conversation = await startConversationRun({
      agentSlug,
      title: conversationInput.title,
      trigger: "manual",
      prompt: conversationInput.prompt,
      adapterType: runtime.adapterType,
      adapterConfig: runtime.adapterConfig,
      providerId: runtime.providerId,
      mentionedPaths:
        "mentionedPaths" in conversationInput
          ? conversationInput.mentionedPaths
          : mentionedPaths,
      mentionedSkills,
      attachmentPaths,
      stagingClientUuid,
      cwd: conversationInput.cwd,
      cabinetPath: conversationCabinetPath,
      onComplete: async (completion) => {
        if (!completion.meta.contextSummary) return;
        const timestamp = new Date().toISOString();
        const completionCabinetPath = completion.meta.cabinetPath || conversationCabinetPath;
        const existingContext = await readMemory(
          agentSlug,
          "context.md",
          completionCabinetPath
        );
        const nextEntry = `\n\n## ${timestamp}\n${completion.meta.contextSummary}`;
        await writeMemory(
          agentSlug,
          "context.md",
          existingContext + nextEntry,
          completionCabinetPath
        );
      },
    });

    return NextResponse.json({ ok: true, conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
