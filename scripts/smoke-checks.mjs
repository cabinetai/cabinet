/**
 * Journey checks that run against an ALREADY-BOOTED Cabinet pair.
 *
 * These know nothing about booting — scripts/test-bundle.mjs owns that, and
 * hands us the two live origins. Keeping them separate means every new
 * assertion costs seconds of CI, not another 90-second boot.
 *
 * Every check must fail loudly rather than vacuously: prefer asserting on a
 * concrete value over asserting "no exception was thrown".
 */

export function step(msg) { console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`); }
export function ok(msg)   { console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`); }

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** fetch + parse JSON, with a hard timeout so a hung daemon fails the run. */
export async function getJson(url, { timeoutMs = 5000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/**
 * The app fetches the daemon over HTTP and proxies its health. A 502
 * {status:"unreachable"} here means the two processes booted but cannot see
 * each other — a stale runtime-ports.json or a bad daemon token.
 */
export async function checkDaemonBridge({ appUrl }) {
  step("app → daemon bridge (GET /api/health/daemon)");
  const { status, body } = await getJson(`${appUrl}/api/health/daemon`);
  assert(
    status === 200,
    `GET /api/health/daemon → ${status} (expected 200). ` +
      `Body: ${JSON.stringify(body)}. The app cannot reach the daemon — ` +
      `check runtime-ports.json and the daemon token.`
  );
  assert(
    body?.status === "ok",
    `bridge returned 200 but status was ${JSON.stringify(body?.status)} (expected "ok")`
  );
  ok("app can reach the daemon over HTTP");
}

const CHECKS = [checkDaemonBridge];

/** Run every check in order. Throws on the first failure. */
export async function runChecks(ctx) {
  for (const check of CHECKS) {
    await check(ctx);
  }
  console.log(`\n\x1b[32m✓ All ${CHECKS.length} journey check(s) passed.\x1b[0m`);
}
