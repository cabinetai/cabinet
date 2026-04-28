/**
 * Wrapper around skills.sh's audit endpoint (`add-skill.vercel.sh/audit`),
 * the same backend the open `npx skills` CLI uses during install. Returns a
 * pass-count summary per skill so trust gating doesn't have to re-classify.
 *
 * Shape (verified against live API 2026-04-26):
 *   GET https://add-skill.vercel.sh/audit?source=<owner>/<repo>&skills=<k1>,<k2>
 *   → { <skillKey>: { ath?, socket?, snyk?, zeroleaks? } }
 *   Each audit value: { risk: "safe"|"low"|"medium"|"high"|"critical", ... }
 *   Socket also has `alerts: number` and `score: number`.
 *
 * Cache TTL is 24h (matches our existing GitHub repo-meta cache). Timeout is
 * 3s — matching the CLI's posture: never block a UI render on this.
 */

interface RiskBlock {
  risk?: string;
  alerts?: number;
  score?: number;
  analyzedAt?: string;
}

export interface AuditRaw {
  ath?: RiskBlock;
  socket?: RiskBlock;
  snyk?: RiskBlock;
  zeroleaks?: RiskBlock;
}

export interface AuditSummary {
  /** Number of audit sources that returned a passing classification. */
  passed: number;
  /** Number of audit sources that returned any classification at all. */
  total: number;
  /** Raw per-source data so the UI can render details if it wants. */
  raw: AuditRaw;
  /** False when the network call failed/timed out — UI shows "audits unavailable". */
  available: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3000;
const ENDPOINT = "https://add-skill.vercel.sh/audit";

interface CacheEntry {
  expiresAt: number;
  summary: AuditSummary;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(source: string, skillKey: string): string {
  return `${source}::${skillKey}`;
}

const PASSING_RISK = new Set(["safe", "low", "none"]);

function classify(block: RiskBlock | undefined): boolean {
  if (!block || !block.risk) return false;
  return PASSING_RISK.has(block.risk.toLowerCase());
}

export function summarize(raw: AuditRaw): AuditSummary {
  const sources: Array<RiskBlock | undefined> = [raw.ath, raw.socket, raw.snyk, raw.zeroleaks];
  const present = sources.filter((s): s is RiskBlock => !!s && !!s.risk);
  const passing = present.filter(classify);
  return {
    passed: passing.length,
    total: present.length,
    raw,
    available: present.length > 0,
  };
}

const UNAVAILABLE: AuditSummary = {
  passed: 0,
  total: 0,
  raw: {},
  available: false,
};

/**
 * Fetch the audit block for a single (source, skillKey) pair. Returns
 * `available: false` on network error / timeout / empty response — caller
 * should treat that as "no signal" rather than "failed audits".
 */
export async function fetchAudits(
  source: string,
  skillKey: string,
): Promise<AuditSummary> {
  const map = await fetchAuditsBatch(source, [skillKey]);
  return map.get(skillKey) ?? UNAVAILABLE;
}

/**
 * Fetch audits for multiple skills under the same source (one HTTP call,
 * comma-separated `skills=` param). Use this from listing surfaces — group
 * search results by source first, then issue one batch per group.
 */
export async function fetchAuditsBatch(
  source: string,
  skillKeys: string[],
): Promise<Map<string, AuditSummary>> {
  const out = new Map<string, AuditSummary>();
  if (skillKeys.length === 0 || !source) return out;

  // Cache check: serve everything we already have, batch the misses.
  const now = Date.now();
  const misses: string[] = [];
  for (const key of skillKeys) {
    const hit = cache.get(cacheKey(source, key));
    if (hit && hit.expiresAt > now) {
      out.set(key, hit.summary);
    } else {
      misses.push(key);
    }
  }
  if (misses.length === 0) return out;

  const url = new URL(ENDPOINT);
  url.searchParams.set("source", source);
  url.searchParams.set("skills", misses.join(","));

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      for (const key of misses) out.set(key, UNAVAILABLE);
      return out;
    }
    const body = (await res.json()) as Record<string, AuditRaw>;
    for (const key of misses) {
      const raw = body[key] ?? {};
      const summary = summarize(raw);
      cache.set(cacheKey(source, key), { expiresAt: now + CACHE_TTL_MS, summary });
      out.set(key, summary);
    }
    return out;
  } catch {
    for (const key of misses) out.set(key, UNAVAILABLE);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only — clears the in-process cache between tests. */
export function __clearAuditCache(): void {
  cache.clear();
}
