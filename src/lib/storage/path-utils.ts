import fs from "fs";
import path from "path";
import { getManagedDataDir, isElectronRuntime, PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { normalizeVirtualPath } from "@/lib/virtual-paths";

export const DATA_DIR = getManagedDataDir();
export const CABINET_INTERNAL_DIR = path.join(DATA_DIR, ".cabinet-state");
export const ROOT_INSTALL_METADATA_PATH = path.join(PROJECT_ROOT, ".cabinet-install.json");
export const DATA_INSTALL_METADATA_PATH = path.join(CABINET_INTERNAL_DIR, "install.json");
export const PROJECT_RELEASE_MANIFEST_PATH = path.join(PROJECT_ROOT, "cabinet-release.json");
export const UPDATE_STATUS_PATH = path.join(CABINET_INTERNAL_DIR, "update-status.json");
export const FILE_SCHEMA_STATE_PATH = path.join(CABINET_INTERNAL_DIR, "file-schema.json");
export const BACKUP_ROOT = isElectronRuntime()
  ? path.join(path.dirname(DATA_DIR), "cabinet-backups")
  : path.resolve(PROJECT_ROOT, "..", ".cabinet-backups", path.basename(PROJECT_ROOT));

/**
 * Single source of truth for an agent's spawn cwd (#178). `workdir` is a
 * persona/job value: "/data" or "/" (the room root), or "/subfolder" (a folder
 * inside the room). It is ALWAYS resolved relative to the room (cabinetPath),
 * never relative to DATA_DIR — six hand-rolled copies of this disagreed (some
 * over-joined cabinetPath+workdir, some dropped cabinetPath), so scheduled runs
 * failed for pre-Rooms migrated agents while manual Retry worked.
 */
export function resolveAgentCwd(cabinetPath?: string, workdir?: string): string {
  const baseCwd = cabinetPath ? path.join(DATA_DIR, cabinetPath) : DATA_DIR;
  const sub = (workdir ?? "").replace(/^\/+/, "");
  if (!sub || sub === "data") return baseCwd;
  const scoped = path.join(baseCwd, sub);
  // ponytail: a stale pre-Rooms workdir (cabinetPath already ends in the
  // subfolder) makes `scoped` a doubled, non-existent path — spawning there
  // yields ENOENT that gets mislabeled cli_not_found. Fall back to the room
  // root rather than into a missing cwd; the migration backfills the data so
  // this rarely fires. Upgrade path if workdirs ever legitimately point at a
  // not-yet-created folder: mkdir it here instead of falling back.
  return fs.existsSync(scoped) ? scoped : baseCwd;
}

export function resolveContentPath(virtualPath: string): string {
  const dataDir = path.resolve(DATA_DIR);
  const resolved = path.resolve(dataDir, normalizeVirtualPath(virtualPath));
  const relative = path.relative(dataDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export function virtualPathFromFs(fsPath: string): string {
  return normalizeVirtualPath(path.relative(DATA_DIR, fsPath));
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md");
}

const IGNORED_DIRS = new Set(["node_modules", "__pycache__", ".venv", "dist", "build", "out", "coverage"]);

export function isHiddenEntry(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name);
}
