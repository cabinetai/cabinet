# CI Smoke Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn CI from "the app builds and both processes answer /health" into "the app builds, both processes boot, authenticate each other, serve the core knowledge-base journey, stream a real PTY, and render in a browser" — without adding more than one extra CI machine to the per-PR path.

**Architecture:** Cabinet runs as a **pair** of processes — the Next.js app (port 4000, 146 API routes) and the daemon (`server/cabinet-daemon.ts`, port 4100; owns PTY, the WebSocket event bus, cron, search index, file watcher). They discover each other via `<cabinetDir>/.cabinet-state/runtime-ports.json` and authenticate with a bearer token at `data/.agents/.runtime/daemon-token`.

`scripts/test-bundle.mjs` already boots that real pair through `cabinetai run` and asserts two health endpoints. **That boot is the expensive part and it is already paid for.** This plan keeps a single boot and hangs a suite of journey checks off it — each new assertion costs seconds, not CI minutes. We extract the checks into `scripts/smoke-checks.mjs` so `test-bundle.mjs` stays the boot harness and the checks stay independently reviewable.

Platform coverage is then bought deliberately: Ubuntu on every PR (as today), Windows nightly + on packaging/native path changes only, macOS bolted onto the release job that already spins up a macOS box.

**Tech Stack:** Node 22, ESM `.mjs` scripts, `node:test` for units, `ws` (already a prod dep) for WebSocket checks, `@playwright/test` (one new devDependency, one test), GitHub Actions.

## Global Constraints

- **Node 22** everywhere (`actions/setup-node@v4`, `node-version: 22`).
- All smoke scripts are **ESM `.mjs`**, run by plain `node` — no `tsx`, no transpile step. (`test-bundle.mjs` invokes `tsx` only to run the `cabinetai` TypeScript source; that stays.)
- **No new production dependencies.** The only new devDependency permitted is `@playwright/test`.
- **Reuse the existing single boot.** Do not add a second `cabinetai run` except in Task 7, which explicitly needs a differently-configured process.
- Every check must be **cross-platform** (Windows + macOS + Linux) from Task 9 onward. No `process.kill(-pid)`, no `"dir"` symlinks, no bare `.bin/tsx`.
- CI must set **`SHELL=/bin/bash`** for the smoke job. `server/pty/manager.ts:103` defaults to `process.env.SHELL || "/bin/zsh"`, and zsh is not installed on the GitHub Ubuntu runner.
- Per-PR CI budget is **one Ubuntu runner**. Windows is nightly + `paths:`-filtered. macOS is release-only.
- Checks must **fail loudly, never vacuously**. Every check task includes a step that injects a fault and confirms the check actually goes red.

---

## File Structure

| File | Responsibility |
|---|---|
| `.github/workflows/ci.yml` (modify) | Per-PR gate. Flip `lint-and-unit` to blocking (Task 1); add `SHELL=/bin/bash` (Task 6); add Playwright step (Task 8). |
| `.github/workflows/nightly.yml` (create) | Windows + Ubuntu boot smoke, nightly + `paths:`-filtered (Task 10). |
| `.github/workflows/electron-release.yml` (modify) | Add a boot assertion to the existing macOS job (Task 11). |
| `scripts/test-bundle.mjs` (modify) | Stays the **boot harness**: build check → stage bundle → `cabinetai run` → wait for health → hand off to the check suite → clean up. Made cross-platform in Task 9. |
| `scripts/smoke-checks.mjs` (create) | The **journey checks**. Exports `runChecks({ appUrl, daemonUrl })`, plus one exported `check*` function per journey. Pure assertions against an already-running pair; knows nothing about booting. |
| `e2e/render.spec.ts` (create) | The single Playwright test: the app shell mounts and the console is clean. |
| `playwright.config.ts` (create) | Chromium-only, headless, `baseURL` from `CABINET_APP_URL`. |

---

## Task 1: Make lint and unit tests blocking

`.github/workflows/ci.yml` marks the `lint-and-unit` job `continue-on-error: true`, with a comment claiming lint errors and that the `cabinet-v2` tests need an untracked `data/` fixture. **That comment is stale.** The `cabinet-v2` test was refactored to build its own temp fixture (`test/cabinet-v2.test.ts:18-22`), and both commands now exit 0 on this checkout:

```
lint exit code: 0     (0 errors, 110 warnings)
test exit code: 0     (391 pass, 0 fail)
```

So 391 passing tests currently cannot block a merge, for no reason. This task costs zero CI minutes and zero new machines.

**Files:**
- Modify: `.github/workflows/ci.yml:44-70`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Later tasks do not depend on this.

- [ ] **Step 1: Verify the claim on a clean checkout**

The local tree has an ambient `data/` directory and a `~/.cabinet` home; CI has neither. Prove the suite passes without them before trusting it as a gate.

```bash
cd "$(mktemp -d)"
git clone --depth 1 file:///home/sam/cabinet/cabinet clean-check
cd clean-check
npm ci
npm run lint; echo "LINT EXIT: $?"
npm test;     echo "TEST EXIT: $?"
```

Expected: `LINT EXIT: 0` and `TEST EXIT: 0`.

If either is non-zero, **stop and report** — the rest of this task is invalid and the real failures must be fixed first. Do not "fix" it by re-adding `continue-on-error`.

- [ ] **Step 2: Flip the job to blocking**

In `.github/workflows/ci.yml`, replace the `lint-and-unit` job header and its stale comment:

```yaml
  # Blocking: lint (0 errors) and the full unit suite (391 tests) must stay
  # green. Both are fast (<2 min) and run on the same Ubuntu runner class as
  # the build job.
  lint-and-unit:
    name: Lint & unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm test
```

Note both the `continue-on-error: true` line and the `(non-blocking)` suffix in `name:` are gone.

- [ ] **Step 3: Guard against warning creep**

Lint passes with 110 warnings. Without a ceiling, that number only grows. Pin it so new warnings fail but the existing backlog does not block anyone. In `package.json`, change the `lint` script:

```json
"lint": "eslint --max-warnings 110 src server electron scripts test eslint.config.mjs next.config.ts",
```

- [ ] **Step 4: Confirm the ceiling holds**

```bash
npm run lint; echo "EXIT: $?"
```

Expected: `EXIT: 0`, ending in `✖ 110 problems (0 errors, 110 warnings)`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: make lint and unit tests blocking

The non-blocking comment was stale: cabinet-v2 now builds its own temp
fixture and lint has 0 errors. 391 tests were unable to block a merge.
Pin --max-warnings 110 so the existing backlog doesn't block, but new
warnings do."
```

---

## Task 2: Extract a check suite and assert the app→daemon bridge

Today `test-bundle.mjs` proves the app answers `/api/health` and the daemon answers `/health` — independently. It never proves they can *talk to each other*. `GET /api/health/daemon` (`src/app/api/health/daemon/route.ts`) is the app fetching the daemon's health over HTTP and returning 502 `{status:"unreachable"}` on failure. It is the single best "is the pair actually wired up" check, and it catches the stale-`runtime-ports.json` failure mode.

This task also creates the module every later check hangs off.

**Files:**
- Create: `scripts/smoke-checks.mjs`
- Modify: `scripts/test-bundle.mjs` (after the daemon-health step, before the final success log)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `runChecks({ appUrl: string, daemonUrl: string }): Promise<void>` — runs every registered check in order; throws `Error` on the first failure.
  - `ok(msg: string): void`, `step(msg: string): void` — console helpers, re-exported for checks.
  - `checkDaemonBridge({ appUrl }): Promise<void>`
  - Later tasks add `checkDaemonTokenGate`, `checkEventsWs`, `checkPagesAndSearch`, `checkPtyShell` to the `CHECKS` array.

- [ ] **Step 1: Write the check module**

Create `scripts/smoke-checks.mjs`:

```js
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
```

- [ ] **Step 2: Wire it into the boot harness**

In `scripts/test-bundle.mjs`, add the import next to the other imports at the top:

```js
import { runChecks } from "./smoke-checks.mjs";
```

Then, **after** the existing "Verifying the app serves HTML" block and **before** the final `console.log` success line, insert:

```js
// ─── 6. Journey checks against the live pair ──────────────────────────────────

try {
  await runChecks({
    appUrl: `http://127.0.0.1:${appPort}`,
    daemonUrl: `http://127.0.0.1:${daemonPort}`,
  });
} catch (err) {
  fail(`journey check failed: ${err.message}`);
}
```

`fail()` already prints the child's captured output and cleans up, so a check failure gives you the app+daemon logs for free.

- [ ] **Step 3: Run it against a real boot and watch it pass**

```bash
npm run build && npm run electron:prep && npm run test:bundle
```

Expected: the existing steps pass, then:

```
▶ app → daemon bridge (GET /api/health/daemon)
  ✓ app can reach the daemon over HTTP

✓ All 1 journey check(s) passed.
✓ Bundle boot smoke test passed — `cabinetai run` boots the real bundle.
```

- [ ] **Step 4: Prove the check is not vacuous**

A check that cannot go red is worse than no check. Temporarily break the bridge by pointing it at a dead port — in `scripts/smoke-checks.mjs`, change the URL in `checkDaemonBridge` to `${appUrl}/api/health/daemon-nope`, then:

```bash
npm run test:bundle
```

Expected: **FAIL**, with `GET /api/health/daemon-nope → 404 (expected 200)`.

Now revert that one-character edit back to `/api/health/daemon` and re-run to confirm green again.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-checks.mjs scripts/test-bundle.mjs
git commit -m "test: assert the app can actually reach the daemon

Extract journey checks into smoke-checks.mjs, hung off the boot that
test-bundle.mjs already pays for. First check: GET /api/health/daemon,
which catches a stale runtime-ports.json or a broken daemon token — a
failure mode both independent /health checks miss."
```

---

## Task 3: Assert the daemon's bearer-token gate

The daemon guards **every** HTTP route except `/health` with a bearer token (`server/cabinet-daemon.ts:1507`), and every WebSocket upgrade too (`:2062`). That token is the only thing between localhost and arbitrary PTY spawn. Nothing tests it. A regression that drops the gate is a remote-code-execution-class bug and CI would say nothing.

The token comes from `GET /api/daemon/auth` on the app (`src/app/api/daemon/auth/route.ts`), which returns `{ token, wsOrigin }` — the same path the browser uses. Fetching it here means we test that route too, and avoids guessing at the on-disk token path.

**Files:**
- Modify: `scripts/smoke-checks.mjs`

**Interfaces:**
- Consumes: `step`, `ok`, `assert`, `getJson` from Task 2.
- Produces:
  - `fetchDaemonToken({ appUrl }): Promise<string>` — later tasks (4, 5, 6) call this to authenticate.
  - `checkDaemonTokenGate({ appUrl, daemonUrl }): Promise<void>`

- [ ] **Step 1: Write the token fetcher and the gate check**

Append to `scripts/smoke-checks.mjs`, above the `CHECKS` array:

```js
/**
 * The daemon bearer token, fetched the way the browser fetches it. Also
 * exercises GET /api/daemon/auth.
 */
export async function fetchDaemonToken({ appUrl }) {
  const { status, body } = await getJson(`${appUrl}/api/daemon/auth`);
  assert(status === 200, `GET /api/daemon/auth → ${status} (expected 200)`);
  assert(
    typeof body?.token === "string" && body.token.length > 0,
    `GET /api/daemon/auth returned no token: ${JSON.stringify(body)}`
  );
  return body.token;
}

/**
 * Every daemon route except /health requires the bearer token. If this check
 * ever fails open, any local process could spawn a PTY through the daemon.
 */
export async function checkDaemonTokenGate({ appUrl, daemonUrl }) {
  step("daemon bearer-token gate");

  // /health is the one intentional exception — it must stay open (the app's
  // bridge and `cabinetai doctor` both poll it unauthenticated).
  const health = await getJson(`${daemonUrl}/health`);
  assert(health.status === 200, `daemon /health → ${health.status} (expected 200, it is allowlisted)`);
  ok("/health is reachable without a token (by design)");

  // A guarded route with NO token must be refused.
  const noToken = await getJson(`${daemonUrl}/search?q=smoke`);
  assert(
    noToken.status === 401,
    `daemon GET /search with NO token → ${noToken.status} (expected 401). ` +
      `THE DAEMON TOKEN GATE IS OPEN — any local process can drive the PTY.`
  );
  ok("guarded route rejects a missing token with 401");

  // A guarded route with a WRONG token must be refused.
  const badToken = await getJson(`${daemonUrl}/search?q=smoke`, {
    headers: { authorization: "Bearer 0000000000000000000000000000000000000000000000000000000000000000" },
  });
  assert(
    badToken.status === 401,
    `daemon GET /search with a WRONG token → ${badToken.status} (expected 401)`
  );
  ok("guarded route rejects an invalid token with 401");

  // The real token must be accepted — otherwise the gate is bricked shut and
  // the 401s above would pass for the wrong reason.
  const token = await fetchDaemonToken({ appUrl });
  const good = await getJson(`${daemonUrl}/search?q=smoke`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert(
    good.status === 200,
    `daemon GET /search with the REAL token → ${good.status} (expected 200)`
  );
  ok("guarded route accepts the real token");
}
```

The final positive assertion matters: without it, a daemon that 401s *everything* would pass the first three assertions.

- [ ] **Step 2: Register the check**

Update the `CHECKS` array:

```js
const CHECKS = [checkDaemonBridge, checkDaemonTokenGate];
```

- [ ] **Step 3: Run and watch it pass**

```bash
npm run test:bundle
```

Expected:

```
▶ daemon bearer-token gate
  ✓ /health is reachable without a token (by design)
  ✓ guarded route rejects a missing token with 401
  ✓ guarded route rejects an invalid token with 401
  ✓ guarded route accepts the real token
```

- [ ] **Step 4: Prove it catches an open gate**

In `server/cabinet-daemon.ts:1508`, temporarily neuter the gate:

```ts
  if (false && url.pathname !== "/health" && !isDaemonTokenValid(requestToken(req, url))) {
```

Then rebuild the daemon bundle and re-run:

```bash
npm run electron:prep && npm run test:bundle
```

Expected: **FAIL** with `daemon GET /search with NO token → 200 (expected 401). THE DAEMON TOKEN GATE IS OPEN`.

**Revert the `false &&` edit** and re-run `npm run electron:prep && npm run test:bundle` to confirm green.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-checks.mjs
git commit -m "test: assert the daemon bearer-token gate holds

The token is the only thing between localhost and arbitrary PTY spawn,
and nothing tested it. Asserts 401 on missing and invalid tokens, and
200 on the real one (so a bricked-shut daemon can't pass for the wrong
reason)."
```

---

## Task 4: Assert the WebSocket upgrade path

The browser talks to the daemon **directly over WebSocket** — it is not proxied through the app. Two paths exist (`server/cabinet-daemon.ts:2059-2080`): `/events` (the event bus) and `/` (PTY). The upgrade handler enforces the same token, passed either as an `Authorization` header or a `?token=` query param (`requestToken`, `:397`). None of this is tested at any level.

Note: `handleEventBusConnection` (`:1135`) sends **no** greeting frame on connect — it only registers a subscriber. So the honest assertion is "the upgrade succeeds with a token and is refused without one", not "we received a hello".

**Files:**
- Modify: `scripts/smoke-checks.mjs`

**Interfaces:**
- Consumes: `step`, `ok`, `assert`, `fetchDaemonToken` from Tasks 2-3.
- Produces: `checkEventsWs({ appUrl, daemonUrl }): Promise<void>`

- [ ] **Step 1: Import the WebSocket client**

`ws` is already a production dependency (used by the daemon itself), so this adds nothing to the tree. Add to the top of `scripts/smoke-checks.mjs`:

```js
import { WebSocket } from "ws";
```

- [ ] **Step 2: Write the check**

Append above the `CHECKS` array:

```js
/** Open a WS and settle on the first outcome: open, error, or timeout. */
function connectWs(url, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ outcome: "timeout" });
    }, timeoutMs);

    ws.on("open", () => {
      clearTimeout(timer);
      resolve({ outcome: "open", ws });
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      // ws surfaces a rejected upgrade as "Unexpected server response: 401"
      resolve({ outcome: "error", message: String(err?.message ?? err) });
    });
  });
}

/**
 * The event-bus WebSocket. The browser connects to this DIRECTLY (not through
 * the Next proxy), so a broken upgrade handler silently kills every live
 * update in the UI while every HTTP health check stays green.
 */
export async function checkEventsWs({ appUrl, daemonUrl }) {
  step("daemon event-bus WebSocket (/events)");
  const wsBase = daemonUrl.replace(/^http/, "ws");

  // Without a token the upgrade must be refused with 401.
  const anon = await connectWs(`${wsBase}/events`);
  assert(
    anon.outcome === "error" && /401/.test(anon.message),
    `WS /events with NO token → ${anon.outcome} ${anon.message ?? ""} ` +
      `(expected an error citing 401). The WS upgrade gate is open.`
  );
  if (anon.ws) anon.ws.terminate();
  ok("unauthenticated WS upgrade is refused with 401");

  // With the token (as ?token=, the way the browser passes it) it must open.
  const token = await fetchDaemonToken({ appUrl });
  const authed = await connectWs(`${wsBase}/events?token=${encodeURIComponent(token)}`);
  assert(
    authed.outcome === "open",
    `WS /events with the real token → ${authed.outcome} ${authed.message ?? ""} (expected open)`
  );
  ok("authenticated WS upgrade succeeds");
  authed.ws.close();
}
```

- [ ] **Step 3: Register the check**

```js
const CHECKS = [checkDaemonBridge, checkDaemonTokenGate, checkEventsWs];
```

- [ ] **Step 4: Run and watch it pass**

```bash
npm run test:bundle
```

Expected:

```
▶ daemon event-bus WebSocket (/events)
  ✓ unauthenticated WS upgrade is refused with 401
  ✓ authenticated WS upgrade succeeds
```

- [ ] **Step 5: Prove it catches a broken upgrade route**

In `server/cabinet-daemon.ts:2069`, temporarily misspell the path so `/events` falls through to the 404 branch:

```ts
  if (url.pathname === "/events-nope" || url.pathname === "/api/daemon/events") {
```

```bash
npm run electron:prep && npm run test:bundle
```

Expected: **FAIL** — `WS /events with the real token → error Unexpected server response: 404 (expected open)`.

**Revert** and re-run `npm run electron:prep && npm run test:bundle` to confirm green.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-checks.mjs
git commit -m "test: assert the daemon WebSocket upgrade path

The browser hits /events directly, not through the Next proxy, so a
broken upgrade handler kills every live update while HTTP health stays
green. Asserts 401 without a token and a successful upgrade with one."
```

---

## Task 5: Assert the page → search journey

This is the app's core loop, and one check drags in the daemon's entire spine: writing a page hits `page-io` and the filesystem, the daemon's **chokidar watcher** notices the new file, the **FlexSearch index** picks it up, and `/api/search` proxies through to the daemon's `/search`. If sqlite is broken, the watcher is dead, or the index never builds, this goes red — and nothing else in CI would.

Contracts, read from source:
- `POST /api/pages/<path>` with `{ title }` creates a page (`src/app/api/pages/[...path]/route.ts:61`).
- `PUT /api/pages/<path>` with `{ content, frontmatter }` writes it (`:43`).
- `GET /api/pages/<path>` reads it back (`:30`).
- `DELETE /api/pages/<path>` removes it (`:126`).
- `GET /api/search?q=...` proxies to the daemon (`src/app/api/search/route.ts`).

Indexing is **asynchronous** (watcher → index), so the search assertion must poll, not assume.

**Files:**
- Modify: `scripts/smoke-checks.mjs`

**Interfaces:**
- Consumes: `step`, `ok`, `assert`, `getJson` from Task 2.
- Produces: `checkPagesAndSearch({ appUrl }): Promise<void>`

- [ ] **Step 1: Write the check**

Append above the `CHECKS` array:

```js
/**
 * Create a page → read it back → find it in search → delete it.
 *
 * One assertion, the whole daemon spine: page-io writes the file, the chokidar
 * watcher sees it, the FlexSearch index absorbs it, and /api/search proxies to
 * the daemon to find it again.
 */
export async function checkPagesAndSearch({ appUrl }) {
  step("page CRUD → search index round-trip");

  // A token unique to this run, so we never match a fixture or a previous run.
  const marker = `smoke${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const slug = `ci-smoke-${marker}`;
  const pageUrl = `${appUrl}/api/pages/${slug}`;

  // Create.
  const created = await fetch(pageUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: `CI Smoke ${marker}` }),
    signal: AbortSignal.timeout(10_000),
  });
  assert(
    created.status === 201 || created.status === 200,
    `POST ${pageUrl} → ${created.status} (expected 201). Body: ${await created.text()}`
  );
  ok(`created page ${slug}`);

  try {
    // Write body content containing the marker, so search has something unique
    // to match on.
    const written = await fetch(pageUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `# CI Smoke\n\nThis page exists only to prove the search index works: ${marker}\n`,
        frontmatter: {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    assert(written.status === 200, `PUT ${pageUrl} → ${written.status} (expected 200)`);
    ok("wrote page content");

    // Read back — proves it actually landed on disk, not just that the route
    // returned 200.
    const read = await getJson(pageUrl);
    assert(read.status === 200, `GET ${pageUrl} → ${read.status} (expected 200)`);
    assert(
      JSON.stringify(read.body).includes(marker),
      `page read back but the content did not contain the marker ${marker}: ${JSON.stringify(read.body).slice(0, 400)}`
    );
    ok("read the page back with its content intact");

    // Search — the watcher and the index are asynchronous, so poll.
    const deadline = Date.now() + 30_000;
    let found = false;
    let lastBody = null;
    while (Date.now() < deadline && !found) {
      const res = await getJson(`${appUrl}/api/search?q=${marker}`, { timeoutMs: 8000 });
      lastBody = res.body;
      if (res.status === 200 && JSON.stringify(res.body ?? "").includes(marker)) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert(
      found,
      `the new page never appeared in /api/search within 30s. ` +
        `The daemon's file watcher or FlexSearch index is not working. ` +
        `Last response: ${JSON.stringify(lastBody).slice(0, 400)}`
    );
    ok("the new page was indexed and is searchable");
  } finally {
    // Always clean up, even if an assertion above threw — a leaked page would
    // pollute the next run's search results.
    await fetch(pageUrl, { method: "DELETE", signal: AbortSignal.timeout(10_000) }).catch(() => {});
  }

  // Deletion must actually remove it.
  const gone = await getJson(pageUrl);
  assert(gone.status === 404, `GET ${pageUrl} after DELETE → ${gone.status} (expected 404)`);
  ok("deleted the page");
}
```

- [ ] **Step 2: Register the check**

```js
const CHECKS = [checkDaemonBridge, checkDaemonTokenGate, checkEventsWs, checkPagesAndSearch];
```

- [ ] **Step 3: Run and watch it pass**

```bash
npm run test:bundle
```

Expected:

```
▶ page CRUD → search index round-trip
  ✓ created page ci-smoke-smoke...
  ✓ wrote page content
  ✓ read the page back with its content intact
  ✓ the new page was indexed and is searchable
  ✓ deleted the page
```

If the search step times out on a *correct* build, the watcher may be refusing to start because of the daemon's big-tree FD guard (`server/cabinet-daemon.ts:204-217`). The test data dir is a fresh `mkdtemp`, so it should be far under the 1500-dir threshold — if it trips, that is a genuine bug worth reporting, not something to paper over with `CABINET_ALLOW_BIG_TREE=1`.

- [ ] **Step 4: Prove the search assertion is not vacuous**

Search for a marker that cannot exist, by changing the query in the poll loop to `q=${marker}zzz`:

```js
      const res = await getJson(`${appUrl}/api/search?q=${marker}zzz`, { timeoutMs: 8000 });
```

```bash
npm run test:bundle
```

Expected: **FAIL** after ~30s with `the new page never appeared in /api/search within 30s`.

**Revert** to `q=${marker}` and re-run to confirm green.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-checks.mjs
git commit -m "test: assert the page -> search index round-trip

One check, the whole daemon spine: page-io writes the file, the chokidar
watcher sees it, FlexSearch indexes it, /api/search proxies to the daemon
and finds it. Polls, because indexing is async."
```

---

## Task 6: Assert a real PTY streams

`adapterType=shell` bypasses the agent/provider system entirely and spawns a plain shell through node-pty (`server/cabinet-daemon.ts:1076` → `server/pty/manager.ts:88-103`). That means **we can test the PTY contract without any agent CLI installed** — no `claude`, no `codex`, no API keys. This is the node-pty native-module contract end to end, and it is the exact same test that will prove ConPTY works when we add Windows in Task 10.

The PTY WebSocket is the daemon's root path `/`, with the session configured by query params (`handlePtyConnection`, `:671-677`): `id`, `adapterType`, `prompt`, `providerId`, `cwd`. Output streams back as raw frames; input is written as raw frames.

**Critical:** `manager.ts:103` picks `process.env.SHELL || "/bin/zsh"`. The GitHub Ubuntu runner has no zsh, so CI must export `SHELL=/bin/bash`. We set that in Task 10's workflow edits and in the CI job here.

**Files:**
- Modify: `scripts/smoke-checks.mjs`
- Modify: `.github/workflows/ci.yml` (add `SHELL` to the smoke step's env)

**Interfaces:**
- Consumes: `step`, `ok`, `assert`, `fetchDaemonToken`, `connectWs` from Tasks 2-4.
- Produces: `checkPtyShell({ appUrl, daemonUrl }): Promise<void>`

- [ ] **Step 1: Write the check**

Append above the `CHECKS` array:

```js
/**
 * Spawn a real PTY and prove bytes flow both ways.
 *
 * adapterType=shell bypasses the agent/provider system (daemon:1076) and
 * spawns $SHELL / cmd.exe straight through node-pty, so this needs no agent
 * CLI, no API key, and no network. It is the node-pty native-module contract
 * end to end — and on Windows it is the ConPTY contract.
 *
 * `echo` works identically in POSIX shells and cmd.exe, so the same check runs
 * on every platform.
 */
export async function checkPtyShell({ appUrl, daemonUrl }) {
  step("PTY shell session (node-pty round-trip)");

  const token = await fetchDaemonToken({ appUrl });
  const wsBase = daemonUrl.replace(/^http/, "ws");
  const sessionId = `ci-smoke-pty-${Date.now().toString(36)}`;
  const sentinel = `cabinet-pty-ok-${Math.random().toString(36).slice(2, 8)}`;

  const conn = await connectWs(
    `${wsBase}/?id=${sessionId}&adapterType=shell&token=${encodeURIComponent(token)}`
  );
  assert(
    conn.outcome === "open",
    `PTY WS → ${conn.outcome} ${conn.message ?? ""} (expected open)`
  );
  const ws = conn.ws;
  ok("PTY WebSocket opened");

  try {
    const sawSentinel = new Promise((resolve) => {
      let buffer = "";
      ws.on("message", (data) => {
        buffer += data.toString();
        // The shell echoes our typed command back too, so only resolve on the
        // sentinel appearing on a line of its OWN — i.e. more than once, or
        // after a newline following the command. Simplest robust form: wait
        // until we've seen it twice (once echoed, once as output).
        const hits = buffer.split(sentinel).length - 1;
        if (hits >= 2) resolve(true);
      });
      setTimeout(() => resolve(false), 25_000);
    });

    // Give the shell a moment to finish printing its prompt before typing.
    await new Promise((r) => setTimeout(r, 2000));
    ws.send(`echo ${sentinel}\r`);

    const streamed = await sawSentinel;
    assert(
      streamed,
      `the PTY never echoed "${sentinel}" back within 25s. node-pty spawned but ` +
        `produced no output — on Linux CI this usually means $SHELL is unset and ` +
        `the daemon fell back to /bin/zsh, which is not installed. Set SHELL=/bin/bash.`
    );
    ok("shell spawned, accepted input, and streamed output back");
  } finally {
    ws.close();
  }
}
```

- [ ] **Step 2: Register the check**

```js
const CHECKS = [
  checkDaemonBridge,
  checkDaemonTokenGate,
  checkEventsWs,
  checkPagesAndSearch,
  checkPtyShell,
];
```

- [ ] **Step 3: Run and watch it pass**

```bash
SHELL=/bin/bash npm run test:bundle
```

Expected:

```
▶ PTY shell session (node-pty round-trip)
  ✓ PTY WebSocket opened
  ✓ shell spawned, accepted input, and streamed output back

✓ All 5 journey check(s) passed.
```

- [ ] **Step 4: Prove it catches a dead node-pty**

Simulate the exact CI failure mode — a shell binary that does not exist:

```bash
SHELL=/nonexistent/shell npm run test:bundle
```

Expected: **FAIL** with `the PTY never echoed "cabinet-pty-ok-..." back within 25s`.

Then confirm green again with `SHELL=/bin/bash npm run test:bundle`.

- [ ] **Step 5: Pin SHELL in CI**

In `.github/workflows/ci.yml`, the boot smoke step must not depend on the runner's ambient `$SHELL`. Replace the existing step:

```yaml
      - name: Boot smoke test (cabinetai run → app + daemon + journey checks)
        env:
          # server/pty/manager.ts falls back to /bin/zsh, which the Ubuntu
          # runner does not have. Without this the PTY check fails.
          SHELL: /bin/bash
        run: npm run test:bundle
```

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-checks.mjs .github/workflows/ci.yml
git commit -m "test: assert a real PTY spawns and streams

adapterType=shell bypasses the agent/provider system, so this tests the
node-pty native contract with no agent CLI and no API key. Pin
SHELL=/bin/bash in CI — manager.ts falls back to /bin/zsh, which the
Ubuntu runner doesn't have."
```

---

## Task 7: Assert the KB_PASSWORD auth proxy

Auth is on **iff** `KB_PASSWORD` is a non-empty env var (`src/lib/auth/kb-auth.ts:45`), and it is enforced in `src/proxy.ts` (the Next proxy — note there is no `middleware.ts`). The unit tests cover the *logic* (`request-gate.test.ts`, `kb-auth.test.ts`); what they cannot cover is whether the **proxy matcher is actually wired to the routes**. A matcher regression silently un-gates a self-hosted instance that its owner believes is password-protected.

This is the one check that needs its own boot, because `KB_PASSWORD` must be set at process start. That is ~90 extra seconds on a runner we are already renting — no new machine. It is worth it for an auth bypass.

**Files:**
- Modify: `scripts/test-bundle.mjs` (parameterise the boot; add a second, gated boot)
- Modify: `scripts/smoke-checks.mjs` (add the check, but keep it OUT of the default `CHECKS` array)

**Interfaces:**
- Consumes: `step`, `ok`, `assert`, `getJson` from Task 2.
- Produces: `checkAuthProxy({ appUrl, password }): Promise<void>` — exported, but **not** in `CHECKS`; the harness calls it explicitly against the password-protected boot.

- [ ] **Step 1: Write the check**

Append to `scripts/smoke-checks.mjs` (do **not** add it to `CHECKS`):

```js
/**
 * With KB_PASSWORD set, src/proxy.ts must gate the app. The unit tests cover
 * the auth LOGIC; only this covers whether the proxy matcher is actually wired
 * to the routes. A matcher regression silently un-gates a self-hosted instance
 * whose owner believes it is password-protected.
 *
 * Called explicitly by the harness against a password-protected boot — it is
 * NOT part of the default CHECKS array.
 */
export async function checkAuthProxy({ appUrl, password }) {
  step("KB_PASSWORD auth proxy");

  // /api/health is deliberately allowlisted so probes keep working.
  const health = await getJson(`${appUrl}/api/health`);
  assert(health.status === 200, `/api/health → ${health.status} (expected 200, it is allowlisted)`);
  ok("/api/health stays open (by design)");

  // A protected API route with no cookie must NOT return data.
  const anon = await fetch(`${appUrl}/api/tree`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  assert(
    anon.status === 401 || anon.status === 403 || (anon.status >= 300 && anon.status < 400),
    `GET /api/tree with NO auth → ${anon.status} (expected 401/403/redirect). ` +
      `THE AUTH PROXY IS NOT GATING THE API — a password-protected instance is exposed.`
  );
  ok(`unauthenticated API request is refused (${anon.status})`);

  // Logging in must mint a cookie...
  const login = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  assert(
    login.status >= 200 && login.status < 400,
    `POST /api/auth/login with the correct password → ${login.status} (expected 2xx/3xx)`
  );
  const cookie = login.headers.get("set-cookie");
  assert(cookie, "login succeeded but set no cookie");
  ok("login with the correct password mints a cookie");

  // ...and that cookie must open the door.
  const authed = await fetch(`${appUrl}/api/tree`, {
    headers: { cookie: cookie.split(";")[0] },
    signal: AbortSignal.timeout(10_000),
  });
  assert(
    authed.status === 200,
    `GET /api/tree WITH the auth cookie → ${authed.status} (expected 200)`
  );
  ok("the auth cookie grants access");
}
```

- [ ] **Step 2: Parameterise the boot in `test-bundle.mjs`**

The harness currently boots once with a fixed env. Wrap the boot in a function so it can run twice.

**Delete** the existing inline section `3. Boot via \`cabinetai run\`` (the `const appPort = await freePort()` line through the `child.on("exit", ...)` handler) **and** the existing section `4. Assert health` (both `pollHealth` blocks). `boot()` below absorbs both of them verbatim — leaving the originals in place would boot twice and fail on a port clash.

In their place, add the reusable `boot()`, which keeps behaviour identical for the default call:

```js
/**
 * Boot `cabinetai run` against the staged bundle and wait for both processes
 * to be healthy. Returns the live origins. Extra env is merged in, which is
 * how the auth-proxy boot turns the password gate on.
 */
async function boot({ extraEnv = {}, label = "default" } = {}) {
  const appPort = await freePort();
  const daemonPort = await freePort();

  step(`Booting \`cabinetai run\` [${label}] (app:${appPort}, daemon:${daemonPort})...`);

  const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
  if (!fs.existsSync(tsx)) fail(`tsx not found at ${tsx} — run npm ci first`);

  child = spawn(
    tsx,
    [
      path.join(CABINETAI_DIR, "src", "index.ts"),
      "run",
      "--app-version", TEST_VERSION,
      "--no-open",
      "--data-dir", DATA_DIR,
    ],
    {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CABINET_APP_PORT: String(appPort),
        CABINET_DAEMON_PORT: String(daemonPort),
        ...extraEnv,
      },
    }
  );
  child.stdout.on("data", (d) => { childOutput += d; });
  child.stderr.on("data", (d) => { childOutput += d; });
  child.on("exit", (code) => {
    if (!cleanedUp && !stopping) {
      fail(`\`cabinetai run\` exited early (code ${code}) before becoming healthy`);
    }
  });

  const appStatus = await pollHealth(`http://127.0.0.1:${appPort}/api/health`, 90_000);
  if (appStatus !== 200) fail(`app GET /api/health never returned 200 (got ${appStatus ?? "no response"})`);
  ok("app GET /api/health → 200");

  const daemonStatus = await pollHealth(`http://127.0.0.1:${daemonPort}/health`, 30_000);
  if (daemonStatus !== 200) fail(`daemon GET /health never returned 200 (got ${daemonStatus ?? "no response"})`);
  ok("daemon GET /health → 200");

  return {
    appUrl: `http://127.0.0.1:${appPort}`,
    daemonUrl: `http://127.0.0.1:${daemonPort}`,
  };
}

/** Kill the current boot without tearing down the whole test. */
function stopBoot() {
  stopping = true;
  if (child && child.pid) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  child = null;
  stopping = false;
}
```

Add `let stopping = false;` next to the existing `let cleanedUp = false;` declaration. The `child.on("exit")` guard now checks `stopping`, so a deliberate `stopBoot()` is not mistaken for a crash.

- [ ] **Step 3: Run both boots**

Replace the journey-check block from Task 2 with:

```js
// ─── 6. Journey checks against the live pair ──────────────────────────────────

const origins = await boot({ label: "default" });

try {
  await runChecks(origins);
} catch (err) {
  fail(`journey check failed: ${err.message}`);
}

// ─── 7. Auth proxy: a SECOND boot, with the password gate on ──────────────────
//
// KB_PASSWORD must be present at process start, so this needs its own boot
// (~90s on a runner we're already renting — no new machine). Worth it: this is
// the only test that proves the proxy matcher actually gates the API routes.

stopBoot();

const AUTH_PASSWORD = "ci-smoke-password";
const authOrigins = await boot({
  label: "auth",
  extraEnv: { KB_PASSWORD: AUTH_PASSWORD },
});

try {
  await checkAuthProxy({ appUrl: authOrigins.appUrl, password: AUTH_PASSWORD });
} catch (err) {
  fail(`auth proxy check failed: ${err.message}`);
}
```

And extend the import at the top:

```js
import { runChecks, checkAuthProxy } from "./smoke-checks.mjs";
```

- [ ] **Step 4: Run and watch both boots pass**

```bash
SHELL=/bin/bash npm run test:bundle
```

Expected: the 5 default checks pass against the first boot, then:

```
▶ Booting `cabinetai run` [auth] (app:..., daemon:...)
▶ KB_PASSWORD auth proxy
  ✓ /api/health stays open (by design)
  ✓ unauthenticated API request is refused (307)
  ✓ login with the correct password mints a cookie
  ✓ the auth cookie grants access
```

- [ ] **Step 5: Prove it catches an un-gated API**

In `src/proxy.ts`, temporarily remove `/api/tree` from coverage by narrowing the matcher at `:104` to something that cannot match it (e.g. `matcher: ["/nothing"]`). Rebuild and re-run:

```bash
npm run build && npm run electron:prep && SHELL=/bin/bash npm run test:bundle
```

Expected: **FAIL** with `GET /api/tree with NO auth → 200 (expected 401/403/redirect). THE AUTH PROXY IS NOT GATING THE API`.

**Revert `src/proxy.ts`**, rebuild, and confirm green.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-bundle.mjs scripts/smoke-checks.mjs
git commit -m "test: assert the KB_PASSWORD auth proxy gates the API

Unit tests cover the auth logic; nothing covered whether the proxy
matcher is actually wired to the routes. A matcher regression silently
un-gates an instance its owner thinks is password-protected. Needs its
own boot (KB_PASSWORD is read at start), on the runner we already have."
```

---

## Task 8: One Playwright test — the app renders

`/api/health` returning 200 is entirely compatible with the UI white-screening: a bad client bundle, a hydration crash, or a missing static asset all leave the server perfectly healthy. One headless Chromium test closes that gap for ~40s on the runner we already have.

**Keep this to one test.** The temptation to grow a UI suite here is exactly the "overdoing it" this plan is avoiding. If a real UI suite is wanted later, it deserves its own decision.

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/render.spec.ts`
- Modify: `package.json` (devDependency + `test:e2e` script)
- Modify: `.github/workflows/ci.yml` (install the browser, run the test)

**Interfaces:**
- Consumes: a running app at `CABINET_APP_URL` (default `http://127.0.0.1:4000`).
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write the config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

// Deliberately minimal: one browser, one test. This exists to catch a
// white-screening UI that still serves a healthy /api/health — not to be a UI
// suite. Growing it is a separate decision.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.CABINET_APP_URL || "http://127.0.0.1:4000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the test**

Create `e2e/render.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("the app shell renders without console errors", async ({ page }) => {
  const errors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(`uncaught: ${err.message}`);
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "GET / should return 200").toBe(200);

  // A white screen still has a <body>, so assert on real rendered content:
  // the app must paint something with actual layout.
  const body = page.locator("body");
  await expect(body).toBeVisible();

  await page.waitForLoadState("networkidle");

  const painted = await body.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { height: rect.height, text: (el.innerText || "").trim().length };
  });
  expect(painted.height, "body should have real height (a white screen has none)").toBeGreaterThan(100);
  expect(painted.text, "body should contain rendered text").toBeGreaterThan(0);

  // A hydration crash shows up here even when the HTML looks fine.
  expect(errors, `console errors on load:\n${errors.join("\n")}`).toHaveLength(0);
});
```

- [ ] **Step 4: Add the script**

In `package.json`:

```json
"test:e2e": "playwright test",
```

- [ ] **Step 5: Run it against a live app and watch it pass**

In one terminal boot the app; in another run the test:

```bash
npm run test:e2e
```

Expected: `1 passed`.

If it fails on console errors that are pre-existing and benign, do **not** delete the assertion — narrow it, filtering only the specific known-noisy messages by exact text, with a comment naming each one.

- [ ] **Step 6: Prove it catches a white screen**

A render check that cannot go red is theatre. Point it at a route that returns a healthy 200 with no app shell — `/api/health` serves a bare JSON body, which is exactly what a white screen looks like to a naive check.

Temporarily change the `page.goto` line in `e2e/render.spec.ts`:

```ts
  const response = await page.goto("/api/health", { waitUntil: "domcontentloaded" });
```

Then, with the app still running:

```bash
npm run test:e2e
```

Expected: **FAIL** on `body should have real height (a white screen has none)`.

**Revert** to `page.goto("/", ...)` and re-run to confirm green.

- [ ] **Step 7: Wire into CI**

In `.github/workflows/ci.yml`, in the `build-and-install-smoke` job, after the boot smoke step:

```yaml
      - name: Install Chromium for the render test
        run: npx playwright install --with-deps chromium

      - name: Render smoke test (the UI actually paints)
        env:
          SHELL: /bin/bash
        run: |
          npm run start &
          npx wait-on http://127.0.0.1:4000/api/health -t 90000
          npm run test:e2e
```

`wait-on` is not currently a dependency. Rather than add one, poll with the tooling already present:

```yaml
      - name: Render smoke test (the UI actually paints)
        env:
          SHELL: /bin/bash
        run: |
          npm run start &
          for i in $(seq 1 90); do
            curl -sf http://127.0.0.1:4000/api/health > /dev/null && break
            sleep 1
          done
          curl -sf http://127.0.0.1:4000/api/health > /dev/null || { echo "app never became healthy"; exit 1; }
          npm run test:e2e
```

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e/render.spec.ts package.json package-lock.json .github/workflows/ci.yml
git commit -m "test: one Playwright test that the UI actually paints

/api/health returning 200 is compatible with a white screen: a bad client
bundle or a hydration crash leaves the server perfectly healthy. One
headless Chromium test, deliberately not a UI suite."
```

---

## Task 9: Make the boot harness cross-platform

`scripts/test-bundle.mjs` is POSIX-only in exactly three places. Fixing them is a prerequisite for Task 10 and changes nothing on Linux.

1. `fs.symlinkSync(STANDALONE, APP_DIR, "dir")` (`:153`) — on Windows a `"dir"` symlink needs Developer Mode or admin. A **junction** needs neither. The codebase already makes this exact choice elsewhere (`src/lib/storage/page-io.ts:106`: `win32 ? "junction" : "dir"`).
2. `process.kill(-child.pid, ...)` (`:74-75`) — negative PIDs are POSIX process groups; they do not exist on Windows. Windows needs `taskkill /pid <pid> /T /F`. (This mirrors the fork the app itself makes in `src/lib/agents/adapters/utils.ts:88`.)
3. `path.join(ROOT, "node_modules", ".bin", "tsx")` (`:172`) — on Windows the executable is `tsx.cmd`.

**Files:**
- Modify: `scripts/test-bundle.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `test-bundle.mjs` that runs unchanged on win32, darwin, and linux.

- [ ] **Step 1: Fix the symlink**

Replace line `:153`:

```js
fs.symlinkSync(STANDALONE, APP_DIR, process.platform === "win32" ? "junction" : "dir");
```

A junction needs no elevated privileges, which is why the app itself uses one (`src/lib/storage/page-io.ts:106`).

- [ ] **Step 2: Fix process termination**

Replace the kill logic in `cleanup()` (`:71-76`) and in `stopBoot()`:

```js
function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    // No process groups on Windows — taskkill /T walks the child tree, which
    // is how we reach the app and daemon that `cabinetai run` spawned.
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    return;
  }
  // POSIX: child is a detached group leader, so signal the whole group.
  try { process.kill(-pid, "SIGTERM"); } catch {}
  try { process.kill(-pid, "SIGKILL"); } catch {}
}
```

Add `spawnSync` to the existing `child_process` import:

```js
import { spawn, spawnSync } from "child_process";
```

Then call `killTree(child.pid)` from both `cleanup()` and `stopBoot()` in place of the inline `process.kill` calls.

- [ ] **Step 3: Fix the tsx path**

Replace `:172`:

```js
const tsx = path.join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx"
);
```

- [ ] **Step 4: Confirm Linux is unchanged**

```bash
SHELL=/bin/bash npm run test:bundle
```

Expected: all checks still pass exactly as before. This task is a refactor — a behaviour change on Linux means you broke something.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-bundle.mjs
git commit -m "test: make the boot harness cross-platform

Three POSIX-only constructs blocked running this on Windows: a 'dir'
symlink (needs admin; junction doesn't), process.kill(-pid) (no process
groups on Windows; taskkill /T instead), and the bare .bin/tsx path
(tsx.cmd on Windows). Prerequisite for the Windows boot smoke."
```

---

## Task 10: Boot smoke on Windows — nightly, not per-PR

Windows is where every platform fork lives — `taskkill`-by-pid vs POSIX process groups (`src/lib/agents/adapters/utils.ts:88`), `shell:true` + `buildWindowsShellCommand` for every CLI probe (`provider-cli.ts:277`), ConPTY vs `$SHELL` (`pty/manager.ts:103`), junctions vs symlinks, `tar -xf` vs `-xzf` in the updater. Today `electron-release.yml` **builds** the Windows app and uploads the artifact — it never **starts** it. A Windows native-module or spawn regression ships with zero signal.

But Windows runners bill at **2× minutes**, so this does **not** go on every PR. It runs nightly, plus on PRs that actually touch packaging, native, or platform-forked code.

**Files:**
- Create: `.github/workflows/nightly.yml`

**Interfaces:**
- Consumes: the cross-platform `test-bundle.mjs` from Task 9.
- Produces: nothing.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/nightly.yml`:

```yaml
name: Nightly cross-platform smoke

# Windows is where every platform fork lives (taskkill vs process groups,
# ConPTY vs $SHELL, junctions vs symlinks, tar -xf vs -xzf). Today the release
# workflow BUILDS the Windows app but never BOOTS it.
#
# Windows runners bill at 2x, so this is deliberately NOT on every PR:
#   * nightly, and
#   * on PRs that touch packaging / native / platform-forked code.
on:
  schedule:
    - cron: "0 4 * * *" # 04:00 UTC daily
  workflow_dispatch:
  pull_request:
    paths:
      - "scripts/**"
      - "cabinetai/**"
      - "electron/**"
      - "server/pty/**"
      - "src/lib/agents/adapters/**"
      - "src/lib/agents/provider-cli.ts"
      - "src/lib/system/**"
      - "forge.config.cjs"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/nightly.yml"

concurrency:
  group: nightly-${{ github.ref }}
  cancel-in-progress: true

jobs:
  boot-smoke:
    name: Boot smoke (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false # a Windows-only break must not hide a Linux-only one
      matrix:
        os: [windows-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type-check & build
        run: npm run build

      - name: Assemble standalone bundle
        run: npm run electron:prep

      # The same boot + journey checks the per-PR Ubuntu job runs — now against
      # ConPTY, junctions, and taskkill.
      - name: Boot smoke + journey checks
        env:
          # POSIX only: pty/manager.ts falls back to /bin/zsh, which the Ubuntu
          # runner lacks. Windows ignores this and uses ComSpec/cmd.exe.
          SHELL: /bin/bash
        run: npm run test:bundle
```

- [ ] **Step 2: Validate the workflow parses**

```bash
npx --yes @action-validator/cli .github/workflows/nightly.yml || \
  node -e "const y=require('js-yaml');const fs=require('fs');y.load(fs.readFileSync('.github/workflows/nightly.yml','utf8'));console.log('YAML OK')"
```

Expected: `YAML OK` (or a clean action-validator run).

- [ ] **Step 3: Dry-run it on a branch**

Push the branch and trigger it manually — this is the only way to actually learn whether Windows boots, and it is the entire point of the task:

```bash
git push -u origin HEAD
gh workflow run nightly.yml --ref "$(git branch --show-current)"
gh run watch
```

Expected: **both** matrix legs green.

If the Windows leg fails, that is not a workflow bug to route around — it is the first real Windows signal this repo has ever had. Read the failure, and report it. Likely candidates, in order: node-pty/ConPTY in the PTY check, `better-sqlite3` ABI in the boot, and the junction staging in Task 9.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci: nightly Windows + Ubuntu boot smoke

Windows is where every platform fork lives, and the release workflow
builds it but never boots it. Windows runners bill at 2x, so this is
nightly + paths-filtered rather than per-PR."
```

---

## Task 11: Assert the macOS build boots — on the box we already rent

macOS runners bill at **10× minutes**, so adding one to the PR path is the wrong place to spend. But `electron-release.yml` **already spins up a macOS box** to sign and notarize. Adding a boot assertion there is close to free, and it fires at the moment it matters most: immediately before a release goes out.

macOS has a fork nothing else covers — node-pty's `spawn-helper` must be copied out of the asar bundle to a writable path (`electron/main.cjs:338`, darwin-only). If that breaks, every terminal and every agent in the shipped macOS app is dead, and today nothing would tell us.

**Files:**
- Modify: `.github/workflows/electron-release.yml` (the `electron-macos` job)

**Interfaces:**
- Consumes: the cross-platform `test-bundle.mjs` from Task 9.
- Produces: nothing.

- [ ] **Step 1: Add the boot assertion before publish**

In `.github/workflows/electron-release.yml`, in the `electron-macos` job, insert a step **before** the "Build and publish Electron app" step (so a broken build never gets signed, notarized, and published):

```yaml
      # macOS bills at 10x, so we don't add a macOS PR runner — but we're
      # already renting this box to sign and notarize. Boot the bundle here,
      # right before we publish. This is the only thing covering the darwin-only
      # node-pty spawn-helper copy (electron/main.cjs:338); if that breaks,
      # every terminal and agent in the shipped macOS app is dead.
      - name: Boot smoke + journey checks (pre-publish gate)
        run: |
          npm run build
          npm run electron:prep
          npm run test:bundle
```

- [ ] **Step 2: Validate the workflow parses**

```bash
node -e "const y=require('js-yaml');const fs=require('fs');y.load(fs.readFileSync('.github/workflows/electron-release.yml','utf8'));console.log('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 3: Dry-run without publishing**

The workflow already supports a no-tag VALIDATE mode, but it **skips the macOS job** when no tag is given (`if: ${{ inputs.tag != '' }}`). To exercise the new step without publishing, temporarily change that condition to `if: ${{ always() }}`, comment out the publish step, dispatch against the branch, then revert both.

```bash
gh workflow run electron-release.yml --ref "$(git branch --show-current)"
gh run watch
```

Expected: the boot smoke step passes on macOS. **Revert the `if:` and the commented-out publish step before committing.**

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/electron-release.yml
git commit -m "ci: boot the macOS bundle before publishing it

macOS bills at 10x so it gets no PR runner — but we already rent a macOS
box to sign and notarize, so gate the publish on a real boot. This is the
only coverage of the darwin-only node-pty spawn-helper copy."
```

---

## Resulting CI budget

| When | Machines | What it proves |
|---|---|---|
| **Every PR** | 2× `ubuntu-latest` (unchanged count) | Build + type-check, both install flows, the pair boots and authenticates, daemon token gate holds, WS upgrades, page→search round-trip, a real PTY streams, the auth proxy gates, the UI paints, lint + 391 unit tests. |
| **PRs touching packaging/native/platform code** | + 1× `windows-latest` (2× billing) | The same boot + journey checks against ConPTY, junctions, and taskkill. |
| **Nightly** | 1× `windows-latest` + 1× `ubuntu-latest` | Same. |
| **Release** | 0 extra (rides the existing macOS box) | The macOS bundle actually boots before it is signed, notarized, and published. |

## Explicitly out of scope

Named here so nobody quietly adds them later:

- A full Playwright UI suite, or Playwright on more than one browser. Task 8 is **one** test; growing it is a separate decision.
- Electron UI automation (Spectron/WebDriver). Slow, flaky, and the boot smoke already covers what actually breaks.
- A macOS PR runner. 10× billing for coverage Task 11 gets for free.
- Real agent CLI runs (`claude`, `codex`, `cursor`, …). They need API keys, they are non-deterministic, and they are slow. The `shell` adapter in Task 6 covers the PTY contract those all share.
- The OS shell-out routes (`/api/system/reveal`, `open-path`, `pick-directory`, `terminal/open`). They shell out to Finder/Explorer/`xdg-open` and will hang or fail in a headless runner.
