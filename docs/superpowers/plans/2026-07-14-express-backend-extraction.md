# Express Backend Extraction (Migration Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all 147 Next.js API route handlers from an Express 5 app embedded in the existing daemon process (`server/cabinet-daemon.ts`), with a per-request cutover flag in `src/proxy.ts`, so the Next.js server stops being the API backend.

**Architecture:** The Next route-handler files stay in `src/app/api/**` and are mounted on Express verbatim: a generated static-import manifest maps file paths to Express paths, a small adapter converts Node req/res ↔ web `Request`/`Response`, and an Express middleware reproduces the `src/proxy.ts` auth gate plus daemon-bearer-token acceptance. The daemon's scheduler then triggers jobs against its own `/api` with the bearer token, deleting the kb-auth cookie-replication hack. Design rationale: `docs/superpowers/specs/2026-07-14-nextjs-to-express-tanstack-migration.md`.

**Tech Stack:** Express `^5.1.0` (named wildcards required), `next/server`'s `NextRequest`/`NextResponse` as plain classes, Node 20 (`Readable.toWeb`, `Headers.getSetCookie`), `tsx` runtime, `node:test` via `scripts/run-unit-tests.mjs`.

## Global Constraints

- Express must be `^5.1.0` — the manifest emits Express 5 path syntax (`:param`, named wildcard `*name` yielding `string[]`).
- No body-parsing middleware (`express.json()` etc.) on the API app, ever — route handlers consume the raw web stream (`req.json()`, `req.formData()`); a parser would drain it.
- Route files do NOT move and are NOT edited (single exception: `src/app/api/auth/check/route.ts` drops `next/headers`, Task 4). They must keep working under `next dev` throughout.
- Daemon endpoints, paths, and ports are unchanged: app 4000 / daemon 4100, discovery via `runtime-ports.json` and env (`src/lib/runtime/runtime-config.ts`).
- New server code lives in `server/http/` and imports `src` via relative paths (`../../src/lib/...`), matching the existing `server/` convention.
- `server/http/route-manifest.ts` is generated AND checked in (esbuild needs static imports to bundle the daemon for Electron). Regenerate with `npm run api:manifest`; CI-guard with `npm run api:manifest:check`.
- Auth semantics must be byte-identical to `src/proxy.ts` for browser calls: `/api/health*` open, `/api/auth/login` + `/api/auth/check` open in local mode, KB_PASSWORD cookie via `timingSafeEqualHex` vs `expectedToken()`, Cabinet Cloud ES256 JWT with `x-cabinet-user` injection and caller-header stripping.
- Cutover flag: `CABINET_API_VIA_DAEMON` — opt-in (`"1"`) in Task 6, default-on (`!== "0"`) in Task 7.
- Tests: `node:test`, files in `test/*.test.ts`. Single file: `npx tsx --test test/<file>.test.ts` (set `CABINET_DATA_DIR` to a temp dir if the file touches data). Full suite: `npm test` (hermetic launcher).
- Commit after every task; conventional-commit subjects (`feat:`, `refactor:`, `test:`) as in the repo history.

---

### Task 1: Route manifest generator

**Files:**
- Create: `server/http/manifest-lib.ts`
- Create: `scripts/generate-api-manifest.ts`
- Create: `server/http/route-manifest.ts` (generated output, checked in)
- Modify: `package.json` (two scripts)
- Test: `test/api-manifest-lib.test.ts`

**Interfaces:**
- Consumes: nothing (pure + fs walk of `src/app/api`).
- Produces: `routeFileToExpressPath(routeFile: string): string`, `extractMethods(source: string): HttpMethod[]`, `compareExpressPaths(a: string, b: string): number`, `HTTP_METHODS`, `type HttpMethod` (all from `server/http/manifest-lib.ts`); generated `export const apiRoutes: ReadonlyArray<{ path: string; methods: readonly HttpMethod[]; module: Record<string, unknown> }>` from `server/http/route-manifest.ts` (consumed by Task 4).

- [ ] **Step 1: Write the failing test**

Create `test/api-manifest-lib.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareExpressPaths,
  extractMethods,
  routeFileToExpressPath,
} from "../server/http/manifest-lib";

test("routeFileToExpressPath converts static, dynamic, and catch-all segments", () => {
  assert.equal(routeFileToExpressPath("src/app/api/health/route.ts"), "/api/health");
  assert.equal(
    routeFileToExpressPath("src/app/api/agents/[id]/jobs/[jobId]/route.ts"),
    "/api/agents/:id/jobs/:jobId"
  );
  assert.equal(routeFileToExpressPath("src/app/api/tree/[...path]/route.ts"), "/api/tree/*path");
});

test("extractMethods finds function and const exports, ignores non-method exports", () => {
  const source = [
    'export const dynamic = "force-dynamic";',
    "export async function GET(req: NextRequest) {}",
    "export function DELETE() {}",
    "export const POST = handler;",
  ].join("\n");
  assert.deepEqual(extractMethods(source).sort(), ["DELETE", "GET", "POST"]);
});

test("compareExpressPaths orders literals before params before wildcards", () => {
  const sorted = [
    "/api/agents/:id",
    "/api/agents/personas",
    "/api/tree/*path",
    "/api/tree/meta",
  ].sort(compareExpressPaths);
  assert.deepEqual(sorted, [
    "/api/agents/personas",
    "/api/agents/:id",
    "/api/tree/meta",
    "/api/tree/*path",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/api-manifest-lib.test.ts`
Expected: FAIL — cannot find module `../server/http/manifest-lib`.

- [ ] **Step 3: Write the library**

Create `server/http/manifest-lib.ts`:

```ts
/**
 * Pure helpers for generating the Express route manifest from the Next.js
 * route-handler files under src/app/api. Side-effect free so the unit suite
 * can exercise path conversion and ordering without touching disk.
 */

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Convert a route file path (relative to the repo root) into an Express 5
 * path. Next dynamic segments map onto Express params:
 *   [id]      -> :id
 *   [...path] -> *path  (Express 5 named wildcard: matches >=1 segment and
 *                        yields string[], the same shape Next hands handlers)
 */
export function routeFileToExpressPath(routeFile: string): string {
  const relative = routeFile
    .replace(/\\/g, "/")
    .replace(/^src\/app/, "")
    .replace(/\/route\.tsx?$/, "");
  const segments = relative
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
      if (catchAll) return `*${catchAll[1]}`;
      const dynamic = segment.match(/^\[(.+)\]$/);
      if (dynamic) return `:${dynamic[1]}`;
      return segment;
    });
  return "/" + segments.join("/");
}

/** Extract the HTTP methods a route module exports (function or const form). */
export function extractMethods(source: string): HttpMethod[] {
  const found: HttpMethod[] = [];
  for (const method of HTTP_METHODS) {
    const pattern = new RegExp(
      `^export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\s*=)`,
      "m"
    );
    if (pattern.test(source)) found.push(method);
  }
  return found;
}

/**
 * Express matches routes in registration order, so Next's static-beats-dynamic
 * precedence has to be reproduced by sorting: at each segment depth, literal
 * segments register before :params, and :params before *wildcards. Without
 * this, /api/agents/:id would swallow /api/agents/personas.
 */
function segmentRank(segment: string): number {
  if (segment.startsWith("*")) return 2;
  if (segment.startsWith(":")) return 1;
  return 0;
}

export function compareExpressPaths(a: string, b: string): number {
  const as = a.split("/").filter(Boolean);
  const bs = b.split("/").filter(Boolean);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const sa = as[i];
    const sb = bs[i];
    if (sa === undefined) return -1;
    if (sb === undefined) return 1;
    const rank = segmentRank(sa) - segmentRank(sb);
    if (rank !== 0) return rank;
    const alpha = sa.localeCompare(sb);
    if (alpha !== 0) return alpha;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/api-manifest-lib.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the generator script**

Create `scripts/generate-api-manifest.ts`:

```ts
/**
 * Generates server/http/route-manifest.ts: a static-import manifest of every
 * Next route handler under src/app/api, mounted by the daemon's Express app.
 *
 * Static (not dynamic) imports are required so esbuild can bundle the daemon
 * for the Electron package (scripts/prepare-electron-package.mjs).
 *
 * Usage:
 *   npm run api:manifest         # (re)write the manifest
 *   npm run api:manifest:check   # exit 1 if the manifest is out of date
 */
import fs from "node:fs";
import path from "node:path";
import {
  compareExpressPaths,
  extractMethods,
  routeFileToExpressPath,
} from "../server/http/manifest-lib";

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiRoot = path.join(repoRoot, "src", "app", "api");
const outFile = path.join(repoRoot, "server", "http", "route-manifest.ts");

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

const entries = findRouteFiles(apiRoot)
  .map((file) => {
    const relative = path.relative(repoRoot, file).replace(/\\/g, "/");
    return {
      relative,
      expressPath: routeFileToExpressPath(relative),
      methods: extractMethods(fs.readFileSync(file, "utf-8")),
    };
  })
  .filter((entry) => entry.methods.length > 0)
  .sort((a, b) => compareExpressPaths(a.expressPath, b.expressPath));

const imports = entries
  .map((entry, i) => `import * as r${i} from "../../${entry.relative.replace(/\.ts$/, "")}";`)
  .join("\n");

const rows = entries
  .map(
    (entry, i) =>
      `  { path: ${JSON.stringify(entry.expressPath)}, methods: ${JSON.stringify(entry.methods)}, module: r${i} },`
  )
  .join("\n");

const content = `// AUTO-GENERATED by scripts/generate-api-manifest.ts — do not edit by hand.
// Regenerate with: npm run api:manifest
/* eslint-disable */
${imports}

export const apiRoutes = [
${rows}
] as const;
`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : "";
  if (current !== content) {
    console.error("server/http/route-manifest.ts is out of date. Run: npm run api:manifest");
    process.exit(1);
  }
  console.log(`route-manifest.ts up to date (${entries.length} routes).`);
} else {
  fs.writeFileSync(outFile, content);
  console.log(`Wrote ${entries.length} routes to server/http/route-manifest.ts`);
}
```

Add to `package.json` `"scripts"` (after `"skills:sync"`):

```json
    "api:manifest": "tsx scripts/generate-api-manifest.ts",
    "api:manifest:check": "tsx scripts/generate-api-manifest.ts --check",
```

- [ ] **Step 6: Generate the manifest and eyeball it**

Run: `npm run api:manifest`
Expected: `Wrote 147 routes to server/http/route-manifest.ts` (146–147 depending on method extraction; investigate any file that was filtered out for having zero methods — there should be none).

Run: `grep -c "^import \* as r" server/http/route-manifest.ts` → expect the same count.
Run: `grep -n "agents/personas\|agents/:id" server/http/route-manifest.ts | head -5` → literal `personas` rows must appear before `:id` rows.
Run: `npm run api:manifest:check` → expect `route-manifest.ts up to date`.

- [ ] **Step 7: Commit**

```bash
git add server/http/manifest-lib.ts scripts/generate-api-manifest.ts server/http/route-manifest.ts test/api-manifest-lib.test.ts package.json
git commit -m "feat: generate Express route manifest from Next API route files"
```

---

### Task 2: Next-route → Express adapter

**Files:**
- Create: `server/http/next-route-adapter.ts`
- Modify: `package.json` (+ `express`, `@types/express`)
- Test: `test/next-route-adapter.test.ts`

**Interfaces:**
- Consumes: `HttpMethod`, `HTTP_METHODS` from `server/http/manifest-lib.ts` (Task 1).
- Produces: `type RouteHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Response | Promise<Response>`, `type RouteModule = Partial<Record<HttpMethod, RouteHandler>> & Record<string, unknown>`, `toNextRequest(req: express.Request): NextRequest`, `sendWebResponse(res: express.Response, out: Response): Promise<void>`, `mountRouteModule(app: express.Express, expressPath: string, mod: RouteModule): void` (consumed by Task 4).

- [ ] **Step 1: Install Express**

```bash
npm install express@^5.1.0
npm install -D @types/express@^5
```

Expected: both appear in `package.json`; `npm ls express` prints `express@5.x`.

- [ ] **Step 2: Write the failing test**

Create `test/next-route-adapter.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { NextResponse } from "next/server";
import { mountRouteModule, type RouteModule } from "../server/http/next-route-adapter";

async function withApp(
  mods: Array<[string, RouteModule]>,
  fn: (origin: string) => Promise<void>
): Promise<void> {
  const app = express();
  for (const [p, m] of mods) mountRouteModule(app, p, m);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("adapter passes params, query, and JSON body through and writes the Response", async () => {
  const mod: RouteModule = {
    POST: async (req, ctx) => {
      const params = await ctx.params;
      const body = (await req.json()) as { value: string };
      return NextResponse.json(
        { id: params.id, q: req.nextUrl.searchParams.get("q"), echo: body.value },
        { status: 201 }
      );
    },
  };
  await withApp([["/api/things/:id", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/things/42?q=hello`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: "42", q: "hello", echo: "x" });
  });
});

test("adapter yields catch-all params as a string array", async () => {
  const mod: RouteModule = {
    GET: async (_req, ctx) => NextResponse.json({ path: (await ctx.params).path }),
  };
  await withApp([["/api/tree/*path", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/tree/a/b/c.md`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { path: ["a", "b", "c.md"] });
  });
});

test("adapter forwards multiple Set-Cookie headers and streams bodies", async () => {
  const mod: RouteModule = {
    GET: async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("chunk1"));
          controller.enqueue(new TextEncoder().encode("chunk2"));
          controller.close();
        },
      });
      const res = new NextResponse(stream);
      res.headers.append("set-cookie", "a=1; Path=/");
      res.headers.append("set-cookie", "b=2; Path=/");
      return res;
    },
  };
  await withApp([["/api/stream", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/stream`);
    assert.deepEqual(res.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"]);
    assert.equal(await res.text(), "chunk1chunk2");
  });
});

test("adapter maps a thrown handler error to a 500 via the error middleware", async () => {
  const mod: RouteModule = {
    GET: async () => {
      throw new Error("boom");
    },
  };
  await withApp([["/api/broken", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/broken`);
    assert.equal(res.status, 500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test test/next-route-adapter.test.ts`
Expected: FAIL — cannot find module `../server/http/next-route-adapter`.

- [ ] **Step 4: Write the adapter**

Create `server/http/next-route-adapter.ts`:

```ts
import { Readable } from "node:stream";
import type {
  Express,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { NextRequest } from "next/server";
import { HTTP_METHODS, type HttpMethod } from "./manifest-lib";

/** Shape of a Next.js App Router route-handler module. */
export type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[]>> }
) => Response | Promise<Response>;

export type RouteModule = Partial<Record<HttpMethod, RouteHandler>> &
  Record<string, unknown>;

/**
 * Build a fetch-API request (NextRequest) from the incoming Node request.
 * The body is passed through as a stream so large payloads never buffer.
 */
export function toNextRequest(req: ExpressRequest): NextRequest {
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    // Node's fetch requires half-duplex for streamed request bodies;
    // RequestInit's TS type doesn't carry the field yet.
    ...({ duplex: "half" } as object),
  });
}

/** Stream a fetch-API Response back out over the Node response. */
export async function sendWebResponse(
  res: ExpressResponse,
  out: Response
): Promise<void> {
  res.status(out.status);
  out.headers.forEach((value, key) => {
    // Set-Cookie is multi-valued and collapsed by forEach; handled below.
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  for (const cookie of out.headers.getSetCookie()) {
    res.append("Set-Cookie", cookie);
  }
  if (!out.body) {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(
      out.body as unknown as import("node:stream/web").ReadableStream
    );
    body.once("error", reject);
    res.once("error", reject);
    res.once("close", resolve);
    body.pipe(res);
  });
}

const METHOD_SET = new Set<string>(HTTP_METHODS);

/** Mount every HTTP method a route module exports at the given Express path. */
export function mountRouteModule(
  app: Express,
  expressPath: string,
  mod: RouteModule
): void {
  for (const [name, handler] of Object.entries(mod)) {
    if (!METHOD_SET.has(name) || typeof handler !== "function") continue;
    const verb = name.toLowerCase() as "get";
    app[verb](expressPath, async (req, res, next) => {
      try {
        const out = await (handler as RouteHandler)(toNextRequest(req), {
          params: Promise.resolve(req.params as Record<string, string | string[]>),
        });
        await sendWebResponse(res, out);
      } catch (err) {
        next(err);
      }
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test test/next-route-adapter.test.ts`
Expected: PASS (4 tests). Note the 500 test passes because Express's default error handler answers when `next(err)` is called; Task 4 installs an explicit JSON one.

- [ ] **Step 6: Commit**

```bash
git add server/http/next-route-adapter.ts test/next-route-adapter.test.ts package.json package-lock.json
git commit -m "feat: adapter mounting Next route handlers on Express"
```

---

### Task 3: Express auth gate

**Files:**
- Create: `src/lib/auth/cloud-token.ts`
- Modify: `src/lib/auth/request-gate.ts` (delegate JWT logic to cloud-token, keep its exported API identical)
- Create: `server/http/auth-gate.ts`
- Test: `test/express-auth-gate.test.ts`

**Interfaces:**
- Consumes: `KB_AUTH_COOKIE`, `expectedToken()`, `isAuthEnabled()`, `timingSafeEqualHex()` from `src/lib/auth/kb-auth`; `isDaemonTokenValid()`, `getTokenFromAuthorizationHeader()` from `src/lib/agents/daemon-auth`.
- Produces: `cloudGateActive(): boolean`, `verifyCloudToken(token: string | undefined): Promise<string | null>`, `CABINET_JWT_COOKIE` (from `src/lib/auth/cloud-token.ts`); `apiAuthGate(req, res, next): Promise<void>` Express middleware (from `server/http/auth-gate.ts`, consumed by Task 4).

- [ ] **Step 1: Extract framework-free cloud-token verification**

Create `src/lib/auth/cloud-token.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Cookie the panel sets on `.runcabinet.com` (Supabase ES256 access token). */
export const CABINET_JWT_COOKIE = "cabinet_jwt";

// A remote JWK set caches keys and rate-limits refetches internally, so build
// it ONCE per JWKS URL and reuse it across requests. Memoized on the URL so an
// env change (e.g. in tests) still rebuilds.
let jwksMemo: {
  url: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  if (jwksMemo && jwksMemo.url === url) return jwksMemo.jwks;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksMemo = { url, jwks };
  return jwks;
}

/** Whether the hosted-edition Supabase-JWT gate is active for this process. */
export function cloudGateActive(): boolean {
  return (
    process.env.CABINET_CLOUD === "1" && !!process.env.CABINET_JWT_JWKS_URL
  );
}

/**
 * Verify a Supabase access token and return its subject, or null when the
 * token is missing/invalid/expired or no JWKS URL is configured (fail closed).
 * Pinning `algorithms: ["ES256"]` blocks algorithm-confusion attacks; jose
 * also enforces `exp`/`nbf`.
 */
export async function verifyCloudToken(
  token: string | undefined
): Promise<string | null> {
  const jwksUrl = process.env.CABINET_JWT_JWKS_URL;
  if (!jwksUrl || !token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      algorithms: ["ES256"],
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
```

Rewrite `src/lib/auth/request-gate.ts` so it keeps its exact exported API (`CABINET_JWT_COOKIE`, `cloudGateActive`, `cloudUserSub`, `hasValidKbAuthCookie`, `requireApiAuth`) but delegates: delete its local `jwksMemo`/`getJwks`/`cloudGateActive` and the `jose` import, and replace the body of `cloudUserSub` with:

```ts
export async function cloudUserSub(req: NextRequest): Promise<string | null> {
  return verifyCloudToken(req.cookies.get(CABINET_JWT_COOKIE)?.value);
}
```

with imports/re-exports at the top:

```ts
import {
  CABINET_JWT_COOKIE,
  cloudGateActive,
  verifyCloudToken,
} from "./cloud-token";

export { CABINET_JWT_COOKIE, cloudGateActive };
```

- [ ] **Step 2: Verify the refactor broke nothing**

Run: `npx tsx --test test/proxy.test.ts src/lib/auth/request-gate.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 3: Write the failing gate test**

Create `test/express-auth-gate.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// Must be set before kb-auth / daemon-auth are imported by the gate.
process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
process.env.CABINET_DAEMON_TOKEN = "test-daemon-token-0123456789abcdef";

import express from "express";
import { apiAuthGate } from "../server/http/auth-gate";
import { expectedToken, KB_AUTH_COOKIE } from "../src/lib/auth/kb-auth";

async function withGate(fn: (origin: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(apiAuthGate);
  app.get("/api/echo-user", (req, res) => {
    res.json({ user: req.headers["x-cabinet-user"] ?? null });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/auth/check", (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("gate passes everything when no password is set, stripping spoofed identity", async () => {
  delete process.env.KB_PASSWORD;
  await withGate(async (origin) => {
    const res = await fetch(`${origin}/api/echo-user`, {
      headers: { "x-cabinet-user": "spoofed" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });
});

test("gate 401s without a cookie and passes with the derived kb-auth cookie", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      const anonymous = await fetch(`${origin}/api/echo-user`);
      assert.equal(anonymous.status, 401);
      assert.deepEqual(await anonymous.json(), { error: "Unauthorized" });

      const token = await expectedToken();
      const authed = await fetch(`${origin}/api/echo-user`, {
        headers: { cookie: `${KB_AUTH_COOKIE}=${token}` },
      });
      assert.equal(authed.status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});

test("gate exempts /api/health and /api/auth/check even when locked", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      assert.equal((await fetch(`${origin}/api/health`)).status, 200);
      assert.equal((await fetch(`${origin}/api/auth/check`)).status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});

test("gate accepts the daemon bearer token in place of a cookie", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      const res = await fetch(`${origin}/api/echo-user`, {
        headers: { authorization: `Bearer ${process.env.CABINET_DAEMON_TOKEN}` },
      });
      assert.equal(res.status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx tsx --test test/express-auth-gate.test.ts`
Expected: FAIL — cannot find module `../server/http/auth-gate`.

- [ ] **Step 5: Write the gate**

Create `server/http/auth-gate.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import {
  getTokenFromAuthorizationHeader,
  isDaemonTokenValid,
} from "../../src/lib/agents/daemon-auth";
import {
  KB_AUTH_COOKIE,
  expectedToken,
  isAuthEnabled,
  timingSafeEqualHex,
} from "../../src/lib/auth/kb-auth";
import {
  CABINET_JWT_COOKIE,
  cloudGateActive,
  verifyCloudToken,
} from "../../src/lib/auth/cloud-token";

// Same carve-outs as src/proxy.ts: login + auth-check must answer before a
// session exists (local mode only; the cloud gate has no anonymous routes).
const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/check"]);

function parseCookies(header: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map;
}

/**
 * Express port of the src/proxy.ts auth gate for the daemon-hosted /api
 * surface, plus one addition: the daemon bearer token is accepted so
 * server-to-server calls (scheduler triggers, tooling) don't need a browser
 * cookie.
 */
export async function apiAuthGate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Never trust a caller-supplied identity header; only this gate may set it.
  delete req.headers["x-cabinet-user"];

  // Liveness/readiness probes answer without a session.
  if (req.path.startsWith("/api/health")) return next();

  if (isDaemonTokenValid(getTokenFromAuthorizationHeader(req.headers.authorization))) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);

  if (cloudGateActive()) {
    const sub = await verifyCloudToken(cookies.get(CABINET_JWT_COOKIE));
    if (!sub) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.headers["x-cabinet-user"] = sub;
    return next();
  }

  if (!isAuthEnabled()) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();

  const token = cookies.get(KB_AUTH_COOKIE) ?? "";
  if (timingSafeEqualHex(token, await expectedToken())) return next();
  res.status(401).json({ error: "Unauthorized" });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx --test test/express-auth-gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/cloud-token.ts src/lib/auth/request-gate.ts server/http/auth-gate.ts test/express-auth-gate.test.ts
git commit -m "feat: Express auth gate mirroring the proxy semantics plus daemon bearer"
```

---

### Task 4: Assemble the API app and wire it into the daemon

**Files:**
- Create: `server/http/api-app.ts`
- Modify: `src/app/api/auth/check/route.ts` (drop `next/headers`)
- Modify: `server/cabinet-daemon.ts` (boot salt/env, `/api` delegation)
- Test: `test/api-app.test.ts`

**Interfaces:**
- Consumes: `apiRoutes` (Task 1), `mountRouteModule`/`RouteModule` (Task 2), `apiAuthGate` (Task 3).
- Produces: `buildApiApp(): express.Express` — the complete `/api` application (consumed by the daemon and by Task 7's parity check via the live daemon).

- [ ] **Step 1: Rewrite the one `next/headers` route**

Replace the full contents of `src/app/api/auth/check/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  KB_AUTH_COOKIE,
  expectedToken,
  isAuthEnabled,
  timingSafeEqualHex,
} from "@/lib/auth/kb-auth";

export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, authEnabled: false });
  }

  const token = req.cookies.get(KB_AUTH_COOKIE)?.value ?? "";
  const authenticated = timingSafeEqualHex(token, await expectedToken());

  return NextResponse.json({ authenticated, authEnabled: true });
}
```

(`NextRequest.cookies` works identically under Next and under the adapter; `cookies()` from `next/headers` requires Next's request-scoped AsyncLocalStorage and would throw in the daemon.)

- [ ] **Step 2: Write the failing integration test**

Create `test/api-app.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
delete process.env.KB_PASSWORD; // auth disabled -> gate passes

test("buildApiApp mounts the full manifest and serves real routes", async () => {
  const { apiRoutes } = await import("../server/http/route-manifest");
  assert.ok(
    apiRoutes.length >= 140,
    `expected >=140 mounted routes, got ${apiRoutes.length}`
  );

  const { buildApiApp } = await import("../server/http/api-app");
  const server = buildApiApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const check = await fetch(`http://127.0.0.1:${port}/api/auth/check`);
    assert.equal(check.status, 200);
    assert.deepEqual(await check.json(), {
      authenticated: true,
      authEnabled: false,
    });

    const missing = await fetch(
      `http://127.0.0.1:${port}/api/definitely-not-a-route`
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Not found" });
  } finally {
    server.close();
  }
});
```

This test imports every route module (via the manifest), so it must run through the hermetic launcher or with an isolated data dir.

Run: `CABINET_DATA_DIR=$(mktemp -d) npx tsx --test test/api-app.test.ts`
Expected: FAIL — cannot find module `../server/http/api-app`.

- [ ] **Step 3: Write the app builder**

Create `server/http/api-app.ts`:

```ts
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { apiAuthGate } from "./auth-gate";
import { mountRouteModule, type RouteModule } from "./next-route-adapter";
import { apiRoutes } from "./route-manifest";

/**
 * The Express app hosting the /api surface (the Next.js route handlers from
 * src/app/api, mounted verbatim through the adapter).
 *
 * Deliberately NO body-parsing middleware: handlers consume the raw web
 * stream (req.json()/req.formData()); express.json() would drain it first.
 */
export function buildApiApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(apiAuthGate);
  for (const route of apiRoutes) {
    mountRouteModule(app, route.path, route.module as RouteModule);
  }
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  });
  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CABINET_DATA_DIR=$(mktemp -d) npx tsx --test test/api-app.test.ts`
Expected: PASS. If any route module throws at import time, this test names it — fix the import-order/env assumption it exposes before proceeding (that is this test's job).

- [ ] **Step 5: Wire the daemon**

In `server/cabinet-daemon.ts`:

(a) In the boot preamble (directly after the existing `initProcessLogging("daemon");` call), add:

```ts
// The embedded /api gate derives the same kb-auth token the browser carries,
// so the per-install salt must exist before the first request (Next's
// instrumentation hook also calls this; it is idempotent).
import { ensureAuthSalt } from "../src/lib/auth/kb-auth-salt.node";
try {
  ensureAuthSalt();
} catch (err) {
  console.error("daemon: ensureAuthSalt failed", err);
}
```

(b) Add with the other local imports:

```ts
import { buildApiApp } from "./http/api-app";
```

and, immediately above the `const server = http.createServer(async (req, res) => {` line (currently `server/cabinet-daemon.ts:1497`), add:

```ts
const apiApp = buildApiApp();
```

(c) Inside the request handler, after the `OPTIONS` early-return block and BEFORE the `isDaemonTokenValid` check (currently `server/cabinet-daemon.ts:1506-1510`), add:

```ts
  const url = new URL(req.url || "", `http://localhost:${PORT}`);

  // The former Next.js /api surface, served by the embedded Express app. It
  // applies its own auth gate (kb-auth cookie / cloud JWT / daemon bearer),
  // so the daemon token check below must not run for these paths. WS upgrade
  // paths (/api/daemon/pty, /api/daemon/events) never reach this handler.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    apiApp(req, res);
    return;
  }

  if (url.pathname !== "/health" && !isDaemonTokenValid(requestToken(req, url))) {
```

(i.e. move the existing `const url = ...` line above the new block; do not construct the URL twice.)

(d) Find where the daemon calls `ensureAuthEnvFromDotEnv()` lazily (inside `putJson`, around `server/cabinet-daemon.ts:1252`) and ALSO call it once at boot, right before `server.listen(...)`:

```ts
// KB_PASSWORD (and salt/iters overrides) may live only in `.env`; the
// embedded /api auth gate needs them in process.env before the first
// browser request, not just before the first scheduler trigger.
ensureAuthEnvFromDotEnv();
```

- [ ] **Step 6: Verify against the live daemon**

Run: `npm run dev:daemon` (leave it running in one shell), then:

```bash
curl -s http://127.0.0.1:4100/api/auth/check
# expect: {"authenticated":true,"authEnabled":false}  (or authEnabled:true if you have KB_PASSWORD set)
TOKEN=$(cat data/.agents/.runtime/daemon-token)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4100/api/cabinets | head -c 300
# expect: JSON (not a 401), same shape as http://127.0.0.1:4000/api/cabinets
curl -s http://127.0.0.1:4100/health
# expect: the daemon's own health payload — pre-existing endpoints unchanged
```

Stop the daemon.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS (all pre-existing tests plus the four new files).

- [ ] **Step 8: Commit**

```bash
git add server/http/api-app.ts server/cabinet-daemon.ts src/app/api/auth/check/route.ts test/api-app.test.ts
git commit -m "feat: serve the /api surface from an Express app embedded in the daemon"
```

---

### Task 5: Scheduler triggers via bearer token (delete the cookie hack)

**Files:**
- Modify: `server/cabinet-daemon.ts` (`putJson`, the three `getAppOrigin()` trigger URLs at lines ~1295/1310/1344)

**Interfaces:**
- Consumes: `getOrCreateDaemonTokenSync()` from `src/lib/agents/daemon-auth` — add it to the existing import list from `../src/lib/agents/daemon-auth` (ends at `server/cabinet-daemon.ts:75`); the Task 3 gate's bearer acceptance.
- Produces: `selfApiUrl(pathname: string): string` (daemon-internal helper).

- [ ] **Step 1: Replace putJson's auth and targets**

In `server/cabinet-daemon.ts`, replace the existing `putJson` function (lines ~1248-1265) with:

```ts
/**
 * The daemon hosts /api itself now, so scheduler triggers call the local
 * server with the daemon bearer token — no more replicating the browser's
 * kb-auth cookie.
 */
function selfApiUrl(pathname: string): string {
  return `http://127.0.0.1:${PORT}${pathname}`;
}

async function putJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOrCreateDaemonTokenSync()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}
```

Then update the three call sites that build `${getAppOrigin()}/api/...` URLs (lines ~1295, ~1310, ~1344) to use `selfApiUrl(...)`, e.g.:

```ts
selfApiUrl(`/api/agents/${job.agentSlug}/jobs/${job.id}`)
```

and

```ts
void putJson(selfApiUrl(`/api/agents/personas/${slug}`), {
```

Do NOT remove `getAppOrigin` entirely — it is still used by `getAllowedBrowserOrigins()` (line ~296) for CORS. Do NOT remove `ensureAuthEnvFromDotEnv` — the boot call from Task 4 still feeds the gate's cookie path; only its lazy invocation inside the old `putJson` disappears with the replacement above. Remove the now-unused `authCookieHeader` import (line 76) if `grep -n "authCookieHeader" server/cabinet-daemon.ts` shows no remaining uses.

- [ ] **Step 2: Lint and typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (no unused-import or type errors in `server/cabinet-daemon.ts`).

- [ ] **Step 3: Verify a live trigger end-to-end**

Run `npm run dev:all`. In the Cabinet UI, open an agent and create (or enable) a job with cron schedule `* * * * *`, then watch the daemon shell for the next minute's trigger. Expected: the trigger log line shows success — no `401 Unauthorized` from `putJson`. (Equivalent check without the UI: `tail -f data/.cabinet-state/logs/daemon.log` and confirm `schedulerStats`-adjacent trigger logging reports success, or `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4100/health` and confirm `triggerFailures` did not increment after the minute boundary.) Disable the test job afterwards.

- [ ] **Step 4: Run the unit suite and commit**

Run: `npm test` → PASS.

```bash
git add server/cabinet-daemon.ts
git commit -m "refactor: scheduler triggers call the daemon's own /api with the bearer token"
```

---

### Task 6: Cutover switch in the proxy (opt-in)

**Files:**
- Modify: `src/proxy.ts`
- Test: `test/proxy.test.ts` (extend)

**Interfaces:**
- Consumes: `getDaemonUrl()` from `@/lib/runtime/runtime-config`.
- Produces: env contract `CABINET_API_VIA_DAEMON` (this task: rewrite only when `=== "1"`; Task 7 flips to `!== "0"`).

- [ ] **Step 1: Write the failing tests**

Append to `test/proxy.test.ts` (reusing its existing `makeReq` helper):

```ts
test("proxy rewrites /api to the daemon origin when CABINET_API_VIA_DAEMON=1", async () => {
  process.env.CABINET_API_VIA_DAEMON = "1";
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  const prevPassword = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const res = await proxy(makeReq("/api/cabinets?x=1"));
    assert.equal(
      res.headers.get("x-middleware-rewrite"),
      "http://127.0.0.1:4100/api/cabinets?x=1"
    );
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    if (prevPassword !== undefined) process.env.KB_PASSWORD = prevPassword;
  }
});

test("proxy leaves pages and flag-off requests alone", async () => {
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  const prevPassword = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    delete process.env.CABINET_API_VIA_DAEMON;
    const flagOff = await proxy(makeReq("/api/cabinets"));
    assert.equal(flagOff.headers.get("x-middleware-rewrite"), null);

    process.env.CABINET_API_VIA_DAEMON = "1";
    const page = await proxy(makeReq("/tasks"));
    assert.equal(page.headers.get("x-middleware-rewrite"), null);
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    if (prevPassword !== undefined) process.env.KB_PASSWORD = prevPassword;
  }
});

test("proxy still 401s unauthenticated /api requests before any rewrite", async () => {
  process.env.CABINET_API_VIA_DAEMON = "1";
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  process.env.KB_PASSWORD = "hunter2";
  try {
    const res = await proxy(makeReq("/api/cabinets"));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    delete process.env.KB_PASSWORD;
  }
});
```

Run: `npx tsx --test test/proxy.test.ts`
Expected: the first new test FAILS (no rewrite header yet); pre-existing tests still pass.

- [ ] **Step 2: Implement the rewrite**

In `src/proxy.ts`, add the import:

```ts
import { getDaemonUrl } from "@/lib/runtime/runtime-config";
```

and these helpers above `cloudProxy`:

```ts
// Transitional switch for the Express-backend migration: when enabled, the
// proxy forwards authorized /api/* requests to the daemon's embedded Express
// app instead of the local Next route handlers. /api/upload never reaches
// this code — it is excluded from the matcher below (Next buffers matched
// request bodies), and keeps hitting its Next route until migration step 2.
function apiViaDaemon(): boolean {
  return process.env.CABINET_API_VIA_DAEMON === "1";
}

function maybeRewriteApi(
  req: NextRequest,
  requestHeaders?: Headers
): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (!apiViaDaemon() || !pathname.startsWith("/api/")) return null;
  const target = new URL(pathname + search, getDaemonUrl());
  return requestHeaders
    ? NextResponse.rewrite(target, { request: { headers: requestHeaders } })
    : NextResponse.rewrite(target);
}
```

Then route every authorized `/api` exit through it:

- In `cloudProxy`, the health passthrough becomes
  `return maybeRewriteApi(req) ?? NextResponse.next();`
  and the final authenticated return becomes
  `return maybeRewriteApi(req, headers) ?? NextResponse.next({ request: { headers } });`
- In `proxy`, the `!isAuthEnabled()` return, the login/check-exemption return, the health return, and the final authenticated `return NextResponse.next();` each become
  `return maybeRewriteApi(req) ?? NextResponse.next();`
- The 401 branches are untouched — unauthenticated requests are rejected locally, never forwarded.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx tsx --test test/proxy.test.ts`
Expected: PASS (all pre-existing + 3 new).

- [ ] **Step 4: Manual end-to-end with the flag on**

Run: `CABINET_API_VIA_DAEMON=1 npm run dev:all`, open `http://127.0.0.1:4000`, and exercise: login (if KB_PASSWORD set), browse the tree, open + edit + save a page, open an agent conversation, open the terminal panel (WS still direct to the daemon), and watch an agent run's live activity feed — the feed exercises the 4 SSE routes (`src/app/api/agents/**/events/route.ts`, `text/event-stream`) through the middleware rewrite.

**Contingency (apply only if the SSE feed stalls or buffers):** exclude the events routes from the rewrite the same way `/api/upload` is excluded, by adding to `maybeRewriteApi` after the `/api/` prefix check:

```ts
  // SSE does not survive the middleware rewrite proxy; keep these on Next
  // until migration step 2 removes the proxy entirely.
  if (/^\/api\/agents(\/.*)?\/events$/.test(pathname)) return null;
```

and note the exclusion in `docs/superpowers/specs/2026-07-14-nextjs-to-express-tanstack-migration.md` under "Risks / open items".

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts test/proxy.test.ts
git commit -m "feat: CABINET_API_VIA_DAEMON proxies /api to the daemon's Express app"
```

---

### Task 7: Parity check, default-on, docs

**Files:**
- Create: `scripts/api-parity-check.mjs`
- Modify: `src/proxy.ts` (flag default), `test/proxy.test.ts` (default expectations), `docs/AUTH.md` (bearer note)

**Interfaces:**
- Consumes: running `dev:all` WITHOUT the flag (Next still serves /api), daemon token file `data/.agents/.runtime/daemon-token`.
- Produces: final env contract — `CABINET_API_VIA_DAEMON` defaults ON, `"0"` is the rollback switch.

- [ ] **Step 1: Write the parity script**

Create `scripts/api-parity-check.mjs`:

```js
#!/usr/bin/env node
/**
 * Compares GET responses between the Next.js route handlers (app origin) and
 * the daemon's embedded Express app for a read-only route sample.
 *
 * Run with `npm run dev:all` up and CABINET_API_VIA_DAEMON unset/0 (so the
 * app origin still answers from Next), and with auth disabled (no
 * KB_PASSWORD) — the app origin is queried without a cookie.
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.env.CABINET_APP_ORIGIN || "http://127.0.0.1:4000";
const DAEMON = process.env.CABINET_DAEMON_URL || "http://127.0.0.1:4100";
const tokenPath = path.join(
  process.cwd(),
  "data",
  ".agents",
  ".runtime",
  "daemon-token"
);
const token =
  process.env.CABINET_DAEMON_TOKEN || fs.readFileSync(tokenPath, "utf8").trim();

const ROUTES = [
  "/api/health",
  "/api/auth/check",
  "/api/cabinets",
  "/api/agents/personas",
  "/api/tree",
];

async function snapshot(res) {
  return { status: res.status, body: await res.text() };
}

let failures = 0;
for (const route of ROUTES) {
  const [a, b] = await Promise.all([
    fetch(`${APP}${route}`).then(snapshot),
    fetch(`${DAEMON}${route}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(snapshot),
  ]);
  const same = a.status === b.status && a.body === b.body;
  console.log(`${same ? "OK  " : "DIFF"} ${route} (next=${a.status}, daemon=${b.status})`);
  if (!same) {
    failures++;
    console.log(`  next:   ${a.body.slice(0, 200)}`);
    console.log(`  daemon: ${b.body.slice(0, 200)}`);
  }
}

process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it**

With `npm run dev:all` up (flag unset): `node scripts/api-parity-check.mjs`
Expected: `OK` on every line, exit 0. A `DIFF` where the daemon answers correctly but Next differs only by non-semantic headers/whitespace is acceptable if you can explain it; a status mismatch or payload difference is a bug in Tasks 2–4 — fix before continuing. (Routes that legitimately return time-varying payloads may DIFF on body; if one does, swap it for a stable read-only route from `server/http/route-manifest.ts` rather than weakening the comparison.)

- [ ] **Step 3: Flip the default**

In `src/proxy.ts` change `apiViaDaemon` to:

```ts
function apiViaDaemon(): boolean {
  // Default ON since the Express extraction; "0" is the rollback switch.
  return process.env.CABINET_API_VIA_DAEMON !== "0";
}
```

In `test/proxy.test.ts`, update the flag-off case inside "proxy leaves pages and flag-off requests alone": replace `delete process.env.CABINET_API_VIA_DAEMON;` (before the first assertion) with `process.env.CABINET_API_VIA_DAEMON = "0";`, and update the pre-existing passthrough test ("proxy passes through every path when KB_PASSWORD is unset") if it now sees rewrite headers on `/api/*` paths — set `process.env.CABINET_API_VIA_DAEMON = "0"` at the top of that test and restore it in a `finally`.

Run: `npx tsx --test test/proxy.test.ts` → PASS.

- [ ] **Step 4: Document the auth addition**

Append to `docs/AUTH.md`:

```markdown
## Daemon-hosted API and the bearer token

Since the Express backend extraction (v0.6), the daemon serves the entire
`/api` surface on its own port (default 4100). Browser requests still enter
through the app origin — `src/proxy.ts` authenticates them (KB_PASSWORD
cookie or Cabinet Cloud JWT) and then rewrites to the daemon. Requests
reaching the daemon directly are gated by `server/http/auth-gate.ts`, which
applies the same rules plus one addition: a valid daemon bearer token
(`Authorization: Bearer <data/.agents/.runtime/daemon-token>`, or
`CABINET_DAEMON_TOKEN`) is accepted in place of a browser session. The
daemon's own scheduler uses this to trigger `/api/agents/...` jobs; the old
kb-auth cookie replication inside the daemon is gone.

Rollback switch: `CABINET_API_VIA_DAEMON=0` makes the app serve `/api` from
the Next route handlers again (both implementations mount the same files
under `src/app/api`).
```

- [ ] **Step 5: Full-suite check and commit**

Run: `npm test` → PASS.

```bash
git add scripts/api-parity-check.mjs src/proxy.ts test/proxy.test.ts docs/AUTH.md
git commit -m "feat: default /api traffic to the daemon Express app; add parity check"
```

---

### Task 8: Build, bundle, and packaging verification

**Files:**
- Possibly modify: `scripts/prepare-electron-package.mjs` (esbuild `tsconfig` option — contingency only)

**Interfaces:**
- Consumes: everything above.
- Produces: green `next build`, daemon esbuild bundle, unit suite, and manifest drift check.

- [ ] **Step 1: Next.js still builds**

Run: `npm run build`
Expected: success — route files were not moved, `next build` output unchanged apart from `auth/check`.

- [ ] **Step 2: Daemon bundle survives the manifest**

Run: `npm run test:bundle`
Expected: PASS. The manifest adds ~147 static imports of `@/*`-aliased modules to the daemon graph.

**Contingency (only if esbuild fails to resolve `@/`):** in `scripts/prepare-electron-package.mjs`, inside `bundleDaemon()`'s `bundle({...})` options (line ~158), add:

```js
    tsconfig: path.join(projectRoot, "tsconfig.json"),
```

and re-run `npm run test:bundle`.

- [ ] **Step 3: Manifest drift guard + full checks**

Run: `npm run api:manifest:check` → `route-manifest.ts up to date`.
Run: `npm run lint && npx tsc --noEmit && npm test` → all clean.
Run (if a display/e2e environment is available): `CABINET_API_VIA_DAEMON=1 npm run test:e2e` → PASS.

- [ ] **Step 4: Commit (if the contingency touched anything)**

```bash
git add scripts/prepare-electron-package.mjs
git commit -m "fix: point daemon esbuild bundle at the repo tsconfig for @/ aliases"
```

---

## Out of scope (deferred to Step 2 — TanStack frontend plan)

- Physically moving `src/app/api/**` → `server/api/**` and removing the `next` dependency from the backend (a `NextRequest`/`NextResponse` shim replaces `next/server`).
- `/api/upload` off Next (frontend will call the daemon origin directly).
- `instrumentation.ts` retirement (`ensureGlobalAgents` moves to daemon boot when Next dies).
- Electron/`copy-standalone-assets.mjs` rework away from `.next/standalone` (Express serves the built SPA).
- `cabinetai` / `electron/main.cjs` supervising one backend process instead of two.
