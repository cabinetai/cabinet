import simpleGit, { SimpleGit } from "simple-git";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { fileExists } from "@/lib/storage/fs-operations";
import { normalizeVirtualPath } from "@/lib/virtual-paths";
import path from "path";

let git: SimpleGit | null = null;

function createGit(): SimpleGit {
  const binary = process.env.CABINET_GIT_PATH?.trim();
  if (!binary) return simpleGit(DATA_DIR);
  return simpleGit({
    baseDir: DATA_DIR,
    binary,
    unsafe: { allowUnsafeCustomBinary: true },
  });
}

async function getGit(): Promise<SimpleGit | null> {
  if (git) return git;

  const gitDir = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".git");
  if (await fileExists(gitDir)) {
    git = createGit();
    return git;
  }

  // Initialize git in data dir if not exists
  try {
    git = createGit();
    await git.init();
    await git.addConfig("user.email", "kb@cabinet.dev");
    await git.addConfig("user.name", "Cabinet");
    // Repo provenance marker (PRD §4.4) + scale guards (§4.8).
    await git.addConfig("cabinet.managed", "true");
    await git.addConfig("core.untrackedCache", "true");
    return git;
  } catch {
    return null;
  }
}

/**
 * Attributed, path-scoped auto-commit (LOGGING_AND_FILE_HISTORY_PRD §4.2).
 * Delegates to the history engine: journals the event per room, stages ONLY
 * the affected paths (never `git add .` — that used to sweep agent edits
 * into mislabeled user commits), and authors the commit as the local user
 * profile. Same signature as the legacy version so call sites are untouched.
 */
export function autoCommit(pagePath: string, action: "Update" | "Add" | "Delete") {
  void import("@/lib/history/engine")
    .then(({ recordMutation }) =>
      recordMutation({
        op: action === "Add" ? "create" : action === "Delete" ? "delete" : "write",
        virtualPath: pagePath,
        message: `${action} ${pagePath || "index"}`,
      })
    )
    .catch((error) => {
      console.error("Auto-commit failed:", error);
    });
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
  /** Distinguishes person vs agent commits (agent@cabinet.local). */
  authorEmail?: string;
  /** Parsed from the Cabinet-Agent trailer: `<cabinetPath>#<slug>`. */
  agent?: { cabinetPath: string; slug: string } | null;
  /** Parsed from the Cabinet-Run trailer: the conversation id. */
  runId?: string | null;
}

/** Parse the PRD §4.2 trailers out of a commit body. */
function parseHistoryTrailers(body: string | undefined): {
  agent: { cabinetPath: string; slug: string } | null;
  runId: string | null;
} {
  if (!body) return { agent: null, runId: null };
  let agent: { cabinetPath: string; slug: string } | null = null;
  let runId: string | null = null;
  for (const line of body.split("\n")) {
    const agentMatch = /^Cabinet-Agent:\s*(.+)#([^#\s]+)\s*$/.exec(line);
    if (agentMatch) agent = { cabinetPath: agentMatch[1], slug: agentMatch[2] };
    const runMatch = /^Cabinet-Run:\s*(\S+)\s*$/.exec(line);
    if (runMatch) runId = runMatch[1];
  }
  return { agent, runId };
}

export async function getPageHistory(virtualPath: string): Promise<GitLogEntry[]> {
  const g = await getGit();
  if (!g) return [];

  try {
    // Try both directory and file paths
    const candidates = [
      path.join(virtualPath, "index.md"),
      `${virtualPath}.md`,
      virtualPath,
    ];

    for (const candidate of candidates) {
      try {
        const log = await g.log({ file: candidate, maxCount: 50 });
        if (log.all.length > 0) {
          return log.all.map((entry) => {
            const { agent, runId } = parseHistoryTrailers(entry.body);
            return {
              hash: entry.hash,
              date: entry.date,
              // strip trailers from the visible message
              message: entry.message,
              author: entry.author_name,
              authorEmail: entry.author_email,
              agent,
              runId,
            };
          });
        }
      } catch {
        continue;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export async function getDiff(hash: string): Promise<string> {
  const g = await getGit();
  if (!g) return "";

  try {
    return await g.diff([`${hash}~1`, hash]);
  } catch {
    try {
      // First commit case
      return await g.diff([hash]);
    } catch {
      return "";
    }
  }
}

export async function manualCommit(message: string): Promise<boolean> {
  const g = await getGit();
  if (!g) return false;

  try {
    await g.add(".");
    const status = await g.status();
    if (
      status.staged.length === 0 &&
      status.modified.length === 0 &&
      status.not_added.length === 0
    ) {
      return false;
    }
    await g.commit(message);
    return true;
  } catch {
    return false;
  }
}

export async function restoreFileFromCommit(
  hash: string,
  filePath: string
): Promise<boolean> {
  const g = await getGit();
  if (!g) return false;

  try {
    // Restore file to state at the given commit
    await g.checkout([hash, "--", filePath]);
    // Commit the restoration
    await g.add(filePath);
    await g.commit(`Restore ${filePath} to version ${hash.slice(0, 8)}`);
    return true;
  } catch (error) {
    console.error("Restore failed:", error);
    return false;
  }
}

/** Explicit pull used by the existing manual Git workflow. */
export async function gitPull(): Promise<{ pulled: boolean; summary: string }> {
  const g = await getGit();
  if (!g) return { pulled: false, summary: "Git not available" };

  try {
    const remotes = await g.getRemotes(true);
    if (remotes.length === 0) {
      return { pulled: false, summary: "No remote configured" };
    }

    const result = await g.pull();
    const changed = (result.files?.length || 0) > 0;
    const summary = changed
      ? `Pulled ${result.files.length} file(s) updated`
      : "Already up to date";
    return { pulled: changed, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pull failed";
    console.error("Git pull failed:", message);
    return { pulled: false, summary: message };
  }
}

export interface UncommittedFile {
  path: string;
  /** "M" modified, "?" untracked, "A" added, "D" deleted, "R" renamed. */
  status: "M" | "?" | "A" | "D" | "R";
}

const MAX_UNCOMMITTED_LIST = 50;

// Audit #058: Cabinet's own runtime state writes shouldn't count as
// user-visible "uncommitted" changes — they confused users into thinking
// they had pending edits when only the daemon had touched a runtime file.
// Anything matching one of these prefixes (relative to repo root) is hidden
// from the user-visible count. The list mirrors what `.gitignore` should
// already exclude; this is defense-in-depth in case a project's gitignore
// drifts.
const INTERNAL_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.cabinet-state(\/|$)/,
  /(^|\/)\.cabinet\/runtime-ports\.json$/,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.cabinet-cache(\/|$)/,
];

function isInternalPath(p: string): boolean {
  return INTERNAL_PATH_PATTERNS.some((re) => re.test(p));
}

// PRD §4.8: the status-bar poll is the one full-status consumer. If a scan
// blows the time budget the cabinet is flagged `large` (once per process)
// so we can see how often real installs hit the degradation ladder.
let largeTierReported = false;
const STATUS_BUDGET_MS = 2000;

export async function getStatus(): Promise<{ uncommitted: number; files: UncommittedFile[]; truncated: boolean; isGit: boolean; large?: boolean }> {
  const g = await getGit();
  if (!g) return { uncommitted: 0, files: [], truncated: false, isGit: false };

  try {
    const startedAt = Date.now();
    const status = await g.status();
    const elapsed = Date.now() - startedAt;
    if (elapsed > STATUS_BUDGET_MS && !largeTierReported) {
      largeTierReported = true;
      console.warn(`[history] git status took ${elapsed}ms — large-repo tier`);
      void import("@/lib/telemetry")
        .then(({ emit }) => emit("history.tier", { tier: "large" }))
        .catch(() => {});
    }
    // Audit #015: include the file list so the status bar can show it on
    // hover/click, not just a bare count. Capped at 50 entries to keep
    // payloads small; UI surfaces a "+N more" hint when truncated.
    const allFiles: UncommittedFile[] = [
      ...status.modified.map((path): UncommittedFile => ({ path, status: "M" })),
      ...status.not_added.map((path): UncommittedFile => ({ path, status: "?" })),
      ...status.created.map((path): UncommittedFile => ({ path, status: "A" })),
      ...status.deleted.map((path): UncommittedFile => ({ path, status: "D" })),
      ...status.renamed.map((entry): UncommittedFile => ({
        path: typeof entry === "string" ? entry : entry.to || entry.from,
        status: "R",
      })),
    ];
    // Audit #058: drop Cabinet-internal writes from the user-facing count.
    const files = allFiles.filter((f) => !isInternalPath(f.path));
    return {
      uncommitted: files.length,
      files: files.slice(0, MAX_UNCOMMITTED_LIST),
      truncated: files.length > MAX_UNCOMMITTED_LIST,
      isGit: true,
      large: largeTierReported || undefined,
    };
  } catch {
    return { uncommitted: 0, files: [], truncated: false, isGit: false };
  }
}

export type WorkspaceSyncState =
  | "synced"
  | "syncing"
  | "offline"
  | "needs-attention"
  | "not-configured";

export interface WorkspaceSyncStatus {
  state: WorkspaceSyncState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  branch: string | null;
  reason: string | null;
  error: string | null;
  pulled: boolean;
  pushed: boolean;
}

export interface WorkspaceSyncOptions {
  /** Virtual path currently open in the editor. Incoming changes defer safely. */
  activePath?: string | null;
  /** Automatic runs respect CABINET_SYNC_ENABLED; explicit runs remain available. */
  automatic?: boolean;
}

const INITIAL_SYNC_STATUS: WorkspaceSyncStatus = {
  state: "not-configured",
  lastAttemptAt: null,
  lastSuccessAt: null,
  branch: null,
  reason: null,
  error: null,
  pulled: false,
  pushed: false,
};

let workspaceSyncStatus = INITIAL_SYNC_STATUS;
let activeWorkspaceSync: Promise<WorkspaceSyncStatus> | null = null;
const protectedActivePaths = new Set<string>();
const registeredActivePaths = new Map<string, string>();

function automaticWorkspaceSyncEnabled(): boolean {
  return process.env.CABINET_SYNC_ENABLED?.trim().toLowerCase() !== "false";
}

function setWorkspaceSyncStatus(
  state: WorkspaceSyncState,
  patch: Partial<WorkspaceSyncStatus> = {},
): WorkspaceSyncStatus {
  workspaceSyncStatus = {
    ...workspaceSyncStatus,
    state,
    ...patch,
  };
  return workspaceSyncStatus;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function changedFiles(output: string): string[] {
  return output ? [...new Set(output.split("\n").filter(Boolean))].sort() : [];
}

function incomingTouchesActivePath(incoming: string[]): boolean {
  if (protectedActivePaths.size === 0 && registeredActivePaths.size === 0) {
    return false;
  }
  const candidates = new Set<string>();
  const activePaths = [
    ...protectedActivePaths,
    ...registeredActivePaths.values(),
  ];
  for (const activePath of activePaths) {
    candidates.add(activePath);
    candidates.add(`${activePath}.md`);
    candidates.add(`${activePath}/index.md`);
  }
  return incoming.some((file) => candidates.has(file));
}

async function runWorkspaceSync(): Promise<WorkspaceSyncStatus> {
  const lastAttemptAt = new Date().toISOString();
  setWorkspaceSyncStatus("syncing", {
    lastAttemptAt,
    reason: null,
    error: null,
    pulled: false,
    pushed: false,
  });

  const g = await getGit();
  if (!g) {
    return setWorkspaceSyncStatus("not-configured", {
      branch: null,
      reason: "git-unavailable",
      error: "Git is unavailable.",
    });
  }

  const branchSummary = await g.branchLocal();
  const branch = process.env.CABINET_SYNC_BRANCH || branchSummary.current;
  if (!branch) {
    return setWorkspaceSyncStatus("needs-attention", {
      branch: null,
      reason: "detached-head",
      error: "Workspace sync requires an active branch.",
    });
  }

  const remotes = await g.getRemotes(true);
  const remoteName = process.env.CABINET_SYNC_REMOTE || "origin";
  if (!remotes.some((remote) => remote.name === remoteName)) {
    return setWorkspaceSyncStatus("not-configured", {
      branch,
      reason: "no-remote",
      error: null,
    });
  }

  setWorkspaceSyncStatus("syncing", { branch });
  try {
    await g.raw(["fetch", "--quiet", "--prune", remoteName, branch]);
  } catch (error) {
    return setWorkspaceSyncStatus("offline", {
      branch,
      reason: "fetch-failed",
      error: errorMessage(error),
    });
  }

  const remoteRef = `${remoteName}/${branch}`;
  try {
    const counts = await g.raw([
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${remoteRef}`,
    ]);
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number);

    if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
      throw new Error("Git returned an invalid ahead/behind count.");
    }

    if (ahead === 0 && behind === 0) {
      return setWorkspaceSyncStatus("synced", {
        lastSuccessAt: new Date().toISOString(),
        reason: null,
        error: null,
      });
    }

    if (behind === 0) {
      try {
        await g.raw(["push", "--quiet", remoteName, `HEAD:${branch}`]);
        return setWorkspaceSyncStatus("synced", {
          lastSuccessAt: new Date().toISOString(),
          reason: null,
          error: null,
          pushed: true,
        });
      } catch (error) {
        return setWorkspaceSyncStatus("needs-attention", {
          reason: "push-rejected",
          error: errorMessage(error),
        });
      }
    }

    const base = (await g.raw(["merge-base", "HEAD", remoteRef])).trim();
    const incoming = changedFiles(
      await g.raw(["diff", "--name-only", `${base}..${remoteRef}`]),
    );
    const status = await g.status();
    const dirtyFiles = status.files.filter((file) => !isInternalPath(file.path));
    if (dirtyFiles.length > 0) {
      return setWorkspaceSyncStatus("needs-attention", {
        reason: "local-changes",
        error: "Incoming changes are waiting while local files are being saved.",
      });
    }

    if (incomingTouchesActivePath(incoming)) {
      return setWorkspaceSyncStatus("needs-attention", {
        reason: "active-page-changed",
        error: "Incoming changes touch the currently open page.",
      });
    }

    if (ahead === 0) {
      try {
        await g.raw(["merge", "--ff-only", "--quiet", remoteRef]);
        return setWorkspaceSyncStatus("synced", {
          lastSuccessAt: new Date().toISOString(),
          reason: null,
          error: null,
          pulled: true,
        });
      } catch (error) {
        return setWorkspaceSyncStatus("needs-attention", {
          reason: "fast-forward-failed",
          error: errorMessage(error),
        });
      }
    }

    const local = changedFiles(
      await g.raw(["diff", "--name-only", `${base}..HEAD`]),
    );
    const incomingSet = new Set(incoming);
    const overlap = local.filter((file) => incomingSet.has(file));
    if (overlap.length > 0) {
      return setWorkspaceSyncStatus("needs-attention", {
        reason: "overlapping-changes",
        error: `Both collaborators changed: ${overlap.join(", ")}`,
      });
    }

    try {
      await g.raw(["rebase", remoteRef]);
    } catch {
      await g.raw(["rebase", "--abort"]).catch(() => {});
      return setWorkspaceSyncStatus("needs-attention", {
        reason: "rebase-aborted",
        error: "Automatic rebase was aborted safely.",
      });
    }

    try {
      await g.raw(["push", "--quiet", remoteName, `HEAD:${branch}`]);
      return setWorkspaceSyncStatus("synced", {
        lastSuccessAt: new Date().toISOString(),
        reason: null,
        error: null,
        pulled: true,
        pushed: true,
      });
    } catch (error) {
      return setWorkspaceSyncStatus("needs-attention", {
        reason: "push-race",
        error: errorMessage(error),
        pulled: true,
      });
    }
  } catch (error) {
    return setWorkspaceSyncStatus("needs-attention", {
      branch,
      reason: "sync-failed",
      error: errorMessage(error),
    });
  }
}

/** Last result from the process-local sync owner. No filesystem sidecar needed. */
export function getWorkspaceSyncStatus(): WorkspaceSyncStatus {
  if (!automaticWorkspaceSyncEnabled()) {
    return {
      ...workspaceSyncStatus,
      state: "not-configured",
      reason: "automatic-sync-disabled",
      error: null,
      pulled: false,
      pushed: false,
    };
  }
  return workspaceSyncStatus;
}

/** Keep daemon-triggered pulls away from pages open in any app window. */
export function setWorkspaceSyncActivePath(
  clientId: string,
  activePath: string | null,
): void {
  if (!clientId || clientId.length > 128) return;
  if (!activePath) {
    registeredActivePaths.delete(clientId);
    return;
  }
  registeredActivePaths.set(clientId, normalizeVirtualPath(activePath));
}

/**
 * Conflict-aware bidirectional synchronization for the managed data repo.
 * Concurrent status-bar requests share one operation instead of racing Git.
 */
export function syncWorkspace(
  options: WorkspaceSyncOptions = {},
): Promise<WorkspaceSyncStatus> {
  if (
    options.automatic &&
    !automaticWorkspaceSyncEnabled()
  ) {
    return Promise.resolve(
      setWorkspaceSyncStatus("not-configured", {
        reason: "automatic-sync-disabled",
        error: null,
        pulled: false,
        pushed: false,
      }),
    );
  }
  if (options.activePath) {
    protectedActivePaths.add(normalizeVirtualPath(options.activePath));
  }
  if (activeWorkspaceSync) return activeWorkspaceSync;

  activeWorkspaceSync = runWorkspaceSync()
    .catch((error) =>
      setWorkspaceSyncStatus("needs-attention", {
        reason: "sync-failed",
        error: errorMessage(error),
        pulled: false,
        pushed: false,
      }),
    )
    .finally(() => {
      activeWorkspaceSync = null;
      protectedActivePaths.clear();
    });
  return activeWorkspaceSync;
}
