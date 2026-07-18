# Status Popover: Error Review, Log Capture, Restart

> **Status:** proposal — no implementation in this PR. This doc captures the agreed plan; review and amend here before writing code.

## Context

Today the bottom-bar "All Systems Running" popover (`src/components/layout/status-bar.tsx:523-695`) tells users which services are healthy, but when something is broken there's no in-app way to see *what* broke or do anything about it. Two related gaps:

1. **No captured logs.** Daemon and app-server stdout/stderr inherit the parent stdio in both supervisors (`electron/main.cjs:155`, `cabinetai/src/commands/run.ts:336, 359`). Nothing is on disk. A user hitting an error has nothing to copy/report.
2. **No in-app restart.** Only IPC handler today is `cabinet:uninstall-app` (`electron/main.cjs:506`). A wedged daemon means quitting the app or killing/restarting the npm script.

This plan adds: (a) in-memory log capture per service, (b) a "Service error" panel inside the existing status popover with **Copy logs**, **Report**, and **Restart daemon**, and (c) a small backend endpoint that receives error reports.

User-confirmed scope:

- Restart: **daemon only**.
- Report destination: **upload to cabinet-backend** (new endpoint).
- Log storage: **in-memory ring buffer**, no rolling files.
- UI: **inline in the existing status popover**, no separate page.

## Launch-mode reality (key finding)

There are three ways Cabinet runs, and two of them have a supervisor that owns the daemon child:

| Mode                   | Supervisor                          | Restart possible | Log capture possible |
| ---------------------- | ----------------------------------- | ---------------- | -------------------- |
| Electron app           | `electron/main.cjs`                 | Yes              | Yes                  |
| `npx cabinetai run`    | `cabinetai/src/commands/run.ts`     | Yes              | Yes                  |
| `npm run dev:all` (dev)| None (`&` backgrounded)             | No — show hint   | Daemon-side only     |

Both real supervisors already track child PIDs and handle SIGTERM cleanup. The plan adds the same "supervisor surface" to both, so end users get identical behavior whether they install the DMG or run `npx cabinetai run`.

## Architecture

### 1. In-memory log buffer (zero idle filesystem cost)

**New file**: `src/lib/diagnostics/log-buffer.ts` (TS, used by daemon)
**Mirror file**: same shape as plain JS inside both supervisors

```ts
export interface LogLine { ts: number; stream: "out" | "err"; text: string }
export class LogRingBuffer {
  constructor(private capacity: number = 2000) {} // ~256 KB resident
  push(line: LogLine): void
  snapshot(): LogLine[]
  clear(): void
}
```

No file I/O during normal operation. Disk/network only touched when:

- User clicks **Copy logs** → buffer JSON-serialized → clipboard.
- User clicks **Report** → buffer POSTed to cabinet-backend.
- Crash signal handler fires (`uncaughtException`, `SIGTERM`, child non-zero exit) → best-effort single-write `~/Documents/Cabinet/.cabinet-state/logs/{service}-last-crash.log` (overwritten, not rotated). Read on next boot to surface "Cabinet crashed last time" in the popover.

This is the answer to "rotation without filesystem overhead": **don't rotate files at all — keep the rolling window in RAM, persist only on death.**

### 2. Shared "supervisor surface"

Both supervisors get the same minimal HTTP server on a free loopback port and inject one new env var into both children:

```
CABINET_SUPERVISOR_URL=http://127.0.0.1:<port>
```

Routes (identical in both supervisors):

- `GET /app-logs` → ring snapshot for the app-server child
- `POST /restart-daemon` → SIGTERM the daemon child (5s grace, then SIGKILL), respawn with the args/env captured at first launch, wait for `/health` to return `ok` (30s timeout), return `{ ok, durationMs }`
- `GET /supervisor-info` → `{ supervisor: "electron"|"cli", appPid, daemonPid, supervisorStartedAt }`

**Why HTTP and not IPC**: IPC only works in Electron (renderer↔main). Next.js API routes run in a separate Node process and can't reach Electron's main process via IPC. A 50-line loopback server works in both modes with identical code.

**Modify**:

- `electron/main.cjs` — switch `spawnBackend()` from `stdio: "inherit"` to piped stdio + tee (still echo to console for dev experience), embed `LogRingBuffer`, mount the supervisor HTTP server on a free port, inject `CABINET_SUPERVISOR_URL` into both children's env (lines 338-351).
- `cabinetai/src/commands/run.ts` — same three changes: switch `stdio: "inherit"` (lines 336, 359) to piped, embed ring buffer, mount supervisor HTTP server, inject env var. Reuse `findAvailablePort` already imported on line 17.

`electron/preload.cjs` does **not** need changes — the renderer talks to the supervisor through Next.js API routes, not through preload.

### 3. Daemon-side capture

**Modify**: `src/lib/daemon/cabinet-daemon.ts`

- Instantiate one `LogRingBuffer` at startup; wrap the daemon's existing log writes so each line mirrors into it.
- Add HTTP routes on the daemon (mirrors existing `/health` pattern at `cabinet-daemon.ts:1717`):
  - `GET /diagnostics/logs` → `{ lines: LogLine[], capturedSince }`
  - `POST /diagnostics/clear-logs` → empties buffer
- Install crash handlers: `process.on("uncaughtException")`, `process.on("SIGTERM")` → write `daemon-last-crash.log`, exit.

The daemon owns its *own* logs even after a restart (the supervisor restarts the process, but the new daemon's ring is empty until it writes). The last-crash file bridges that gap.

### 4. App-server proxy routes (Next.js)

**New files** (all thin proxies, mirror pattern at `src/app/api/health/daemon/route.ts:6`):

- `src/app/api/diagnostics/daemon-logs/route.ts` → `GET {daemonUrl}/diagnostics/logs`
- `src/app/api/diagnostics/app-logs/route.ts` → `GET {supervisorUrl}/app-logs` if `CABINET_SUPERVISOR_URL` is set; otherwise return `{ lines: [], hint: "App-server logs are only captured under the desktop app or `npx cabinetai run`. In `npm run dev`, check the terminal." }`
- `src/app/api/diagnostics/restart-daemon/route.ts` → `POST {supervisorUrl}/restart-daemon` if env set; else `{ ok: false, hint: "Restart not available in dev mode — kill and re-run your dev script." }`
- `src/app/api/diagnostics/report/route.ts` → POSTs to cabinet-backend's `/diagnostics/reports` with `{ version, installKind, dataDir, service, lines, supervisor }`. Strips obvious PII (full home paths → `~`, env values matching token patterns).

### 5. Backend endpoint (cabinet-backend, separate repo)

Implementer note: add `POST /diagnostics/reports` storing `{ id, ts, version, installKind, service, lines, userAgent }`, returning `{ id, viewUrl }`. Reuse the table strategy from the feedback endpoint. No auth; rate-limit by IP.

### 6. UI changes

**Modify**: `src/components/layout/status-bar.tsx`

When `selectAppLevel()` or `selectDaemonLevel()` returns `"down"` or `"degraded"`, the corresponding section (currently lines 546-577) gains an expandable error block:

```
● Daemon                              Down
  AI agents, scheduled jobs… not working.
  Last seen: 47s ago

  ┌─ Last error ────────────────────────┐
  │ ECONNREFUSED 127.0.0.1:7320         │
  │ at TCPConnectWrap.afterConnect      │
  │ … (12 more lines)                   │
  └─────────────────────────────────────┘
  [View full logs]  [Copy logs]  [Report]  [Restart]
```

- **View full logs** opens a modal with a `<pre>` and fixed height (use existing `Dialog` primitive).
- **Copy logs** → `navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))`.
- **Report** → small confirmation ("Sends the last ~2000 log lines + your Cabinet version. No file contents."), then POSTs to `/api/diagnostics/report`. On success, shows the returned `viewUrl`.
- **Restart** is enabled when `/api/diagnostics/restart-daemon` returns ok. In `npm run dev:all` mode, button is replaced by the install-kind-specific hint (existing switch at `status-bar.tsx:626-664`).

New hook `src/hooks/use-service-diagnostics.ts` wraps the four fetches. Lazy — only triggered when the user expands the error block, not on every poll.

## Files to Modify / Create

**New**:

- `src/lib/diagnostics/log-buffer.ts`
- `src/app/api/diagnostics/daemon-logs/route.ts`
- `src/app/api/diagnostics/app-logs/route.ts`
- `src/app/api/diagnostics/restart-daemon/route.ts`
- `src/app/api/diagnostics/report/route.ts`
- `src/hooks/use-service-diagnostics.ts`

**Modify**:

- `src/lib/daemon/cabinet-daemon.ts` — ring buffer + 2 HTTP routes + crash handlers
- `electron/main.cjs` — piped stdio, ring buffer, supervisor HTTP server, env injection
- `cabinetai/src/commands/run.ts` — piped stdio, ring buffer, supervisor HTTP server, env injection (mirrors Electron changes; rebuild via `cabinetai/esbuild.config.mjs`)
- `src/components/layout/status-bar.tsx` — error block + buttons in popover (lines 546-577)

**External (cabinet-backend)**:

- `POST /diagnostics/reports` endpoint + table

## Reused Existing Code

- `spawnBackend` / `cleanupBackends` — `electron/main.cjs:152-159, 452-457` (restart reuses both)
- `spawnChild` / port helpers — `cabinetai/src/lib/process.ts`, `cabinetai/src/lib/ports.ts:findAvailablePort` (supervisor server reuses for its own port)
- `getDaemonUrl()` proxy pattern — `src/app/api/health/daemon/route.ts:6`
- Install-kind switch — `src/components/layout/status-bar.tsx:626-664`
- Health polling + level selectors — `src/stores/health-store.ts:126-139`
- `isElectronRuntime()` check — `src/lib/runtime/runtime-config.ts:48-54`

## Verification

1. **Buffer correctness** — unit test `LogRingBuffer`: push N+10 lines, snapshot length === N, oldest dropped.
2. **Electron path** (`npm run electron:dev` or DMG):
   - Kill daemon process from Activity Monitor → status pill amber → red within 10s.
   - Open popover, expand Daemon → captured stderr lines visible.
   - **Copy logs** → paste into scratch file, confirm JSON.
   - **Restart** → spinner → daemon child PID changes (verify via `ps -p`), pill returns to green.
   - **Report** → confirm POST hits cabinet-backend (intercept locally if backend not deployed).
3. **`cabinetai run` path** (`npx cabinetai run` from a fresh dir):
   - Same kill-daemon test → identical behavior to Electron.
   - Confirm `CABINET_SUPERVISOR_URL` is in the spawned children's env (`ps eww`).
   - Restart works without quitting the CLI.
4. **`npm run dev:all` path**:
   - Daemon-side `GET /diagnostics/logs` returns recent lines.
   - App-logs and restart endpoints return `hint` strings, not 500s.
   - UI swaps Restart button for the dev-mode hint snippet.
5. **Crash handler**:
   - From a debug route, `process.kill(process.pid, "SIGTERM")` the daemon.
   - After respawn, `~/Documents/Cabinet/.cabinet-state/logs/daemon-last-crash.log` exists with the buffer contents at time of death.
6. **No regression on healthy state** — popover still shows "All Systems Running" header; error block absent when both services report `ok`.
7. **Footprint check** — run for 30 min producing chatty logs; daemon RSS doesn't grow >256 KB above baseline.

## Open questions for review

- Backend report payload retention/PII policy: does cabinet-backend already have a precedent we should match?
- Crash-log read on boot — should the popover surface "Cabinet crashed last time" proactively, or only when the user opens the popover?
- Should the supervisor HTTP server be bound only to `127.0.0.1`, or do we ever need `::1` too?
- Buffer size of 2000 lines / ~256 KB: too tight? Daemon stdout under load can be chatty.
