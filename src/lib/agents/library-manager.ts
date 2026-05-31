import path from "path";
import fs from "fs/promises";
import matter from "gray-matter";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists, readFileContent } from "@/lib/storage/fs-operations";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import { getDefaultProviderId } from "./provider-runtime";
import { resolveEnabledProviderId } from "./provider-settings";
import { GLOBAL_AGENTS_DIR, type AgentPersona, type RecommendedSkill } from "./persona-manager";
import { ensureAgentScaffold } from "./scaffold";

export const SEEDED_AGENT_LIBRARY_DIR = path.join(DATA_DIR, ".agents", ".library");
export const SOURCE_AGENT_LIBRARY_DIR = path.join(
  PROJECT_ROOT,
  "src",
  "lib",
  "agents",
  "library"
);

/**
 * Slugs that ship as shared, cabinet-spanning identities. The editor is the
 * canonical generalist — without it as a global, the LLM roster in any
 * cabinet that didn't explicitly install the editor will fall back to
 * "writing-coach (best specialist fit)" and similar misroutes.
 */
const GLOBAL_AGENT_SLUGS = ["editor"] as const;

import { getMandatoryAgentsForRoom, type RoomType } from "@/lib/onboarding/rooms";

// Legacy default — kept for callers that haven't been taught about rooms yet.
// New code should use getMandatoryAgentSlugs(roomType).
export const MANDATORY_AGENT_SLUGS = ["ceo", "editor"] as const;

export function getMandatoryAgentSlugs(roomType?: RoomType | string): readonly string[] {
  if (!roomType) return MANDATORY_AGENT_SLUGS;
  return getMandatoryAgentsForRoom(roomType);
}

export async function resolveAgentLibraryDir(): Promise<string | null> {
  for (const dir of [SEEDED_AGENT_LIBRARY_DIR, SOURCE_AGENT_LIBRARY_DIR]) {
    if (await fileExists(dir)) {
      return dir;
    }
  }

  return null;
}

export async function resolveAgentTemplateDir(slug: string): Promise<string | null> {
  const libraryDir = await resolveAgentLibraryDir();
  if (!libraryDir) return null;

  const templateDir = path.join(libraryDir, slug);
  if (!(await fileExists(path.join(templateDir, "persona.md")))) {
    return null;
  }

  return templateDir;
}

/**
 * Read the `recommendedSkills` frontmatter from a library template, if it
 * exists. Used to surface template suggestions on existing agents whose own
 * persona file pre-dates the template's recommendations being added.
 *
 * Returns `[]` when no matching template exists or the template has no
 * recommendations. Errors swallowed — best-effort enrichment.
 */
export async function getTemplateRecommendedSkills(
  slug: string,
): Promise<RecommendedSkill[]> {
  try {
    const templateDir = await resolveAgentTemplateDir(slug);
    if (!templateDir) return [];
    const raw = await fs.readFile(path.join(templateDir, "persona.md"), "utf-8");
    const { data } = matter(raw);
    const recommended = data.recommendedSkills;
    if (!Array.isArray(recommended)) return [];
    const out: RecommendedSkill[] = [];
    for (const v of recommended) {
      if (typeof v === "string" && v.trim()) {
        out.push({ key: v.trim() });
      } else if (v && typeof v === "object" && typeof (v as { key?: unknown }).key === "string") {
        const rec = v as { key: string; source?: unknown };
        const k = rec.key.trim();
        if (!k) continue;
        const entry: RecommendedSkill = { key: k };
        if (typeof rec.source === "string" && rec.source.trim()) {
          entry.source = rec.source.trim();
        }
        out.push(entry);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function mergeMandatoryAgentSlugs(
  selectedAgents: string[],
  roomType?: RoomType | string
): string[] {
  const mandatory = getMandatoryAgentSlugs(roomType);
  return Array.from(new Set([...mandatory, ...selectedAgents]));
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await ensureDirectory(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDirRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.copyFile(srcPath, destPath);
      }
    })
  );
}

/**
 * Bootstrap shared, cabinet-spanning agents by copying their library
 * templates into `data/.global-agents/<slug>/` if missing. Idempotent:
 * existing global agents are left alone (the user may have edited them).
 *
 * Called once on app boot. Fresh installs get the editor automatically;
 * existing installs get it on the next boot after this lands.
 */
export async function ensureGlobalAgents(): Promise<void> {
  await ensureDirectory(GLOBAL_AGENTS_DIR);
  for (const slug of GLOBAL_AGENT_SLUGS) {
    const targetDir = path.join(GLOBAL_AGENTS_DIR, slug);
    if (await fileExists(path.join(targetDir, "persona.md"))) continue;
    const templateDir = await resolveAgentTemplateDir(slug);
    if (!templateDir) {
      // The library template is missing — non-fatal, just log. The editor
      // resolver chain in conversation-runner falls back to readLibraryPersona,
      // so callers degrade gracefully even without bootstrap.
      console.warn(`ensureGlobalAgents: library template for "${slug}" not found; skipping bootstrap.`);
      continue;
    }
    await copyDirRecursive(templateDir, targetDir);
    await ensureAgentScaffold(targetDir);
  }
}

export async function readLibraryPersona(
  slug: string,
  cabinetPath?: string
): Promise<AgentPersona | null> {
  const templateDir = await resolveAgentTemplateDir(slug);
  if (!templateDir) return null;

  const raw = await readFileContent(path.join(templateDir, "persona.md"));
  const { data, content } = matter(raw);

  return {
    name: (data.name as string) || slug,
    role: (data.role as string) || "",
    provider: resolveEnabledProviderId(
      typeof data.provider === "string" ? data.provider : getDefaultProviderId()
    ),
    heartbeat: (data.heartbeat as string) || "0 8 * * *",
    budget: (data.budget as number) || 100,
    active: data.active !== false,
    heartbeatEnabled: data.heartbeatEnabled !== false,
    workdir: (data.workdir as string) || "/data",
    focus: (data.focus as string[]) || [],
    tags: (data.tags as string[]) || [],
    emoji: (data.emoji as string) || "🤖",
    department: (data.department as string) || "general",
    type: (data.type as AgentPersona["type"]) || "specialist",
    goals: (data.goals as AgentPersona["goals"]) || [],
    channels: (data.channels as string[]) || ["general"],
    workspace: (data.workspace as string) || "workspace",
    setupComplete: false,
    cabinetPath: normalizeCabinetPath(cabinetPath, true),
    slug,
    body: content.trim(),
  };
}
