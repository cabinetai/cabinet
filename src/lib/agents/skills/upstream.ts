/**
 * Upstream-metadata helpers for installed skills: GitHub stars + skills.sh
 * install counts, fetched from the same backends `npx skills` uses. Driven
 * by the source recorded in `skills-lock.json` at import time.
 *
 * Skills authored directly on disk (no lock entry, no upstream) return
 * `null` for both fields — the UI hides the upstream chip in that case.
 */

import { fetchAuditsBatch, type AuditSummary } from "./audits";
import type { SkillsLockEntry, SkillsLockFile } from "./lock";

const STARS_TTL_MS = 24 * 60 * 60 * 1000;
const INSTALLS_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const starsCache = new Map<string, CacheEntry<number | null>>();
const installsCache = new Map<string, CacheEntry<number | null>>();

export interface UpstreamMeta {
  source: string;
  stars: number | null;
  installs: number | null;
  audits: AuditSummary | null;
}

export interface ParsedLockSource {
  owner: string;
  repo: string;
  /** When the lock source pinned a specific skill subdir within the repo. */
  skill?: string;
  /** `<owner>/<repo>` — the form skills.sh search returns + the audit endpoint expects. */
  sourceForApi: string;
}

/**
 * Parse the `source` string out of a `skills-lock.json` entry into something
 * we can hit GitHub / skills.sh with. Handles three historical shapes:
 *   - "github:owner/repo[/skill]"        (v2 import format)
 *   - "owner/repo"                       (legacy v1 with sourceType=github)
 *   - "https://github.com/owner/repo..."  (URL-style)
 *
 * Returns null for non-github sources (local, url, skills_sh-resolved
 * sources we can't directly look up).
 */
export function parseLockSource(entry: SkillsLockEntry): ParsedLockSource | null {
  const { source, sourceType } = entry;
  if (!source) return null;

  // github:owner/repo[/skill]
  if (source.startsWith("github:")) {
    const body = source.slice("github:".length);
    const segs = body.split("/").filter(Boolean);
    if (segs.length >= 2) {
      const [owner, repo, ...rest] = segs;
      const skill = rest.length > 0 ? rest[rest.length - 1] : undefined;
      return { owner, repo, skill, sourceForApi: `${owner}/${repo}` };
    }
    return null;
  }

  // https://github.com/owner/repo[/...]
  const ghUrl = source.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);
  if (ghUrl) {
    return { owner: ghUrl[1], repo: ghUrl[2], sourceForApi: `${ghUrl[1]}/${ghUrl[2]}` };
  }

  // Bare owner/repo, only when sourceType says github
  if (sourceType === "github" && /^[^/]+\/[^/]+$/.test(source)) {
    const [owner, repo] = source.split("/");
    return { owner, repo, sourceForApi: `${owner}/${repo}` };
  }

  return null;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "cabinet-skills-upstream",
        ...(init?.headers ?? {}),
        ...(process.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRepoStars(owner: string, repo: string): Promise<number | null> {
  const key = `${owner}/${repo}`;
  const now = Date.now();
  const hit = starsCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const res = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`);
  let value: number | null = null;
  if (res?.ok) {
    try {
      const data = (await res.json()) as { stargazers_count?: number };
      if (typeof data.stargazers_count === "number") value = data.stargazers_count;
    } catch {
      /* fall through to null */
    }
  }
  starsCache.set(key, { expiresAt: now + STARS_TTL_MS, value });
  return value;
}

/**
 * Look up install count from skills.sh's search API. Searches by the skill
 * key, then filters by source to find the exact match. There's no direct
 * lookup endpoint, so this is best-effort: when the search ranking buries
 * the skill or the key is too generic to match cleanly, we return null.
 */
export async function fetchInstalls(
  source: string,
  skillKey: string,
): Promise<number | null> {
  const cacheKey = `${source}::${skillKey}`;
  const now = Date.now();
  const hit = installsCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.value;

  const url = `https://skills.sh/api/search?q=${encodeURIComponent(skillKey)}&limit=20`;
  const res = await fetchWithTimeout(url);
  let value: number | null = null;
  if (res?.ok) {
    try {
      const data = (await res.json()) as {
        skills?: Array<{ skillId?: string; source?: string; installs?: number }>;
      };
      const match = data.skills?.find(
        (s) => s.source === source && s.skillId === skillKey,
      );
      if (match && typeof match.installs === "number") value = match.installs;
    } catch {
      /* fall through to null */
    }
  }
  installsCache.set(cacheKey, { expiresAt: now + INSTALLS_TTL_MS, value });
  return value;
}

/**
 * Given a lock file, fetch upstream stars + installs for every entry that
 * has a parseable github source. Returns a Map keyed by skill key.
 *
 * Fetches in parallel with built-in caches; cold first call costs one
 * GitHub + one skills.sh round-trip per skill, subsequent calls are free
 * within the cache TTL.
 */
export async function fetchUpstreamForLock(
  lock: SkillsLockFile,
): Promise<Map<string, UpstreamMeta>> {
  const out = new Map<string, UpstreamMeta>();

  // Group lock entries by source so we can batch the audit fetch — `audits.ts`
  // accepts comma-separated skill keys per source in a single HTTP call.
  const bySource = new Map<string, { parsed: ParsedLockSource; keys: string[] }>();
  for (const [key, entry] of Object.entries(lock.skills)) {
    const parsed = parseLockSource(entry);
    if (!parsed) continue;
    const existing = bySource.get(parsed.sourceForApi);
    if (existing) existing.keys.push(key);
    else bySource.set(parsed.sourceForApi, { parsed, keys: [key] });
  }

  await Promise.all(
    [...bySource.values()].map(async ({ parsed, keys }) => {
      const auditMap = await fetchAuditsBatch(parsed.sourceForApi, keys);
      await Promise.all(
        keys.map(async (key) => {
          const [stars, installs] = await Promise.all([
            fetchRepoStars(parsed.owner, parsed.repo),
            fetchInstalls(parsed.sourceForApi, key),
          ]);
          out.set(key, {
            source: parsed.sourceForApi,
            stars,
            installs,
            audits: auditMap.get(key) ?? null,
          });
        }),
      );
    }),
  );
  return out;
}

/**
 * Single-skill audit lookup for surfaces that have just one skill in hand
 * (e.g. the detail GET route). Returns null when the lock entry's source
 * isn't a github-style identifier we can hit the audit API with.
 */
export async function fetchAuditsForLockEntry(
  key: string,
  entry: SkillsLockEntry,
): Promise<AuditSummary | null> {
  const parsed = parseLockSource(entry);
  if (!parsed) return null;
  const map = await fetchAuditsBatch(parsed.sourceForApi, [key]);
  return map.get(key) ?? null;
}

/** Test-only — clears caches between tests. */
export function __clearUpstreamCaches(): void {
  starsCache.clear();
  installsCache.clear();
}
