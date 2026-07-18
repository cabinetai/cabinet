/**
 * Journey checks that run against an ALREADY-BOOTED Cabinet pair.
 *
 * These know nothing about booting — scripts/test-bundle.mjs owns that, and
 * hands us the two live origins. Keeping them separate means every new
 * assertion costs seconds of CI, not another 90-second boot.
 *
 * Every check must fail loudly rather than vacuously: prefer asserting on a
 * concrete value over asserting "no exception was thrown". Note that the
 * catch-all SPA route (src/app/[...slug]/page.tsx) does not exclude /api, so
 * an unmatched /api/* path answers 200 with the app-shell HTML instead of
 * 404ing. A check that asserts only on a status code will pass against a
 * route that does not exist. Always assert on the body too.
 */

function step(msg) { console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`); }
function ok(msg)   { console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`); }

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** fetch + parse JSON, with a hard timeout so a hung daemon fails the run. */
async function getJson(url, { timeoutMs = 5000 } = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON — most likely the SPA catch-all serving HTML. Leave body null;
    // the caller's body assertion is what turns that into a loud failure.
    body = null;
  }
  return { status: res.status, body };
}

/**
 * The app fetches the daemon over HTTP and proxies its health. A 502
 * {status:"unreachable"} here means the two processes booted but cannot see
 * each other — a stale runtime-ports.json, or a daemon that died after its
 * own /health went green.
 *
 * This says nothing about the daemon token: the daemon exempts /health from
 * its auth gate (cabinet-daemon.ts, `url.pathname !== "/health" && ...`), so
 * this passes with a wrong token, an empty token, or no token at all.
 * checkDaemonTokenGate and checkAuthenticatedProxy are what cover that.
 */
async function checkDaemonBridge({ appUrl }) {
  step("app → daemon bridge (GET /api/health/daemon)");
  const { status, body } = await getJson(`${appUrl}/api/health/daemon`);
  assert(
    status === 200,
    `GET /api/health/daemon → ${status} (expected 200). ` +
      `Body: ${JSON.stringify(body)}. The app cannot reach the daemon — ` +
      `check runtime-ports.json.`
  );
  assert(
    body?.status === "ok",
    `bridge returned 200 but status was ${JSON.stringify(body?.status)} (expected "ok")`
  );
  ok("app can reach the daemon over HTTP");
}

/**
 * The daemon must reject an unauthenticated caller on a token-gated route.
 *
 * This is the control for checkAuthenticatedProxy: without it, a proxy call
 * that succeeds proves nothing, because it would succeed just the same if the
 * auth gate were switched off entirely.
 */
async function checkDaemonTokenGate({ daemonUrl }) {
  step("daemon token gate (GET /search with no Authorization)");
  const { status, body } = await getJson(`${daemonUrl}/search?q=smoke`);
  assert(
    status === 401,
    `unauthenticated GET /search → ${status} (expected 401). ` +
      `Body: ${JSON.stringify(body)}. The daemon is serving a token-gated ` +
      `route to an anonymous caller — the auth gate is not on.`
  );
  ok("daemon rejects unauthenticated callers with 401");
}

/**
 * The real bridge test: /api/search is the app's authenticated proxy. It
 * resolves the daemon token via getOrCreateDaemonToken() and forwards an
 * Authorization: Bearer header. If the app and the daemon disagree about the
 * token, the daemon 401s and the route answers 503 "Daemon returned 401".
 *
 * A 200 here proves the app holds a token the daemon accepts — which, given
 * checkDaemonTokenGate proved the gate is on, is exactly what independent
 * /health probes on each process cannot see.
 *
 * Assert on the response *shape*, not on hits: the bundle test boots against a
 * throwaway temp data dir, so the result set is legitimately empty and
 * asserting on it would be vacuous.
 */
async function checkAuthenticatedProxy({ appUrl }) {
  step("app → daemon authenticated proxy (GET /api/search)");
  const { status, body } = await getJson(`${appUrl}/api/search?q=smoke`);
  assert(
    status === 200,
    `GET /api/search → ${status} (expected 200). ` +
      `Body: ${JSON.stringify(body)}. A 503 carrying "Daemon returned 401" ` +
      `means the app's daemon token is not the one the daemon is enforcing.`
  );
  assert(
    Array.isArray(body?.pages) && typeof body?.tookMs === "number",
    `proxy returned 200 but the body is not a SearchResponse: ${JSON.stringify(body)}`
  );
  ok("app is authenticated to the daemon (search round-trip)");
}

const CHECKS = [checkDaemonBridge, checkDaemonTokenGate, checkAuthenticatedProxy];

/** Run every check in order. Throws on the first failure. */
export async function runChecks(ctx) {
  for (const check of CHECKS) {
    await check(ctx);
  }
  console.log(`\n\x1b[32m✓ All ${CHECKS.length} journey check(s) passed.\x1b[0m`);
}
