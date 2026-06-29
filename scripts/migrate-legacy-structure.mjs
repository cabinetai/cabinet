#!/usr/bin/env node

/**
 * Converts an old data folder to the current "cabinet + Sibling Pattern" layout:
 *
 *   1. CABINET LAYOUT  — loose content sitting directly under data/ is moved into a
 *      single root-cabinet folder (the "cabinet"); only shared cross-cabinet state
 *      (.home, .cabinet-state, bookmarks.json, backups) remains at the parent root.
 *   2. GIT             — the old SHARED data/.git is moved INTO the cabinet so each
 *      cabinet owns its history (data/<Cabinet>/.git). Because both the content and
 *      history move down, `git status`/`log`/`diff` remain fully intact and local.
 *   3. SIBLINGS        — every page folder X/ containing an index.md is collapsed
 *      into a single X.md file in X's parent folder, and the empty folder is removed.
 *      Folders containing other sub-pages/assets are left in place.
 *   4. RELATIVE LINKS  — every `[text](relative/link/to/index.md)` or relative image
 *      is re-resolved and updated to point at the new file locations, ensuring
 *      explicit `.../index.md` links across the cabinet are rewritten.
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import yaml from "js-yaml";

const PROJECT_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const DATA_DIR = process.env.CABINET_DATA_DIR ? path.resolve(process.env.CABINET_DATA_DIR) : path.join(PROJECT_ROOT, "data");

// Script CLI arguments:
//   --dry-run   (perform scans and print planned changes; write nothing)
//   --no-commit (perform moves and link rewrites, but do not create a git commit)
//   --no-backup (consolidate immediately without duplicating the data folder first)
const DRY_RUN = process.argv.includes("--dry-run");
const DO_COMMIT = !process.argv.includes("--no-commit");
const DO_BACKUP = !process.argv.includes("--no-backup");

// Cross-cabinet state that lives beside the cabinets and is never itself a cabinet nor
// moved during migration. Mirrors SHARED_TOP_LEVEL in src/lib/cabinets/cabinets.ts
// (note: .git is intentionally NOT here — it moves into the cabinet per phase 2).
const SHARED_TOP_LEVEL = new Set([
  ".home",
  ".cabinet-state",
  "cabinet-backups",
  "bookmarks.json",
]);

// Folder features that identify a cabinet (manifest file).
const CONTAINER_MARKERS = [".cabinet"];

const DEFAULT_CABINET_NAME = "Cabinet";

function log(...args) {
  console.log("[migrate]", ...args);
}
function act(op, p, extra = "") {
  console.log(`  ${op.padEnd(20)} ${p}`, extra);
}
function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function readDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}
function rename(src, dst) {
  act("rename", path.relative(DATA_DIR, src), `-> ${path.relative(DATA_DIR, dst)}`);
  if (!DRY_RUN) {
    mkdirp(path.dirname(dst));
    fs.renameSync(src, dst);
  }
}
function rmFile(p) {
  act("delete file", path.relative(DATA_DIR, p));
  if (!DRY_RUN) fs.rmSync(p, { force: true });
}
function rmdir(p) {
  act("delete folder", path.relative(DATA_DIR, p));
  if (!DRY_RUN) fs.rmdirSync(p);
}
function mkdirp(p) {
  if (!DRY_RUN) fs.mkdirSync(p, { recursive: true });
}
function writeFile(p, content) {
  if (!DRY_RUN) fs.writeFileSync(p, content, "utf-8");
}
function readYaml(file) {
  try { return yaml.load(fs.readFileSync(file, "utf-8")) || {}; } catch { return null; }
}
function sanitizeCabinetName(raw) {
  return String(raw || "")
    .replace(/[\\/]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
function isContainerDir(dir) {
  return CONTAINER_MARKERS.some((m) => exists(path.join(dir, m)));
}
// Junk-only entries that don't count toward "is this folder empty?".
const JUNK = new Set([".DS_Store", "Thumbs.db"]);

// ── cabinet-relative posix-path helpers ───────────────────────────────────────
// All link math is done on "/"-separated cabinet-relative paths so it is platform
// independent and easy to reason about.
function vrel(cabinetDir, abs) {
  return path.relative(cabinetDir, abs).split(path.sep).join("/");
}
function parentV(vpath) {
  return vpath.includes("/") ? vpath.slice(0, vpath.lastIndexOf("/")) : "";
}
function joinV(dir, rel) {
  return dir ? `${dir}/${rel}` : rel;
}
function normVPath(vpath) {
  const out = [];
  for (const seg of vpath.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}
function relVPath(fromDir, to) {
  const a = fromDir ? fromDir.split("/") : [];
  const b = to ? to.split("/") : [];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => "..");
  const down = b.slice(i);
  const rel = [...up, ...down].join("/");
  return rel || ".";
}

main();

function main() {
  if (!isDir(DATA_DIR)) {
    log(`data dir not found: ${DATA_DIR} — nothing to do.`);
    return;
  }
  log(`data dir: ${DATA_DIR}${DRY_RUN ? "  (DRY RUN — no changes written)" : ""}`);

  if (DO_BACKUP && !DRY_RUN) backup();

  const cabinets = phase1EnsureCabinet();
  for (const cabinetDir of cabinets) {
    phase2GitIntoCabinet(cabinetDir);
    const converted = phase3ConvertPages(cabinetDir);
    rewriteLinks(cabinetDir, converted);
    if (DO_COMMIT) commit(cabinetDir, converted.convertedDirs.size);
  }
  log("done.");
}

// ── backup ─────────────────────────────────────────────────────────────────
function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = `${DATA_DIR}-backup-${stamp}`;
  log(`backing up ${DATA_DIR} -> ${dst}`);
  fs.cpSync(DATA_DIR, dst, { recursive: true });
}

// ── phase 1: ensure a cabinet holds all content ───────────────────────────────
function isCabinetDir(dir) {
  if (!isDir(dir)) return false;
  const m = readYaml(path.join(dir, ".cabinet"));
  return !!m && (m.kind === "root" || m.kind === undefined);
}

function phase1EnsureCabinet() {
  const top = readDir(DATA_DIR);
  const existingCabinets = top
    .filter((n) => !SHARED_TOP_LEVEL.has(n) && isCabinetDir(path.join(DATA_DIR, n)))
    .map((n) => path.join(DATA_DIR, n));

  if (existingCabinets.length > 0) {
    log(`cabinet layout already present: ${existingCabinets.map((d) => path.basename(d)).join(", ")}`);
    return existingCabinets;
  }

  // No cabinet yet: derive a name (root .cabinet name, else home.json, else default).
  const rootManifest = readYaml(path.join(DATA_DIR, ".cabinet"));
  const home = readYaml(path.join(DATA_DIR, ".home", "home.json")) || {};
  let target =
    sanitizeCabinetName(rootManifest?.name) ||
    sanitizeCabinetName(home.activeCabinet || home.activeVault) ||
    DEFAULT_CABINET_NAME;

  const loose = top.filter((n) => !SHARED_TOP_LEVEL.has(n));
  if (loose.includes(target)) target = DEFAULT_CABINET_NAME; // never bury into a loose entry
  const targetDir = path.join(DATA_DIR, target);
  log(`no cabinet found — consolidating loose content into cabinet "${target}"`);
  mkdirp(targetDir);

  for (const name of loose) {
    if (name === target) continue;
    rename(path.join(DATA_DIR, name), path.join(targetDir, name));
  }
  return [targetDir];
}

// ── phase 2: move shared git into the cabinet ──────────────────────────────────
function phase2GitIntoCabinet(cabinetDir) {
  const sharedGit = path.join(DATA_DIR, ".git");
  const cabinetGit = path.join(cabinetDir, ".git");
  if (exists(cabinetGit)) {
    log(`git already per-cabinet: ${path.relative(DATA_DIR, cabinetGit)}`);
    return;
  }
  if (!exists(sharedGit)) {
    log("no shared .git to migrate.");
    return;
  }
  const otherCabinets = readDir(DATA_DIR).filter(
    (n) => !SHARED_TOP_LEVEL.has(n) && isCabinetDir(path.join(DATA_DIR, n))
  );
  if (otherCabinets.length > 1) {
    log("WARNING: shared .git but multiple cabinets — leaving .git at root; resolve manually.");
    return;
  }
  rename(sharedGit, cabinetGit);
}

// ── phase 3: convert legacy index.md pages (bottom-up) ───────────────────────
// Two passes: first move every legacy `X/index.md` up to `<parent>/X.md`
// (deleting emptied folders), recording what moved; then rewrite links so they
// still resolve against the new file locations.
function phase3ConvertPages(cabinetDir) {
  const convertedDirs = new Set(); // cabinet-rel posix dir paths that were collapsed
  const pageOldDir = new Map();    // new md cabinet-rel path -> its ORIGINAL dir vpath
  walkConvert(cabinetDir, cabinetDir, true, convertedDirs, pageOldDir);
  log(`converted ${convertedDirs.size} legacy page folder(s) in ${path.basename(cabinetDir)}`);
  return { convertedDirs, pageOldDir };
}

function walkConvert(dir, cabinetDir, isCabinetRoot, convertedDirs, pageOldDir) {
  // Special containers (nested cabinets, linked repos, apps) own their internal
  // structure — never descend into them nor convert their pages (a linked repo's
  // sub-pages are synced from an external source). The cabinet root is itself a
  // cabinet, so we still descend into it; we just never convert the root itself.
  if (!isCabinetRoot && isContainerDir(dir)) return;

  // Recurse into children first so the deepest pages convert before their parents.
  for (const name of readDir(dir)) {
    if (name.startsWith(".")) continue; // hidden/scaffold dirs are never pages
    const child = path.join(dir, name);
    if (isDir(child)) walkConvert(child, cabinetDir, false, convertedDirs, pageOldDir);
  }

  if (isCabinetRoot) return;            // the cabinet root is the cabinet entry; keep its index.md
  const indexPath = path.join(dir, "index.md");
  if (!exists(indexPath)) return;     // not a legacy page folder

  const base = path.basename(dir);
  const target = path.join(path.dirname(dir), `${base}.md`);
  const dirV = vrel(cabinetDir, dir);
  if (exists(target)) {
    log(`SKIP ${dirV}: sibling ${base}.md already exists`);
    return;
  }

  rename(indexPath, target);
  convertedDirs.add(dirV);
  pageOldDir.set(vrel(cabinetDir, target), dirV);

  // Drop junk, then remove the now-empty folder (sub-pages/assets keep it alive).
  for (const name of readDir(dir)) {
    if (JUNK.has(name)) rmFile(path.join(dir, name));
  }
  if (DRY_RUN || readDir(dir).length === 0) rmdir(dir);
}

function readText(p) {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}

// ── phase 3 link pass: re-resolve relative links to the new layout ───────────
function rewriteLinks(cabinetDir, { convertedDirs, pageOldDir }) {
  if (convertedDirs.size === 0) return;
  let files = 0;
  forEachMd(cabinetDir, (file) => {
    const vp = vrel(cabinetDir, file);
    const newDir = parentV(vp);
    // A converted page's links were authored relative to its ORIGINAL folder.
    const oldDir = pageOldDir.get(vp) ?? newDir;
    const before = readText(file);
    const after = rewriteContentLinks(before, oldDir, newDir, convertedDirs);
    if (after !== before) {
      writeFile(file, after);
      files++;
      act("rewrite links in", vp);
    }
  });
  if (files) log(`rewrote links in ${files} file(s)`);
}

/**
 * Rewrite relative markdown links/images. Each target is resolved to an absolute
 * cabinet-relative path against the file's ORIGINAL directory, remapped through the
 * `X/index.md -> X.md` collapse, then re-expressed relative to the file's NEW
 * directory. Absolute URLs, anchors and root-absolute paths are left alone, and
 * wiki-links (resolved globally by name) are untouched.
 */
function rewriteContentLinks(content, oldDir, newDir, convertedDirs) {
  if (!content) return content;
  return content.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (m, pre, tgt, post) => {
    if (/^\s*<.*>\s*$/.test(tgt)) return m; // angle-bracket form: skip
    const t = tgt.trim();
    if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("#") || t.startsWith("/")) return m;
    const hash = t.search(/[#?]/);
    const linkPart = hash >= 0 ? t.slice(0, hash) : t;
    const suffix = hash >= 0 ? t.slice(hash) : "";
    let abs = normVPath(joinV(oldDir, linkPart));            // where it pointed, originally
    if (abs.endsWith("/index.md")) {
      const d = abs.slice(0, -"/index.md".length);
      if (convertedDirs.has(d)) abs = `${d}.md`;             // parent page collapsed too
    }
    return pre + relVPath(newDir, abs) + suffix + post;
  });
}

function forEachMd(dir, fn) {
  for (const name of readDir(dir)) {
    const full = path.join(dir, name);
    if (isDir(full)) {
      if (name === ".git" || name === "node_modules") continue;
      forEachMd(full, fn);
    } else if (name.endsWith(".md")) {
      fn(full);
    }
  }
}

// ── git commit ───────────────────────────────────────────────────────────────
function commit(cabinetDir, count) {
  if (!exists(path.join(cabinetDir, ".git"))) return;
  if (DRY_RUN) { act("git add -A && git commit (cabinet:", path.basename(cabinetDir) + ")"); return; }
  try {
    execFileSync("git", ["-C", cabinetDir, "add", "-A"], { stdio: "ignore" });
    const status = execFileSync("git", ["-C", cabinetDir, "status", "--porcelain"], { encoding: "utf-8" });
    if (!status.trim()) { log("nothing to commit."); return; }
    execFileSync(
      "git",
      ["-C", cabinetDir, "commit", "-m", `Migrate to cabinet + Sibling Pattern (${count} page folder(s))`],
      { stdio: "ignore" }
    );
    log(`committed migration in ${path.basename(cabinetDir)}`);
  } catch (e) {
    log("WARNING: git commit failed:", e.message);
  }
}
