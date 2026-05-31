import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { DATA_DIR } from "../../src/lib/storage/path-utils";
import type { AgentDoc, TaskDoc } from "./search-service";

const AGENT_CACHE_TTL_MS = 5_000;
const TASK_CACHE_TTL_MS = 3_000;

/** Top-level room slug a file lives in (first path segment under data/). */
function roomOf(fsPath: string): string | undefined {
  const rel = path.relative(DATA_DIR, fsPath);
  if (!rel || rel.startsWith("..")) return undefined;
  const seg = rel.split(path.sep)[0];
  return seg && !seg.startsWith(".") ? seg : undefined;
}

let agentCache: { at: number; docs: AgentDoc[] } | null = null;
let taskCache: { at: number; docs: TaskDoc[] } | null = null;

async function readPersonaFile(fsPath: string): Promise<AgentDoc | null> {
  try {
    const raw = await fs.readFile(fsPath, "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const slug = typeof data.slug === "string" ? data.slug : path.basename(path.dirname(fsPath));
    const title = typeof data.displayName === "string" && data.displayName
      ? data.displayName
      : typeof data.title === "string"
        ? data.title
        : slug;
    const role = typeof data.role === "string" ? data.role : undefined;
    const department = typeof data.department === "string" ? data.department : undefined;
    const provider = typeof data.provider === "string" ? data.provider : undefined;
    const tags = Array.isArray(data.tags)
      ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : undefined;
    const searchText = [
      title,
      slug,
      role,
      department,
      provider,
      ...(tags ?? []),
      parsed.content.slice(0, 400),
    ]
      .filter(Boolean)
      .join(" ");
    return {
      slug,
      title,
      role,
      department,
      provider,
      tags,
      searchText,
    };
  } catch {
    return null;
  }
}

async function findPersonaFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".agents") {
          let subEntries: import("fs").Dirent[];
          try {
            subEntries = await fs.readdir(p, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const sub of subEntries) {
            if (!sub.isDirectory()) continue;
            const personaPath = path.join(p, sub.name, "persona.md");
            try {
              await fs.access(personaPath);
              found.push(personaPath);
            } catch {}
          }
        } else {
          await walk(p);
        }
      }
    }
  }

  await walk(root);
  return found;
}

export async function loadAgentDocs(): Promise<AgentDoc[]> {
  const now = Date.now();
  if (agentCache && now - agentCache.at < AGENT_CACHE_TTL_MS) {
    return agentCache.docs;
  }
  const files = await findPersonaFiles(DATA_DIR);
  const docs: AgentDoc[] = [];
  for (const f of files) {
    const doc = await readPersonaFile(f);
    if (doc) docs.push({ ...doc, cabinet: roomOf(f) });
  }
  agentCache = { at: now, docs };
  return docs;
}

interface RawTask {
  id: string;
  title?: string;
  description?: string;
  fromAgent?: string;
  toAgent?: string;
  status?: string;
  trigger?: string;
  createdAt?: string;
  prompt?: string;
}

async function findTaskFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".tasks" && entry.name !== ".agents") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".tasks") {
          let subs: import("fs").Dirent[];
          try {
            subs = await fs.readdir(p, { withFileTypes: true });
          } catch {
            continue;
          }
          for (const sub of subs) {
            if (sub.isFile() && sub.name.endsWith(".json")) {
              out.push(path.join(p, sub.name));
            }
          }
        } else {
          await walk(p);
        }
      }
    }
  }

  await walk(root);
  return out;
}

export async function loadTaskDocs(): Promise<TaskDoc[]> {
  const now = Date.now();
  if (taskCache && now - taskCache.at < TASK_CACHE_TTL_MS) {
    return taskCache.docs;
  }
  const files = await findTaskFiles(DATA_DIR);
  const docs: TaskDoc[] = [];
  for (const f of files) {
    try {
      const raw = await fs.readFile(f, "utf8");
      const parsed = JSON.parse(raw) as RawTask;
      const title =
        (parsed.title && parsed.title.trim()) ||
        (parsed.description && parsed.description.trim().slice(0, 80)) ||
        (parsed.prompt && parsed.prompt.trim().slice(0, 80)) ||
        parsed.id;
      const searchText = [
        title,
        parsed.description,
        parsed.prompt,
        parsed.fromAgent,
        parsed.toAgent,
        parsed.status,
        parsed.trigger,
      ]
        .filter(Boolean)
        .join(" ");
      docs.push({
        id: parsed.id,
        title,
        agent: parsed.toAgent || parsed.fromAgent,
        status: parsed.status,
        trigger: parsed.trigger,
        createdAt: parsed.createdAt,
        cabinet: roomOf(f),
        searchText,
      });
    } catch {
      continue;
    }
  }
  taskCache = { at: now, docs };
  return docs;
}

export function invalidateAgentCache(): void {
  agentCache = null;
}

export function invalidateTaskCache(): void {
  taskCache = null;
}
