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
  readWorkspaceSyncState,
  resolveWorkspaceSync,
} = require("../electron/workspace-sync.cjs");

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function waitFor(check: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("timed out waiting for workspace sync");
}

function createRemoteWorkspace(root: string) {
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const workspace = path.join(root, "workspace");

  git(root, "init", "--bare", remote);
  git(root, "clone", remote, seed);
  git(seed, "config", "user.name", "Test");
  git(seed, "config", "user.email", "test@example.com");
  fs.writeFileSync(path.join(seed, ".cabinet"), "name: Test\n");
  fs.writeFileSync(path.join(seed, "index.md"), "one\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "seed");
  git(seed, "branch", "-M", "main");
  git(seed, "push", "-u", "origin", "main");
  git(root, "clone", "--branch", "main", remote, workspace);
  git(workspace, "config", "user.name", "Test");
  git(workspace, "config", "user.email", "test@example.com");

  return { remote, seed, workspace };
}

test("workspace sync stays unconfigured outside a Cabinet", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-disabled-"));
  try {
    assert.deepEqual(resolveWorkspaceSync(dataDir), {
      enabled: false,
      reason: "not-cabinet",
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("workspace sync persists missing Git as needs attention", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-no-git-"));
  try {
    fs.writeFileSync(path.join(dataDir, ".cabinet"), "name: Test\n");
    const supervisor = createWorkspaceSyncSupervisor({
      dataDir,
      gitResolver: () => null,
    });
    assert.equal(supervisor.start(), false);
    assert.deepEqual(readWorkspaceSyncState(dataDir), {
      state: "needs-attention",
      lastAttemptAt: null,
      lastSuccessAt: null,
      branch: null,
      reason: "git-not-found",
      error:
        "Git was not found. Install GitHub Desktop or Git to enable workspace sync.",
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("built-in workspace sync pushes and pulls without a workspace script", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-enabled-"));
  const { seed, workspace } = createRemoteWorkspace(root);
  const supervisor = createWorkspaceSyncSupervisor({
    dataDir: workspace,
    intervalMs: 60_000,
  });

  try {
    assert.equal(supervisor.start(), true);
    await waitFor(
      () => readWorkspaceSyncState(workspace).state === "synced",
    );

    fs.writeFileSync(path.join(workspace, "local.md"), "local\n");
    git(workspace, "add", "local.md");
    git(workspace, "commit", "-m", "local");
    await supervisor.sync();
    git(seed, "pull", "--ff-only");
    assert.equal(fs.readFileSync(path.join(seed, "local.md"), "utf8"), "local\n");

    fs.writeFileSync(path.join(seed, "remote.md"), "remote\n");
    git(seed, "add", "remote.md");
    git(seed, "commit", "-m", "remote");
    git(seed, "push");
    await supervisor.sync();
    assert.equal(
      fs.readFileSync(path.join(workspace, "remote.md"), "utf8"),
      "remote\n",
    );

    const state = readWorkspaceSyncState(workspace);
    assert.equal(state.state, "synced");
    assert.equal(state.branch, "main");
    assert.equal(state.reason, null);
    assert.ok(state.lastAttemptAt);
    assert.ok(state.lastSuccessAt);
  } finally {
    await supervisor.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
