import fs from "fs";
import os from "os";
import path from "path";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { listSkills, readSkill } from "@/lib/agents/skills/loader";
import type { SkillEntry } from "@/lib/agents/skills/types";

/**
 * Cabinet's skill catalog spans multiple origins (cabinet-scoped, cabinet-root,
 * system, linked-repo, legacy-home). See `src/lib/agents/skills/loader.ts` for
 * the full model and `docs/SKILLS_PLAN.md` for design rationale.
 *
 * This module is the runtime-mount layer: per-run, the daemon symlinks each
 * agent's selected skills into a managed tmpdir and passes that dir to the
 * adapter. Adapters that support a skills contract (Claude's `--add-dir`,
 * Cursor's equivalent, etc.) read the tmpdir out of `adapterConfig.skillsDir`
 * and pass it through; adapters that don't know about skills leave the
 * directory unreferenced and the contents are invisible to the CLI —
 * harmless no-op.
 */

export interface SkillCatalogEntry {
  slug: string;
  name: string;
  description?: string;
  path: string;
}

function homeDir(): string {
  return process.env.HOME || os.homedir() || "/tmp";
}

interface SyncOriginConfig {
  dir: string;
  origin: SkillEntry["origin"];
}

function syncCatalogOrigins(): SyncOriginConfig[] {
  const home = homeDir();
  return [
    { dir: path.join(PROJECT_ROOT, ".agents", "skills"), origin: "cabinet-root" },
    { dir: path.join(home, ".claude", "skills"), origin: "system" },
    { dir: path.join(home, ".agents", "skills"), origin: "system" },
    { dir: path.join(home, ".cabinet", "skills"), origin: "legacy-home" },
  ];
}

function readSkillNameAndDescription(skillDir: string): { name: string; description?: string } {
  const slug = path.basename(skillDir);
  const skillMd = path.join(skillDir, "SKILL.md");
  let name = slug;
  let description: string | undefined;
  let md: string;
  try {
    md = fs.readFileSync(skillMd, "utf-8");
  } catch {
    return { name };
  }
  // Cheap frontmatter-aware parse: grab `name:` and `description:` if present.
  let nameFromFrontmatter = false;
  let body = md;
  if (md.startsWith("---")) {
    const closing = md.indexOf("\n---", 3);
    if (closing !== -1) {
      const front = md.slice(3, closing);
      body = md.slice(closing + 4);
      const nameMatch = front.match(/^name:\s*(.+)$/m);
      const descMatch = front.match(/^description:\s*([\s\S]+?)(?:\n[a-zA-Z_-]+:|$)/m);
      if (nameMatch) {
        name = nameMatch[1].trim();
        nameFromFrontmatter = true;
      }
      if (descMatch) description = descMatch[1].trim().replace(/\n\s+/g, " ").slice(0, 300);
    }
  }
  // Fallback: pull name from the first H1 if frontmatter didn't supply one.
  if (!nameFromFrontmatter) {
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#")) {
        const heading = line.replace(/^#+\s*/, "").trim();
        if (heading) name = heading;
        break;
      }
      break; // first non-blank wasn't a heading; keep slug
    }
  }
  if (!description) {
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      description = line.slice(0, 300);
      break;
    }
  }
  return { name, description };
}

/**
 * Synchronous catalog walk across host origins (cabinet-root, system, legacy).
 * Cabinet-scoped origins require a `cabinetPath` and an async loader call;
 * use `readSkillCatalogRich` when scope is needed.
 *
 * Higher-precedence origins win on key collision: cabinet-root > system > legacy-home.
 */
export function readSkillCatalog(): SkillCatalogEntry[] {
  const collected: SkillCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const { dir } of syncCatalogOrigins()) {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      if (dirent.name.startsWith(".")) continue;
      if (seen.has(dirent.name)) continue;
      seen.add(dirent.name);
      const skillDir = path.join(dir, dirent.name);
      const { name, description } = readSkillNameAndDescription(skillDir);
      collected.push({ slug: dirent.name, name, description, path: skillDir });
    }
  }

  collected.sort((a, b) => a.slug.localeCompare(b.slug));
  return collected;
}

/**
 * Async variant — preferred for UI/API code. Returns the full SkillEntry
 * shape (origin, trust level, file inventory, allowed-tools, etc.) so
 * surfaces can render proper provenance and security signals.
 */
export async function readSkillCatalogRich(opts: {
  cabinetPath?: string;
} = {}): Promise<SkillEntry[]> {
  return listSkills({ cabinetPath: opts.cabinetPath });
}

function safeMkdir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Prepare a managed tmpdir for `sessionId` containing symlinks to each of
 * the agent's selected skill directories. Returns the tmpdir path so the
 * adapter can point the CLI at it (e.g. Claude `--add-dir <dir>`).
 *
 * If the selection is empty or no skills resolve, returns `null` — the
 * caller should skip wiring `skillsDir` into adapterConfig entirely in that
 * case so the CLI spawn isn't polluted with a no-op flag.
 *
 * Idempotent: calling twice for the same sessionId reuses the same dir but
 * re-materializes the symlinks to reflect the latest selection.
 */
export function syncSkillsToTmpdir(
  sessionId: string,
  desiredSlugs: string[],
): { dir: string; resolved: SkillCatalogEntry[] } | null {
  if (!Array.isArray(desiredSlugs) || desiredSlugs.length === 0) return null;
  const catalog = readSkillCatalog();
  if (catalog.length === 0) return null;

  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const resolved: SkillCatalogEntry[] = [];
  for (const slug of desiredSlugs) {
    const entry = bySlug.get(slug);
    if (entry) resolved.push(entry);
  }
  if (resolved.length === 0) return null;

  const base = path.join(os.tmpdir(), "cabinet-skills");
  safeMkdir(base);
  const dir = path.join(base, sessionId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* fine */
  }
  safeMkdir(dir);

  for (const entry of resolved) {
    const linkPath = path.join(dir, entry.slug);
    try {
      fs.symlinkSync(entry.path, linkPath, "dir");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
        try {
          fs.cpSync(entry.path, linkPath, { recursive: true });
        } catch {
          // Give up on this skill; CLI run continues without it.
        }
      }
    }
  }

  return { dir, resolved };
}

/**
 * Remove the tmpdir produced by `syncSkillsToTmpdir` for `sessionId`.
 * Safe to call on a nonexistent dir. Invoked by the daemon on session exit.
 */
export function cleanupSkillsTmpdir(sessionId: string): void {
  const base = path.join(os.tmpdir(), "cabinet-skills");
  const dir = path.join(base, sessionId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

// Async loader is canonical for new code; legacy sync facades stay for
// back-compat with existing callers (e.g. the conversation runner).
export { readSkill };
