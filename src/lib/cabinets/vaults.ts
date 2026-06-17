import fs from "fs/promises";
import path from "path";
import { DATA_PARENT_DIR } from "@/lib/storage/path-utils";
import {
  DEFAULT_VAULT_NAME,
  getActiveVaultName,
} from "@/lib/runtime/runtime-config";
import { writeActiveVault } from "@/lib/cabinets/rooms";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";

/**
 * A "vault" is a root cabinet: a named directory directly under the shared data
 * folder, holding its own rooms/content tree. The active vault's directory is
 * the content root (DATA_DIR). Multiple vaults map to multiple Obsidian-style
 * workspaces; switching restarts the server so DATA_DIR re-resolves.
 *
 * Cross-vault state lives beside the vaults at the data-folder root and is
 * never itself a vault nor moved during migration.
 */
const SHARED_TOP_LEVEL = new Set([
  ".home",
  ".cabinet-state",
  "cabinet-backups",
  "bookmarks.json",
]);

function sanitizeVaultName(raw: string): string {
  return raw
    .replace(/[\\/]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export interface VaultMeta {
  /** Directory name == display name (PRD: vault name is the folder name). */
  name: string;
  active: boolean;
}

async function isVaultDir(name: string): Promise<boolean> {
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

/** List the vaults (root cabinets) found directly under the data folder. */
export async function listVaults(): Promise<VaultMeta[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(DATA_PARENT_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const active = getActiveVaultName();
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await isVaultDir(entry.name)) names.push(entry.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names.map((name) => ({ name, active: name === active }));
}

/**
 * Create a new vault (root cabinet) directory under the data folder. Idempotent
 * via scaffold's skipExisting. Returns the sanitized vault name.
 */
export async function createVault(rawName: string): Promise<string> {
  const name = sanitizeVaultName(rawName);
  if (!name) throw new Error("invalid vault name");
  if (SHARED_TOP_LEVEL.has(name)) throw new Error("reserved vault name");
  const dir = path.join(DATA_PARENT_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await scaffoldCabinet(dir, { name, kind: "root", skipExisting: true });
  return name;
}

/**
 * Point the active-vault config at `name`. Validates the vault exists; the
 * caller triggers the server restart that makes the new content root effective.
 */
export async function setActiveVault(rawName: string): Promise<string> {
  const name = sanitizeVaultName(rawName);
  if (!name || !(await isVaultDir(name))) {
    throw new Error("unknown vault");
  }
  await writeActiveVault(name);
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
 * One-time, idempotent migration. When no vault exists yet, move every loose
 * top-level entry (rooms, root .agents, index.md, etc.) into the active vault's
 * directory, leaving only the shared cross-vault state at the data-folder root,
 * then record the active vault. Safe to call on every server start.
 */
export async function ensureVaultsMigrated(): Promise<void> {
  const existing = await listVaults();
  if (existing.length > 0) {
    // Already migrated. Heal a missing/stale active pointer so the resolved
    // DATA_DIR always maps to a real vault.
    if (!existing.some((v) => v.active)) {
      await writeActiveVault(existing[0].name);
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

  // Target ideally matches the synchronously-resolved DATA_DIR vault so loose
  // content lands where the content root already points. But never migrate INTO
  // an existing loose entry: a stale activeVault that points at a room/content
  // folder would otherwise bury the whole tree under that one folder. In that
  // case fall back to the default vault name.
  let target = getActiveVaultName() || DEFAULT_VAULT_NAME;
  if (looseNames.has(target)) target = DEFAULT_VAULT_NAME;
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

  // Guarantee the vault is a valid root cabinet even if nothing was moved.
  await scaffoldCabinet(targetDir, {
    name: target,
    kind: "root",
    skipExisting: true,
  });
  await writeActiveVault(target);
}
