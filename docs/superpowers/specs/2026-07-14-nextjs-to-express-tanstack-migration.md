# Next.js → Express → TanStack Migration Design

**Date:** 2026-07-14
**Status:** Step 1 planned (see `docs/superpowers/plans/2026-07-14-express-backend-extraction.md`); Step 2 to be planned after Step 1 ships.

## Motivation

Cabinet runs two processes: a Next.js 16 app (port 4000) serving the UI **and** 147 API route handlers, and a standalone daemon (`server/cabinet-daemon.ts`, port 4100) for PTY sessions, agent execution, cron scheduling, WebSockets, SQLite, and search. We want to (1) consolidate the server surface onto Express in the daemon process, then (2) replace the Next.js frontend with Vite + TanStack Router/Query.

This mirrors the successful migration of `~/projects/mono-mytrainingapp` (Next.js 15 monolith → pnpm monorepo with Express 5 backend + Vite/TanStack frontend, ~16 days of active migration after preparation). Key transferable lessons from that case study:

- Framework-agnostic business logic **before** the split turns extraction into a file move. Cabinet is already there: only 2 of 267 files under `src/lib` touch Next APIs.
- Extract the server first, run old and new side by side (strangler pattern), cut over big-bang at the end with a rollback path.
- Do auth as the first vertical slice; budget real time for cookie/CORS details.
- Scaffold the new frontend greenfield beside the old one; mirror route groups; use a holding pen + ticket file for unported components.
- Stable error codes / response contracts make the backend swap invisible to the UI (their "transkeys" `ERROR_MAP` pattern).

## Findings that shaped the design

- The daemon is **already** a standalone Node `http.createServer` + `ws` process with zero Next imports. "Move the daemon out of Next.js" is really "move the **API routes** out of Next.js".
- The route surface is uniform: 147 `route.ts` files exporting `GET`/`POST`/`PUT`/`PATCH`/`DELETE` functions typed against `NextRequest` → `Response`. All dynamic params are Next 15-style `Promise<{...}>`. Exactly **one** route uses `next/headers` (`api/auth/check`), zero use `req.cookies`, none use server actions.
- `NextRequest`/`NextResponse` are constructible outside a Next server (proven by `test/proxy.test.ts`), so the existing route files can be mounted on Express **verbatim** through a small adapter — no per-route rewrite.
- The daemon ↔ app coupling is bidirectional HTTP: app → daemon via `src/lib/agents/daemon-client.ts` (bearer token), daemon → app scheduler triggers via a hand-replicated `kb-auth` PBKDF2 cookie (`server/cabinet-daemon.ts:1204-1266`). Hosting `/api` in the daemon lets triggers use the daemon bearer token against localhost and deletes the cookie-replication hack.
- Next 16's `proxy.ts` middleware runs in the Node runtime, so it can read `runtime-ports.json` per request and `NextResponse.rewrite()` to the daemon origin — a runtime-configurable, per-request cutover switch. (Config-file `rewrites()` would bake the port at build time, which breaks dynamic port allocation.)
- The frontend is already a client-rendered SPA (catch-all route → `<AppShell/>`, hand-rolled `fetch` + Zustand, WS direct to daemon), so Step 2 is mostly routing/shell/auth-gate work, not a rendering-model rewrite.

## Decision: unified backend inside the daemon process

The daemon grows an embedded **Express 5** app that serves `/api/*`. The Next route-handler files stay physically in `src/app/api/**` during Step 1 and are mounted on Express through:

1. A **generated manifest** (`server/http/route-manifest.ts`, static imports so esbuild can bundle the daemon for Electron) mapping Next file paths → Express paths (`[id]` → `:id`, `[...path]` → `*path`), ordered so literals beat params beat wildcards.
2. A **request/response adapter** (`server/http/next-route-adapter.ts`): Node req → `NextRequest` (streamed body), handler `Response` → Node res (streamed, multi `Set-Cookie` safe).
3. An **Express auth gate** (`server/http/auth-gate.ts`) replicating `src/proxy.ts` semantics (KB_PASSWORD cookie / Cabinet Cloud ES256 JWT / health + login carve-outs) **plus** acceptance of the daemon bearer token for server-to-server calls.

Cutover is a per-request rewrite in `src/proxy.ts` behind `CABINET_API_VIA_DAEMON` (opt-in first, default-on after parity verification, `=0` as kill switch). `/api/upload` stays on Next during Step 1 — it is excluded from the proxy matcher because Next buffers matched request bodies (10MB cap), so it never reaches the rewrite; it moves in Step 2 when the frontend calls the backend origin directly.

Rejected alternatives:
- **Separate Express service (third process):** keeps the bidirectional auth hack alive, adds a port and a supervisor entry in dev/Electron/cabinetai for no benefit.
- **Physically moving route files + `src/lib` into packages now:** big diff, no behavior gain in Step 1; deferred to Step 2 when Next is deleted.
- **Config-time `rewrites()` in next.config.ts:** bakes daemon origin at build time; incompatible with `runtime-ports.json` dynamic ports.

## Step 2 outline (plan after Step 1 ships)

- Scaffold `apps/frontend` greenfield: Vite + React 19 + TanStack Router (file-based, `autoCodeSplitting`) + TanStack Query. Mirror the current shell: TanStack routes for `/login`, `/tasks`, `/tasks/$id`, `/agents/conversations/$id`, catch-all → `AppShell`.
- Port components via the mytrainingapp holding-pen pattern (`src/unmigrated-components/` + a migration ticket file); replace `next/font` with self-hosted fonts, `next/navigation`/`next/image` usages, and the `proxy.ts` page gate with router guards + a session bootstrap query.
- Adopt `api/<feature>/{api,queries,mutations}` structure with TanStack Query for the ~111 raw-`fetch` call sites (incremental — Zustand stays for UI state).
- Physically move `src/app/api/**` route files into `server/api/**`, replace `next/server` imports with a small local shim (`NextRequest`/`NextResponse` are thin wrappers over web `Request`/`Response`), move `/api/upload` and `instrumentation.ts` duties (`ensureGlobalAgents`) into the daemon, then delete Next: `src/app`, `next.config.ts`, the `next` dependency, `next start` from scripts.
- Express serves the built SPA statically in production/Electron (single backend process + static assets); Vite dev server proxies `/api` and WS to the daemon in dev. Rework `copy-standalone-assets.mjs` / `prepare-electron-package.mjs` / `electron/main.cjs` away from the `.next/standalone` layout — this is the largest Cabinet-specific cost (mytrainingapp had no desktop wrapper).
- Optional, from the transkeys case study: introduce a shared error-code map (`ERROR_CODE` in responses + i18next `ErrorsCodes` dictionary section + a static 1:1 validation script) so future backend changes stay invisible to the UI.

## Risks / open items

- **SSE through the middleware rewrite:** 4 routes stream `text/event-stream` (`api/agents/**/events`). If streaming stalls through `NextResponse.rewrite`, exclude them from the rewrite (like `/api/upload`) until Step 2. Verified explicitly in the plan.
- **esbuild bundling of the manifest:** 147 static imports pull `@/*`-aliased modules into the daemon bundle; `scripts/prepare-electron-package.mjs` may need an explicit `tsconfig` option. Covered by `npm run test:bundle` in the plan.
- **Boot cost:** the daemon now imports every route module graph at startup (comparable to what `next start` did). Acceptable; lazy imports were rejected because esbuild can't bundle non-static `import()`.
- **`next` stays a backend dependency during Step 1** (adapter constructs `NextRequest`). Removed in Step 2 via the shim.
