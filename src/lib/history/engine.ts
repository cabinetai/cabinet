import fs from "fs";
import path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";

/**
 * File-edit history engine (docs/LOGGING_AND_FILE_HISTORY_PRD.md §4).
 *
 * Git is the ground truth (per-commit --author carries the actor; agent
 * commits add Cabinet-Agent / Cabinet-Run trailers). A per-room journal
 * (<cabinetRoot>/.cabinet-meta/file-history.jsonl) is the regenerable index
 * the UI reads. Two hard rules:
 *   - stage EXPLICIT paths only, never `git add .` (attribution corruption)
 *   - never auto-commit into a repo Cabinet didn't create (cabinet.managed)
 */

// ---------------------------------------------------------------- actors

export interface UserActor {
  kind: "user";
  id: string; // "local" until orgs
  name: string;
  email?: string;
}

export interface AgentActor {
  kind: "agent";
  slug: string;
  cabinetPath: string;
  conversationId?: string;
  /** Persona displayName || name, resolved at commit time for git author. */
  displayName?: string;
  runtime?: string;
  trigger?: string;
}

export type HistoryActor = UserActor | AgentActor;

function slugifyEmailLocal(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "user";
}

/** Git `--author` string for an actor (PRD §4.2). */
export function actorAuthor(actor: HistoryActor): string {
  if (actor.kind === "user") {
    const email = actor.email?.trim() || `${slugifyEmailLocal(actor.name)}@local`;
    return `${actor.name || "You"} <${email}>`;
  }
  const room = path.basename(actor.cabinetPath || "") || "home";
  const display = actor.displayName || actor.slug;
  return `${display} (${room}) <agent@cabinet.local>`;
}

/** Cached local user actor from the onboarding-captured profile. */
let cachedUserActor: UserActor | null = null;
export async function localUserActor(): Promise<UserActor> {
  if (cachedUserActor) return cachedUserActor;
  try {
    const { readUserProfile } = await import("@/lib/user/profile-io");
    const profile = await readUserProfile();
    cachedUserActor = {
      kind: "user",
      id: "local",
      name: profile.displayName?.trim() || profile.name?.trim() || "You",
      email: profile.email,
    };
  } catch {
    cachedUserActor = { kind: "user", id: "local", name: "You" };
  }
  return cachedUserActor;
}

export function invalidateUserActorCache(): void {
  cachedUserActor = null;
}

// ------------------------------------------------------- cabinet rooms

/** Root cabinet may arrive as "", ".", or "./" — one canonical form. */
export function normalizeCabinetRoot(value: string | undefined | null): string {
  const v = (value ?? "").trim();
  return v === "." || v === "./" || v === "/" ? "" : v;
}

let realDataDir: string | null = null;
function getRealDataDir(): string {
  if (realDataDir) return realDataDir;
  try {
    realDataDir = fs.realpathSync(DATA_DIR);
  } catch {
    realDataDir = DATA_DIR;
  }
  return realDataDir;
}

/**
 * Nearest enclosing cabinet root for a DATA_DIR-relative virtual path —
 * walking up the VIRTUAL components (so symlink mounts resolve through
 * DATA_DIR joins). "" is the root cabinet.
 */
export function cabinetRootForVirtualPath(virtualPath: string): string {
  const parts = virtualPath.split("/").filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const candidate = parts.slice(0, i).join("/");
    try {
      if (fs.existsSync(path.join(DATA_DIR, candidate, CABINET_MANIFEST_FILE))) {
        return candidate;
      }
    } catch {
      // unreadable — keep walking up
    }
  }
  return "";
}

// ------------------------------------------------------ history config

export interface HistoryConfig {
  /** Commit binaries at or under this size (MB). 0/absent = text only. */
  binaryThresholdMB: number;
  /** Journal-only tier: record everything, commit nothing (PRD §4.8). */
  journalOnly: boolean;
}

export function readHistoryConfig(cabinetRootVirtual: string): HistoryConfig {
  try {
    const raw = fs.readFileSync(
      path.join(
        DATA_DIR,
        normalizeCabinetRoot(cabinetRootVirtual),
        ".cabinet-state",
        "history.json"
      ),
      "utf-8"
    );
    const parsed = JSON.parse(raw) as Partial<HistoryConfig>;
    return {
      binaryThresholdMB:
        typeof parsed.binaryThresholdMB === "number" ? parsed.binaryThresholdMB : 0,
      journalOnly: parsed.journalOnly === true,
    };
  } catch {
    return { binaryThresholdMB: 0, journalOnly: false };
  }
}

export function writeHistoryConfig(
  cabinetRootVirtual: string,
  config: HistoryConfig
): void {
  const dir = path.join(
    DATA_DIR,
    normalizeCabinetRoot(cabinetRootVirtual),
    ".cabinet-state"
  );
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "history.json"), JSON.stringify(config, null, 2));
}

// --------------------------------------------------------- text/binary

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "json", "jsonl", "yaml", "yml", "csv", "tsv",
  "html", "htm", "css", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb",
  "sh", "zsh", "bash", "toml", "ini", "env", "xml", "svg", "lock", "log",
  "sql", "graphql", "gitignore", "prettierrc", "eslintrc",
]);

const HARD_TEXT_CAP_BYTES = 5 * 1024 * 1024; // PRD §4.7 guard, even for text

function isTextFile(relPath: string): boolean {
  const base = path.basename(relPath);
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  if (!ext) return true; // extensionless (Makefile, LICENSE) — treat as text
  return TEXT_EXTENSIONS.has(ext);
}

/** Should this changed file be committed under the cabinet's policy? */
function commitAllowed(
  repoRoot: string,
  relPath: string,
  config: HistoryConfig
): boolean {
  let size = 0;
  try {
    size = fs.statSync(path.join(repoRoot, relPath)).size;
  } catch {
    // deleted file — always commit the deletion
    return true;
  }
  if (isTextFile(relPath)) return size <= HARD_TEXT_CAP_BYTES;
  const thresholdBytes = config.binaryThresholdMB * 1024 * 1024;
  return thresholdBytes > 0 && size <= thresholdBytes;
}

// -------------------------------------------------------------- journal

export type HistoryOp =
  | "write"
  | "create"
  | "delete"
  | "rename"
  | "move"
  | "upload";

export interface HistoryEvent {
  ts: string;
  op: HistoryOp;
  /** DATA_DIR-relative virtual path. */
  path: string;
  from?: string;
  actor: HistoryActor;
  skipped?: "size" | "foreign-repo" | "journal-only";
}

const JOURNAL_MAX_BYTES = 5 * 1024 * 1024;

// NOTE: lives under .cabinet-state (NOT .cabinet-meta) — `.cabinet-meta`
// is the link-metadata FILE in linked cabinets (CABINET_LINK_META_FILE),
// so a directory by that name would collide. .cabinet-state is already
// the per-room internal-state convention and is excluded from commits.
function journalFile(cabinetRootVirtual: string): string {
  return path.join(
    DATA_DIR,
    normalizeCabinetRoot(cabinetRootVirtual),
    ".cabinet-state",
    "file-history.jsonl"
  );
}

export function appendHistoryEvent(
  cabinetRootVirtual: string,
  event: HistoryEvent
): void {
  try {
    const file = journalFile(cabinetRootVirtual);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      const stat = fs.statSync(file);
      if (stat.size > JOURNAL_MAX_BYTES) {
        // Keep the newest half. The journal is a regenerable index — git
        // remains the authoritative record (PRD §4.1).
        const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
        fs.writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n");
      }
    } catch {
      // no journal yet
    }
    fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // journaling must never break the mutation it records
  }
}

export function readHistoryEvents(
  cabinetRootVirtual: string,
  limit: number,
  filter?: { path?: string }
): HistoryEvent[] {
  try {
    const lines = fs
      .readFileSync(journalFile(cabinetRootVirtual), "utf-8")
      .split("\n")
      .filter(Boolean);
    const events: HistoryEvent[] = [];
    for (let i = lines.length - 1; i >= 0 && events.length < limit; i--) {
      try {
        const e = JSON.parse(lines[i]) as HistoryEvent;
        if (filter?.path && e.path !== filter.path && e.from !== filter.path) continue;
        events.push(e);
      } catch {
        // skip corrupt line
      }
    }
    return events;
  } catch {
    return [];
  }
}

// ------------------------------------------------------------ repo layer

export interface RepoHandle {
  git: SimpleGit;
  /** Absolute filesystem root of the repo (realpath). */
  root: string;
  /** Cabinet created/owns this repo — auto-commits allowed. */
  managed: boolean;
}

const repoCache = new Map<string, RepoHandle | null>();

function findEnclosingRepoRoot(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

async function isManagedRepo(git: SimpleGit, root: string): Promise<boolean> {
  if (root === getRealDataDir()) return true; // Cabinet's own data repo
  try {
    const value = await git.getConfig("cabinet.managed", "local");
    return value.value === "true";
  } catch {
    return false;
  }
}

async function initManagedRepo(root: string): Promise<RepoHandle | null> {
  try {
    const git = simpleGit(root);
    await git.init();
    await git.addConfig("user.email", "kb@cabinet.dev");
    await git.addConfig("user.name", "Cabinet");
    await git.addConfig("cabinet.managed", "true");
    // Scale guards (PRD §4.8): status cost ∝ recent changes, not tree size.
    await git.addConfig("core.untrackedCache", "true");
    try {
      await git.addConfig("core.fsmonitor", "true");
    } catch {
      // older git — untrackedCache still helps
    }
    return { git, root, managed: true };
  } catch {
    return null;
  }
}

/**
 * Repo for a cabinet root (virtual path). Inside DATA_DIR → the data repo
 * (initialized on demand). Symlink-mounted → the mount target's own repo
 * (managed only if Cabinet created it), or a fresh managed repo at the
 * mount root when none exists (PRD §4.4).
 */
export async function repoForCabinetRoot(
  cabinetRootVirtual: string
): Promise<RepoHandle | null> {
  const normalized = normalizeCabinetRoot(cabinetRootVirtual);
  const cacheKey = normalized;
  if (repoCache.has(cacheKey)) return repoCache.get(cacheKey) ?? null;

  let handle: RepoHandle | null = null;
  try {
    const fsRoot = path.join(DATA_DIR, normalized);
    let real: string;
    try {
      real = fs.realpathSync(fsRoot);
    } catch {
      repoCache.set(cacheKey, null);
      return null;
    }

    if (real === getRealDataDir() || real.startsWith(getRealDataDir() + path.sep)) {
      // Plain directory inside the data tree — one repo at DATA_DIR.
      const dataRepoRoot = getRealDataDir();
      if (!fs.existsSync(path.join(dataRepoRoot, ".git"))) {
        handle = await initManagedRepo(dataRepoRoot);
      } else {
        const git = simpleGit(dataRepoRoot);
        handle = { git, root: dataRepoRoot, managed: true };
        // Backfill scale guards on existing installs (idempotent).
        git.addConfig("core.untrackedCache", "true").catch(() => {});
      }
    } else {
      // Symlink-mounted cabinet. Use the nearest enclosing repo if any.
      const enclosing = findEnclosingRepoRoot(real);
      if (enclosing) {
        const git = simpleGit(enclosing);
        handle = {
          git,
          root: enclosing,
          managed: await isManagedRepo(git, enclosing),
        };
      } else {
        handle = await initManagedRepo(real);
      }
    }
  } catch {
    handle = null;
  }
  repoCache.set(cacheKey, handle);
  return handle;
}

export function invalidateRepoCache(): void {
  repoCache.clear();
}

// --------------------------------------------------------- commit queue

const INTERNAL_PATH_RE = [
  /(^|\/)\.cabinet-state(\/|$)/,
  /(^|\/)\.cabinet-meta(\/|$)/,
  /(^|\/)\.cabinet-cache(\/|$)/,
  /(^|\/)\.agents\/\.conversations(\/|$)/,
  /(^|\/)\.agents\/\.runtime(\/|$)/,
  /(^|\/)\.agents\/\.config(\/|$)/,
  /(^|\/)\.next(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
];

/** Cabinet-internal runtime state — never part of user-facing history. */
export function isInternalHistoryPath(relPath: string): boolean {
  return INTERNAL_PATH_RE.some((re) => re.test(relPath));
}

const isInternal = isInternalHistoryPath;

const EXCLUDE_MAX_BYTES = 1024 * 1024;

/** Append never-committed paths to .git/info/exclude (deduped, capped). */
function maintainExcludes(repoRoot: string, relPaths: string[]): void {
  if (!relPaths.length) return;
  try {
    const file = path.join(repoRoot, ".git", "info", "exclude");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let existing = "";
    try {
      const stat = fs.statSync(file);
      if (stat.size > EXCLUDE_MAX_BYTES) return; // cap reached — stop growing
      existing = fs.readFileSync(file, "utf-8");
    } catch {
      // no exclude file yet
    }
    const present = new Set(existing.split("\n"));
    const fresh = relPaths
      .map((p) => `/${p}`)
      .filter((line) => !present.has(line));
    if (fresh.length) fs.appendFileSync(file, fresh.join("\n") + "\n", "utf-8");
  } catch {
    // exclude maintenance is best-effort
  }
}

async function withIndexLockRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("index.lock")) throw err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

interface CommitBucket {
  cabinetRootVirtual: string;
  actor: HistoryActor;
  author: string;
  /** repo-relative pathspecs to inspect at flush time */
  pathspecs: Set<string>;
  message: string;
  trailers: string[];
  timer: NodeJS.Timeout;
}

const buckets = new Map<string, CommitBucket>();
let commitChain: Promise<void> = Promise.resolve();
let commitsSinceGc = 0;

function actorKey(actor: HistoryActor): string {
  return actor.kind === "user"
    ? `user:${actor.id}`
    : `agent:${actor.cabinetPath}#${actor.slug}:${actor.conversationId ?? ""}`;
}

/** repo-relative path for a DATA_DIR virtual path, or null if outside. */
function repoRelative(handle: RepoHandle, virtualPath: string): string | null {
  try {
    const abs = path.join(DATA_DIR, virtualPath);
    // realpath the nearest existing ancestor so deleted paths still resolve
    let probe = abs;
    let suffix = "";
    while (!fs.existsSync(probe)) {
      suffix = path.join(path.basename(probe), suffix);
      const parent = path.dirname(probe);
      if (parent === probe) return null;
      probe = parent;
    }
    const real = path.join(fs.realpathSync(probe), suffix);
    const rel = path.relative(handle.root, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return rel === "" ? "." : rel.split(path.sep).join("/");
  } catch {
    return null;
  }
}

async function flushBucket(bucket: CommitBucket): Promise<void> {
  const handle = await repoForCabinetRoot(bucket.cabinetRootVirtual);
  if (!handle || !handle.managed) return; // foreign repo — journal-only
  const config = readHistoryConfig(bucket.cabinetRootVirtual);
  if (config.journalOnly) return;

  const pathspecs = [...bucket.pathspecs].filter((p) => p && p !== ".");
  if (!pathspecs.length) return;

  try {
    await withIndexLockRetry(async () => {
      // status with pathspecs is lenient about non-matches (unlike add)
      const status = await handle.git.status(["--", ...pathspecs]);
      const changed = status.files
        .map((f) => f.path)
        .filter((p) => !isInternal(p));
      if (!changed.length) return;

      const allowed = changed.filter((p) => commitAllowed(handle.root, p, config));
      // Skipped binaries also go into .git/info/exclude so status scans
      // never even enumerate them (PRD §4.7).
      maintainExcludes(
        handle.root,
        changed.filter((p) => !allowed.includes(p))
      );
      if (!allowed.length) return;

      await handle.git.raw(["add", "-A", "--", ...allowed]);
      const staged = await handle.git.status(["--", ...allowed]);
      if (!staged.staged.length && !staged.files.length) return;

      const message =
        bucket.message +
        (bucket.trailers.length ? `\n\n${bucket.trailers.join("\n")}` : "");
      await handle.git.commit(message, allowed, { "--author": bucket.author });
      commitsSinceGc++;
    });

    if (commitsSinceGc >= 100) {
      commitsSinceGc = 0;
      handle.git.raw(["gc", "--auto"]).catch(() => {});
    }
  } catch (err) {
    console.error(
      `[history] auto-commit failed for ${bucket.cabinetRootVirtual || "(root)"}:`,
      err instanceof Error ? err.message : err
    );
  }
}

const FLUSH_DEBOUNCE_MS = 5000;

/**
 * Schedule a scoped, attributed commit. Debounced per (cabinet, actor)
 * bucket so concurrent actors can never be merged into one commit
 * (PRD §4.2 item 4).
 */
export function scheduleActorCommit(input: {
  cabinetRootVirtual: string;
  actor: HistoryActor;
  virtualPaths: string[];
  message: string;
}): void {
  const key = `${input.cabinetRootVirtual}|${actorKey(input.actor)}`;
  const existing = buckets.get(key);

  const addPathspecs = (bucket: CommitBucket) => {
    void repoForCabinetRoot(input.cabinetRootVirtual).then((handle) => {
      if (!handle) return;
      for (const vp of input.virtualPaths) {
        const candidates = vp
          ? [vp, `${vp}.md`]
          : ["index.md"]; // root index page
        for (const c of candidates) {
          const rel = repoRelative(handle, c);
          if (rel) bucket.pathspecs.add(rel);
        }
      }
    });
  };

  if (existing) {
    clearTimeout(existing.timer);
    existing.message = input.message; // latest action label wins
    addPathspecs(existing);
    existing.timer = setTimeout(() => {
      buckets.delete(key);
      commitChain = commitChain.then(() => flushBucket(existing));
    }, FLUSH_DEBOUNCE_MS);
    return;
  }

  const trailers: string[] = [];
  if (input.actor.kind === "agent") {
    trailers.push(
      `Cabinet-Agent: ${input.actor.cabinetPath}#${input.actor.slug}`
    );
    if (input.actor.conversationId) {
      trailers.push(`Cabinet-Run: ${input.actor.conversationId}`);
    }
  }

  const bucket: CommitBucket = {
    cabinetRootVirtual: input.cabinetRootVirtual,
    actor: input.actor,
    author: actorAuthor(input.actor),
    pathspecs: new Set(),
    message: input.message,
    trailers,
    timer: setTimeout(() => {
      buckets.delete(key);
      commitChain = commitChain.then(() => flushBucket(bucket));
    }, FLUSH_DEBOUNCE_MS),
  };
  addPathspecs(bucket);
  buckets.set(key, bucket);
}

/** Flush all pending buckets now (used by agent run-end and tests). */
export async function flushPendingCommits(): Promise<void> {
  const pending = [...buckets.values()];
  buckets.clear();
  for (const bucket of pending) {
    clearTimeout(bucket.timer);
    commitChain = commitChain.then(() => flushBucket(bucket));
  }
  await commitChain;
}

// -------------------------------------------------------- recordMutation

/**
 * THE choke point for user-driven content mutations (PRD §4.2): one call
 * journals the event and schedules the attributed commit.
 */
export async function recordMutation(input: {
  op: HistoryOp;
  virtualPath: string;
  fromVirtualPath?: string;
  actor?: HistoryActor;
  /** Human commit subject, e.g. `Update notes/launch`. */
  message?: string;
}): Promise<void> {
  try {
    const actor = input.actor ?? (await localUserActor());
    const cabinetRoot = cabinetRootForVirtualPath(input.virtualPath);
    const config = readHistoryConfig(cabinetRoot);
    const handle = await repoForCabinetRoot(cabinetRoot);

    appendHistoryEvent(cabinetRoot, {
      ts: new Date().toISOString(),
      op: input.op,
      path: input.virtualPath,
      ...(input.fromVirtualPath ? { from: input.fromVirtualPath } : {}),
      actor,
      ...(handle && !handle.managed
        ? { skipped: "foreign-repo" as const }
        : config.journalOnly
          ? { skipped: "journal-only" as const }
          : {}),
    });

    const paths = [input.virtualPath];
    if (input.fromVirtualPath) paths.push(input.fromVirtualPath);
    scheduleActorCommit({
      cabinetRootVirtual: cabinetRoot,
      actor,
      virtualPaths: paths,
      message:
        input.message ??
        `${input.op === "delete" ? "Delete" : input.op === "create" ? "Add" : "Update"} ${input.virtualPath || "index"}`,
    });
  } catch (err) {
    console.error("[history] recordMutation failed:", err);
  }
}
