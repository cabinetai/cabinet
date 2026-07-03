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
  // A room with one real subfolder; the stale "/home" subfolder is absent.
  await fs.mkdir(path.join(tempRoot, "dragonstone", "home", "reports"), { recursive: true });
  mod = await import("./path-utils");
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
