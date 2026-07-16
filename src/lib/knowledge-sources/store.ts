import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { ROOT_CABINET_PATH, normalizeCabinetPath } from "@/lib/cabinets/paths";
import { listRooms } from "@/lib/cabinets/rooms";

/**
 * Per-room knowledge sources (Connect Knowledge / Drive browser).
 *
 * Replaces the global `google_drive_mounts` SQLite table. Each room owns its
 * connected sources in `<room>/.agents/.config/knowledge-sources.json`, so a
 * room's Drive browser shows only what was connected in that room (no global
 * cross-room leak). See docs/CONNECT_KNOWLEDGE_PRD.md §5.
 */

export type KnowledgeProviderId =
  | "local"
  | "google-drive"
  | "icloud"
  | "onedrive"
  | "sharepoint"
  | "dropbox";

export type KnowledgePolicy = "read-only" | "read-write";
export type KnowledgeSurface = "browser" | "inline";

export interface KnowledgeSource {
  id: string;
  provider: KnowledgeProviderId;
  /** Real filesystem path of the connected folder (the provider's local mount). */
  absPath: string;
  /** Display name. */
  name: string;
  policy: KnowledgePolicy;
  /** "browser" → shown in the per-room Drive browser; "inline" → symlinked at treePath. */
  surface: KnowledgeSurface;
  /** For inline sources: where in the room's tree the symlink lives. */
  treePath?: string;
  enabled: boolean;
  addedAt: string;
}

interface SourcesFile {
  version: 1;
  sources: KnowledgeSource[];
}

/** A connected cloud folder in the shape buildGoogleDriveTree() / the guards expect. */
export interface DriveMount {
  id: string;
  abs_path: string;
  folder_name: string;
  provider: KnowledgeProviderId;
}

/** `<room>/.agents/.config/knowledge-sources.json`, traversal-guarded. */
function sourcesFilePath(cabinetPath: string): string {
  const normalized = normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  const rel = normalized === ROOT_CABINET_PATH ? "" : normalized;
  const roomDir = resolveContentPath(rel); // "" → DATA_DIR
  return path.join(roomDir, ".agents", ".config", "knowledge-sources.json");
}

export async function readKnowledgeSources(
  cabinetPath: string,
): Promise<KnowledgeSource[]> {
  try {
    const raw = await fs.readFile(sourcesFilePath(cabinetPath), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SourcesFile>;
    if (!parsed || !Array.isArray(parsed.sources)) return [];
    return parsed.sources.filter(
      (s): s is KnowledgeSource =>
        !!s && typeof s.id === "string" && typeof s.absPath === "string",
    );
  } catch {
    return [];
  }
}

async function writeKnowledgeSources(
  cabinetPath: string,
  sources: KnowledgeSource[],
): Promise<void> {
  const file = sourcesFilePath(cabinetPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload: SourcesFile = { version: 1, sources };
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tmp, file);
  invalidateSourcesCache();
}

export interface AddSourceInput {
  provider: KnowledgeProviderId;
  absPath: string;
  name: string;
  policy?: KnowledgePolicy;
  surface?: KnowledgeSurface;
  treePath?: string;
}

/** Thrown when a source with the same (provider, absPath, surface, treePath) already exists in the room. */
export class DuplicateSourceError extends Error {
  constructor() {
    super("This folder is already connected in this room");
    this.name = "DuplicateSourceError";
  }
}

export async function addKnowledgeSource(
  cabinetPath: string,
  input: AddSourceInput,
): Promise<KnowledgeSource> {
  const sources = await readKnowledgeSources(cabinetPath);
  const surface = input.surface ?? "browser";
  const dup = sources.find(
    (s) =>
      s.provider === input.provider &&
      s.absPath === input.absPath &&
      s.surface === surface &&
      (s.treePath ?? "") === (input.treePath ?? ""),
  );
  if (dup) throw new DuplicateSourceError();

  const source: KnowledgeSource = {
    id: randomUUID(),
    provider: input.provider,
    absPath: input.absPath,
    name: input.name,
    policy: input.policy ?? "read-only",
    surface,
    treePath: input.treePath,
    enabled: true,
    addedAt: new Date().toISOString(),
  };
  sources.push(source);
  await writeKnowledgeSources(cabinetPath, sources);
  return source;
}

export async function removeKnowledgeSource(
  cabinetPath: string,
  id: string,
): Promise<boolean> {
  const sources = await readKnowledgeSources(cabinetPath);
  const next = sources.filter((s) => s.id !== id);
  if (next.length === sources.length) return false;
  await writeKnowledgeSources(cabinetPath, next);
  return true;
}

/** Enabled "browser" sources (any provider) for a room, in buildGoogleDriveTree() shape. */
export async function listDriveMounts(
  cabinetPath: string,
): Promise<DriveMount[]> {
  const sources = await readKnowledgeSources(cabinetPath);
  return sources
    .filter((s) => s.enabled && s.surface === "browser")
    .map((s) => ({
      id: s.id,
      abs_path: s.absPath,
      folder_name: s.name,
      provider: s.provider,
    }));
}

/**
 * Union of enabled google-drive mounts across the home root and every room.
 * Used by the serve/reveal guards when the caller doesn't pass a specific
 * room — the security property ("path is inside a user-connected Drive
 * folder") holds regardless of which room connected it.
 */
export async function listAllDriveMounts(): Promise<DriveMount[]> {
  const rooms = await listRooms();
  const cabinetPaths = [ROOT_CABINET_PATH, ...rooms.map((r) => r.path)];
  const all: DriveMount[] = [];
  const seen = new Set<string>();
  for (const cp of cabinetPaths) {
    for (const m of await listDriveMounts(cp)) {
      if (seen.has(m.abs_path)) continue;
      seen.add(m.abs_path);
      all.push(m);
    }
  }
  return all;
}

/**
 * Resolve the mount set to authorize a serve/reveal request against: the
 * given room's mounts when a cabinet is supplied, else the union across rooms.
 */
export async function resolveAuthorizedMountPaths(
  cabinetPath: string | null,
): Promise<string[]> {
  const mounts =
    cabinetPath != null && cabinetPath.trim() !== ""
      ? await listDriveMounts(cabinetPath)
      : await listAllDriveMounts();
  return mounts.map((m) => m.abs_path);
}

// --- Cross-room source lookups (for the tree-builder + write-guard) ----------
//
// These run on hot paths (the write-guard fires on every page save), so the
// union is cached briefly and invalidated whenever any sources file changes.

type SourceWithCabinet = KnowledgeSource & { cabinet: string };
let _allSourcesCache: { at: number; sources: SourceWithCabinet[] } | null = null;
const SOURCES_CACHE_MS = 3000;

function invalidateSourcesCache(): void {
  _allSourcesCache = null;
}

function normTreePath(p: string): string {
  return p.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

/** Every knowledge source across the home root and all rooms (cached ~3s). */
export async function listAllSources(): Promise<SourceWithCabinet[]> {
  const now = Date.now();
  if (_allSourcesCache && now - _allSourcesCache.at < SOURCES_CACHE_MS) {
    return _allSourcesCache.sources;
  }
  const rooms = await listRooms();
  const cabinetPaths = [ROOT_CABINET_PATH, ...rooms.map((r) => r.path)];
  const all: SourceWithCabinet[] = [];
  for (const cp of cabinetPaths) {
    for (const s of await readKnowledgeSources(cp)) all.push({ ...s, cabinet: cp });
  }
  _allSourcesCache = { at: now, sources: all };
  return all;
}

export interface InlineMark {
  provider: KnowledgeProviderId;
  policy: KnowledgePolicy;
}

/**
 * Map of data-root-relative treePath → {provider, policy} for every INLINE
 * source across rooms. The tree-builder uses this to mark mount nodes (which
 * are data-root-relative too), since it has no per-room context.
 */
export async function getInlineSourceMap(): Promise<Map<string, InlineMark>> {
  const all = await listAllSources();
  const map = new Map<string, InlineMark>();
  for (const s of all) {
    if (s.surface === "inline" && s.treePath) {
      map.set(normTreePath(s.treePath), { provider: s.provider, policy: s.policy });
    }
  }
  return map;
}

/**
 * Remove any inline source whose treePath matches `treePath` (across rooms).
 * Called when a mount symlink is deleted (disconnect), so the registry never
 * drifts from disk. Best-effort — returns the count removed.
 */
export async function removeInlineSourceByTreePath(
  treePath: string,
): Promise<number> {
  const norm = normTreePath(treePath);
  let removed = 0;
  for (const s of await listAllSources()) {
    if (s.surface === "inline" && s.treePath && normTreePath(s.treePath) === norm) {
      if (await removeKnowledgeSource(s.cabinet, s.id)) removed++;
    }
  }
  return removed;
}

/** Thrown when a write targets a path under a read-only inline mount. */
export class ReadOnlySourceError extends Error {
  constructor(name: string) {
    super(`"${name}" is connected read-only, so editing is disabled here.`);
    this.name = "ReadOnlySourceError";
  }
}

/**
 * Guard for file-mutation routes. Throws ReadOnlySourceError if virtualPath
 * sits STRICTLY UNDER a read-only inline mount (so the mount node itself can
 * still be disconnected, but its Drive contents can't be edited/deleted/moved
 * through the normal file API). docs/CONNECT_KNOWLEDGE_PRD.md §6.1.
 */
export async function assertWritablePath(virtualPath: string): Promise<void> {
  const norm = normTreePath(virtualPath);
  if (!norm) return;
  for (const s of await listAllSources()) {
    if (s.surface !== "inline" || s.policy !== "read-only" || !s.treePath) continue;
    const tp = normTreePath(s.treePath);
    if (tp && norm.startsWith(tp + "/")) throw new ReadOnlySourceError(s.name);
  }
}
