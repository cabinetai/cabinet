import path from "path";
import matter from "gray-matter";
import cron from "node-cron";
import { createTtlCache } from "@/lib/cache/ttl-cache";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { discoverCabinetPaths } from "@/lib/cabinets/discovery";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import {
  readFileContent,
  writeFileContent,
  fileExists,
  ensureDirectory,
  listDirectory,
} from "@/lib/storage/fs-operations";
import { runHeartbeat } from "./heartbeat";
import { getGoalState } from "./goal-manager";
import type { GoalMetric, AgentType } from "@/types/agents";
import { getDefaultProviderId } from "./provider-runtime";
import { resolveEnabledProviderId } from "./provider-settings";

const AGENTS_DIR = path.join(DATA_DIR, ".agents");
const MEMORY_DIR = path.join(AGENTS_DIR, ".memory");
const MESSAGES_DIR = path.join(AGENTS_DIR, ".messages");
const HISTORY_DIR = path.join(AGENTS_DIR, ".history");
// Global agents live alongside cabinet data, not inside any cabinet's
// .agents dir. One persona, one memory, one heartbeat — shared across cabinets.
export const GLOBAL_AGENTS_DIR = path.join(DATA_DIR, ".global-agents");

export type PersonaScope = "global" | "cabinet";

/**
 * Frontmatter shape for `recommendedSkills` entries. Either a bare key (string)
 * or an object with `key` + optional `source` URL for one-click install.
 */
export interface RecommendedSkill {
  key: string;
  source?: string;
}

function resolveAgentsDir(cabinetPath?: string): string {
  if (cabinetPath) return path.join(DATA_DIR, cabinetPath, ".agents");
  return AGENTS_DIR;
}

async function isGlobalPersona(slug: string): Promise<boolean> {
  return fileExists(path.join(GLOBAL_AGENTS_DIR, slug, "persona.md"));
}

// State-path resolver: globals always route to GLOBAL_AGENTS_DIR regardless
// of which cabinet the call originated from. That's the whole point — one
// memory dir, one heartbeat counter, shared across cabinets.
async function resolveAgentsDirForSlug(
  slug: string,
  cabinetPath: string | undefined
): Promise<string> {
  if (await isGlobalPersona(slug)) return GLOBAL_AGENTS_DIR;
  const resolved = cabinetPath ?? (await findPersonaCabinetPath(slug));
  return resolveAgentsDir(resolved);
}

async function resolveMemoryDirForSlug(
  slug: string,
  cabinetPath: string | undefined
): Promise<string> {
  return path.join(await resolveAgentsDirForSlug(slug, cabinetPath), ".memory");
}

async function resolveMessagesDirForSlug(
  slug: string,
  cabinetPath: string | undefined
): Promise<string> {
  return path.join(await resolveAgentsDirForSlug(slug, cabinetPath), ".messages");
}

async function resolveHistoryDirForSlug(
  slug: string,
  cabinetPath: string | undefined
): Promise<string> {
  return path.join(await resolveAgentsDirForSlug(slug, cabinetPath), ".history");
}

/**
 * Legacy alias: older conversations and external callers pass `agentSlug:
 * "general"` — there is no General persona anymore, Editor fills that role.
 */
export function normalizeAgentSlug(slug: string | null | undefined): string {
  if (!slug) return "editor";
  return slug === "general" ? "editor" : slug;
}

/**
 * Walks all cabinets looking for `.agents/<slug>/persona.md`. Slugs are
 * globally unique, so at most one cabinet contains a match. Returns the
 * cabinetPath (or undefined when found at the root / not found at all).
 * Callers fall back to the root dir when undefined.
 *
 * Note: this only searches *cabinet-local* personas. Global personas live
 * outside any cabinet — use `findPersonaSource` if you need to know whether
 * a slug resolves to a global or a cabinet-local agent.
 */
export async function findPersonaCabinetPath(slug: string): Promise<string | undefined> {
  const cabinetPaths = await discoverCabinetPaths();
  for (const cp of cabinetPaths) {
    const agentsDir =
      cp === ROOT_CABINET_PATH ? AGENTS_DIR : path.join(DATA_DIR, cp, ".agents");
    const candidate = path.join(agentsDir, slug, "persona.md");
    if (await fileExists(candidate)) {
      return cp === ROOT_CABINET_PATH ? undefined : cp;
    }
  }
  return undefined;
}

interface PersonaSource {
  scope: PersonaScope;
  agentsDir: string;
  cabinetPath?: string; // only for scope === "cabinet"; undefined means root
}

/**
 * Resolves where a persona's `persona.md` actually lives. Order:
 * 1. Cabinet-local override (when `preferredCabinetPath` is set and the file exists there)
 * 2. Global tier (`data/.global-agents/<slug>/persona.md`)
 * 3. Any cabinet (root or sub) — slug uniqueness means at most one match
 */
async function findPersonaSource(
  slug: string,
  preferredCabinetPath?: string
): Promise<PersonaSource | null> {
  if (preferredCabinetPath !== undefined) {
    const dir = resolveAgentsDir(preferredCabinetPath);
    if (await fileExists(path.join(dir, slug, "persona.md"))) {
      return { scope: "cabinet", agentsDir: dir, cabinetPath: preferredCabinetPath };
    }
  }
  if (await fileExists(path.join(GLOBAL_AGENTS_DIR, slug, "persona.md"))) {
    return { scope: "global", agentsDir: GLOBAL_AGENTS_DIR };
  }
  const cabinetPaths = await discoverCabinetPaths();
  for (const cp of cabinetPaths) {
    const dir =
      cp === ROOT_CABINET_PATH ? AGENTS_DIR : path.join(DATA_DIR, cp, ".agents");
    if (await fileExists(path.join(dir, slug, "persona.md"))) {
      return {
        scope: "cabinet",
        agentsDir: dir,
        cabinetPath: cp === ROOT_CABINET_PATH ? undefined : cp,
      };
    }
  }
  return null;
}

// Track currently running heartbeats
const runningHeartbeats = new Set<string>();

export function markHeartbeatRunning(slug: string): void {
  runningHeartbeats.add(slug);
}

export function markHeartbeatComplete(slug: string): void {
  runningHeartbeats.delete(slug);
}

export function getRunningHeartbeats(): string[] {
  return Array.from(runningHeartbeats);
}

export interface AgentPersona {
  name: string;
  role: string;
  provider: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  heartbeat: string; // cron expression
  budget: number; // max heartbeats per month
  active: boolean;
  /**
   * Whether the heartbeat is enabled. Independent from `active` so users can
   * silence the heartbeat without disabling the agent's other routines.
   * Effective scheduling = `active && heartbeatEnabled`. Defaults to true
   * for personas missing the field (backward compat).
   */
  heartbeatEnabled: boolean;
  workdir: string;
  focus: string[];
  tags: string[];
  /**
   * Skill keys this agent has attached. Resolved at run time by
   * `src/lib/agents/skills/loader.ts` against four origins (cabinet-scoped,
   * cabinet-root, system, legacy-home) and symlinked into a managed tmpdir
   * for adapters that support it (see `_shared/skills-injection.ts`).
   */
  skills?: string[];
  /**
   * Skills recommended for this persona — surfaced in the agent detail
   * "Suggested" section. Each entry is either a bare key (assumed to be in
   * the local catalog) or an object with a `source` URL so the UI can offer
   * a one-click install for skills that aren't yet imported.
   *
   *   recommendedSkills:
   *     - kb-page-author                                    # already in catalog
   *     - key: seo-audit                                    # not yet installed
   *       source: github:owner/repo/seo-audit
   */
  recommendedSkills?: RecommendedSkill[];
  // New fields (all optional for backward compat)
  emoji: string;
  department: string;
  type: AgentType;
  goals: GoalMetric[];
  channels: string[];     // Agent Slack channels
  workspace: string;      // relative path under data/.agents/{slug}/
  setupComplete: boolean; // false until agent settings are saved for the first time
  cabinetPath?: string;
  // Identity customization (all optional; fall back to slug-based defaults)
  displayName?: string;   // user-chosen name, e.g. "Steve"
  iconKey?: string;       // Lucide key from icon-catalog (overrides slug default)
  color?: string;         // hex color (overrides hash-based color)
  avatar?: string;        // "none" | preset id | "custom" (file at avatar.{ext})
  avatarExt?: string;     // extension of uploaded custom avatar (png/jpg/svg)
  canDispatch?: boolean;  // can propose tasks/jobs to other agents (lead-default)
  // Computed
  slug: string;
  scope?: PersonaScope; // "global" when persona file lives in data/.global-agents/
  body: string; // markdown body (persona instructions)
  heartbeatsUsed?: number;
  lastHeartbeat?: string;
  nextHeartbeat?: string;
}

export interface HeartbeatRecord {
  agentSlug: string;
  timestamp: string;
  duration: number;
  status: "completed" | "failed";
  summary: string;
}

import { computeNextCronRun } from "./cron-compute";

// Active cron jobs for agents
const heartbeatJobs = new Map<string, ReturnType<typeof cron.schedule>>();

function parseRecommendedSkill(raw: unknown): RecommendedSkill | null {
  if (typeof raw === "string") {
    const key = raw.trim();
    return key ? { key } : null;
  }
  if (raw && typeof raw === "object") {
    const rec = raw as { key?: unknown; source?: unknown };
    if (typeof rec.key === "string" && rec.key.trim()) {
      const out: RecommendedSkill = { key: rec.key.trim() };
      if (typeof rec.source === "string" && rec.source.trim()) {
        out.source = rec.source.trim();
      }
      return out;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAdapterConfig(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.keys(value).length > 0 ? value : undefined;
}

export async function initAgentsDir(): Promise<void> {
  await ensureDirectory(AGENTS_DIR);
  await ensureDirectory(MEMORY_DIR);
  await ensureDirectory(MESSAGES_DIR);
  await ensureDirectory(HISTORY_DIR);
  await ensureDirectory(GLOBAL_AGENTS_DIR);
}

async function listPersonasInDir(
  agentsDir: string,
  cabinetPath: string | undefined
): Promise<AgentPersona[]> {
  await ensureDirectory(agentsDir);
  const entries = await listDirectory(agentsDir);
  const candidates = entries.filter(
    (entry) => entry.isDirectory && !entry.name.startsWith(".")
  );
  const personas = await Promise.all(
    candidates.map(async (entry) => {
      const personaPath = path.join(agentsDir, entry.name, "persona.md");
      if (!(await fileExists(personaPath))) return null;
      const persona = await readPersona(entry.name, cabinetPath);
      return persona && persona.role ? persona : null;
    })
  );
  return personas.filter((p): p is AgentPersona => p !== null);
}

export async function listGlobalPersonas(): Promise<AgentPersona[]> {
  // No cabinetPath — readPersona will route through findPersonaSource and
  // discover the global tier on its own.
  return listPersonasInDir(GLOBAL_AGENTS_DIR, undefined);
}

/**
 * Personas visible to a cabinet: cabinet-local first (they shadow globals
 * when slugs collide), then globals not already represented locally. The
 * LLM roster builder, the agent picker, and the personas API all use this.
 */
export async function listPersonas(cabinetPath?: string): Promise<AgentPersona[]> {
  const [locals, globals] = await Promise.all([
    listPersonasInDir(resolveAgentsDir(cabinetPath), cabinetPath),
    listGlobalPersonas(),
  ]);
  const localSlugs = new Set(locals.map((p) => p.slug));
  return [...locals, ...globals.filter((g) => !localSlugs.has(g.slug))];
}

// 5-second TTL. listAllPersonas walks every cabinet's .agents dir and is
// called every /api/agents/events tick (3s) plus scheduler / gallery routes.
const allPersonasCache = createTtlCache<AgentPersona[]>({ ttlMs: 5000 });

export function invalidatePersonasCache() {
  allPersonasCache.invalidate();
}

export async function listAllPersonas(): Promise<AgentPersona[]> {
  return allPersonasCache.get("all", async () => {
    const cabinetPaths = await discoverCabinetPaths();
    // Walk only cabinet-local personas per cabinet; globals are appended
    // once at the end, not per-cabinet, so the gallery doesn't duplicate them.
    const [cabinetGroups, globals] = await Promise.all([
      Promise.all(
        cabinetPaths.map((cp) =>
          listPersonasInDir(resolveAgentsDir(cp === ROOT_CABINET_PATH ? undefined : cp), cp === ROOT_CABINET_PATH ? undefined : cp)
        )
      ),
      listGlobalPersonas(),
    ]);

    return [...cabinetGroups.flat(), ...globals].sort((left, right) => {
      if ((left.workdir || "").localeCompare(right.workdir || "") !== 0) {
        return (left.workdir || "").localeCompare(right.workdir || "");
      }
      return left.name.localeCompare(right.name);
    });
  });
}

export async function readPersona(slug: string, cabinetPath?: string): Promise<AgentPersona | null> {
  const source = await findPersonaSource(slug, cabinetPath);
  if (!source) return null;
  const { agentsDir, scope } = source;
  const resolved = source.cabinetPath;
  const filePath = path.join(agentsDir, slug, "persona.md");
  if (!(await fileExists(filePath))) return null;

  const raw = await readFileContent(filePath);
  const { data, content } = matter(raw);

  const persona: AgentPersona = {
    scope,
    name: (data.name as string) || slug,
    role: (data.role as string) || "",
    provider: resolveEnabledProviderId(
      typeof data.provider === "string" ? data.provider : getDefaultProviderId()
    ),
    adapterType:
      typeof data.adapterType === "string" && data.adapterType.trim()
        ? data.adapterType.trim()
        : undefined,
    adapterConfig: normalizeAdapterConfig(data.adapterConfig),
    heartbeat: (data.heartbeat as string) || "0 8 * * *",
    budget: (data.budget as number) || 100,
    active: data.active !== false,
    heartbeatEnabled: data.heartbeatEnabled !== false,
    workdir: (data.workdir as string) || "/data",
    focus: (data.focus as string[]) || [],
    tags: (data.tags as string[]) || [],
    skills: Array.isArray(data.skills)
      ? (data.skills as unknown[]).filter(
          (value): value is string => typeof value === "string" && value.trim() !== ""
        )
      : undefined,
    recommendedSkills: Array.isArray(data.recommendedSkills)
      ? (data.recommendedSkills as unknown[])
          .map(parseRecommendedSkill)
          .filter((entry): entry is RecommendedSkill => entry !== null)
      : undefined,
    // New fields with backward-compatible defaults
    emoji: (data.emoji as string) || "🤖",
    department: (data.department as string) || "general",
    type: (data.type as AgentPersona["type"]) || "specialist",
    goals: (data.goals as AgentPersona["goals"]) || [],
    channels: (data.channels as string[]) || ["general"],
    workspace: (data.workspace as string) || `workspace`,
    setupComplete: data.setupComplete === true,
    cabinetPath: normalizeCabinetPath(resolved, true),
    displayName:
      typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : undefined,
    iconKey:
      typeof data.iconKey === "string" && data.iconKey.trim()
        ? data.iconKey.trim()
        : undefined,
    color:
      typeof data.color === "string" && data.color.trim()
        ? data.color.trim()
        : undefined,
    avatar:
      typeof data.avatar === "string" && data.avatar.trim()
        ? data.avatar.trim()
        : undefined,
    avatarExt:
      typeof data.avatarExt === "string" && data.avatarExt.trim()
        ? data.avatarExt.trim()
        : undefined,
    canDispatch:
      typeof data.canDispatch === "boolean" ? data.canDispatch : undefined,
    slug,
    body: content.trim(),
  };

  // Load stats — check agent dir first, then legacy shared dir.
  // Globals route their legacy dir to GLOBAL_AGENTS_DIR/.memory.
  const agentStatsPath = path.join(agentsDir, slug, "memory", "stats.json");
  const legacyStatsPath = path.join(agentsDir, ".memory", slug, "stats.json");
  const statsPath = (await fileExists(agentStatsPath)) ? agentStatsPath : legacyStatsPath;
  if (await fileExists(statsPath)) {
    try {
      const stats = JSON.parse(await readFileContent(statsPath));
      persona.heartbeatsUsed = stats.heartbeatsUsed || 0;
      persona.lastHeartbeat = stats.lastHeartbeat;
    } catch { /* ignore */ }
  }

  // Compute nextHeartbeat from cron expression + lastHeartbeat
  if (persona.active && persona.heartbeatEnabled && persona.heartbeat && persona.lastHeartbeat) {
    try {
      const nextRun = computeNextCronRun(persona.heartbeat, new Date(persona.lastHeartbeat));
      if (nextRun) persona.nextHeartbeat = nextRun.toISOString();
    } catch { /* ignore */ }
  }

  // Merge goal state from disk (overwrites static frontmatter values)
  if (persona.goals.length > 0) {
    try {
      const goalState = await getGoalState(slug);
      persona.goals = persona.goals.map((g) => {
        const state = goalState[g.metric];
        return state ? { ...g, current: state.current } : g;
      });
    } catch { /* ignore */ }
  }

  return persona;
}

export async function writePersona(slug: string, persona: Partial<AgentPersona> & { body?: string }, cabinetPath?: string): Promise<void> {
  // If the persona already exists, write back to wherever it lives — that
  // includes the global tier. Settings dialogs editing a global from any
  // cabinet view should land in `data/.global-agents/<slug>/persona.md`.
  const existingSource = await findPersonaSource(slug, cabinetPath);
  const agentsDir = existingSource?.agentsDir ?? resolveAgentsDir(cabinetPath);
  const resolved = existingSource?.cabinetPath ?? cabinetPath;
  await ensureDirectory(agentsDir);
  // Use directory-based structure: {slug}/persona.md
  const agentDir = path.join(agentsDir, slug);
  await ensureDirectory(agentDir);
  const filePath = path.join(agentDir, "persona.md");

  const existing = await readPersona(slug, resolved);
  const merged = { ...existing, ...persona };

  const frontmatter: Record<string, unknown> = {
    name: merged.name,
    role: merged.role,
    provider: resolveEnabledProviderId(merged.provider),
    heartbeat: merged.heartbeat,
    budget: merged.budget,
    active: merged.active,
    heartbeatEnabled: merged.heartbeatEnabled !== false,
    workdir: merged.workdir,
    focus: merged.focus,
    tags: merged.tags,
    // Always write these fields for consistency
    emoji: merged.emoji || "🤖",
    department: merged.department || "general",
    type: merged.type || "specialist",
    workspace: merged.workspace || "workspace",
    setupComplete: merged.setupComplete === true,
    ...(merged.goals && merged.goals.length > 0 ? { goals: merged.goals } : {}),
    ...(merged.channels && merged.channels.length > 0 ? { channels: merged.channels } : {}),
    ...(typeof merged.adapterType === "string" && merged.adapterType.trim()
      ? { adapterType: merged.adapterType.trim() }
      : {}),
    ...(normalizeAdapterConfig(merged.adapterConfig)
      ? { adapterConfig: normalizeAdapterConfig(merged.adapterConfig) }
      : {}),
    ...(typeof merged.displayName === "string" && merged.displayName.trim()
      ? { displayName: merged.displayName.trim() }
      : {}),
    ...(typeof merged.iconKey === "string" && merged.iconKey.trim()
      ? { iconKey: merged.iconKey.trim() }
      : {}),
    ...(typeof merged.color === "string" && merged.color.trim()
      ? { color: merged.color.trim() }
      : {}),
    ...(typeof merged.avatar === "string" && merged.avatar.trim()
      ? { avatar: merged.avatar.trim() }
      : {}),
    ...(typeof merged.avatarExt === "string" && merged.avatarExt.trim()
      ? { avatarExt: merged.avatarExt.trim() }
      : {}),
    ...(Array.isArray(merged.skills) && merged.skills.length > 0
      ? {
          skills: merged.skills.filter(
            (slug): slug is string => typeof slug === "string" && slug.trim() !== ""
          ),
        }
      : {}),
    ...(Array.isArray(merged.recommendedSkills) && merged.recommendedSkills.length > 0
      ? {
          recommendedSkills: merged.recommendedSkills
            .map(parseRecommendedSkill)
            .filter((entry): entry is RecommendedSkill => entry !== null)
            .map((entry) => (entry.source ? entry : entry.key)),
        }
      : {}),
    ...(typeof merged.canDispatch === "boolean"
      ? { canDispatch: merged.canDispatch }
      : {}),
  };

  const md = matter.stringify(merged.body || "", frontmatter);
  await writeFileContent(filePath, md);
}

export async function deletePersona(slug: string, cabinetPath?: string): Promise<void> {
  const source = await findPersonaSource(slug, cabinetPath);
  if (!source) return;
  // Refuse to delete a global agent from a cabinet view — globals are shared
  // across cabinets, so a per-cabinet delete is almost certainly a mistake.
  if (source.scope === "global" && cabinetPath !== undefined) {
    throw new Error(
      `Cannot delete global agent "${slug}" from a cabinet view. ` +
        "Open the agent's settings without a cabinet context to remove it."
    );
  }
  const fs = await import("fs/promises");
  const agentDir = path.join(source.agentsDir, slug);
  await fs.rm(agentDir, { recursive: true, force: true });
  unregisterHeartbeat(slug);
}

// --- Memory ---

export async function readMemory(slug: string, file: string, cabinetPath?: string): Promise<string> {
  const memDir = path.join(await resolveMemoryDirForSlug(slug, cabinetPath), slug);
  await ensureDirectory(memDir);
  const filePath = path.join(memDir, file);
  if (!(await fileExists(filePath))) return "";
  return readFileContent(filePath);
}

export async function writeMemory(slug: string, file: string, content: string, cabinetPath?: string): Promise<void> {
  const memDir = path.join(await resolveMemoryDirForSlug(slug, cabinetPath), slug);
  await ensureDirectory(memDir);
  await writeFileContent(path.join(memDir, file), content);
}

export async function listMemoryFiles(slug: string, cabinetPath?: string): Promise<string[]> {
  const memDir = path.join(await resolveMemoryDirForSlug(slug, cabinetPath), slug);
  await ensureDirectory(memDir);
  const entries = await listDirectory(memDir);
  return entries.filter((e) => !e.isDirectory).map((e) => e.name);
}

// --- Messages ---

export async function sendMessage(
  from: string,
  to: string,
  message: string,
  cabinetPath?: string
): Promise<void> {
  const inboxDir = path.join(await resolveMessagesDirForSlug(to, cabinetPath), to);
  await ensureDirectory(inboxDir);
  const timestamp = new Date().toISOString();
  const filename = `${timestamp.replace(/[:.]/g, "-")}_from_${from}.md`;
  const content = `---\nfrom: ${from}\nto: ${to}\ntimestamp: ${timestamp}\n---\n\n${message}\n`;
  await writeFileContent(path.join(inboxDir, filename), content);
}

export async function readInbox(slug: string, cabinetPath?: string): Promise<Array<{ from: string; timestamp: string; message: string; filename: string }>> {
  const inboxDir = path.join(await resolveMessagesDirForSlug(slug, cabinetPath), slug);
  await ensureDirectory(inboxDir);
  const entries = await listDirectory(inboxDir);
  const messages: Array<{ from: string; timestamp: string; message: string; filename: string }> = [];

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    const raw = await readFileContent(path.join(inboxDir, entry.name));
    const { data, content } = matter(raw);
    messages.push({
      from: (data.from as string) || "unknown",
      timestamp: (data.timestamp as string) || "",
      message: content.trim(),
      filename: entry.name,
    });
  }

  return messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function clearInbox(slug: string, cabinetPath?: string): Promise<void> {
  const inboxDir = path.join(await resolveMessagesDirForSlug(slug, cabinetPath), slug);
  const fs = await import("fs/promises");
  const entries = await listDirectory(inboxDir).catch(() => []);
  for (const entry of entries) {
    if (entry.name.endsWith(".md")) {
      await fs.unlink(path.join(inboxDir, entry.name)).catch(() => {});
    }
  }
}

// --- Heartbeat History ---

export async function recordHeartbeat(record: HeartbeatRecord & { cabinetPath?: string }): Promise<void> {
  const slug = record.agentSlug;
  const histDir = await resolveHistoryDirForSlug(slug, record.cabinetPath);

  // Append to history log
  const historyFile = path.join(histDir, `${slug}.jsonl`);
  const line = JSON.stringify(record) + "\n";
  const fs = await import("fs/promises");
  await fs.appendFile(historyFile, line).catch(async () => {
    await ensureDirectory(histDir);
    await fs.writeFile(historyFile, line);
  });

  // Update stats
  const memDir = path.join(await resolveMemoryDirForSlug(slug, record.cabinetPath), slug);
  await ensureDirectory(memDir);
  const statsPath = path.join(memDir, "stats.json");
  let stats = { heartbeatsUsed: 0, lastHeartbeat: "" };
  if (await fileExists(statsPath)) {
    try { stats = JSON.parse(await readFileContent(statsPath)); } catch { /* ignore */ }
  }
  stats.heartbeatsUsed++;
  stats.lastHeartbeat = record.timestamp;
  await writeFileContent(statsPath, JSON.stringify(stats, null, 2));
}

export async function getHeartbeatHistory(slug: string, limit = 20, cabinetPath?: string): Promise<HeartbeatRecord[]> {
  const historyFile = path.join(
    await resolveHistoryDirForSlug(slug, cabinetPath),
    `${slug}.jsonl`
  );
  if (!(await fileExists(historyFile))) return [];

  const raw = await readFileContent(historyFile);
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .reverse()
    .slice(0, limit);
}

// --- Heartbeat Scheduler ---

export function registerHeartbeat(slug: string, cronExpr: string): void {
  unregisterHeartbeat(slug);
  if (!cron.validate(cronExpr)) return;

  const job = cron.schedule(cronExpr, () => {
    runHeartbeat(slug).catch((err) => {
      console.error(`Heartbeat failed for ${slug}:`, err);
    });
  });

  heartbeatJobs.set(slug, job);
}

export function unregisterHeartbeat(slug: string): void {
  const existing = heartbeatJobs.get(slug);
  if (existing) {
    existing.stop();
    heartbeatJobs.delete(slug);
  }
}

export async function registerAllHeartbeats(): Promise<void> {
  const personas = await listPersonas();
  for (const persona of personas) {
    if (persona.active && persona.heartbeatEnabled && persona.heartbeatsUsed !== undefined && persona.heartbeatsUsed < persona.budget) {
      registerHeartbeat(persona.slug, persona.heartbeat);
    }
  }
}

export function getRegisteredHeartbeats(): string[] {
  return Array.from(heartbeatJobs.keys());
}
