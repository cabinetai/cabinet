import test from "node:test";
import assert from "node:assert/strict";
import { __clearAuditCache, fetchAuditsBatch, summarize } from "./audits";

const ENDPOINT = "https://add-skill.vercel.sh/audit";
type FetchFn = typeof globalThis.fetch;

function withMockFetch<T>(
  mock: (req: Request | string | URL) => Promise<Response> | Response,
  fn: () => Promise<T>,
): Promise<T> {
  const original: FetchFn = globalThis.fetch;
  globalThis.fetch = (async (input, _init) => mock(input as Request | string | URL)) as FetchFn;
  __clearAuditCache();
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
    __clearAuditCache();
  });
}

test("summarize counts safe/low risks as passing", () => {
  const s = summarize({
    ath: { risk: "safe" },
    socket: { risk: "safe", alerts: 0 },
    snyk: { risk: "low" },
    zeroleaks: { risk: "high" },
  });
  assert.equal(s.total, 4);
  assert.equal(s.passed, 3);
  assert.equal(s.available, true);
});

test("summarize treats missing audit blocks as not present", () => {
  const s = summarize({
    ath: { risk: "safe" },
    socket: undefined,
    snyk: { risk: "high" },
    zeroleaks: undefined,
  });
  assert.equal(s.total, 2);
  assert.equal(s.passed, 1);
});

test("summarize on empty input is unavailable", () => {
  const s = summarize({});
  assert.equal(s.available, false);
  assert.equal(s.total, 0);
  assert.equal(s.passed, 0);
});

test("fetchAuditsBatch hits the audit endpoint with correct query", async () => {
  let observedUrl = "";
  await withMockFetch(
    (req) => {
      observedUrl = String(req);
      return new Response(
        JSON.stringify({
          alpha: { ath: { risk: "safe" }, socket: { risk: "safe", alerts: 0 }, snyk: { risk: "low" } },
          beta: { ath: { risk: "high" } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
    async () => {
      const map = await fetchAuditsBatch("anthropics/skills", ["alpha", "beta"]);
      assert.ok(observedUrl.startsWith(ENDPOINT));
      assert.match(observedUrl, /source=anthropics%2Fskills/);
      assert.match(observedUrl, /skills=alpha%2Cbeta/);
      assert.equal(map.get("alpha")?.passed, 3);
      assert.equal(map.get("alpha")?.total, 3);
      assert.equal(map.get("beta")?.passed, 0);
      assert.equal(map.get("beta")?.total, 1);
    },
  );
});

test("fetchAuditsBatch caches per (source, key) within TTL", async () => {
  let calls = 0;
  await withMockFetch(
    () => {
      calls += 1;
      return new Response(JSON.stringify({ alpha: { ath: { risk: "safe" } } }), { status: 200 });
    },
    async () => {
      await fetchAuditsBatch("foo/bar", ["alpha"]);
      await fetchAuditsBatch("foo/bar", ["alpha"]);
      await fetchAuditsBatch("foo/bar", ["alpha"]);
      assert.equal(calls, 1);
    },
  );
});

test("fetchAuditsBatch only re-requests cache misses, returns hits from memory", async () => {
  const seen: string[] = [];
  await withMockFetch(
    (req) => {
      seen.push(String(req));
      const url = new URL(String(req));
      const requested = (url.searchParams.get("skills") || "").split(",");
      const body: Record<string, unknown> = {};
      for (const k of requested) body[k] = { ath: { risk: "safe" } };
      return new Response(JSON.stringify(body), { status: 200 });
    },
    async () => {
      await fetchAuditsBatch("foo/bar", ["a", "b"]);
      await fetchAuditsBatch("foo/bar", ["a", "b", "c"]);
      assert.equal(seen.length, 2);
      // Second call should only request "c" — a and b are cached.
      assert.match(seen[1], /skills=c$/);
    },
  );
});

test("fetchAuditsBatch returns unavailable on HTTP error", async () => {
  await withMockFetch(
    () => new Response("nope", { status: 502 }),
    async () => {
      const map = await fetchAuditsBatch("foo/bar", ["alpha"]);
      assert.equal(map.get("alpha")?.available, false);
    },
  );
});

test("fetchAuditsBatch returns unavailable when fetch throws (e.g. timeout abort)", async () => {
  await withMockFetch(
    () => {
      throw new Error("network down");
    },
    async () => {
      const map = await fetchAuditsBatch("foo/bar", ["alpha"]);
      assert.equal(map.get("alpha")?.available, false);
    },
  );
});

test("fetchAuditsBatch with empty input returns empty map without fetching", async () => {
  let calls = 0;
  await withMockFetch(
    () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    },
    async () => {
      const map = await fetchAuditsBatch("foo/bar", []);
      assert.equal(map.size, 0);
      assert.equal(calls, 0);
    },
  );
});
