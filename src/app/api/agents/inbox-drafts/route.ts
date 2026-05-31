import { NextRequest, NextResponse } from "next/server";
import {
  createHumanInboxDraft,
  deleteHumanInboxDraft,
  listAllHumanInboxDrafts,
  listHumanInboxDrafts,
  updateHumanInboxDraft,
} from "@/lib/agents/human-inbox-drafts";
import { readCabinetOverview } from "@/lib/cabinets/overview";
import type { CabinetVisibilityMode } from "@/types/cabinets";

function sortDrafts<T extends { priority: number; updatedAt: string; createdAt: string }>(
  drafts: T[]
): T[] {
  return drafts.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return new Date(right.updatedAt || right.createdAt).getTime() -
      new Date(left.updatedAt || left.createdAt).getTime();
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cabinetPath = searchParams.get("cabinetPath") || undefined;
  const visibilityMode = (searchParams.get("visibilityMode") || "own") as CabinetVisibilityMode;

  if (cabinetPath && visibilityMode !== "own") {
    try {
      const overview = await readCabinetOverview(cabinetPath, { visibilityMode });
      const visiblePaths = overview.visibleCabinets.map((cabinet) => cabinet.path);
      const allDrafts = await Promise.all(
        visiblePaths.map((path) => listHumanInboxDrafts(path))
      );
      return NextResponse.json({ drafts: sortDrafts(allDrafts.flat()) });
    } catch {
      // Fall through to single-cabinet fetch.
    }
  }

  const drafts = cabinetPath
    ? await listHumanInboxDrafts(cabinetPath)
    : await listAllHumanInboxDrafts();

  return NextResponse.json({ drafts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "update") {
    const {
      draftId,
      cabinetPath,
      title,
      description,
      priority,
      assignedAgentSlug,
      assignedAgentCabinetPath,
    } = body;

    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const updated = await updateHumanInboxDraft(
      draftId,
      {
        ...(title !== undefined ? { title: String(title) } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(priority !== undefined ? { priority: Number(priority) } : {}),
        ...(assignedAgentSlug !== undefined ? { assignedAgentSlug } : {}),
        ...(assignedAgentCabinetPath !== undefined ? { assignedAgentCabinetPath } : {}),
      },
      cabinetPath
    );

    if (!updated) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ draft: updated });
  }

  const { title, description, priority, cabinetPath } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const draft = await createHumanInboxDraft({
    title: title.trim(),
    description: typeof description === "string" ? description.trim() : "",
    priority: Number(priority) || 3,
    cabinetPath,
  });

  return NextResponse.json({ draft }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const draftId = body?.draftId;
  const cabinetPath = body?.cabinetPath;

  if (!draftId || typeof draftId !== "string") {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  const deleted = await deleteHumanInboxDraft(draftId, cabinetPath);
  if (!deleted) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
