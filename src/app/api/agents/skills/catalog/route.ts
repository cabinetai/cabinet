import { NextResponse } from "next/server";
import matter from "gray-matter";
import { fetchAuditsBatch, type AuditSummary } from "@/lib/agents/skills/audits";

/**
 * GET /api/agents/skills/catalog
 *
 * Two modes:
 * 1. **Search** (`?q=<query>`) — proxies skills.sh's open search API and
 *    enriches each result with a per-skill audit summary fetched from
 *    `add-skill.vercel.sh/audit` (the same endpoint the open `npx skills`
 *    CLI uses during install). Results are sorted by install count desc.
 *    Cached in-memory for 1h per query.
 * 2. **Detail** (`?owner=&repo=[&skill=]`) — fetches GitHub repo metadata
 *    (stars, forks, last commit) plus the audit summary for the named
 *    skill. Cached for 24h.
 *
 * Empty query returns an empty result set (UI's responsibility to show a
 * "type to search" hint) — we don't make a wildcard request.
 */

interface CachedEntry<T> {
  expiresAt: number;
  data: T;
}

const searchCache = new Map<string, CachedEntry<unknown>>();
const detailCache = new Map<string, CachedEntry<unknown>>();
const SEARCH_TTL_MS = 60 * 60 * 1000;
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 5000;

function getCached<T>(map: Map<string, CachedEntry<unknown>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(map: Map<string, CachedEntry<unknown>>, key: string, data: T, ttl: number) {
  map.set(key, { expiresAt: Date.now() + ttl, data });
}

interface SearchSkill {
  id: string;
  skillId: string;
  name: string;
  source: string;
  installs: number;
}

interface SearchResponse {
  query: string;
  searchType?: string;
  skills?: SearchSkill[];
  count?: number;
}

interface EnrichedSearchSkill extends SearchSkill {
  audits: AuditSummary;
}

async function fetchSearch(query: string): Promise<SearchSkill[]> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}&limit=50`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: "application/json", "User-Agent": "cabinet-skills-catalog" },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as SearchResponse;
    return body.skills ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

interface RepoMeta {
  owner: string;
  repo: string;
  stars: number;
  forks: number;
  lastCommitISO: string | null;
  lastCommitAgeDays: number | null;
  defaultBranch: string;
  description: string | null;
  topics: string[];
}

type FetchResult =
  | { ok: true; meta: RepoMeta }
  | { ok: false; reason: string };

async function fetchGitHubRepo(owner: string, repo: string): Promise<FetchResult> {
  const cacheKey = `repo:${owner}/${repo}`;
  const cached = getCached<RepoMeta>(detailCache, cacheKey);
  if (cached) return { ok: true, meta: cached };

  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cabinet-skills-catalog",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, reason: "repo not found" };
      }
      if (res.status === 403 || res.status === 429) {
        return {
          ok: false,
          reason: process.env.GITHUB_TOKEN
            ? "GitHub rate-limited (try again shortly)"
            : "GitHub rate-limited (set GITHUB_TOKEN env to raise the limit)",
        };
      }
      return { ok: false, reason: `GitHub returned ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const pushedAt = typeof data.pushed_at === "string" ? data.pushed_at : null;
    const lastCommitAgeDays = pushedAt
      ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const meta: RepoMeta = {
      owner,
      repo,
      stars: typeof data.stargazers_count === "number" ? data.stargazers_count : 0,
      forks: typeof data.forks_count === "number" ? data.forks_count : 0,
      lastCommitISO: pushedAt,
      lastCommitAgeDays,
      defaultBranch: typeof data.default_branch === "string" ? data.default_branch : "main",
      description: typeof data.description === "string" ? data.description : null,
      topics: Array.isArray(data.topics) ? (data.topics as string[]) : [],
    };
    setCached(detailCache, cacheKey, meta, DETAIL_TTL_MS);
    return { ok: true, meta };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "network error",
    };
  }
}

export interface SkillMeta {
  key: string;
  name: string;
  description: string | null;
  path: string;
}

/**
 * Find a skill's `SKILL.md` in a GitHub repo and return its frontmatter.
 * Used by the preview pane to show skill-level info (name, description) when
 * the user pastes `github:owner/repo/<skill>`.
 *
 * Two API hits + one CDN fetch:
 *   1. GET /repos/<owner>/<repo>/git/trees/<branch>?recursive=1
 *   2. GET https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
 *
 * raw.githubusercontent.com is CDN-served — much higher rate-limit ceiling
 * than api.github.com — so this only adds 1 rate-limited call beyond the
 * existing repo-meta fetch.
 */
async function fetchSkillMeta(
  owner: string,
  repo: string,
  skill: string,
  defaultBranch: string,
): Promise<SkillMeta | null> {
  const cacheKey = `skill:${owner}/${repo}:${skill}`;
  const cached = getCached<SkillMeta>(detailCache, cacheKey);
  if (cached) return cached;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cabinet-skills-catalog",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers });
    if (!treeRes.ok) return null;
    const treeData = (await treeRes.json()) as {
      tree?: Array<{ path?: string; type?: string }>;
    };
    const skillPath = (treeData.tree ?? [])
      .filter((e) => typeof e.path === "string" && e.path.endsWith("/SKILL.md"))
      .map((e) => e.path as string)
      .find((p) => {
        const segs = p.split("/");
        // Parent dir of SKILL.md is the second-to-last segment.
        return segs[segs.length - 2] === skill;
      });
    if (!skillPath) return null;

    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${skillPath}`;
    const rawRes = await fetch(rawUrl);
    if (!rawRes.ok) return null;
    const md = await rawRes.text();
    const { data } = matter(md);
    const meta: SkillMeta = {
      key: skill,
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : skill,
      description: typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : null,
      path: skillPath,
    };
    setCached(detailCache, cacheKey, meta, DETAIL_TTL_MS);
    return meta;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const owner = url.searchParams.get("owner") || undefined;
  const repo = url.searchParams.get("repo") || undefined;
  const skill = url.searchParams.get("skill") || undefined;
  const q = (url.searchParams.get("q") || "").trim();

  // Detail mode — owner+repo (+ optional skill) supplied.
  if (owner && repo) {
    const result = await fetchGitHubRepo(owner, repo);
    if (!result.ok) {
      return NextResponse.json(
        { error: `${owner}/${repo}: ${result.reason}` },
        { status: 502 },
      );
    }
    let audits: AuditSummary | null = null;
    let skillMeta: SkillMeta | null = null;
    if (skill) {
      [audits, skillMeta] = await Promise.all([
        fetchAuditsBatch(`${owner}/${repo}`, [skill]).then((m) => m.get(skill) ?? null),
        fetchSkillMeta(owner, repo, skill, result.meta.defaultBranch),
      ]);
    }
    return NextResponse.json({
      mode: "detail",
      skill: result.meta,
      requestedSkill: skill ?? null,
      audits,
      skillMeta,
    });
  }

  // Search mode.
  if (!q) {
    return NextResponse.json({ mode: "search", query: "", skills: [] });
  }

  const cached = getCached<EnrichedSearchSkill[]>(searchCache, q);
  if (cached) {
    return NextResponse.json({ mode: "search", source: "cache", query: q, skills: cached });
  }

  const results = await fetchSearch(q);

  // Group by source so we can issue one audit fetch per repo (the audit
  // endpoint accepts comma-separated skill keys under a single source).
  const bySource = new Map<string, string[]>();
  for (const r of results) {
    const list = bySource.get(r.source) ?? [];
    list.push(r.skillId);
    bySource.set(r.source, list);
  }
  const auditMap = new Map<string, AuditSummary>();
  await Promise.all(
    Array.from(bySource.entries()).map(async ([source, keys]) => {
      const partial = await fetchAuditsBatch(source, keys);
      for (const [k, v] of partial) auditMap.set(`${source}::${k}`, v);
    }),
  );

  const enriched: EnrichedSearchSkill[] = results
    .map((r) => ({
      ...r,
      audits: auditMap.get(`${r.source}::${r.skillId}`) ?? {
        passed: 0,
        total: 0,
        raw: {},
        available: false,
      },
    }))
    .sort((a, b) => b.installs - a.installs);

  setCached(searchCache, q, enriched, SEARCH_TTL_MS);

  return NextResponse.json({ mode: "search", source: "fresh", query: q, skills: enriched });
}
