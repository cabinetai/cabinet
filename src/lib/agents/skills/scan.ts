import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";

/**
 * Discovery scan — walks well-known skill directories across the workspace
 * and (when present) linked repos, reporting skills that exist but aren't
 * yet imported into Cabinet's library. Caller decides whether to import.
 *
 * Plan ref: docs/SKILLS_PLAN.md Phase 4.
 */

const COMPETITOR_SKILL_DIRS: readonly string[] = [
  "skills",
  ".agents/skills",
  ".claude/skills",
  ".codex/skills",
  ".cursor/skills",
  ".windsurf/skills",
  ".openhands/skills",
  ".vscode/skills",
  ".gemini/skills",
  ".roo/skills",
  ".trae/skills",
  ".kiro/skills",
  ".kilocode/skills",
  ".cortex/skills",
];

export interface ScanResult {
  /** Where this skill was found (absolute path to its directory). */
  path: string;
  /** Skill key (basename of the directory). */
  key: string;
  /** Display name pulled from SKILL.md frontmatter `name:` if present, else key. */
  name: string;
  /** Discovery root that contained the skill (e.g. `.agents/skills`, `skills/`). */
  source: string;
  /** Workspace root (cabinet, linked repo, or PROJECT_ROOT) the skill was relative to. */
  workspace: string;
}

async function walkRoot(workspace: string, subdir: string): Promise<ScanResult[]> {
  const dir = path.join(workspace, subdir);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ScanResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".")) continue;
    const skillDir = path.join(dir, entry.name);
    let name = entry.name;
    try {
      const md = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
      // Pull the YAML frontmatter block, then look for `name:` on any line.
      // The previous one-shot regex required at least one more key after
      // `name:`, so it silently failed when `name:` was the only or last
      // field — and minimal SKILL.md files (just `name:` + body) are common.
      const block = md.match(/^---\s*\n([\s\S]*?)\n---/);
      if (block) {
        const nameLine = block[1].match(/^name:\s*(.+?)\s*$/m);
        if (nameLine) name = nameLine[1].trim();
      }
    } catch {
      /* fine */
    }
    out.push({ path: skillDir, key: entry.name, name, source: subdir, workspace });
  }
  return out;
}

export interface ScanOptions {
  /** When set, scan only this cabinet (relative path under DATA_DIR). */
  cabinetPath?: string;
  /** Linked repo paths to also scan (resolved from `.repo.yaml`). */
  linkedRepos?: string[];
}

/**
 * Walk all known skill-root subpaths under the workspaces, collecting any
 * skill bundles that exist on disk. The result is the input the UI uses to
 * offer one-click "import to cabinet" for each find.
 */
export async function scanForSkills(opts: ScanOptions = {}): Promise<ScanResult[]> {
  const workspaces: string[] = [];
  if (opts.cabinetPath) {
    workspaces.push(path.join(DATA_DIR, opts.cabinetPath));
  } else {
    workspaces.push(PROJECT_ROOT);
    // Also scan all top-level cabinet dirs under DATA_DIR if no specific cabinet.
    try {
      const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          workspaces.push(path.join(DATA_DIR, entry.name));
        }
      }
    } catch {
      /* DATA_DIR missing — nothing to scan */
    }
  }
  if (opts.linkedRepos) workspaces.push(...opts.linkedRepos);

  const results: ScanResult[] = [];
  for (const workspace of workspaces) {
    for (const subdir of COMPETITOR_SKILL_DIRS) {
      results.push(...(await walkRoot(workspace, subdir)));
    }
  }
  return results;
}
