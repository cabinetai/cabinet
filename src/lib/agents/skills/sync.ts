import fs from "fs";
import os from "os";
import path from "path";
import { resolveDesiredSkills } from "./loader";
import { recordSkillsOffered } from "./stats";
import type { SkillBundle } from "./types";

/**
 * Idempotent symlink: clobbers an existing managed link, leaves a real dir
 * (user-installed) alone if `protectExisting` is true (default).
 */
export function ensureSymlink(
  source: string,
  target: string,
  opts: { protectExisting?: boolean } = {},
): void {
  const protectExisting = opts.protectExisting !== false;
  let existing: fs.Stats | null = null;
  try {
    existing = fs.lstatSync(target);
  } catch {
    /* doesn't exist */
  }
  if (existing) {
    if (existing.isSymbolicLink()) {
      try {
        fs.unlinkSync(target);
      } catch {
        return;
      }
    } else if (protectExisting) {
      // Real dir/file — leave alone.
      return;
    } else {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        return;
      }
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.symlinkSync(source, target, "dir");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
      try {
        fs.cpSync(source, target, { recursive: true });
      } catch {
        /* give up */
      }
    }
  }
}

export interface InstalledTarget {
  name: string;
  targetPath: string;
  managed: boolean;
}

/**
 * Inspect a "skills home" directory (e.g. `~/.claude/skills/` or `~/.agents/skills/`)
 * and report what's there. `managed: true` means the entry is a symlink to a
 * Cabinet-managed source; `false` means a real dir, presumed user-installed.
 */
export function readInstalledTargets(home: string): InstalledTarget[] {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(home, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledTarget[] = [];
  for (const dirent of dirents) {
    if (dirent.name.startsWith(".")) continue;
    const targetPath = path.join(home, dirent.name);
    let managed = false;
    if (dirent.isSymbolicLink()) {
      managed = true;
    }
    if (dirent.isDirectory() || dirent.isSymbolicLink()) {
      out.push({ name: dirent.name, targetPath, managed });
    }
  }
  return out;
}

/**
 * Mount handle returned from `prepareSkillMount`. Callers pass it to
 * `cleanupSkillMount(handle)` after the run completes.
 */
export interface SkillMount {
  /** Tmpdir containing symlinks to the mounted skill bundles. */
  dir: string;
  /** Skills successfully mounted. */
  mounted: SkillBundle[];
}

export interface PrepareSkillMountInput {
  sessionId: string;
  desiredKeys: string[] | undefined;
  cabinetPath?: string | null;
}

/**
 * Resolve a persona's desired skills and materialize a per-session plugin
 * directory for adapters that consume `adapterConfig.skillsDir`. The dir is
 * shaped like a Claude Code plugin (`.claude-plugin/plugin.json` manifest +
 * `skills/<key>/` symlinks) so Claude can register the skills via
 * `--plugin-dir`. (Plain `--add-dir` only grants read access; it doesn't
 * make skills discoverable as `/skill-name`, which is why mounted skills
 * weren't actually usable.)
 *
 * All resolved skills are mounted — the operator's act of attaching a skill
 * to a persona is the trust signal. Trust level + skills.sh audits are
 * surfaced as descriptive labels in the UI, not runtime gates.
 *
 * Returns null when nothing was selected (so the spawn isn't polluted with
 * an empty `skillsDir` flag).
 */
export async function prepareSkillMount(
  input: PrepareSkillMountInput,
): Promise<SkillMount | null> {
  if (!input.desiredKeys || input.desiredKeys.length === 0) return null;
  const bundles = await resolveDesiredSkills(input.desiredKeys, input.cabinetPath ?? undefined);
  if (bundles.length === 0) return null;

  const base = path.join(os.tmpdir(), "cabinet-skills");
  fs.mkdirSync(base, { recursive: true });
  const dir = path.join(base, input.sessionId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* fine */
  }
  fs.mkdirSync(dir, { recursive: true });

  // Plugin manifest — the bare minimum Claude Code accepts. Name must be
  // a valid identifier; the session id (hex/uuid-ish) qualifies.
  const manifestDir = path.join(dir, ".claude-plugin");
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifest = {
    name: `cabinet-session-${input.sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    version: "0.0.0",
    description: "Cabinet ephemeral per-session skill mount",
  };
  fs.writeFileSync(path.join(manifestDir, "plugin.json"), JSON.stringify(manifest, null, 2));

  const skillsRoot = path.join(dir, "skills");
  fs.mkdirSync(skillsRoot, { recursive: true });
  for (const skill of bundles) {
    ensureSymlink(skill.path, path.join(skillsRoot, skill.key));
  }

  // Record that these skills were offered — drives the "last offered"
  // timestamp shown in the library. Best-effort: stat write failures don't
  // block the run.
  await recordSkillsOffered(
    bundles.map((s) => s.key),
    input.cabinetPath ?? null,
  );

  return { dir, mounted: bundles };
}

export function cleanupSkillMount(handle: SkillMount | null): void {
  if (!handle) return;
  try {
    fs.rmSync(handle.dir, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}
