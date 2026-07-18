#!/usr/bin/env node
/**
 * Runs the unit suite against an isolated, seeded CABINET_DATA_DIR.
 *
 * Why this exists rather than `tsx --test $(find ...)` directly:
 *
 *   1. Hermeticity. Several tests (cabinet-v2 in particular) resolve DATA_DIR
 *      and read/write cabinets under it. DATA_DIR defaults to whatever the
 *      machine happens to have — so the suite passed locally and failed on a
 *      clean checkout, which is why the CI job carried continue-on-error.
 *   2. Isolation. Because DATA_DIR resolved to the *real* data directory, the
 *      suite wrote its fixtures into the developer's actual Cabinet. Pointing
 *      it at a temp copy of the seed fixture stops that.
 *
 * DATA_DIR is a module-level const, frozen at import time, so the env var has
 * to be set before the test process starts. Hence a launcher script.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seed = path.join(repoRoot, "test/support/fixtures/seed-cabinet");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-unit-"));
fs.cpSync(seed, dataDir, { recursive: true });

const testFiles = [];
for (const root of ["test", "src"]) {
  collect(path.join(repoRoot, root));
}
testFiles.sort();

function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "fixtures") continue;
      collect(full);
    } else if (entry.name.endsWith(".test.ts")) {
      testFiles.push(path.relative(repoRoot, full));
    }
  }
}

const child = spawn("npx", ["tsx", "--test", ...testFiles, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, CABINET_DATA_DIR: dataDir },
});

const cleanup = () => fs.rmSync(dataDir, { recursive: true, force: true });
child.on("exit", (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
