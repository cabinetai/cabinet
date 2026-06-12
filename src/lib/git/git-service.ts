import simpleGit, { SimpleGit } from "simple-git";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { fileExists } from "@/lib/storage/fs-operations";
import path from "path";

let git: SimpleGit | null = null;

async function getGit(): Promise<SimpleGit | null> {
  if (git) return git;

  const gitDir = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".git");
  if (await fileExists(gitDir)) {
    git = simpleGit(DATA_DIR);
    return git;
  }

  // Initialize git in data dir if not exists
  try {
    git = simpleGit(DATA_DIR);
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

export async function gitPull(): Promise<{ pulled: boolean; summary: string }> {
  const g = await getGit();
  if (!g) return { pulled: false, summary: "Git not available" };

  try {
    // Check if remote exists
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
