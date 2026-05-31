import fs from "fs/promises";
import path from "path";
import { discoverCabinetPaths } from "@/lib/cabinets/discovery";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { ensureDirectory, fileExists } from "@/lib/storage/fs-operations";
import type { HumanInboxDraft } from "@/types/agents";

type DraftUpdates = Partial<
  Pick<
    HumanInboxDraft,
    "title" | "description" | "priority" | "assignedAgentSlug" | "assignedAgentCabinetPath"
  >
> & {
  assignedAgentSlug?: string | null;
  assignedAgentCabinetPath?: string | null;
};

function draftsDir(cabinetPath?: string): string {
  return path.join(resolveCabinetDir(cabinetPath), ".agents", ".inbox-drafts");
}

async function initDraftsDir(cabinetPath?: string): Promise<void> {
  await ensureDirectory(draftsDir(cabinetPath));
}

function draftFilePath(draftId: string, cabinetPath?: string): string {
  return path.join(draftsDir(cabinetPath), `${draftId}.json`);
}

function sortDrafts(drafts: HumanInboxDraft[]): HumanInboxDraft[] {
  return drafts.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return new Date(right.updatedAt || right.createdAt).getTime() -
      new Date(left.updatedAt || left.createdAt).getTime();
  });
}

function normalizeAssignedCabinetPath(
  assignedAgentSlug: string | undefined,
  assignedAgentCabinetPath: string | undefined,
  fallbackCabinetPath: string
): string | undefined {
  if (!assignedAgentSlug) return undefined;
  return normalizeCabinetPath(assignedAgentCabinetPath, true) || fallbackCabinetPath;
}

export async function createHumanInboxDraft(
  draft: Omit<HumanInboxDraft, "id" | "createdAt" | "updatedAt">
): Promise<HumanInboxDraft> {
  const cabinetPath = normalizeCabinetPath(draft.cabinetPath, true);
  await initDraftsDir(cabinetPath);

  const timestamp = new Date().toISOString();
  const full: HumanInboxDraft = {
    ...draft,
    cabinetPath,
    assignedAgentCabinetPath: normalizeAssignedCabinetPath(
      draft.assignedAgentSlug,
      draft.assignedAgentCabinetPath,
      cabinetPath || "."
    ),
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await fs.writeFile(
    draftFilePath(full.id, cabinetPath),
    JSON.stringify(full, null, 2),
    "utf-8"
  );

  return full;
}

export async function listHumanInboxDrafts(cabinetPath?: string): Promise<HumanInboxDraft[]> {
  const normalizedCabinetPath = normalizeCabinetPath(cabinetPath, true);
  const dir = draftsDir(normalizedCabinetPath);
  if (!(await fileExists(dir))) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const drafts: HumanInboxDraft[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    try {
      const raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
      const draft = JSON.parse(raw) as HumanInboxDraft;
      drafts.push({
        ...draft,
        cabinetPath: normalizeCabinetPath(draft.cabinetPath, true) || normalizedCabinetPath,
        assignedAgentCabinetPath: normalizeAssignedCabinetPath(
          draft.assignedAgentSlug,
          draft.assignedAgentCabinetPath,
          normalizedCabinetPath || "."
        ),
      });
    } catch {
      // Skip malformed draft files.
    }
  }

  return sortDrafts(drafts);
}

export async function listAllHumanInboxDrafts(
  cabinetPath?: string
): Promise<HumanInboxDraft[]> {
  const cabinetPaths = cabinetPath
    ? [normalizeCabinetPath(cabinetPath, true)]
    : await discoverCabinetPaths();

  const allDrafts = await Promise.all(
    cabinetPaths.map((resolvedCabinetPath) => listHumanInboxDrafts(resolvedCabinetPath))
  );

  return sortDrafts(allDrafts.flat());
}

export async function getHumanInboxDraft(
  draftId: string,
  cabinetPath?: string
): Promise<HumanInboxDraft | null> {
  const normalizedCabinetPath = normalizeCabinetPath(cabinetPath, true);
  const filePath = draftFilePath(draftId, normalizedCabinetPath);
  if (!(await fileExists(filePath))) return null;

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const draft = JSON.parse(raw) as HumanInboxDraft;
    return {
      ...draft,
      cabinetPath: normalizeCabinetPath(draft.cabinetPath, true) || normalizedCabinetPath,
      assignedAgentCabinetPath: normalizeAssignedCabinetPath(
        draft.assignedAgentSlug,
        draft.assignedAgentCabinetPath,
        normalizedCabinetPath || "."
      ),
    };
  } catch {
    return null;
  }
}

export async function updateHumanInboxDraft(
  draftId: string,
  updates: DraftUpdates,
  cabinetPath?: string
): Promise<HumanInboxDraft | null> {
  const normalizedCabinetPath = normalizeCabinetPath(cabinetPath, true);
  const existing = await getHumanInboxDraft(draftId, normalizedCabinetPath);
  if (!existing) return null;

  const nextAssignedAgentSlug =
    updates.assignedAgentSlug === null
      ? undefined
      : updates.assignedAgentSlug !== undefined
        ? updates.assignedAgentSlug
        : existing.assignedAgentSlug;

  const nextAssignedAgentCabinetPath =
    updates.assignedAgentSlug === null
      ? undefined
      : updates.assignedAgentCabinetPath === null
        ? undefined
        : normalizeAssignedCabinetPath(
            nextAssignedAgentSlug,
            updates.assignedAgentCabinetPath !== undefined
              ? updates.assignedAgentCabinetPath
              : existing.assignedAgentCabinetPath,
            existing.cabinetPath || normalizedCabinetPath || "."
          );

  const updated: HumanInboxDraft = {
    ...existing,
    ...("title" in updates && updates.title !== undefined ? { title: updates.title } : {}),
    ...("description" in updates && updates.description !== undefined
      ? { description: updates.description }
      : {}),
    ...("priority" in updates && updates.priority !== undefined
      ? { priority: updates.priority }
      : {}),
    assignedAgentSlug: nextAssignedAgentSlug,
    assignedAgentCabinetPath: nextAssignedAgentCabinetPath,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    draftFilePath(draftId, normalizedCabinetPath),
    JSON.stringify(updated, null, 2),
    "utf-8"
  );

  return updated;
}

export async function deleteHumanInboxDraft(
  draftId: string,
  cabinetPath?: string
): Promise<boolean> {
  const normalizedCabinetPath = normalizeCabinetPath(cabinetPath, true);
  const filePath = draftFilePath(draftId, normalizedCabinetPath);
  if (!(await fileExists(filePath))) return false;

  await fs.rm(filePath, { force: true });
  return true;
}
