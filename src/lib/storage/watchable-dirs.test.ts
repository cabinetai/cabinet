import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { countWatchableDirs } from "./watchable-dirs";

// Fixtures live outside DATA_DIR: countWatchableDirs takes an explicit root.
let TMP: string;

function mkdirs(root: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    fs.mkdirSync(path.join(root, `d${String(i).padStart(4, "0")}`), { recursive: true });
  }
}

before(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), "watchable-dirs-"));
});

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

test("counts plain nested directories", () => {
  const root = path.join(TMP, "plain");
  fs.mkdirSync(path.join(root, "a", "b"), { recursive: true });
  fs.mkdirSync(path.join(root, "c"), { recursive: true });
  // root + a + a/b + c
  assert.equal(countWatchableDirs(root, 1000), 4);
});

test("skips hidden and ignored directories", () => {
  const root = path.join(TMP, "ignored");
  fs.mkdirSync(path.join(root, ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(path.join(root, "real"), { recursive: true });
  // root + real only
  assert.equal(countWatchableDirs(root, 1000), 2);
});

test("stops counting once the threshold is crossed", () => {
  const root = path.join(TMP, "early-exit");
  fs.mkdirSync(root, { recursive: true });
  mkdirs(root, 50);
  const count = countWatchableDirs(root, 10);
  assert.ok(count > 10, `expected >10, got ${count}`);
  assert.ok(count <= 12, `expected early exit near the threshold, got ${count}`);
});

// The issue-#131 repro: the same tree is refused when passed directly but was
// waved through when reached via a symlink, because Dirent.isDirectory() is
// false for a symlink. The indexer's walkDataDir follows it regardless.
test("counts a large tree reached through a symlink the same as a direct one", () => {
  const bigtree = path.join(TMP, "bigtree");
  fs.mkdirSync(bigtree, { recursive: true });
  mkdirs(bigtree, 40); // bigtree + 40 children = 41

  const workspace = path.join(TMP, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.symlinkSync(bigtree, path.join(workspace, "link"), "dir");

  const direct = countWatchableDirs(bigtree, 1000);
  assert.equal(direct, 41);

  // workspace + everything behind the symlink
  const throughSymlink = countWatchableDirs(workspace, 1000);
  assert.equal(throughSymlink, direct + 1);
});

test("terminates on a symlink cycle without unbounded recursion", () => {
  const root = path.join(TMP, "cycle");
  const inner = path.join(root, "inner");
  fs.mkdirSync(inner, { recursive: true });
  // inner/loop -> root, and a self-referential link too
  fs.symlinkSync(root, path.join(inner, "loop"), "dir");
  fs.symlinkSync(root, path.join(root, "self"), "dir");

  // Each real directory is counted once: root + inner.
  const count = countWatchableDirs(root, 1000);
  assert.equal(count, 2);
});

test("ignores symlinks that do not resolve to a directory", () => {
  const root = path.join(TMP, "file-links");
  fs.mkdirSync(root, { recursive: true });
  const target = path.join(root, "note.md");
  fs.writeFileSync(target, "# note\n");
  fs.symlinkSync(target, path.join(root, "note-link.md"));
  fs.symlinkSync(path.join(root, "missing"), path.join(root, "broken"));

  assert.equal(countWatchableDirs(root, 1000), 1);
});
