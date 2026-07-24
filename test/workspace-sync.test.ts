import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  createWorkspaceSyncSupervisor,
  resolveWorkspaceSync,
} = require("../electron/workspace-sync.cjs");

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function waitFor(check: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("timed out waiting for workspace sync");
}

test("workspace sync stays disabled without the explicit workspace script", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-disabled-"));
  try {
    assert.equal(resolveWorkspaceSync(dataDir), null);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("workspace sync runs immediately and after a Git commit", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-enabled-"));
  const scriptsDir = path.join(dataDir, "scripts");
  const callsPath = path.join(dataDir, "calls.log");
  fs.mkdirSync(scriptsDir);
  fs.writeFileSync(
    path.join(scriptsDir, "cabinet-sync.mjs"),
    `import fs from "node:fs"; fs.appendFileSync(${JSON.stringify(callsPath)}, "sync\\n")\n`,
  );
  git(dataDir, "init", "--initial-branch=main");
  git(dataDir, "config", "user.name", "Test");
  git(dataDir, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(dataDir, "index.md"), "one\n");
  git(dataDir, "add", ".");
  git(dataDir, "commit", "-m", "seed");

  const supervisor = createWorkspaceSyncSupervisor({
    dataDir,
    nodeCommand: process.execPath,
    intervalMs: 60_000,
  });

  try {
    assert.equal(supervisor.start(), true);
    await waitFor(() => fs.existsSync(callsPath));
    fs.writeFileSync(path.join(dataDir, "index.md"), "two\n");
    git(dataDir, "commit", "-am", "change");
    await waitFor(() => fs.readFileSync(callsPath, "utf8").split("sync\n").length >= 3);
  } finally {
    await supervisor.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
