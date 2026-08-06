import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { WorkspaceSyncStatus } from "../src/lib/git/git-service";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const tsx = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const runner = path.join(testDir, "support", "workspace-sync-runner.ts");

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runSync(
  workspace: string,
  options: {
    activePath?: string;
    registeredActivePath?: string;
    automatic?: boolean;
    automaticSyncEnabled?: boolean;
  } = {},
): WorkspaceSyncStatus {
  return JSON.parse(
    execFileSync(tsx, [runner], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CABINET_DATA_DIR: workspace,
        CABINET_SYNC_BRANCH: "main",
        ...(options.activePath
          ? { CABINET_TEST_ACTIVE_PATH: options.activePath }
          : {}),
        ...(options.registeredActivePath
          ? {
              CABINET_TEST_REGISTERED_ACTIVE_PATH:
                options.registeredActivePath,
            }
          : {}),
        ...(options.automatic ? { CABINET_TEST_AUTOMATIC: "true" } : {}),
        ...(options.automaticSyncEnabled === false
          ? { CABINET_SYNC_ENABLED: "false" }
          : {}),
      },
    }),
  ) as WorkspaceSyncStatus;
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

  return { seed, workspace };
}

test("workspace sync pushes local commits and pulls remote commits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-basic-"));
  const { seed, workspace } = createRemoteWorkspace(root);

  try {
    fs.writeFileSync(path.join(workspace, "local.md"), "local\n");
    git(workspace, "add", "local.md");
    git(workspace, "commit", "-m", "local");
    const pushed = runSync(workspace);
    assert.equal(pushed.state, "synced");
    assert.equal(pushed.pushed, true);

    git(seed, "pull", "--ff-only");
    fs.writeFileSync(path.join(seed, "remote.md"), "remote\n");
    git(seed, "add", "remote.md");
    git(seed, "commit", "-m", "remote");
    git(seed, "push");

    const pulled = runSync(workspace);
    assert.equal(pulled.state, "synced");
    assert.equal(pulled.pulled, true);
    assert.equal(fs.readFileSync(path.join(workspace, "remote.md"), "utf8"), "remote\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace sync defers incoming changes to the active page", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-active-"));
  const { seed, workspace } = createRemoteWorkspace(root);

  try {
    fs.writeFileSync(path.join(seed, "index.md"), "remote\n");
    git(seed, "commit", "-am", "remote");
    git(seed, "push");

    const status = runSync(workspace, { registeredActivePath: "index" });
    assert.equal(status.state, "needs-attention");
    assert.equal(status.reason, "active-page-changed");
    assert.equal(fs.readFileSync(path.join(workspace, "index.md"), "utf8"), "one\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace sync rebases disjoint local and remote commits", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-rebase-"));
  const { seed, workspace } = createRemoteWorkspace(root);

  try {
    fs.writeFileSync(path.join(workspace, "local.md"), "local\n");
    git(workspace, "add", "local.md");
    git(workspace, "commit", "-m", "local");

    fs.writeFileSync(path.join(seed, "remote.md"), "remote\n");
    git(seed, "add", "remote.md");
    git(seed, "commit", "-m", "remote");
    git(seed, "push");

    const status = runSync(workspace);
    assert.equal(status.state, "synced");
    assert.equal(status.pulled, true);
    assert.equal(status.pushed, true);
    assert.equal(fs.readFileSync(path.join(workspace, "remote.md"), "utf8"), "remote\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workspace sync does not pull over dirty files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-dirty-"));
  const { seed, workspace } = createRemoteWorkspace(root);

  try {
    fs.writeFileSync(path.join(seed, "remote.md"), "remote\n");
    git(seed, "add", "remote.md");
    git(seed, "commit", "-m", "remote");
    git(seed, "push");
    fs.writeFileSync(path.join(workspace, "draft.md"), "draft\n");

    const status = runSync(workspace);
    assert.equal(status.state, "needs-attention");
    assert.equal(status.reason, "local-changes");
    assert.equal(fs.existsSync(path.join(workspace, "remote.md")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("automatic sync can be disabled without disabling explicit sync", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-sync-opt-out-"));
  const { seed, workspace } = createRemoteWorkspace(root);

  try {
    fs.writeFileSync(path.join(workspace, "local.md"), "local\n");
    git(workspace, "add", "local.md");
    git(workspace, "commit", "-m", "local");

    const automatic = runSync(workspace, {
      automatic: true,
      automaticSyncEnabled: false,
    });
    assert.equal(automatic.state, "not-configured");
    assert.equal(automatic.reason, "automatic-sync-disabled");
    assert.equal(git(seed, "rev-list", "--count", "HEAD"), "1");

    const explicit = runSync(workspace, { automaticSyncEnabled: false });
    assert.equal(explicit.state, "synced");
    assert.equal(explicit.pushed, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
