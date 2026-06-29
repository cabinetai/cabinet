import path from "path";
import { getManagedDataDir, getManagedDataParentDir, isElectronRuntime, PROJECT_ROOT, isProcessStale } from "@/lib/runtime/runtime-config";
import { normalizeVirtualPath } from "@/lib/virtual-paths";

// Content root: the active cabinet directory (`<dataParent>/<activeCabinet>`).
// All content, cabinets, rooms and per-cabinet agents live under here.
export const DATA_DIR = getManagedDataDir();
// Shared data folder: parent of every cabinet. Holds cross-cabinet state
// (bookmarks.json, .home/, .cabinet-state/, backups) that must not be scoped
// to a single cabinet.
export const DATA_PARENT_DIR = getManagedDataParentDir();
export const CABINET_INTERNAL_DIR = path.join(DATA_PARENT_DIR, ".cabinet-state");
export const ROOT_INSTALL_METADATA_PATH = path.join(PROJECT_ROOT, ".cabinet-install.json");
export const DATA_INSTALL_METADATA_PATH = path.join(CABINET_INTERNAL_DIR, "install.json");
export const PROJECT_RELEASE_MANIFEST_PATH = path.join(PROJECT_ROOT, "cabinet-release.json");
export const UPDATE_STATUS_PATH = path.join(CABINET_INTERNAL_DIR, "update-status.json");
export const FILE_SCHEMA_STATE_PATH = path.join(CABINET_INTERNAL_DIR, "file-schema.json");
export const BACKUP_ROOT = isElectronRuntime()
  ? path.join(path.dirname(DATA_PARENT_DIR), "cabinet-backups")
  : path.resolve(PROJECT_ROOT, "..", ".cabinet-backups", path.basename(PROJECT_ROOT));

export function resolveContentPath(virtualPath: string): string {
  if (isProcessStale()) {
    throw new Error(
      "Cabinet server process is stale (active cabinet changed on disk). Please restart the process to apply the cabinet switch."
    );
  }
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
  return name.endsWith(".md") || name.endsWith(".mdx");
}

const IGNORED_DIRS = new Set(["node_modules", "__pycache__", ".venv", "dist", "build", "out", "coverage"]);

export function isHiddenEntry(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRS.has(name);
}
