import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";

/**
 * Per-skill usage stats — what we *can* honestly track without inferring
 * model behavior (see C5 in docs/SKILLS_PLAN.md).
 *
 * Stored at `.cabinet/skills-stats.json` (cabinet-root or per-cabinet) so
 * stats follow the cabinet on export. Currently records:
 *   - lastOfferedAt: most-recent ISO timestamp this skill was offered to a run
 *   - offerCount: total number of runs that offered this skill
 *
 * Updated by `prepareSkillMount` whenever a skill resolves to `allow` or
 * `needsPrompt`. Skills filtered to `block` aren't counted as "offered".
 */

export interface SkillStatsEntry {
  lastOfferedAt: string;
  offerCount: number;
}

export interface SkillStatsFile {
  version: 1;
  skills: Record<string, SkillStatsEntry>;
}

function statsFilePath(cabinetPath?: string | null): string {
  // `.cabinet` (no extension) at the cabinet root is the cabinet manifest
  // FILE — not a directory. Stats live alongside personas under `.agents/`,
  // which is an existing directory the runner already writes to.
  const cabinetRoot = cabinetPath ? path.join(DATA_DIR, cabinetPath) : PROJECT_ROOT;
  return path.join(cabinetRoot, ".agents", "skills-stats.json");
}

export async function readSkillStats(
  cabinetPath?: string | null,
): Promise<SkillStatsFile> {
  const file = statsFilePath(cabinetPath);
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SkillStatsFile>;
    if (parsed && typeof parsed === "object" && parsed.skills) {
      return { version: 1, skills: parsed.skills as Record<string, SkillStatsEntry> };
    }
  } catch {
    /* missing or unreadable — return empty */
  }
  return { version: 1, skills: {} };
}

export async function recordSkillsOffered(
  keys: string[],
  cabinetPath?: string | null,
): Promise<void> {
  if (keys.length === 0) return;
  const file = statsFilePath(cabinetPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const current = await readSkillStats(cabinetPath);
  const now = new Date().toISOString();
  for (const key of keys) {
    const existing = current.skills[key];
    current.skills[key] = {
      lastOfferedAt: now,
      offerCount: (existing?.offerCount ?? 0) + 1,
    };
  }
  // Best-effort write; failure here shouldn't block the run.
  try {
    await fs.writeFile(file, JSON.stringify(current, null, 2), "utf-8");
  } catch {
    /* ignore */
  }
}
