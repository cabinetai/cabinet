import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";
import { ROOT_CABINET_PATH, normalizeCabinetPath } from "@/lib/cabinets/paths";

/**
 * A "room" is a switchable workspace surfaced in the home-button switcher.
 * Rooms are the top-level cabinets: direct children of the data dir that
 * carry a `.cabinet` manifest. The data-dir root is a neutral home
 * container and is deliberately NOT listed as a room. Each room is a
 * regular cabinet that gains identity bits in its `.cabinet` manifest:
 *
 *   room:
 *     icon: briefcase     # key into ROOM_ICONS (src/lib/cabinets/room-icons)
 *     color: "#7c3aed"    # accent CSS color (null → auto from path)
 *     theme: paper        # theme name from src/lib/themes (null → global)
 *
 * The manifest is written lazily the first time a user customizes the room
 * (see `updateRoomMeta`). Manifest writes are atomic (temp + rename) so a
 * save can't half-apply.
 */
export interface RoomMeta {
  /** cabinetPath — the top-level directory name. */
  path: string;
  /** Display name (manifest `name`, or a humanized directory name). */
  name: string;
  /** Lucide icon key, or null when unset (UI falls back to a default). */
  icon: string | null;
  /** Theme name from src/lib/themes, or null to use the global default. */
  theme: string | null;
  /** Accent color (CSS color string), or null to auto-derive from the path. */
  color: string | null;
  /** Carried for client/back-compat. Always false in v3 — no room is "root". */
  isRoot: boolean;
}

function humanize(slug: string): string {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return "Untitled";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function readManifest(dir: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(path.join(dir, CABINET_MANIFEST_FILE), "utf-8");
    const parsed = yaml.load(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Atomic manifest write — render YAML, write to `<file>.tmp`, then rename
 * over the target. Prevents a half-written manifest if the process is
 * killed mid-write (which would otherwise leave the room unparseable).
 */
async function writeManifestAtomic(
  dir: string,
  manifest: Record<string, unknown>
): Promise<void> {
  const target = path.join(dir, CABINET_MANIFEST_FILE);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, yaml.dump(manifest, { lineWidth: -1 }), "utf-8");
  await fs.rename(tmp, target);
}

function roomFromManifest(
  cabinetPath: string,
  dirName: string,
  manifest: Record<string, unknown> | null
): RoomMeta {
  const room =
    manifest && typeof manifest.room === "object" && manifest.room
      ? (manifest.room as Record<string, unknown>)
      : undefined;
  const manifestName =
    manifest && typeof manifest.name === "string" ? manifest.name.trim() : "";
  const name = manifestName || humanize(dirName);
  const icon = room && typeof room.icon === "string" ? room.icon : null;
  const theme = room && typeof room.theme === "string" ? room.theme : null;
  const color = room && typeof room.color === "string" ? room.color : null;
  return { path: cabinetPath, name, icon, theme, color, isRoot: false };
}

/**
 * List the rooms: every top-level directory that is a real cabinet (has a
 * `.cabinet` manifest) and is not the home container itself. The data-dir
 * root is the neutral "home" and is deliberately NOT a room. Plain folders
 * without a `.cabinet` are content (orphans from a broken setup or a partial
 * delete), not rooms.
 */
export async function listRooms(): Promise<RoomMeta[]> {
  let entries: import("fs").Dirent[] = [];
  try {
    entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirNames = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const rooms: RoomMeta[] = [];
  for (const dirName of dirNames) {
    const manifest = await readManifest(path.join(DATA_DIR, dirName));
    if (!manifest) continue; // no manifest → content folder, not a room
    if (manifest.kind === "home") continue; // never list the home container
    rooms.push(roomFromManifest(dirName, dirName, manifest));
  }

  return rooms;
}

export interface HomeConfig {
  defaultRoom: string | null;
  lastActiveRoom: string | null;
}

const HOME_CONFIG_PATH = path.join(DATA_DIR, ".home", "home.json");

/** Read the home container config (`data/.home/home.json`). */
export async function getHomeConfig(): Promise<HomeConfig> {
  try {
    const raw = await fs.readFile(HOME_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      defaultRoom:
        typeof parsed.defaultRoom === "string" ? parsed.defaultRoom : null,
      lastActiveRoom:
        typeof parsed.lastActiveRoom === "string"
          ? parsed.lastActiveRoom
          : null,
    };
  } catch {
    return { defaultRoom: null, lastActiveRoom: null };
  }
}

/**
 * Merge a patch into `data/.home/home.json` atomically. Creates the
 * `.home/` directory if missing and preserves any keys the caller didn't
 * touch (schemaVersion / kind / other future fields).
 */
async function patchHomeConfig(patch: Partial<HomeConfig>): Promise<void> {
  const dir = path.dirname(HOME_CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });
  let current: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(HOME_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") current = parsed;
  } catch {
    // create fresh
  }
  current.schemaVersion = current.schemaVersion ?? 1;
  current.kind = current.kind ?? "home";
  if (patch.defaultRoom !== undefined) {
    if (patch.defaultRoom === null) delete current.defaultRoom;
    else current.defaultRoom = patch.defaultRoom;
  }
  if (patch.lastActiveRoom !== undefined) {
    if (patch.lastActiveRoom === null) delete current.lastActiveRoom;
    else current.lastActiveRoom = patch.lastActiveRoom;
  }
  const tmp = `${HOME_CONFIG_PATH}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(current, null, 2), "utf-8");
  await fs.rename(tmp, HOME_CONFIG_PATH);
}

/**
 * Resolve the room the app should open on launch: the configured defaultRoom
 * if it still exists, else lastActiveRoom if it still exists, else the first
 * room alphabetically, else null (no rooms yet).
 *
 * If `home.json` points at a slug that no longer has a `.cabinet` on disk
 * (the dir was deleted, or its manifest was removed), self-heal the file:
 * clear the dead pointer(s) and persist the resolved alternative. Without
 * this, the app gets stuck "landing" into a room that doesn't exist and
 * back-compat code paths keep dragging the dead slug forward.
 */
export async function resolveDefaultRoom(): Promise<string | null> {
  const [rooms, home] = await Promise.all([listRooms(), getHomeConfig()]);
  if (rooms.length === 0) return null;
  const paths = new Set(rooms.map((r) => r.path));

  const defaultStillExists = home.defaultRoom && paths.has(home.defaultRoom);
  const lastStillExists = home.lastActiveRoom && paths.has(home.lastActiveRoom);

  if (defaultStillExists) return home.defaultRoom!;

  const resolved = lastStillExists ? home.lastActiveRoom! : rooms[0].path;

  // Self-heal: persist the resolved slug so the next read returns it
  // directly and stale fields don't keep papering over reality. Best-effort
  // — never let a healing-write failure poison the resolution itself.
  const patch: Partial<HomeConfig> = {};
  if (home.defaultRoom && !defaultStillExists) patch.defaultRoom = resolved;
  if (home.lastActiveRoom && !lastStillExists) patch.lastActiveRoom = resolved;
  if (Object.keys(patch).length > 0) {
    try {
      await patchHomeConfig(patch);
    } catch {
      // healing is opportunistic
    }
  }

  return resolved;
}

function resolveRoomDir(normalizedPath: string): string {
  if (normalizedPath === ROOT_CABINET_PATH) return DATA_DIR;
  const resolved = path.resolve(DATA_DIR, normalizedPath);
  // Path-traversal guard (CLAUDE.md key rule 4): never escape the data dir.
  if (resolved !== DATA_DIR && !resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error("invalid room path");
  }
  return resolved;
}

/**
 * Update a room's identity (name / icon / color / theme), writing into the
 * cabinet's `.cabinet` manifest. If the directory has no manifest yet, a
 * minimal one is created. `icon`/`theme`/`color` set to null clears that
 * field; leaving a key undefined leaves it unchanged.
 *
 * Only the manifest `name` is updated — never the directory slug. Renaming
 * the slug would invalidate every agent/task/job path keyed off it and
 * break the search index; we keep that as a separate, heavier operation.
 * Manifest writes are atomic.
 */
export async function updateRoomMeta(
  cabinetPath: string,
  patch: {
    name?: string;
    icon?: string | null;
    theme?: string | null;
    color?: string | null;
  }
): Promise<RoomMeta> {
  const normalized =
    normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  if (normalized === ROOT_CABINET_PATH) {
    // The home container is not a room — we don't expose customization for
    // it. Refuse so a stale client can't accidentally rewrite the home
    // manifest into a working cabinet.
    throw new Error("invalid: cannot customize the home container");
  }
  const dir = resolveRoomDir(normalized);

  const manifest = (await readManifest(dir)) ?? {};
  if (manifest.kind === "home") {
    throw new Error("invalid: cannot customize the home container");
  }
  // Backfill the canonical cabinet fields so a promoted folder is a valid cabinet.
  if (typeof manifest.schemaVersion !== "number") manifest.schemaVersion = 1;
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    manifest.name = humanize(path.basename(dir));
  }
  if (typeof manifest.kind !== "string") manifest.kind = "room";
  if (typeof manifest.entry !== "string") manifest.entry = "index.md";

  if (typeof patch.name === "string" && patch.name.trim()) {
    manifest.name = patch.name.trim();
  }

  const room =
    typeof manifest.room === "object" && manifest.room
      ? (manifest.room as Record<string, unknown>)
      : {};
  if (patch.icon !== undefined) {
    if (patch.icon === null) delete room.icon;
    else room.icon = patch.icon;
  }
  if (patch.theme !== undefined) {
    if (patch.theme === null) delete room.theme;
    else room.theme = patch.theme;
  }
  if (patch.color !== undefined) {
    if (patch.color === null) delete room.color;
    else room.color = patch.color;
  }
  manifest.room = room;

  await writeManifestAtomic(dir, manifest);

  return roomFromManifest(normalized, path.basename(dir), manifest);
}

export interface DeleteRoomResult {
  /** Where the room directory was moved (relative to DATA_DIR). */
  trashPath: string;
  /** New defaultRoom after the delete (null if none left). */
  nextDefaultRoom: string | null;
  /** True iff `home.json` was rewritten as a result of the delete. */
  homeConfigUpdated: boolean;
}

/**
 * Soft-delete a room by moving its directory to `data/.trash/<slug>-<ts>/`
 * and repointing `home.json` if the deleted slug was the default or last
 * active. Reversible by hand (move it back into `data/`); a future Trash UI
 * can promote this to a first-class restore.
 *
 * Refuses to delete:
 *   • the home container (`.`),
 *   • a path that isn't a direct child of `DATA_DIR` (traversal guard),
 *   • the home marker (kind:home — defense-in-depth on top of the path check),
 *   • the *only* remaining room (caller should keep at least one).
 */
export async function deleteRoom(cabinetPath: string): Promise<DeleteRoomResult> {
  const normalized =
    normalizeCabinetPath(cabinetPath, true) || ROOT_CABINET_PATH;
  if (normalized === ROOT_CABINET_PATH) {
    throw new Error("invalid: cannot delete the home container");
  }

  const dir = resolveRoomDir(normalized);
  // Must be a *direct* child of DATA_DIR — defense-in-depth on top of
  // `resolveRoomDir`'s traversal guard. Rooms are always top-level.
  if (path.dirname(dir) !== DATA_DIR) {
    throw new Error("invalid: room must be a direct child of the data dir");
  }

  const manifest = await readManifest(dir);
  if (!manifest) {
    throw new Error("invalid: not a room (no .cabinet manifest)");
  }
  if (manifest.kind === "home") {
    throw new Error("invalid: cannot delete the home container");
  }

  // Keep at least one room — UX guard so the user can never delete their way
  // into a roomless state that the landing redirect can't recover from.
  const remaining = (await listRooms()).filter((r) => r.path !== normalized);
  if (remaining.length === 0) {
    throw new Error("invalid: cannot delete the last remaining room");
  }

  const slug = path.basename(dir);
  const trashDir = path.join(DATA_DIR, ".trash");
  await fs.mkdir(trashDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const trashTarget = path.join(trashDir, `${slug}-${stamp}`);
  // De-collide in the (vanishingly unlikely) case of identical stamps.
  let finalTarget = trashTarget;
  let suffix = 1;
  let collision = true;
  while (collision) {
    try {
      await fs.access(finalTarget);
      finalTarget = `${trashTarget}-${suffix++}`;
    } catch {
      collision = false;
    }
  }

  await fs.rename(dir, finalTarget);

  // Repoint home.json if the deleted slug was the default or last-active.
  const home = await getHomeConfig();
  const patch: Partial<HomeConfig> = {};
  const nextDefault = remaining[0].path;
  if (home.defaultRoom === normalized) patch.defaultRoom = nextDefault;
  if (home.lastActiveRoom === normalized) patch.lastActiveRoom = nextDefault;
  const homeConfigUpdated = Object.keys(patch).length > 0;
  if (homeConfigUpdated) {
    await patchHomeConfig(patch);
  }

  return {
    trashPath: path.relative(DATA_DIR, finalTarget),
    nextDefaultRoom: homeConfigUpdated ? nextDefault : home.defaultRoom ?? nextDefault,
    homeConfigUpdated,
  };
}
