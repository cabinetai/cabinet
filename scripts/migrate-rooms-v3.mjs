#!/usr/bin/env node
/**
 * Rooms v3 migration: turn the root cabinet into a real sibling room and make
 * data/ a neutral "home" container, so rooms are isolated (none parents another).
 *
 * Idempotent: a no-op once data/.home/home.json exists.
 *
 *   data/                          data/
 *   ├── .cabinet (sales-root)  →   ├── .cabinet (kind: home, empty)
 *   ├── .cabinet.db                ├── .home/home.json  (defaultRoom)
 *   ├── .agents/<personas>         ├── .agents/.config  (GLOBAL app config stays)
 *   ├── index.md, songs/, …        ├── <rootSlug>/      ← the old root, now a room
 *   ├── salesons/ (cabinet)        │   ├── .cabinet (kind: room, +room block)
 *   └── …                          │   ├── .cabinet.db, index.md, songs/, .chat, …
 *                                  │   └── .agents/<personas>, .conversations, …
 *                                  ├── salesons/  ← sibling room (unchanged)
 *                                  └── …
 *
 * Run with the dev server + daemon stopped (the SQLite DB must not be open).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.CABINET_DATA_DIR
  ? path.resolve(process.env.CABINET_DATA_DIR)
  : path.join(REPO_ROOT, "data");

// Lucide icon keys + accent colors so migrated rooms get distinct avatars (the
// "one DP" fix). Mirrors ROOM_ICON_KEYS / ROOM_COLORS in src/lib/cabinets.
const ICONS = ["briefcase", "study", "lab", "family", "rocket", "studio", "coffee", "building", "school", "heart"];
const COLORS = [
  "rgb(99, 102, 241)", "rgb(236, 72, 153)", "rgb(34, 197, 94)", "rgb(249, 115, 22)",
  "rgb(14, 165, 233)", "rgb(168, 85, 247)", "rgb(245, 158, 11)", "rgb(20, 184, 166)",
];

const log = (...a) => console.log("[migrate-rooms-v3]", ...a);

function readYaml(file) {
  try {
    return yaml.load(fs.readFileSync(file, "utf-8")) || {};
  } catch {
    return null;
  }
}
function writeYaml(file, obj) {
  fs.writeFileSync(file, yaml.dump(obj, { lineWidth: -1 }), "utf-8");
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}
function slugify(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "home";
}
function isCabinetDir(dir) {
  return fs.existsSync(path.join(dir, ".cabinet"));
}
function move(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
}

function main() {
  const homeMarker = path.join(DATA_DIR, ".home", "home.json");
  if (fs.existsSync(homeMarker)) {
    log("already migrated (data/.home/home.json present) — no-op.");
    return;
  }
  const rootManifestPath = path.join(DATA_DIR, ".cabinet");
  if (!fs.existsSync(rootManifestPath)) {
    log("data/.cabinet not found — nothing to migrate (data/ is not a root cabinet).");
    fs.mkdirSync(path.join(DATA_DIR, ".home"), { recursive: true });
    writeJson(homeMarker, { schemaVersion: 1, kind: "home", defaultRoom: null, lastActiveRoom: null });
    return;
  }

  const rootManifest = readYaml(rootManifestPath) || {};
  const rootName = (typeof rootManifest.name === "string" && rootManifest.name.trim()) || "Home";

  // De-collide the new room slug against existing top-level dirs.
  let rootSlug = slugify(rootName);
  const existing = new Set(fs.readdirSync(DATA_DIR));
  if (existing.has(rootSlug)) {
    let i = 2;
    while (existing.has(`${rootSlug}-${i}`)) i++;
    rootSlug = `${rootSlug}-${i}`;
  }
  const roomDir = path.join(DATA_DIR, rootSlug);
  log(`root cabinet "${rootName}" -> room data/${rootSlug}/`);
  fs.mkdirSync(roomDir, { recursive: true });

  // Things that STAY at the container (never moved into the room).
  const KEEP = new Set([
    ".git", ".global-agents", ".cabinet-state", ".cabinet-meta", ".home",
    ".DS_Store", ".cabinet", ".agents", rootSlug,
  ]);
  // Root-cabinet internals that MOVE wholesale into the room.
  const MOVE_WHOLE = new Set([
    ".chat", "index.md", ".cabinet.db", ".cabinet.db-shm", ".cabinet.db-wal",
  ]);

  for (const name of fs.readdirSync(DATA_DIR)) {
    if (name === rootSlug) continue;
    const src = path.join(DATA_DIR, name);

    if (MOVE_WHOLE.has(name)) {
      if (fs.existsSync(src)) { move(src, path.join(roomDir, name)); log("moved", name); }
      continue;
    }
    if (KEEP.has(name)) continue;

    // Any other top-level entry: an existing cabinet stays put (sibling room);
    // a plain folder/file was the root's content and moves into the room.
    const stat = fs.statSync(src);
    if (stat.isDirectory() && isCabinetDir(src)) {
      log("sibling room kept in place:", name);
      continue;
    }
    move(src, path.join(roomDir, name));
    log("moved content", name);
  }

  // .agents: move personas + agent runtime into the room; KEEP global config
  // (.config + .config.json) at the container so global readers don't break.
  const agentsSrc = path.join(DATA_DIR, ".agents");
  if (fs.existsSync(agentsSrc)) {
    const agentsDst = path.join(roomDir, ".agents");
    fs.mkdirSync(agentsDst, { recursive: true });
    const AGENTS_KEEP = new Set([".config", ".config.json"]);
    for (const name of fs.readdirSync(agentsSrc)) {
      if (AGENTS_KEEP.has(name)) continue;
      move(path.join(agentsSrc, name), path.join(agentsDst, name));
      log("moved agent", name);
    }
  }
  fs.mkdirSync(path.join(roomDir, ".cabinet-state"), { recursive: true });
  fs.mkdirSync(path.join(roomDir, ".jobs"), { recursive: true });

  // Room manifest: copy the root's identity, mark it a room, give it an avatar.
  const roomManifest = {
    ...rootManifest,
    id: `${rootSlug}-room`,
    name: rootName,
    kind: "room",
    entry: "index.md",
    room: {
      ...(rootManifest.room && typeof rootManifest.room === "object" ? rootManifest.room : {}),
      icon: ICONS[0],
      color: COLORS[0],
    },
  };
  writeYaml(path.join(roomDir, ".cabinet"), roomManifest);

  // Backfill distinct avatars on the other existing sibling rooms.
  let idx = 1;
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (name === rootSlug) continue;
    const dir = path.join(DATA_DIR, name);
    if (!fs.statSync(dir).isDirectory() || !isCabinetDir(dir)) continue;
    const m = readYaml(path.join(dir, ".cabinet")) || {};
    const room = m.room && typeof m.room === "object" ? m.room : {};
    if (!room.icon) room.icon = ICONS[idx % ICONS.length];
    if (!room.color) room.color = COLORS[idx % COLORS.length];
    m.room = room;
    if (m.kind === "root") m.kind = "room";
    writeYaml(path.join(dir, ".cabinet"), m);
    log("backfilled avatar for sibling room:", name);
    idx++;
  }

  // data/ becomes a neutral home: a thin, empty kind:home cabinet keeps "." a
  // valid (but content-less) scope so the existing "." defaults don't crash.
  writeYaml(rootManifestPath, {
    schemaVersion: 1,
    id: "home",
    name: "Home",
    kind: "home",
    version: "0.1.0",
    description: "Cabinet home (room container).",
    entry: "index.md",
    room: { icon: "home" },
  });

  fs.mkdirSync(path.join(DATA_DIR, ".home"), { recursive: true });
  writeJson(homeMarker, {
    schemaVersion: 1,
    kind: "home",
    defaultRoom: rootSlug,
    lastActiveRoom: rootSlug,
  });

  log("done. defaultRoom =", rootSlug);
}

main();
