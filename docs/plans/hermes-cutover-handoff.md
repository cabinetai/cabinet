# Hermes-First Cabinet Cutover Handoff

Status: cutover approved by Jeremy Hamilton on 2026-07-18

Cabinet is now Jeremy's primary Hermes UI. This approval closed M7 and authorized M8 work. At the time of this handoff it did not authorize merging GitHub PR #1; that PR was subsequently approved and merged as `e2b0ba4c`.

## Branch, build, and launch

The approved source is branch `feat/hermes-runtime` at or after commit `3fadd337`, which includes the M8 shadow cockpit.

From `/Users/ignitabull/projects/active/hermes-cabinet`, with the server-only Hermes variables from `.env.example` configured in the launch environment:

```bash
git switch feat/hermes-runtime
npm ci
npm run build
PORT=4000 CABINET_DAEMON_PORT=4100 npm run start
```

Open `http://127.0.0.1:4000`. For development, the equivalent launch is `npm run dev:all` after exporting the same server-only Hermes variables.

Required values are `CABINET_RUNTIME_MODE=hermes`, the API, management, and interactive gateway endpoints and credentials, and `CABINET_HERMES_PROFILE=operator-os`. Credentials must remain server-side and must never use a `NEXT_PUBLIC_` name.

## Required processes

1. Cabinet Next.js app on port 4000.
2. Cabinet daemon on port 4100. It supports Cabinet file, event, and artifact surfaces even though Hermes owns agent execution.
3. Hermes Run API on `127.0.0.1:8642` with the configured bearer credential. It must answer `/health` and the profile-scoped `/p/operator-os/v1/runs` surface.
4. Hermes interactive gateway for `operator-os` on `127.0.0.1:8645`. Conversations, clarifications, secrets, and sudo use this path.
5. Hermes management compatibility service on its discovered loopback port, currently `127.0.0.1:56314`. The installed Hermes Desktop 0.18 process owns this service and may run in the background. Its UI is not part of the routine workflow.
6. The `operator-os` Hermes profile and gateway worker. Cabinet must report that exact profile before work begins.

## Connection verification

In Cabinet, open **Settings → Advanced Hermes**.

- The health summary must say **Online**, version `0.18.2`, profile `operator-os`, and gateway running.
- **Memory namespace and recall health** must show namespace `operator-os:supermemory`, provider `supermemory`, capture `active`, and recall `healthy`.
- **Plugins, MCP, Executor, and OpenCLI** must show Hermes toolsets. The execution baseline is connected when Terminal, File Operations, and Code Execution are enabled and configured. These are the current Hermes execution mechanisms Cabinet groups under the Executor management surface.
- OpenCLI is connected when that row says **Connected** and reports a running daemon, connected browser extension, and at least one connected profile. OpenCLI is currently installed and connected as an external CLI invoked through Hermes' enabled Terminal toolset. The clean profile has no separate Hermes-native OpenCLI skill; that is a distinct, optional capability.
- **Management diagnostics** must report a healthy response. Any degraded area is a stop signal for the affected management workflow.

The same non-secret verification is available from `GET /api/hermes/health` and `GET /api/hermes/management` on the Cabinet origin.

## Hermes Desktop diagnostic escape hatch

Go to **Settings → Advanced Hermes → Management diagnostics → Hermes Desktop diagnostic escape hatch** and choose **Open Hermes Desktop diagnostics**. Cabinet requires a confirmation and invokes the fixed macOS command `open -a Hermes`. Use it only for diagnosis or emergency recovery, not as a competing daily execution interface.

## Accepted M7 limitations

1. **Run SSE is not a durable replay log.** After an unreconstructable upstream event gap, Cabinet reconciles current state but marks `exactReplay: false`. Treat the run state as authoritative and the missing event interval as incomplete evidence.
2. **Background runs cannot answer secret or sudo requests in Hermes 0.18.2.** Cabinet rejects a background run that declares either requirement before launch. Use an interactive Operator conversation for that work.
3. **Management is pinned to Hermes Desktop 0.18 internals.** Profiles, skills, cron, memory, MCP, plugins, and toolset management depend on the separately authenticated local compatibility service. Revalidate the adapter before upgrading Hermes.
4. **The diagnostic launcher is macOS-only.** It is verified against `/Applications/Hermes.app`. Other platforms fail closed until a platform-specific launcher is implemented and tested.
5. **`operator-os` begins intentionally clean.** It has no installed Hermes skills, jobs, or MCP servers. OpenCLI is available as an external CLI through the Hermes Terminal toolset, not as a separately installed Hermes skill. Add canonical profile resources through confirmed Advanced Hermes controls as actual work requires them.

## Cutover boundary

Hermes remains authoritative for sessions, runs, profiles, skills, cron, plugins, tools, memory, approvals, secrets, sudo, and execution telemetry. Cabinet owns presentation, human-authored knowledge, comments, artifacts, diagnostics, and rebuildable projections. The implementation from PR #1 is now on `main`.
