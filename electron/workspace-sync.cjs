/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STATE_DIRECTORY = ".cabinet-state";
const STATE_FILENAME = "workspace-sync.json";

function statePath(dataDir) {
  return path.join(dataDir, STATE_DIRECTORY, STATE_FILENAME);
}

function readWorkspaceSyncState(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(dataDir), "utf8"));
  } catch {
    return {
      state: "not-configured",
      lastAttemptAt: null,
      lastSuccessAt: null,
      branch: null,
      reason: null,
      error: null,
    };
  }
}

function writeWorkspaceSyncState(dataDir, patch) {
  const directory = path.join(dataDir, STATE_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const next = {
    ...readWorkspaceSyncState(dataDir),
    ...patch,
  };
  const target = statePath(dataDir);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, target);
  return next;
}

function minimalGitEnvironment(env = process.env) {
  const allowed = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SSH_AUTH_SOCK",
    "GIT_SSH_COMMAND",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "DISPLAY",
    "SystemRoot",
    "WINDIR",
    "LOCALAPPDATA",
    "APPDATA",
    "TMP",
    "TEMP",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => typeof env[key] === "string" && env[key] !== "")
      .map((key) => [key, env[key]]),
  );
}

function githubDesktopGitCandidates(env = process.env) {
  if (process.platform === "darwin") {
    return [
      "/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git",
      path.join(
        os.homedir(),
        "Applications",
        "GitHub Desktop.app",
        "Contents",
        "Resources",
        "app",
        "git",
        "bin",
        "git",
      ),
    ];
  }

  if (process.platform === "win32" && env.LOCALAPPDATA) {
    const root = path.join(env.LOCALAPPDATA, "GitHubDesktop");
    try {
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("app-"))
        .sort((left, right) => right.name.localeCompare(left.name, undefined, {
          numeric: true,
        }))
        .map((entry) =>
          path.join(
            root,
            entry.name,
            "resources",
            "app",
            "git",
            "cmd",
            "git.exe",
          ),
        );
    } catch {
      return [];
    }
  }

  return [];
}

function resolveGitCommand(env = process.env) {
  const candidates = [
    env.CABINET_GIT_PATH,
    ...githubDesktopGitCandidates(env),
    "git",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], {
        env: minimalGitEnvironment(env),
        stdio: "ignore",
      });
      return candidate;
    } catch {
      // Try the next supported Git location.
    }
  }
  return null;
}

function gitSync(gitCommand, dataDir, env, ...args) {
  return execFileSync(gitCommand, ["-C", dataDir, ...args], {
    encoding: "utf8",
    env: minimalGitEnvironment(env),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveWorkspaceSync(
  dataDir,
  env = process.env,
  gitResolver = resolveGitCommand,
) {
  if (!fs.existsSync(path.join(dataDir, ".cabinet"))) {
    return {
      enabled: false,
      reason: "not-cabinet",
    };
  }

  const gitCommand = gitResolver(env);
  if (!gitCommand) {
    return {
      enabled: false,
      reason: "git-not-found",
    };
  }

  try {
    const gitDir = gitSync(
      gitCommand,
      dataDir,
      env,
      "rev-parse",
      "--absolute-git-dir",
    );
    const branch =
      env.CABINET_SYNC_BRANCH ||
      gitSync(gitCommand, dataDir, env, "branch", "--show-current") ||
      "main";
    return {
      enabled: true,
      branch,
      gitCommand,
      gitDir,
      headRef: path.join(gitDir, "refs", "heads", ...branch.split("/")),
      remote: env.CABINET_SYNC_REMOTE || "origin",
    };
  } catch {
    return {
      enabled: false,
      reason: "not-git-repository",
    };
  }
}

function ensureLocalStateIsIgnored(gitDir) {
  const excludePath = path.join(gitDir, "info", "exclude");
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, "utf8")
    : "";
  if (
    existing
      .split(/\r?\n/)
      .some((line) => line.trim() === `${STATE_DIRECTORY}/`)
  ) {
    return;
  }
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(
    excludePath,
    `${separator}${STATE_DIRECTORY}/\n`,
    "utf8",
  );
}

function processExists(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cabinetRunning(dataDir) {
  const runtimePath = path.join(dataDir, STATE_DIRECTORY, "runtime-ports.json");
  try {
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    return [runtime?.app?.pid, runtime?.daemon?.pid].some(processExists);
  } catch {
    return false;
  }
}

function activePage(dataDir) {
  const homePath = path.join(dataDir, ".home", "home.json");
  try {
    return JSON.parse(fs.readFileSync(homePath, "utf8")).lastActivePath || null;
  } catch {
    return null;
  }
}

function touchesActivePage(dataDir, changedPaths) {
  if (!cabinetRunning(dataDir)) return false;
  const active = activePage(dataDir);
  if (!active) return true;
  const candidates = new Set([active, `${active}.md`, `${active}/index.md`]);
  return changedPaths.some((changedPath) => candidates.has(changedPath));
}

function createWorkspaceSyncSupervisor({
  dataDir,
  env = process.env,
  gitResolver = resolveGitCommand,
  intervalMs = Number(process.env.CABINET_SYNC_INTERVAL_MS || 30_000),
}) {
  let activeChild = null;
  let activeSync = null;
  let configuration = null;
  let started = false;
  let timer = null;

  function git(...args) {
    return new Promise((resolve, reject) => {
      const child = execFile(
        configuration.gitCommand,
        ["-C", dataDir, ...args],
        {
          encoding: "utf8",
          env: minimalGitEnvironment(env),
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout) => {
          if (activeChild === child) activeChild = null;
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout.trim());
        },
      );
      activeChild = child;
    });
  }

  async function changedFiles(from, to) {
    const output = await git("diff", "--name-only", `${from}..${to}`);
    return output ? [...new Set(output.split("\n"))].sort() : [];
  }

  function setState(state, patch = {}) {
    return writeWorkspaceSyncState(dataDir, {
      state,
      branch: configuration?.branch ?? patch.branch ?? null,
      ...patch,
    });
  }

  async function runSync() {
    const attemptedAt = new Date().toISOString();
    setState("syncing", {
      lastAttemptAt: attemptedAt,
      reason: null,
      error: null,
    });

    const remoteRef = `${configuration.remote}/${configuration.branch}`;
    await git("config", "--local", "pull.rebase", "false");
    await git("config", "--local", "pull.ff", "only");
    await git("remote", "get-url", configuration.remote);

    try {
      await git(
        "fetch",
        "--quiet",
        "--prune",
        configuration.remote,
        configuration.branch,
      );
    } catch (error) {
      setState("offline", {
        reason: "fetch-failed",
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const [ahead, behind] = (
      await git(
        "rev-list",
        "--left-right",
        "--count",
        `HEAD...${remoteRef}`,
      )
    )
      .split(/\s+/)
      .map(Number);

    if (ahead === 0 && behind === 0) {
      setState("synced", {
        lastSuccessAt: new Date().toISOString(),
        reason: null,
        error: null,
      });
      return;
    }

    if (behind === 0) {
      try {
        await git(
          "push",
          "--quiet",
          configuration.remote,
          `HEAD:${configuration.branch}`,
        );
        setState("synced", {
          lastSuccessAt: new Date().toISOString(),
          reason: null,
          error: null,
        });
      } catch (error) {
        setState("needs-attention", {
          reason: "push-rejected",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const base = await git("merge-base", "HEAD", remoteRef);
    const remoteFiles = await changedFiles(base, remoteRef);
    const dirty = await git(
      "status",
      "--porcelain",
      "--untracked-files=normal",
    );
    if (dirty) {
      setState("needs-attention", {
        reason: "local-changes",
        error: "Incoming changes are waiting while local files are being saved.",
      });
      return;
    }

    if (touchesActivePage(dataDir, remoteFiles)) {
      setState("needs-attention", {
        reason: "active-page-changed",
        error: "Incoming changes touch the currently open page.",
      });
      return;
    }

    if (ahead === 0) {
      try {
        await git("merge", "--ff-only", "--quiet", remoteRef);
        setState("synced", {
          lastSuccessAt: new Date().toISOString(),
          reason: null,
          error: null,
        });
      } catch (error) {
        setState("needs-attention", {
          reason: "fast-forward-failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const localFiles = await changedFiles(base, "HEAD");
    const remoteSet = new Set(remoteFiles);
    const overlap = localFiles.filter((file) => remoteSet.has(file));
    if (overlap.length > 0) {
      setState("needs-attention", {
        reason: "overlapping-changes",
        error: `Both collaborators changed: ${overlap.join(", ")}`,
      });
      return;
    }

    try {
      await git("rebase", remoteRef);
    } catch {
      await git("rebase", "--abort").catch(() => {});
      setState("needs-attention", {
        reason: "rebase-aborted",
        error: "Automatic rebase was aborted safely.",
      });
      return;
    }

    try {
      await git(
        "push",
        "--quiet",
        configuration.remote,
        `HEAD:${configuration.branch}`,
      );
      setState("synced", {
        lastSuccessAt: new Date().toISOString(),
        reason: null,
        error: null,
      });
    } catch (error) {
      setState("needs-attention", {
        reason: "push-race",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function sync() {
    if (!started) return Promise.resolve();
    if (activeSync) return activeSync;

    activeSync = runSync()
      .catch((error) => {
        setState("needs-attention", {
          reason: "sync-failed",
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        activeSync = null;
        if (!started) configuration = null;
      });
    return activeSync;
  }

  function start() {
    if (started) return true;
    configuration = resolveWorkspaceSync(dataDir, env, gitResolver);
    if (!configuration.enabled) {
      const needsGit = configuration.reason === "git-not-found";
      writeWorkspaceSyncState(dataDir, {
        state: needsGit ? "needs-attention" : "not-configured",
        lastAttemptAt: null,
        lastSuccessAt: null,
        branch: null,
        reason: configuration.reason,
        error: needsGit
          ? "Git was not found. Install GitHub Desktop or Git to enable workspace sync."
          : null,
      });
      configuration = null;
      return false;
    }

    ensureLocalStateIsIgnored(configuration.gitDir);
    started = true;
    void sync();
    timer = setInterval(() => void sync(), intervalMs);
    fs.watchFile(
      configuration.headRef,
      { interval: 500 },
      (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs) void sync();
      },
    );
    console.log(
      `workspace-sync: supervising ${dataDir} on ${configuration.branch}`,
    );
    return true;
  }

  async function stop({ waitMs = 5_000 } = {}) {
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (configuration) fs.unwatchFile(configuration.headRef);

    if (activeSync) {
      await Promise.race([
        activeSync,
        new Promise((resolve) => setTimeout(resolve, waitMs)),
      ]);
    }

    if (activeChild) {
      setState("needs-attention", {
        reason: "shutdown-timeout",
        error: "Cabinet closed before workspace sync finished.",
      });
    }
    if (!activeSync) configuration = null;
  }

  return { start, stop, sync };
}

module.exports = {
  createWorkspaceSyncSupervisor,
  readWorkspaceSyncState,
  resolveGitCommand,
  resolveWorkspaceSync,
  writeWorkspaceSyncState,
};
