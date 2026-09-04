import fs from "fs/promises";
import path from "path";
import { DATA_PARENT_DIR } from "@/lib/storage/path-utils";
import {
  DEFAULT_CABINET_NAME,
  getActiveCabinetName,
  clearActiveCabinetCache,
} from "@/lib/runtime/runtime-config";
import { writeActiveCabinet } from "@/lib/cabinets/rooms";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";

/**
 * A "root cabinet" (formerly "vault") is a named directory directly under the shared data
 * folder, holding its own rooms/content tree. The active cabinet's directory is
 * the content root (DATA_DIR). Multiple root cabinets map to multiple Obsidian-style
 * workspaces; switching restarts the server so DATA_DIR re-resolves.
 *
 * Cross-cabinet state lives beside the root cabinets at the data-folder root and is
 * never itself a cabinet nor moved during migration.
 */
const SHARED_TOP_LEVEL = new Set([
  ".home",
  ".cabinet-state",
  "cabinet-backups",
  "bookmarks.json",
]);

function sanitizeCabinetName(raw: string): string {
  return raw
    .replace(/[\\/]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export interface CabinetMeta {
  /** Directory name == display name (the cabinet name is the folder name). */
  name: string;
  active: boolean;
}

async function isCabinetDir(name: string): Promise<boolean> {
  if (SHARED_TOP_LEVEL.has(name)) return false;
  try {
    const stat = await fs.stat(path.join(DATA_PARENT_DIR, name));
    if (!stat.isDirectory()) return false;
    await fs.access(path.join(DATA_PARENT_DIR, name, CABINET_MANIFEST_FILE));
    return true;
  } catch {
    return false;
  }
}

/** List the root cabinets found directly under the data folder. */
export async function listCabinets(): Promise<CabinetMeta[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(DATA_PARENT_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const active = getActiveCabinetName();
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await isCabinetDir(entry.name)) names.push(entry.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names.map((name) => ({ name, active: name === active }));
}

/**
 * Create a new root cabinet directory under the data folder. Idempotent
 * via scaffold's skipExisting. Returns the sanitized cabinet name.
 */
export async function createCabinet(rawName: string): Promise<string> {
  const name = sanitizeCabinetName(rawName);
  if (!name) throw new Error("invalid cabinet name");
  if (SHARED_TOP_LEVEL.has(name)) throw new Error("reserved cabinet name");
  const dir = path.join(DATA_PARENT_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await scaffoldCabinet(dir, { name, kind: "root", skipExisting: true });
  return name;
}

/**
 * Point the active-cabinet config at `name`. Validates the cabinet exists; the
 * caller triggers the server restart that makes the new content root effective.
 */
export async function setActiveCabinet(rawName: string): Promise<string> {
  const name = sanitizeCabinetName(rawName);
  if (!name || !(await isCabinetDir(name))) {
    throw new Error("unknown cabinet");
  }
  await writeActiveCabinet(name);
  clearActiveCabinetCache();
  return name;
}

/**
 * Move `from` onto `to`, merging into an existing destination instead of
 * failing the way a bare `fs.rename` does when the target already exists. A
 * half-finished earlier migration can leave a partial target dir behind, so a
 * plain rename would collide and silently strand loose content at the root
 * (the exact corruption this hardening prevents). Directories recurse; on a
 * file collision the source wins, since it is the live content being
 * consolidated. Falls back to copy semantics across devices via rename retry.
 */
async function moveMerge(from: string, to: string): Promise<void> {
  try {
    await fs.rename(from, to);
    return;
  } catch {
    // Destination exists (or cross-device) — fall through to a recursive merge.
  }
  const stat = await fs.stat(from);
  if (!stat.isDirectory()) {
    await fs.rm(to, { force: true });
    await fs.rename(from, to);
    return;
  }
  await fs.mkdir(to, { recursive: true });
  for (const child of await fs.readdir(from)) {
    await moveMerge(path.join(from, child), path.join(to, child));
  }
  await fs.rmdir(from).catch(() => {});
}

/**
 * One-time, idempotent migration. When no cabinet exists yet, move every loose
 * top-level entry (rooms, root .agents, index.md, etc.) into the active cabinet's
 * directory, leaving only the shared cross-cabinet state at the data-folder root,
 * then record the active cabinet. Safe to call on every server start.
 */
export async function ensureCabinetsMigrated(): Promise<void> {
  const existing = await listCabinets();
  if (existing.length > 0) {
    // Already migrated. Heal a missing/stale active pointer so the resolved
    // DATA_DIR always maps to a real cabinet.
    if (!existing.some((c) => c.active)) {
      await writeActiveCabinet(existing[0].name);
    }
    return;
  }

  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(DATA_PARENT_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const looseNames = new Set(
    entries.filter((e) => !SHARED_TOP_LEVEL.has(e.name)).map((e) => e.name)
  );

  // Target ideally matches the synchronously-resolved DATA_DIR cabinet so loose
  // content lands where the content root already points. But never migrate INTO
  // an existing loose entry: a stale activeCabinet that points at a room/content
  // folder would otherwise bury the whole tree under that one folder. In that
  // case fall back to the default cabinet name.
  let target = getActiveCabinetName() || DEFAULT_CABINET_NAME;
  if (looseNames.has(target)) target = DEFAULT_CABINET_NAME;
  const targetDir = path.join(DATA_PARENT_DIR, target);
  await fs.mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    if (entry.name === target) continue;
    if (SHARED_TOP_LEVEL.has(entry.name)) continue;
    const from = path.join(DATA_PARENT_DIR, entry.name);
    const to = path.join(targetDir, entry.name);
    try {
      await moveMerge(from, to);
    } catch {
      // Best-effort: a permission issue leaves the entry in place rather than
      // aborting the whole migration.
    }
  }

  // Guarantee the cabinet is a valid root cabinet even if nothing was moved.
  await scaffoldCabinet(targetDir, {
    name: target,
    kind: "root",
    skipExisting: true,
  });
  await writeActiveCabinet(target);
}
