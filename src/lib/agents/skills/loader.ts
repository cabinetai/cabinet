import fs from "fs";
import os from "os";
import path from "path";
import matter from "gray-matter";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import type {
  ListSkillsOptions,
  SkillBundle,
  SkillEntry,
  SkillFileInventoryEntry,
  SkillFileKind,
  SkillOrigin,
  TrustLevel,
} from "./types";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function homeDir(): string {
  return process.env.HOME || os.homedir() || "/tmp";
}

function cabinetRootSkillsDir(): string {
  return path.join(PROJECT_ROOT, ".agents", "skills");
}

function cabinetScopedSkillsDir(cabinetPath: string): string {
  return path.join(DATA_DIR, cabinetPath, ".agents", "skills");
}

function systemSkillsDirs(): string[] {
  // Two host-managed conventions:
  // - ~/.claude/skills/  — Claude Code's home (Anthropic native)
  // - ~/.agents/skills/  — Cross-CLI shared (Codex + Gemini both walk this)
  const home = homeDir();
  return [
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
  ];
}

function legacyHomeSkillsDir(): string {
  return path.join(homeDir(), ".cabinet", "skills");
}

function claudePluginMarketplacesDir(): string {
  return path.join(homeDir(), ".claude", "plugins", "marketplaces");
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

const SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".py", ".rb", ".pl", ".js", ".mjs", ".cjs", ".ts"]);
const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf", ".csv", ".json", ".yaml", ".yml", ".html"]);

function classifyFile(rel: string, isExecutable: boolean): SkillFileKind {
  const base = path.basename(rel);
  const ext = path.extname(base).toLowerCase();
  if (rel === "SKILL.md") return "skill";
  if (rel.startsWith("references/") || rel.startsWith("rules/")) return "reference";
  if (rel.startsWith("assets/")) return "asset";
  if (rel.startsWith("scripts/")) return "script";
  if (isExecutable) return "script";
  if (SCRIPT_EXTENSIONS.has(ext)) return "script";
  if (ext === ".md") return "markdown";
  if (ASSET_EXTENSIONS.has(ext)) return "asset";
  return "other";
}

function deriveTrustLevel(inventory: SkillFileInventoryEntry[]): TrustLevel {
  let hasNonMarkdown = false;
  for (const entry of inventory) {
    if (entry.kind === "script") return "scripts_executables";
    if (entry.kind === "asset" || entry.kind === "other") hasNonMarkdown = true;
  }
  return hasNonMarkdown ? "assets" : "markdown_only";
}

// ---------------------------------------------------------------------------
// Bundle scan
// ---------------------------------------------------------------------------

function walkBundle(skillDir: string): SkillFileInventoryEntry[] {
  const entries: SkillFileInventoryEntry[] = [];
  const walk = (dir: string, prefix: string) => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".") && prefix === "") continue;
      const abs = path.join(dir, dirent.name);
      const rel = prefix ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!dirent.isFile() && !dirent.isSymbolicLink()) continue;
      let isExecutable = false;
      try {
        const stat = fs.statSync(abs);
        isExecutable = (stat.mode & 0o111) !== 0;
      } catch {
        /* ignore */
      }
      entries.push({ path: rel, kind: classifyFile(rel, isExecutable) });
    }
  };
  walk(skillDir, "");
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

function firstBodyLine(body: string): string | null {
  for (const raw of body.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    return trimmed.slice(0, 300);
  }
  return null;
}

function parseAllowedTools(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

interface ReadOne {
  entry: SkillEntry;
  body: string;
}

function readOneSkill(
  skillDir: string,
  origin: SkillOrigin,
  scope: string | null,
): ReadOne | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(skillDir);
  } catch {
    return null;
  }
  if (!stat.isDirectory()) return null;

  const skillMdPath = path.join(skillDir, "SKILL.md");
  let frontmatter: Record<string, unknown> = {};
  let body = "";
  if (fs.existsSync(skillMdPath)) {
    try {
      const raw = fs.readFileSync(skillMdPath, "utf-8");
      const parsed = matter(raw);
      frontmatter = (parsed.data as Record<string, unknown>) || {};
      body = (parsed.content || "").trim();
    } catch {
      /* fall through to slug-named fallback */
    }
  }

  const key = path.basename(skillDir);
  const fmName = frontmatter.name;
  const name = typeof fmName === "string" && fmName.trim() ? fmName.trim() : key;

  const fmDescription = frontmatter.description;
  const description =
    typeof fmDescription === "string" && fmDescription.trim()
      ? fmDescription.trim()
      : firstBodyLine(body);

  const allowedTools = parseAllowedTools(frontmatter["allowed-tools"]);

  const fileInventory = walkBundle(skillDir);
  const trustLevel = deriveTrustLevel(fileInventory);

  const editable = origin === "cabinet-scoped" || origin === "cabinet-root";

  const entry: SkillEntry = {
    key,
    name,
    description,
    origin,
    scope,
    path: skillDir,
    fileInventory,
    trustLevel,
    allowedTools,
    editable,
  };
  return { entry, body };
}

function listSkillsAtRoot(
  rootDir: string,
  origin: SkillOrigin,
  scope: string | null,
): ReadOne[] {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ReadOne[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
    if (dirent.name.startsWith(".")) continue;
    const skillDir = path.join(rootDir, dirent.name);
    const result = readOneSkill(skillDir, origin, scope);
    if (result) out.push(result);
  }
  return out;
}

/**
 * Walk Claude Code's plugin-marketplace tree under `~/.claude/plugins/marketplaces/`.
 * Three layouts coexist on real installations (verified 2026-04-26):
 *   <marketplace>/skills/<skill>/                          (e.g. n8n-mcp-skills)
 *   <marketplace>/plugins/<plugin>/skills/<skill>/         (claude-plugins-official curated)
 *   <marketplace>/external_plugins/<plugin>/skills/<skill>/ (community plugins)
 *
 * Returns ReadOne[] tagged with origin "system" (read-only host install) plus
 * `pluginSource` so the UI can label them by marketplace+plugin instead of
 * lumping them in with the `~/.claude/skills/` flat user installs.
 */
function listClaudePluginSkills(): ReadOne[] {
  const marketplacesDir = claudePluginMarketplacesDir();
  let marketplaces: fs.Dirent[];
  try {
    marketplaces = fs.readdirSync(marketplacesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: ReadOne[] = [];

  const collect = (dir: string, marketplace: string, plugin: string, external: boolean) => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      if (dirent.name.startsWith(".")) continue;
      const skillDir = path.join(dir, dirent.name);
      const result = readOneSkill(skillDir, "system", null);
      if (result) {
        result.entry.pluginSource = { marketplace, plugin, external: external || undefined };
        out.push(result);
      }
    }
  };

  for (const m of marketplaces) {
    if (!m.isDirectory()) continue;
    if (m.name.startsWith(".") || m.name.endsWith(".bak")) continue;
    const marketplaceRoot = path.join(marketplacesDir, m.name);

    // Layout 1: <marketplace>/skills/<skill>/ — marketplace ships skills directly.
    collect(path.join(marketplaceRoot, "skills"), m.name, m.name, false);

    // Layouts 2 + 3: <marketplace>/{plugins,external_plugins}/<plugin>/skills/<skill>/
    for (const container of ["plugins", "external_plugins"] as const) {
      const containerPath = path.join(marketplaceRoot, container);
      let plugins: fs.Dirent[];
      try {
        plugins = fs.readdirSync(containerPath, { withFileTypes: true });
      } catch {
        continue;
      }
      const external = container === "external_plugins";
      for (const plugin of plugins) {
        if (!plugin.isDirectory()) continue;
        if (plugin.name.startsWith(".")) continue;
        collect(
          path.join(containerPath, plugin.name, "skills"),
          m.name,
          plugin.name,
          external,
        );
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ORIGIN_PRECEDENCE: Record<SkillOrigin, number> = {
  "cabinet-scoped": 0,
  "cabinet-root": 1,
  "linked-repo": 2,
  system: 3,
  "legacy-home": 4,
};

/**
 * List skills across all enabled origins. On key collision the higher-precedence
 * origin wins (cabinet-scoped > cabinet-root > linked-repo > system > legacy-home).
 */
export async function listSkills(opts: ListSkillsOptions = {}): Promise<SkillEntry[]> {
  const includeSystem = opts.includeSystem !== false;
  const includeLegacy = opts.includeLegacy !== false;
  // includeLinked TODO once .repo.yaml linking is wired here. Currently no-op.

  const collected: ReadOne[] = [];

  if (opts.cabinetPath) {
    collected.push(
      ...listSkillsAtRoot(
        cabinetScopedSkillsDir(opts.cabinetPath),
        "cabinet-scoped",
        opts.cabinetPath,
      ),
    );
  }

  collected.push(...listSkillsAtRoot(cabinetRootSkillsDir(), "cabinet-root", null));

  if (includeSystem) {
    for (const dir of systemSkillsDirs()) {
      collected.push(...listSkillsAtRoot(dir, "system", null));
    }
    // Claude Code plugin marketplace skills — Claude Code auto-loads them
    // for any of its runs, so they belong in the system tier alongside
    // ~/.claude/skills/. Tagged with `pluginSource` for UI labeling.
    collected.push(...listClaudePluginSkills());
  }

  if (includeLegacy) {
    collected.push(...listSkillsAtRoot(legacyHomeSkillsDir(), "legacy-home", null));
  }

  // Resolve key collisions by precedence. For plugin skills, namespace by
  // marketplace+plugin so two plugins with same-named skills don't clobber
  // each other (e.g. example-plugin's `example-skill` and another marketplace's).
  const collisionKey = ({ entry }: ReadOne): string => {
    if (entry.pluginSource) {
      return `${entry.pluginSource.marketplace}::${entry.pluginSource.plugin}::${entry.key}`;
    }
    return entry.key;
  };
  const byKey = new Map<string, SkillEntry>();
  for (const item of collected) {
    const ck = collisionKey(item);
    const entry = item.entry;
    const existing = byKey.get(ck);
    if (
      !existing ||
      ORIGIN_PRECEDENCE[entry.origin] < ORIGIN_PRECEDENCE[existing.origin]
    ) {
      byKey.set(ck, entry);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Read a single skill's full bundle (frontmatter + body + file inventory).
 * Returns null if the skill is not found in any enabled origin.
 */
export async function readSkill(
  key: string,
  opts: ListSkillsOptions = {},
): Promise<SkillBundle | null> {
  const includeSystem = opts.includeSystem !== false;
  const includeLegacy = opts.includeLegacy !== false;

  const candidates: Array<{ dir: string; origin: SkillOrigin; scope: string | null }> = [];
  if (opts.cabinetPath) {
    candidates.push({
      dir: path.join(cabinetScopedSkillsDir(opts.cabinetPath), key),
      origin: "cabinet-scoped",
      scope: opts.cabinetPath,
    });
  }
  candidates.push({
    dir: path.join(cabinetRootSkillsDir(), key),
    origin: "cabinet-root",
    scope: null,
  });
  if (includeSystem) {
    for (const sysDir of systemSkillsDirs()) {
      candidates.push({ dir: path.join(sysDir, key), origin: "system", scope: null });
    }
  }
  if (includeLegacy) {
    candidates.push({
      dir: path.join(legacyHomeSkillsDir(), key),
      origin: "legacy-home",
      scope: null,
    });
  }

  for (const { dir, origin, scope } of candidates) {
    const result = readOneSkill(dir, origin, scope);
    if (result) {
      return { ...result.entry, body: result.body };
    }
  }

  // Plugin marketplace fallback — search nested layouts for a same-key skill.
  if (includeSystem) {
    const pluginHits = listClaudePluginSkills().filter((r) => r.entry.key === key);
    if (pluginHits.length > 0) {
      const first = pluginHits[0];
      return { ...first.entry, body: first.body };
    }
  }

  return null;
}

/**
 * Hydrate a persona's `skills: [...]` slug list into bundles, in the order
 * they appear on the persona. Missing skills are silently dropped (the
 * conversation runner can warn separately if desired).
 */
export async function resolveDesiredSkills(
  desiredKeys: string[] | undefined,
  cabinetPath?: string,
): Promise<SkillBundle[]> {
  if (!desiredKeys || desiredKeys.length === 0) return [];
  const bundles: SkillBundle[] = [];
  for (const key of desiredKeys) {
    if (typeof key !== "string" || !key.trim()) continue;
    const bundle = await readSkill(key.trim(), { cabinetPath });
    if (bundle) bundles.push(bundle);
  }
  return bundles;
}

/**
 * Build the "skill index" block injected into agent prompts: a compact list
 * of `name + description` for each attached skill, so the model knows what's
 * available without us preloading bodies. Bodies are mounted separately by
 * the adapter (see `_shared/skills-injection.ts`).
 *
 * Returns null when the agent has no skills.
 */
export function buildSkillIndex(skills: SkillBundle[] | SkillEntry[]): string | null {
  if (!skills || skills.length === 0) return null;
  const lines: string[] = [
    "Skills available to you (full instructions are mounted into your working dir; consult by name when relevant):",
  ];
  for (const skill of skills) {
    const description = skill.description ? ` — ${skill.description}` : "";
    lines.push(`- \`${skill.key}\` (${skill.name})${description}`);
  }
  lines.push(
    "Use a skill when its description matches your task. Do NOT invoke skills not listed here.",
  );
  return lines.join("\n");
}
