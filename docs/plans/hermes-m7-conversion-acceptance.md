# M7 Full Conversion Acceptance and Cutover Evidence

Status: cutover approved by Jeremy Hamilton on 2026-07-18; M7 complete

This document is the evidence package for IG-448, IG-449, IG-419, and Jeremy's decision in IG-450. Jeremy recorded **Approve cutover** on 2026-07-18. Cabinet is now approved as his primary Hermes interface. The cutover decision did not itself authorize a merge; PR #1 was subsequently approved and merged as `e2b0ba4c`.

## Technical verdict

The verified current macOS installation passes the full technical conversion suite. No routine workflow in the definitive M7 inventory requires Hermes Desktop. Hermes Desktop is available only as an explicitly confirmed diagnostic and emergency escape hatch inside Advanced Hermes diagnostics.

## Full conversion matrix

| Requirement | Result | Current evidence |
| --- | --- | --- |
| Conversations and streaming | Pass | M2 live multi-turn streaming and persistence; Hermes gateway unit contracts. |
| Session start, resume, rename, search, branch, interrupt, archive, and recovery | Pass | M4 live 29-session acceptance, service restart, exact retained replay, branch isolation, and duplicate-operation proof. |
| Structured tools and artifacts | Pass | M3 live read/search/terminal tool cards; artifact and diff normalization tests; full browser artifact workflow. |
| Clarifications and approvals | Pass | M3 live browser clarification and command rejection; M6 live Run API pause and denial with stable request identity. |
| Secrets and sudo | Pass | M3 live disposable secret and sudo approval/rejection/cancellation; duplicate submission 409 and persistence scans. |
| Safe retries and idempotency | Pass | M3 read-only retry policy, M4 stable operation claims, M6 duplicate run start returning one run, stale approval rejection. |
| Every visible agent is Hermes-backed | Pass | M5 browser exposes one Operator and no provider/runtime selector; crafted persona writes are forced to `hermes_runtime`. |
| Skills are Hermes skills | Pass | M6 canonical list/status, hub install, create/edit/toggle, and job attachment through Hermes management. No second active catalog. |
| Schedules are Hermes cron | Pass | M6 canonical job inspection/create/pause/resume/run-now. No Cabinet scheduler in Hermes product mode. |
| Profiles and manifests | Pass | M6 canonical profile list, isolated creation reason, and SOUL.md management. |
| Plugins, MCP, Executor, and OpenCLI | Pass | M6 normalized canonical status and governed MCP/toolset controls. |
| Supermemory and runtime health | Pass | Live `operator-os:supermemory` capture active and recall healthy; Hermes 0.18.2 health and diagnostics online. |
| Run history and performance evidence | Pass | Live completed and governed runs with context, outcome, duration, events, errors, retry count, and tokens. |
| Screenshots, diffs, logs, and files | Pass | Existing Cabinet artifact/diff/log surfaces remain available; full 19-test production-browser suite covers file artifacts and failure details. |
| Legacy Cabinet AI inaccessible in normal operation | Pass | M5 removed provider/model/effort/native/terminal/skill/memory/routine/heartbeat/schedule/integration controls and redirects direct Skills navigation. |
| Credentials never reach browser | Pass | Static bundle scan and normalized live management response scan are clear; server clients have credential non-egress tests. |
| Cabinet is a rebuildable projection | Pass | Hermes remains authoritative for sessions, runs, skills, jobs, tools, profiles, approvals, secrets, sudo, and memory. Local run/event and lifecycle evidence are bounded projections or governance records. |

## Hermes Desktop independence inventory

Routine work is completed in Cabinet through these surfaces:

- conversations and decisions: Operator task/conversation UI backed by `HermesGatewayClient`
- sessions and recovery: Advanced Hermes session manager
- background work and approvals: `HermesRunClient` and run evidence panel
- profiles and SOUL.md: Advanced Hermes Profiles and agent manifests
- skills: Advanced Hermes Skills, including hub install and job attachment
- schedules: Advanced Hermes Cron calendar and run controls
- memory: Advanced Hermes Memory namespace and recall health
- tooling: Advanced Hermes Plugins, MCP, Executor, and OpenCLI
- artifacts, screenshots, diffs, and logs: Cabinet task detail and artifact surfaces
- system diagnosis: Cabinet health, management diagnostics, and exported diagnostics

There is no Hermes Desktop link or instruction in the ordinary daily path. The one escape hatch is nested under Advanced Hermes → Management diagnostics, states that it is diagnostic/emergency-only, and requires an explicit confirmation.

## Diagnostic escape hatch proof

- fixed current target: `/Applications/Hermes.app`
- launch command: fixed `open -a Hermes`, with no renderer-supplied executable or arguments
- guards: authenticated Cabinet API, Hermes runtime mode, explicit `confirmed: true`, and exact `purpose: diagnostic`
- unsupported platforms: fail closed with a clear message
- browser acceptance: control location, warning copy, confirmation, exact diagnostic request, and result status
- live macOS acceptance: endpoint returned success and activated Hermes Desktop
- before/after history: 29 Hermes sessions and five Cabinet run projections both before and after activation

Opening the escape hatch starts no prompt or run and creates no competing Cabinet execution history.

## Current verification

- full unit suite: 451 passed
- focused Hermes contracts: 13 passed
- full production-browser suite: 19 passed
- TypeScript: passed
- ESLint: 0 errors and 110 pre-existing warnings
- production build: passed with one existing broad NFT trace warning in this run
- static credential scan: clear
- live normalized management-response sensitive-field scan: clear
- `git diff --check`: passed

The first full browser attempt exposed two test-quality problems: an ambiguous ARIA status locator in the new diagnostic test and a macOS `/var` versus `/private/var` path-spelling assertion in an existing adapter test. The locator was made specific and the containment assertion now compares canonical paths. The complete 19-test suite then passed. Neither failure represented a product runtime escape.

## Known limitations for Jeremy's decision

1. Hermes 0.18.2 Run SSE is not a durable replay log. Cabinet reports degraded reconciliation with `exactReplay: false` when an upstream gap cannot be reconstructed.
2. Secret and sudo decisions are available only through the interactive gateway in Hermes 0.18.2. Declared secret/sudo background runs fail before launch.
3. Full management uses a separately authenticated, version-pinned Hermes Desktop 0.18 compatibility adapter until Hermes exposes equivalent stable public management APIs.
4. The diagnostic launcher is verified for this macOS installation. Other platforms fail closed and need their own verified launcher before a cutover on those platforms.
5. The clean `operator-os` profile intentionally has no installed skills, jobs, or MCP servers. Exact confirmed write contracts are browser/unit tested; acceptance did not mutate canonical operator resources merely to prove controls.

These are documented technical constraints, not hidden dependencies on Hermes Desktop for routine work. Jeremy decides whether they are acceptable for daily cutover.

## Gate resolution

- IG-448: complete
- IG-449: complete
- IG-419: complete
- IG-450: **Approve cutover** recorded by Jeremy on 2026-07-18
- IG-447: complete
- M8: authorized to begin after the cutover handoff is recorded
