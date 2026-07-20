export type HermesSourceState = "success" | "connected_empty" | "unavailable" | "failure" | "unknown";

export type HermesProjectObservation = {
  state: HermesSourceState;
  observedAt: string;
  profile: string;
  project: string | null;
  sessionAssociation: string | null;
  workingDirectoryReported: boolean;
  repositoryAssociated: boolean;
  repository: string | null;
  summary: string;
};

export type HermesWorktreeItem = {
  identity: string;
  current: boolean;
  main: boolean;
  branch: string | null;
  detached: boolean;
  locked: boolean;
};

export type HermesWorktreeObservation = {
  state: HermesSourceState;
  observedAt: string;
  total: number;
  current: HermesWorktreeItem | null;
  ambiguousCurrent: boolean;
  items: HermesWorktreeItem[];
  summary: string;
};

export type HermesReviewObservation = {
  state: HermesSourceState;
  observedAt: string;
  repository: string | null;
  branch: string | null;
  detached: boolean | null;
  clean: boolean | null;
  staged: number | null;
  unstaged: number | null;
  untracked: number | null;
  conflicts: number | null;
  ahead: number | null;
  behind: number | null;
  reviewAvailable: boolean | null;
  reviewCount: number | null;
  summary: string;
};

export type HermesDeveloperRepositorySnapshot = {
  project: HermesProjectObservation;
  worktrees: HermesWorktreeObservation;
  review: HermesReviewObservation;
};

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const MAX_LABEL = 96;

export function safeDeveloperLabel(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(ANSI, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > MAX_LABEL ? `${normalized.slice(0, MAX_LABEL - 1).trimEnd()}…` : normalized;
}

/** Returns only the final safe path identity. Full paths never enter the projection. */
export function safePathIdentity(value: unknown): string | null {
  const safe = safeDeveloperLabel(value);
  if (!safe) return null;
  const withoutQuery = safe.split(/[?#]/, 1)[0] ?? "";
  const parts = withoutQuery.replaceAll("\\", "/").split("/").filter(Boolean);
  return safeDeveloperLabel(parts.at(-1) ?? null);
}

/** Reduce a local or remote repository identifier to a credential-free display label. */
export function safeRepositoryIdentity(value: unknown): string | null {
  const safe = safeDeveloperLabel(value);
  if (!safe) return null;
  if (/^(?:file:|[a-z]:[\\/]|[/~])/i.test(safe)) return stripGit(safePathIdentity(safe));
  const withoutQuery = safe.split(/[?#]/, 1)[0] ?? "";
  const scpLike = withoutQuery.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scpLike) return stripGit(safePathIdentity(scpLike[1]));
  try {
    const parsed = new URL(withoutQuery);
    return stripGit(safePathIdentity(parsed.pathname));
  } catch {
    return stripGit(safePathIdentity(withoutQuery));
  }
}

function stripGit(value: string | null): string | null {
  return value ? safeDeveloperLabel(value.replace(/\.git$/i, "")) : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function bool(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function count(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null; }

export function normalizeProjectObservation(raw: unknown, profile: string, observedAt: string): HermesProjectObservation {
  const sessions = array(record(raw).sessions).map(record);
  const selected = sessions.find((item) => item.is_active === true) ?? sessions[0];
  if (!selected) return { state: "connected_empty", observedAt, profile: safeDeveloperLabel(profile, "Unknown profile")!, project: null, sessionAssociation: null, workingDirectoryReported: false, repositoryAssociated: false, repository: null, summary: "Hermes sessions responded with no project association." };
  const cwd = safePathIdentity(selected.cwd);
  const repository = safeRepositoryIdentity(selected.git_repo_root ?? selected.repository);
  const project = safeDeveloperLabel(selected.project_name) ?? cwd;
  return {
    state: "success",
    observedAt,
    profile: safeDeveloperLabel(selected.profile_name ?? selected.profile ?? profile, "Unknown profile")!,
    project,
    sessionAssociation: safeDeveloperLabel(selected.id),
    workingDirectoryReported: Boolean(cwd),
    repositoryAssociated: Boolean(repository),
    repository,
    summary: repository ? "Hermes reported an active session and repository association." : "Hermes reported an active session; repository association was not reported by the session source.",
  };
}

export function normalizeWorktreeObservation(raw: unknown, cwd: unknown, observedAt: string): HermesWorktreeObservation {
  const values = Array.isArray(raw) ? raw : array(record(raw).worktrees);
  const cwdIdentity = safePathIdentity(cwd);
  const deduped = new Map<string, HermesWorktreeItem>();
  for (const item of values) {
    const source = record(item);
    const identity = safePathIdentity(source.path);
    if (!identity) continue;
    const branch = safeDeveloperLabel(source.branch);
    const detached = source.detached === true;
    const current = source.current === true || source.isCurrent === true || (cwdIdentity !== null && identity === cwdIdentity);
    const normalized = { identity, current, main: source.isMain === true || source.is_main === true, branch: detached ? null : branch, detached, locked: source.locked === true };
    const key = `${identity}\u0000${branch ?? ""}\u0000${detached}`;
    const prior = deduped.get(key);
    deduped.set(key, prior ? { ...prior, current: prior.current || current, main: prior.main || normalized.main, locked: prior.locked || normalized.locked } : normalized);
  }
  const items = [...deduped.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.identity.localeCompare(b.identity) || (a.branch ?? "").localeCompare(b.branch ?? ""));
  const currentItems = items.filter((item) => item.current);
  return {
    state: items.length ? "success" : "connected_empty",
    observedAt,
    total: items.length,
    current: currentItems.length === 1 ? currentItems[0]! : null,
    ambiguousCurrent: currentItems.length > 1,
    items,
    summary: !items.length ? "Hermes worktrees responded with no records." : currentItems.length > 1 ? `Hermes reported ${items.length} worktrees with multiple records marked current.` : `Hermes reported ${items.length} worktree${items.length === 1 ? "" : "s"}.`,
  };
}

export function normalizeReviewObservation(statusRaw: unknown, reviewRaw: unknown, cwd: unknown, observedAt: string): HermesReviewObservation {
  const status = record(statusRaw);
  const review = record(reviewRaw);
  const hasStatus = ["branch", "detached", "staged", "unstaged", "untracked", "conflicted", "ahead", "behind"].some((key) => key in status);
  const staged = count(status.staged);
  const unstaged = count(status.unstaged);
  const untracked = count(status.untracked);
  const conflicts = count(status.conflicted);
  const clean = hasStatus && staged !== null && unstaged !== null && untracked !== null && conflicts !== null ? staged + unstaged + untracked + conflicts === 0 : null;
  const reviewFiles = Array.isArray(review.files) ? review.files.length : null;
  return {
    state: hasStatus ? "success" : "unknown",
    observedAt,
    repository: safeRepositoryIdentity(status.repository ?? status.repo_root ?? cwd),
    branch: status.detached === true ? null : safeDeveloperLabel(status.branch),
    detached: bool(status.detached),
    clean,
    staged,
    unstaged,
    untracked,
    conflicts,
    ahead: count(status.ahead),
    behind: count(status.behind),
    reviewAvailable: reviewFiles === null ? null : true,
    reviewCount: reviewFiles,
    summary: hasStatus ? "Hermes Git status returned bounded repository state." : "Hermes Git status did not provide enough structured data to determine repository state.",
  };
}

export function unavailableDeveloperRepositorySnapshot(profile: string, observedAt: string, error: unknown): HermesDeveloperRepositorySnapshot {
  const raw = safeDeveloperLabel(error instanceof Error ? error.message : error, "Hermes developer repository source is unavailable.")!;
  const summary = /(?:token|authorization|credential|secret|https?:\/\/)/i.test(raw) ? "Hermes developer repository source is unavailable." : raw;
  return {
    project: { state: "unavailable", observedAt, profile, project: null, sessionAssociation: null, workingDirectoryReported: false, repositoryAssociated: false, repository: null, summary },
    worktrees: { state: "unavailable", observedAt, total: 0, current: null, ambiguousCurrent: false, items: [], summary },
    review: { state: "unavailable", observedAt, repository: null, branch: null, detached: null, clean: null, staged: null, unstaged: null, untracked: null, conflicts: null, ahead: null, behind: null, reviewAvailable: null, reviewCount: null, summary },
  };
}
