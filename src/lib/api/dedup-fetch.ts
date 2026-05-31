/**
 * In-flight request dedup for the client.
 *
 * Multiple components that mount on first paint all fetch the same read-only
 * endpoint in parallel (audit #188: providers ×3, overview ×5, health ×3, …).
 * `dedupFetch` returns the same Promise for identical URL+method pairs that
 * are already in flight, so the underlying network request fires once no
 * matter how many callers race in the same tick.
 *
 * Optionally, `ttlMs` keeps the most recent response cached for N ms so calls
 * that fire *just after* the first one completes still get a hit instead of
 * re-issuing the request. Off by default because it's unsafe for endpoints
 * whose data can mutate between renders.
 *
 * Dedup and caching are only applied to GET (and HEAD) requests — mutations
 * are always sent through.
 */

interface InflightEntry {
  promise: Promise<Response>;
  at: number;
}

interface CachedEntry {
  response: Response;
  at: number;
}

const inflight = new Map<string, InflightEntry>();
const recent = new Map<string, CachedEntry>();

function keyFor(url: string, init?: RequestInit): string {
  const method = (init?.method ?? "GET").toUpperCase();
  return `${method} ${url}`;
}

function isReadOnlyMethod(init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD";
}

export interface DedupFetchOptions {
  /** Keep the most recent response cached for this many ms. 0 = disabled. */
  ttlMs?: number;
}

export function dedupFetch(
  url: string,
  init?: RequestInit,
  options?: DedupFetchOptions
): Promise<Response> {
  if (!isReadOnlyMethod(init)) {
    return fetch(url, init);
  }

  const key = keyFor(url, init);
  const ttl = options?.ttlMs ?? 0;

  if (ttl > 0) {
    const cached = recent.get(key);
    if (cached && Date.now() - cached.at < ttl) {
      return Promise.resolve(cached.response.clone());
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing.promise.then((res) => res.clone());
  }

  const promise = fetch(url, init).then((res) => {
    if (ttl > 0 && res.ok) {
      recent.set(key, { response: res.clone(), at: Date.now() });
    }
    inflight.delete(key);
    return res;
  });

  // If the fetch rejects, drop the inflight entry so callers can retry.
  promise.catch(() => {
    inflight.delete(key);
  });

  inflight.set(key, { promise, at: Date.now() });
  return promise.then((res) => res.clone());
}

/** Clear both the in-flight and short-TTL caches (useful for tests). */
export function resetDedupFetch(): void {
  inflight.clear();
  recent.clear();
}

/**
 * Drop cached GET responses whose dedup key contains `urlIncludes`.
 * Call after mutations (e.g. delete) so the next list refresh cannot
 * resurrect stale rows from the short TTL cache.
 */
export function invalidateDedupFetch(urlIncludes?: string): void {
  if (!urlIncludes) {
    recent.clear();
    return;
  }
  for (const key of recent.keys()) {
    if (key.includes(urlIncludes)) {
      recent.delete(key);
    }
  }
}
