import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
let mod: typeof import("./path-utils");

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-path-utils-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  mod = await import("./path-utils");
  // A room with one real subfolder; the stale "/home" subfolder is absent.
  // Cabinet's managed data dir appends the active cabinet name, so the content
  // root (mod.DATA_DIR) is <tempRoot>/Cabinet — build the fixture there so it
  // lines up with where resolveAgentCwd resolves room subfolders.
  await fs.mkdir(path.join(mod.DATA_DIR, "dragonstone", "home", "reports"), { recursive: true });
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("resolveAgentCwd resolves workdir relative to the room, with a stale-workdir fallback", () => {
  const { resolveAgentCwd, DATA_DIR } = mod;
  const room = path.join(DATA_DIR, "dragonstone/home");

  // Root workdir values → the room folder itself.
  assert.equal(resolveAgentCwd("dragonstone/home", "/data"), room);
  assert.equal(resolveAgentCwd("dragonstone/home", "/"), room);
  assert.equal(resolveAgentCwd("dragonstone/home", undefined), room);

  // A real subfolder inside the room → scoped into it.
  assert.equal(resolveAgentCwd("dragonstone/home", "/reports"), path.join(room, "reports"));

  // Stale pre-Rooms workdir (#178): the double-joined dir doesn't exist, so
  // fall back to the room root instead of a missing cwd (the ENOENT bug).
  assert.equal(resolveAgentCwd("dragonstone/home", "/home"), room);

  // No cabinet → DATA_DIR root.
  assert.equal(resolveAgentCwd(undefined, "/data"), DATA_DIR);
});

// #103: a Windows backslash arriving at the storage layer used to crash all
// asset viewers with "Path traversal detected", because `path.resolve` treats
// `\foo` as drive-root-relative on Windows and escapes DATA_DIR. Both entry
// points go through normalizeVirtualPath now — pin that behaviour so any
// regression surfaces as a test failure rather than a 500 in the browser.
test("resolveContentPath normalizes Windows-style backslash inputs (#103)", () => {
  const { resolveContentPath, DATA_DIR } = mod;
  const expected = path.join(DATA_DIR, "Cabinet_AI_Introduction.pptx");

  assert.equal(resolveContentPath("\\Cabinet_AI_Introduction.pptx"), expected);
  assert.equal(resolveContentPath("Cabinet_AI_Introduction.pptx"), expected);
  assert.equal(
    resolveContentPath("\\personal-os_jp\\brain\\dashboard"),
    path.join(DATA_DIR, "personal-os_jp/brain/dashboard")
  );

  // A genuine escape attempt must still throw — normalization is not a bypass.
  assert.throws(() => resolveContentPath("..\\..\\etc\\passwd"), /Path traversal detected/);
});

test("virtualPathFromFs returns forward-slash paths regardless of separator (#103)", () => {
  const { virtualPathFromFs, DATA_DIR } = mod;
  const nested = path.join(DATA_DIR, "personal-os_jp", "brain", "dashboard");
  assert.equal(virtualPathFromFs(nested), "personal-os_jp/brain/dashboard");
  assert.equal(virtualPathFromFs(path.join(DATA_DIR, "Cabinet_AI_Introduction.pptx")), "Cabinet_AI_Introduction.pptx");
  // No leading separator leaks through — the URL layer relies on this.
  assert.equal(virtualPathFromFs(DATA_DIR).startsWith("/"), false);
  assert.equal(virtualPathFromFs(DATA_DIR).startsWith("\\"), false);
});
