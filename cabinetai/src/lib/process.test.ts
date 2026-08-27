import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { npmCommand, runNpm, describeSpawnFailure } from "./process.js";

// Regression test for the Windows dependency-install failure.
//
// `npm install` used to be invoked as spawnSync(npmCommand(), ["install"])
// with no shell. On win32 npmCommand() is "npm.cmd", and since the Node
// hardening released for CVE-2024-27980 spawning a .cmd without a shell fails
// with EINVAL — so `npx cabinetai run` could never install the app's
// dependencies on Windows.
//
// `--version` stands in for `install` here: it exercises the same spawn path
// (the part that was broken) in well under a second and writes nothing to
// disk.
//
// Note this test can only *fail* on win32. On macOS and Linux npm was always
// spawned directly and passed both before and after the fix, which is exactly
// the platform split of the bug.

test("runNpm can actually start npm on this platform", () => {
  const result = runNpm(["--version"], { stdio: "pipe" });

  assert.equal(
    result.error,
    undefined,
    `npm could not be spawned: ${describeSpawnFailure(result)}`
  );
  assert.equal(result.status, 0, describeSpawnFailure(result));
  assert.match(result.stdout.toString().trim(), /^\d+\.\d+\.\d+/);
});

test("describeSpawnFailure surfaces the underlying spawn error", () => {
  const result = spawnSync("cabinet-nonexistent-binary-xyz", ["--version"]);

  assert.ok(result.error, "expected the bogus binary to fail to spawn");
  assert.match(describeSpawnFailure(result), /ENOENT/);
});

test("npmCommand targets npm.cmd on win32 only", () => {
  assert.equal(npmCommand(), process.platform === "win32" ? "npm.cmd" : "npm");
});
