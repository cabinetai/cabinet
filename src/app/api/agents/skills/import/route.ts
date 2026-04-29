import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { readPersona, writePersona } from "@/lib/agents/persona-manager";
import { updateSkillsLock } from "@/lib/agents/skills/lock";
import { parseSource } from "@/lib/agents/skills/import-source";
import {
  isValidSkillKey,
  resolveSkillsScopeRoot,
} from "@/lib/agents/skills/scope";

/**
 * POST /api/agents/skills/import
 * Body: { source, scope?, attachToAgents?, ref? }
 *
 * Source forms accepted:
 *   - "github:owner/repo[/skill]"            → clone skill bundle from GitHub
 *   - "https://skills.sh/owner/repo[/skill]" → resolve to GitHub
 *   - "https://github.com/owner/repo[/...]"  → resolve to GitHub
 *   - "local:/absolute/path"                 → copy from local path (rare)
 *
 * scope: "root" | "cabinet:<path>"  (default: "root")
 * attachToAgents: agent slugs to add the imported skill key to (one-click flow)
 */

interface ImportRequest {
  source: string;
  scope?: string;
  attachToAgents?: string[];
  ref?: string;
}

// `parseSource` and `ResolvedSource` extracted to
// `src/lib/agents/skills/import-source.ts` so they can be unit-tested.

// Refs flow into `git clone --branch <ref>` as a positional value. Reject any
// ref that could be interpreted as a flag or that contains shell-meaningful
// characters; git's own ref-name rules are stricter, but this is the
// minimum we need to be safe with the spawn.
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]+$/;

function isSafeRef(ref: string): boolean {
  if (!ref || ref.length > 256) return false;
  if (ref.startsWith("-")) return false;
  if (ref.includes("..")) return false;
  return SAFE_REF_PATTERN.test(ref);
}

function gitClone(url: string, dest: string, ref?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ref && !isSafeRef(ref)) {
      reject(new Error(`unsafe ref: "${ref}"`));
      return;
    }
    const args = ["clone", "--depth", "1"];
    if (ref) args.push("--branch", ref);
    args.push("--", url, dest);
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone failed: ${stderr.trim() || `code ${code}`}`));
    });
  });
}

function resolveDestRoot(scope: string | undefined): string {
  // Accept "cabinet-root" as a legacy alias for "root"; otherwise delegate
  // to the shared resolver, which enforces DATA_DIR boundary checks.
  if (scope === "cabinet-root") return resolveSkillsScopeRoot("root");
  return resolveSkillsScopeRoot(scope);
}

/**
 * Claude Code plugin marketplace layout: skills are listed in
 * `.claude-plugin/plugin.json` under a `skills` array of relative
 * `SKILL.md` paths (e.g. `./tools/image/ai-image-generation/SKILL.md`).
 * Resolve a skill name to its bundle directory by matching against the
 * basename of each entry's parent dir.
 */
async function resolveFromPluginManifest(
  repoRoot: string,
  skillName: string,
): Promise<string | null> {
  try {
    const manifestPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as { skills?: unknown };
    const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
    const repoRootResolved = path.resolve(repoRoot) + path.sep;
    for (const entry of skills) {
      if (typeof entry !== "string") continue;
      // Normalize: drop leading "./" and trailing /SKILL.md
      const normalized = entry.replace(/^\.\//, "");
      const dir = normalized.replace(/\/SKILL\.md$/i, "");
      if (path.basename(dir) !== skillName) continue;
      const abs = path.resolve(repoRoot, dir);
      // Boundary check: a malicious manifest declaring `../../../etc/<skill>`
      // would let the import copy from outside the cloned repo. Refuse any
      // entry whose resolved path escapes repoRoot.
      if (abs !== path.resolve(repoRoot) && !abs.startsWith(repoRootResolved)) {
        continue;
      }
      if (await fs.stat(abs).then(() => true).catch(() => false)) {
        return abs;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generic fallback: walk the repo for any directory named `skillName` that
 * contains a `SKILL.md`. Covers Claude Code marketplace repos
 * (`plugins/<plugin>/skills/<skill>/`) and other nested layouts where the
 * manifest doesn't declare the skill directly. Depth-limited and
 * ignores common noise dirs (`.git`, `node_modules`, etc).
 */
async function findSkillByDirName(
  repoRoot: string,
  skillName: string,
  maxDepth = 6,
): Promise<string | null> {
  const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".venv", "venv"]);
  async function walk(dir: string, depth: number): Promise<string | null> {
    if (depth > maxDepth) return null;
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP.has(entry.name)) continue;
      const childDir = path.join(dir, entry.name);
      if (entry.name === skillName) {
        const skillMd = path.join(childDir, "SKILL.md");
        if (await fs.stat(skillMd).then(() => true).catch(() => false)) {
          return childDir;
        }
      }
      const found = await walk(childDir, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return walk(repoRoot, 0);
}

async function attachToAgents(slugs: string[] | undefined, skillKey: string): Promise<string[]> {
  if (!slugs || slugs.length === 0) return [];
  const updated: string[] = [];
  for (const slug of slugs) {
    const persona = await readPersona(slug);
    if (!persona) continue;
    const next = new Set([...(persona.skills || []), skillKey]);
    await writePersona(slug, { skills: Array.from(next) });
    updated.push(slug);
  }
  return updated;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as ImportRequest;
  if (!body.source) {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  const parsed = parseSource(body.source);
  if (!parsed) {
    return NextResponse.json(
      { error: `unrecognized source format: ${body.source}` },
      { status: 400 },
    );
  }

  let destRoot: string;
  try {
    destRoot = resolveDestRoot(body.scope);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid scope" },
      { status: 400 },
    );
  }
  await fs.mkdir(destRoot, { recursive: true });

  let importedKey: string;
  let sourceLocator: string;
  let sourceType: "github" | "skills_sh" | "local_path";

  if (parsed.kind === "local") {
    if (!parsed.localPath) {
      return NextResponse.json({ error: "local source missing path" }, { status: 400 });
    }
    importedKey = path.basename(parsed.localPath);
    if (!isValidSkillKey(importedKey)) {
      return NextResponse.json(
        { error: `local path basename "${importedKey}" is not a valid skill key (kebab-case only)` },
        { status: 400 },
      );
    }
    const dest = path.join(destRoot, importedKey);
    // verbatimSymlinks: copy symlinks as-is rather than following them, so a
    // hostile bundle that contains `evil -> /home/user/.ssh` doesn't siphon
    // the target's contents into the skills dir.
    await fs.cp(parsed.localPath, dest, { recursive: true, verbatimSymlinks: true });
    sourceLocator = parsed.localPath;
    sourceType = "local_path";
  } else {
    // github / skills_sh — both resolve to a GitHub clone.
    const owner = parsed.owner!;
    const repo = parsed.repo!;
    const url = `https://github.com/${owner}/${repo}.git`;
    const ref = body.ref ?? parsed.ref;

    // Clone to a temp dir, then move/copy the relevant subtree.
    const tmp = await fs.mkdtemp(path.join(destRoot, ".import-"));
    try {
      await gitClone(url, tmp, ref);
      // If skillName specified, copy that subdir; else copy the whole repo's
      // skills/ if present; else copy the repo itself as a single skill.
      let sourceDir: string;
      if (parsed.skillName) {
        if (!isValidSkillKey(parsed.skillName)) {
          throw new Error(
            `skill name "${parsed.skillName}" is not a valid skill key (kebab-case only).`,
          );
        }
        // Try repo/<skillName> then repo/skills/<skillName>, then fall back
        // to the Claude Code plugin manifest at .claude-plugin/plugin.json
        // (used by `infsh-skills/skills` and similar plugin-marketplace
        // repos that scatter skills across nested category dirs).
        const direct = path.join(tmp, parsed.skillName);
        const nested = path.join(tmp, "skills", parsed.skillName);
        if (await fs.stat(direct).then(() => true).catch(() => false)) {
          sourceDir = direct;
        } else if (await fs.stat(nested).then(() => true).catch(() => false)) {
          sourceDir = nested;
        } else {
          const fromManifest = await resolveFromPluginManifest(tmp, parsed.skillName);
          if (fromManifest) {
            sourceDir = fromManifest;
          } else {
            // Last-resort: walk the repo for any directory named `<skillName>`
            // that contains SKILL.md. Catches marketplace-style repos
            // (`plugins/<plugin>/skills/<skill>/`) without an explicit manifest.
            const fromWalk = await findSkillByDirName(tmp, parsed.skillName);
            if (fromWalk) {
              sourceDir = fromWalk;
            } else {
              throw new Error(
                `skill "${parsed.skillName}" not found in ${owner}/${repo} (looked in /, /skills/, .claude-plugin/plugin.json, recursive walk)`,
              );
            }
          }
        }
        importedKey = parsed.skillName;
      } else {
        // No skill name → repo IS the skill (e.g. shadcn/skill-bundle pattern)
        if (!isValidSkillKey(repo)) {
          throw new Error(
            `repo name "${repo}" is not a valid skill key (kebab-case only); pass a skill name explicitly.`,
          );
        }
        importedKey = repo;
        sourceDir = tmp;
      }
      const dest = path.join(destRoot, importedKey);
      await fs.rm(dest, { recursive: true, force: true });
      // verbatimSymlinks prevents a hostile repo from exfiltrating files via
      // symlinks pointing outside the clone (e.g. `evil -> /home/user/.ssh`).
      await fs.cp(sourceDir, dest, { recursive: true, verbatimSymlinks: true });
      sourceLocator = parsed.skillName
        ? `github:${owner}/${repo}/${parsed.skillName}`
        : `github:${owner}/${repo}`;
      sourceType = parsed.kind === "skills_sh" ? "skills_sh" : "github";
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }

  // Update lock file with resolved provenance.
  await updateSkillsLock(importedKey, {
    source: sourceLocator,
    sourceType,
    ref: body.ref ?? parsed.ref ?? null,
    scope: body.scope ?? "root",
    installedAt: new Date().toISOString(),
  });

  // Attach to agents if requested.
  const attached = await attachToAgents(body.attachToAgents, importedKey);

  return NextResponse.json({
    ok: true,
    key: importedKey,
    sourceType,
    sourceLocator,
    attachedAgents: attached,
  });
}
