/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function git(dataDir, ...args) {
  return execFileSync("git", ["-C", dataDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveWorkspaceSync(dataDir, env = process.env) {
  const scriptPath = path.join(dataDir, "scripts", "cabinet-sync.mjs");
  if (!fs.existsSync(scriptPath)) return null;

  try {
    const gitDir = git(dataDir, "rev-parse", "--absolute-git-dir");
    const branch = env.CABINET_SYNC_BRANCH || git(dataDir, "branch", "--show-current") || "main";
    return {
      branch,
      headRef: path.join(gitDir, "refs", "heads", ...branch.split("/")),
      scriptPath,
    };
  } catch (error) {
    console.warn("workspace-sync: data directory is not a usable Git repository", error);
    return null;
  }
}

function createWorkspaceSyncSupervisor({
  dataDir,
  nodeCommand,
  nodeEnv = {},
  intervalMs = Number(process.env.CABINET_SYNC_INTERVAL_MS || 30_000),
}) {
  let activeSync = null;
  let configuration = null;
  let started = false;
  let timer = null;

  function sync() {
    if (!started) return Promise.resolve();
    if (activeSync) return activeSync;

    activeSync = new Promise((resolve) => {
      const child = spawn(nodeCommand, [configuration.scriptPath, "once"], {
        cwd: dataDir,
        env: {
          ...process.env,
          ...nodeEnv,
          CABINET_SYNC_REPO_ROOT: dataDir,
          CABINET_SYNC_BRANCH: configuration.branch,
          CABINET_SYNC_ASSUME_RUNNING: "1",
        },
        stdio: "inherit",
      });

      child.once("error", (error) => {
        console.warn(`workspace-sync: ${error.message}; will retry`);
        resolve();
      });
      child.once("exit", (code) => {
        if (code && code !== 0) {
          console.warn(`workspace-sync: exited with code ${code}; will retry`);
        }
        resolve();
      });
    }).finally(() => {
      activeSync = null;
    });

    return activeSync;
  }

  function start() {
    if (started) return true;
    configuration = resolveWorkspaceSync(dataDir);
    if (!configuration) return false;

    started = true;
    void sync();
    timer = setInterval(() => void sync(), intervalMs);
    fs.watchFile(configuration.headRef, { interval: 500 }, (current, previous) => {
      if (current.mtimeMs !== previous.mtimeMs) void sync();
    });
    console.log(`workspace-sync: supervising ${dataDir} on ${configuration.branch}`);
    return true;
  }

  function stop() {
    if (!started) return activeSync || Promise.resolve();
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (configuration) fs.unwatchFile(configuration.headRef);
    configuration = null;
    return activeSync || Promise.resolve();
  }

  return { start, stop, sync };
}

module.exports = {
  createWorkspaceSyncSupervisor,
  resolveWorkspaceSync,
};
