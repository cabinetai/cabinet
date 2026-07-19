# M6 First-Class Hermes Management Acceptance

Status: implementation and acceptance evidence complete on 2026-07-18

This milestone makes Cabinet a governed management surface over Hermes. It does not approve daily cutover. Cabinet remains secondary until M7 passes and Jeremy explicitly approves the cutover.

## Source-of-truth architecture

- Hermes remains authoritative for profiles, agent manifests, skills, jobs, memory, MCP servers, toolsets, plugins, runs, approvals, secrets, and sudo.
- `HermesManagementClient` is a version-pinned compatibility adapter for the installed Hermes Desktop 0.18 management surface. It uses a dedicated server-only dashboard session token, never the Run API bearer key or gateway token.
- `HermesRunClient` is separately profile-scoped to `/p/{profile}/v1/runs`. A server bridge owns one upstream SSE subscription per run and fans out a bounded, rebuildable projection to browser clients.
- Cabinet's capability ledger stores operator governance evidence only. It does not copy or replace Hermes skill state.
- Cabinet has no scheduler. Job creation, pause, resume, and immediate execution write to Hermes cron.
- Every consequential management mutation requires an explicit browser confirmation, a reason, and an idempotency key. Unconfirmed writes fail with HTTP 428 before Hermes is called.

## Issue acceptance matrix

| Linear issue | Delivered evidence |
| --- | --- |
| IG-428 Skills | Canonical list and status, enable/disable, profile-scoped hub installation, SKILL.md creation and replacement, and explicit job skill attachments. |
| IG-429 Profiles and manifests | Canonical profile list; current SOUL.md; isolated profile creation requiring an isolation reason; governed manifest replacement. |
| IG-430 Cron and jobs | Canonical job calendar/status; job creation with schedule, prompt, and skills; pause, resume, and run-now controls. |
| IG-431 Supermemory | Active provider, profile namespace, capture state, recall health, provider availability, and built-in-memory evidence without credential or raw-memory egress. |
| IG-432 Tooling | Normalized MCP, Executor/toolset, dashboard plugin, and OpenCLI availability views, with governed MCP and toolset enablement. |
| IG-433 Capability lifecycle | Sequential Draft, Tested, Approved, Scheduled, Monitored, and Trusted promotions with stage-specific evidence. Cabinet never infers operator approval or trust from AI output. |
| IG-434 Acceptance suite | Unit contracts, isolated production-browser acceptance, full regression suite, typecheck, lint, build, and live Hermes checks. |
| IG-435 Run evidence | Context-linked run history with lifecycle, duration, tools, retries, errors, token usage, result, and recovery evidence. |
| IG-452 HermesRunClient | Typed start/get/stream/approve/stop/reconcile client, stable approval identities, idempotent starts, ordered browser fan-out, and degraded reconnect semantics. |

## Secure and degraded behavior

- The browser never receives the Hermes API key, management token, gateway token, secret values, or sudo values.
- Management reads fail closed by area if the dedicated dashboard token is missing or rejected. Read-only health remains available independently.
- Hermes 0.18.2 does not expose `secret.request`, `secret.respond`, `sudo.request`, or `sudo.respond` through the Run API. A run declaring either requirement is rejected with HTTP 422 before launch and must use the interactive gateway path.
- Run SSE is not an upstream replay log. Cabinet assigns a local monotonic projection sequence. Reconnection can restore the current run and retained projection but reports `exactReplay: false` when the upstream gap cannot be reconstructed.
- Approval writes require the exact stable pending request identity. Missing or stale identities are rejected before Hermes is called.

## Live Hermes evidence

The version-pinned adapter connected to the local Hermes Desktop 0.18.2 process using its dedicated management credential and returned:

- three profiles, including `operator-os`
- 25 toolsets and two dashboard plugins
- zero installed skills, zero jobs, and zero MCP servers for the clean `operator-os` profile
- Supermemory namespace `operator-os:supermemory`, capture active, and recall healthy
- healthy normalized diagnostics

No live skill, job, profile, plugin, or tool mutation was made merely to prove a button. Those are canonical operator resources and the acceptance suite exercises their exact confirmed write contracts without altering the clean profile.

A real background run was started through Cabinet with idempotency key and context `m6-acceptance:IG-452`:

- run ID: `run_d15e13cdecca4820be13d2e842885095`
- result: `M6_RUN_OK`
- terminal state: completed
- usage: 20,969 input, 6 output, 20,975 total tokens
- projection: ordered sequences 1 through 7, ending with `run.completed` and `bridge.reconciled`
- reconnect from sequence 4 returned only sequences 5, 6, and 7, then closed at sequence 7
- repeating the same idempotency key returned the same run ID and left only one projected run

The active profile uses Hermes manual approvals. Harmless commands were correctly allowed without a prompt; Hermes only pauses commands its danger policy classifies as consequential. Mocked contract acceptance proves pending approval projection and stale-decision rejection. Earlier M3 live gateway acceptance remains the evidence for interactive approval, secret, and sudo flows. M6 does not broaden that claim.

## Verification

- Focused M6 contract tests: 11 passed
- Full unit suite: 449 passed
- TypeScript: passed
- ESLint: 0 errors and 110 pre-existing warnings
- Isolated production-browser acceptance: 3 passed
- Production build: passed with two existing broad NFT trace warnings
- `git diff --check`: passed

## Definition of done

The implementation and acceptance gates are complete. M6 is closed after the code and evidence are committed and IG-428 through IG-435 plus IG-452 are synchronized in Linear. M7 remains the full conversion gate. M8 remains blocked by M7.
