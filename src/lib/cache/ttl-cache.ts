/**
 * Server-side TTL cache with in-flight dedupe.
 *
 * Cabinet's API routes repeatedly do the same expensive filesystem walks
 * (readCabinetOverview, buildTree, listAllPersonas…). This wraps a fetcher
 * with a short TTL and single-flight semantics so N concurrent requests for
 * the same key collapse into one underlying call.
 *
 * Module-level state is fine for Next.js API routes — they run in the same
 * node process and persist across requests in dev and prod.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  get(key: string, fetcher: () => Promise<T>): Promise<T>;
  invalidate(key?: string): void;
  invalidateWhere(predicate: (key: string) => boolean): void;
}

export function createTtlCache<T>(options: { ttlMs: number }): TtlCache<T> {
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, fetcher) {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now) return cached.value;

      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = fetcher()
        .then((value) => {
          entries.set(key, { value, expiresAt: Date.now() + options.ttlMs });
          return value;
        })
        .finally(() => {
          if (inflight.get(key) === promise) inflight.delete(key);
        });

      inflight.set(key, promise);
      return promise;
    },
    invalidate(key) {
      if (key === undefined) {
        entries.clear();
        return;
      }
      entries.delete(key);
    },
    invalidateWhere(predicate) {
      for (const key of entries.keys()) {
        if (predicate(key)) entries.delete(key);
      }
    },
  };
}
