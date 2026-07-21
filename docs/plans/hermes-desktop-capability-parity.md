# Hermes Desktop Capability Parity and Visibility

Status: **Phases 1 through 4C implemented and merged; this remains a living parity and live-evidence register**

This audit compares runtime-detected installed Hermes metadata, live installed Hermes Agent management/runtime surfaces, a dated upstream `NousResearch/hermes-agent` audit, Cabinet `feat/hermes-functional-parity`, and Cabinet-native equivalents. Installed Hermes determines what can work now. Upstream-only functionality is never counted as current installed support.

The persisted upstream audit was captured at `2026-07-19T21:06:53Z` from commit `0d2ad3993eb91c486854bc71e2721b747ab1d0f4`. The installed backend was Hermes Agent `0.18.2` at `594308d4bbe95548c9fe418bb10c449099426f93`, 328 commits behind that upstream point. Cabinet labels the audit stale when the detected installed version or commit changes, or when the audit ages beyond seven days. Hermes Desktop is detected as `0.17.0`; its source commit is shown as unknown because the installed bundle does not expose a stable source identifier.

## Parity states

- `first_class`: the Cabinet registry records a fully exposed and governed surface. Runtime failure can degrade health and evidence credit, but cannot erase the implemented surface.
- `mapped`: Cabinet has a different but equivalent surface.
- `visible_read_only`: current status and useful details are visible, but management remains elsewhere or is intentionally withheld.
- `diagnostic_only`: available through an explicit diagnostic escape path.
- `unsupported`: the installed Hermes version does not expose a stable interface.
- `missing`: Hermes supports it but the Cabinet registry explicitly records no usable surface.

## Functional parity dimensions

Parity is reported as four independent dimensions so discoverability cannot disguise missing live data or controls. The percentages below are calculated from all 48 inventoried capabilities; unsupported and inconvenient capabilities are not omitted.

<!-- GENERATED:HERMES_PARITY_SUMMARY:START -->
Live-runtime projection captured 2026-07-21T01:32:43.293Z.

| Audience | Discoverability | Current live visibility | Governed management | Live-proven |
| --- | ---: | ---: | ---: | ---: |
| Operator (14) | 100% | 0% | 14% | 21% |
| Management (22) | 100% | 0% | 5% | 0% |
| Developer (12) | 100% | 0% | 0% | 0% |
| All capabilities (48) | 100% | 0% | 6% | 6% |
<!-- GENERATED:HERMES_PARITY_SUMMARY:END -->

These are implementation-branch values, not a closure claim. The Control Center calculates and displays the same dimensions from the full registry at runtime.

## Complete parity matrix

| Capability | Hermes Desktop route or source | Installed-version support | API, gateway method, or local interface | Existing Cabinet surface | Parity state | Risk | Mode | Missing work | Test evidence |
|---|---|---|---|---|---|---|---|---|---|
| Chat and sessions | / and apps/desktop/src/app/chat | Supported | Gateway WebSocket sessions and /api/sessions | [Agents conversations](/agents) | `mapped` | consequential | Operator | Keep Hermes transcript and execution history canonical. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Command Center | /command-center | Supported | /api/status, /api/system/stats, /api/ops/* | [Hermes Overview](/hermes) | `visible_read_only` | low | Operator | Add confirmed maintenance actions after owner review. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Skills | /skills | Supported | Management `/api/skills` and `/api/skills/hub/*`; Agent `GET /v1/skills` catalog | [Cabinet Skills and Hermes Tools](/hermes?section=tools) | `mapped` | consequential | Operator | No duplicate catalog. Continue projecting Hermes skill provenance and enablement. | Installed Hermes Agent 0.19 source plus authenticated live Agent catalog observation |
| Messaging | /messaging | Supported | /api/messaging/platforms and Gateway | [Hermes Messaging](/hermes?section=messaging) | `visible_read_only` | consequential | Operator | Add confirmed platform repair and test actions without exposing credentials. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Artifacts | /artifacts | Supported | /api/sessions/{id}/messages, /api/files, runtime tool events | [Hermes Artifacts](/hermes?section=artifacts) | `visible_read_only` | low | Operator | Add safe preview, reveal, and download while preserving Hermes session/run association. | Exact management fixture plus live `/api/files` projection |
| Cron and background jobs | /cron | Supported | /api/cron/jobs and /api/cron/jobs/{id}/runs | [Hermes Automations](/hermes?section=automations) | `visible_read_only` | consequential | Operator | Add a reviewed management surface; existing mutations remain confirmation and idempotency gated. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Profiles | /profiles | Supported | /api/profiles and /api/profiles/{name}/soul | [Hermes Agents](/hermes?section=agents) | `visible_read_only` | consequential | Operator | Add reviewed profile management and keep profile and runtime agent identities visually distinct. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Agents and subagents | /agents | Supported | Gateway events, run state, kanban worker API when plugin is enabled | [Hermes Agents](/hermes?section=agents) | `visible_read_only` | consequential | Operator | Governed termination of one specifically identified active Kanban run is implemented behind fresh live authority, exact typed confirmation, stale-state protection, and idempotent reconciliation. No live mutation has yet been performed. | Exact management fixture plus live active-worker API projection |
| Starmap and memory graph | /starmap | Supported | /api/learning/graph and /api/learning/node | [Hermes Memory](/hermes?section=memory) | `visible_read_only` | consequential | Operator | Render only reported nodes and recall relationships. No fabricated edges. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Settings | /settings | Supported | /api/config/schema, /api/config and scoped management APIs | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Expose safe typed fields gradually; raw config remains Developer-only. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Providers | /settings?tab=providers | Supported | /api/auth/providers, /api/providers/oauth, /api/providers/validate | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | secret | Operator | Add safe OAuth/setup flows; never serialize tokens. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Provider accounts | /settings?tab=providers&pview=accounts | Supported | /api/providers/oauth and /api/credentials/pool | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | secret | Operator | Expose account labels and health only. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Models | /settings?tab=config:model | Supported | /api/model/info, /api/model/options, /api/model/set | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Add confirmed default and profile override controls. | Hermes Agent 0.18.2 live OpenAPI and management response |
| API keys and tools | /settings?tab=keys | Supported | Management `/api/env` and `/api/tools/toolsets`; Agent `GET /v1/toolsets` catalog | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | secret | Operator | Show configured/not configured only. Values stay server-side. | Installed Hermes Agent 0.19 source plus authenticated live Agent catalog observation; canonical key state remains unavailable |
| Gateway | /settings?tab=gateway | Supported | /api/gateway/start\|stop\|restart and detailed health | [Hermes Overview](/hermes?capability=gateway) | `visible_read_only` | consequential | Operator | Add confirmed restart/reconnect with failure-log excerpt. | Hermes Agent 0.18.2 live OpenAPI and management response |
| MCP | /skills?tab=mcp | Supported | /api/mcp/servers and /api/mcp/catalog | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Add a reviewed management surface; mutations remain confirmation gated. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Plugins | /settings?tab=plugins | Supported | /api/dashboard/plugins and /api/dashboard/agent-plugins/* | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Add explicit install/update/disable confirmations. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Notifications | /settings?tab=notifications | Supported | Desktop local preferences plus OS notification permission | [Hermes Settings](/hermes?section=settings) | `mapped` | low | Operator | Cabinet manages its equivalent event preferences and in-app test; it does not claim control of every Desktop-local preference. | Exact browser fixture and live non-prompting permission projection |
| Archived chats | /settings?tab=sessions | Supported | /api/sessions, search, export, delete | [Hermes Sessions](/hermes?section=sessions) | `visible_read_only` | consequential | Operator | Add restore/export and separately confirmed delete. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Billing | Upstream /settings billing module | Not in installed Desktop 0.17.0 | Upstream-only portal billing client | [Hermes Settings](/hermes?section=settings) | `unsupported` | consequential | Operator | Upgrade installed Desktop/backend only after separate approval and re-audit. | Present on upstream main, absent at installed Desktop commit |
| About and updates | /settings?tab=about | Supported | /api/hermes/update/check and app metadata | [Hermes Overview](/hermes?capability=about-updates) | `visible_read_only` | consequential | Operator | Upgrade requires explicit owner approval and restart handoff. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Model settings | /settings?tab=config:model | Supported | /api/model/* and config schema | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Add reasoned, confirmed mutations. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Chat settings | /settings?tab=config:chat | Supported | /api/config/schema and /api/config | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Project safe fields into typed controls. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Appearance | /settings?tab=config:appearance | Desktop-local | Desktop local theme and font preferences | [Cabinet appearance](/settings/appearance) | `mapped` | low | Operator | Desktop-only themes remain diagnostic because Cabinet has its own theme system. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Workspace | /settings?tab=config:workspace | Supported | /api/config and /api/fs/default-cwd | [Cabinet rooms and linked repos](/) | `mapped` | consequential | Operator | Keep Hermes working directory visible without duplicating Cabinet workspace state. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Safety | /settings?tab=config:safety | Supported | Approvals config, hooks, security audit | [Existing Hermes approval boundaries](/hermes?section=settings) | `mapped` | consequential | Operator | Do not weaken Jeremy-only approval gates. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Memory and context | /settings?tab=config:memory | Supported | /api/memory and /api/memory/providers/* | [Hermes Memory](/hermes?section=memory) | `visible_read_only` | consequential | Operator | Add safe inspect/search; delete/archive only when supported and confirmed. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Voice | Chat composer and /settings voice fields | Supported | /api/audio/transcribe, /api/audio/speak, config status | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | low | Operator | Permission probe is live; owner permission and reviewed record/transcribe/playback remain required. | Exact management fixture plus non-prompting browser permission projection |
| Advanced configuration | /settings?tab=config:* | Supported | /api/config/raw and /api/config/schema | [Hermes Developer](/hermes?mode=developer) | `diagnostic_only` | secret | Developer | Provide redacted read-only projection before any raw editor. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Files | Right sidebar Files | Supported | /api/fs/* and /api/files/* | [Cabinet data tree and viewers](/) | `mapped` | consequential | Developer | Hermes remote files need association and safe reveal/download. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Terminal | Right sidebar Terminal | Supported | Hermes PTY plus Cabinet daemon PTY | [Cabinet Terminal](/hermes?mode=developer) | `mapped` | consequential | Developer | No silent fallback between Hermes and Cabinet execution. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Source-control review | Right sidebar Review | Supported | /api/git/review/* | [Cabinet git history and diffs](/hermes?mode=developer) | `mapped` | consequential | Developer | Ship/push actions remain outside read-only Control Center. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Projects | Chat sidebar Projects | Supported | Hermes project config and session cwd | [Cabinet rooms and linked repos](/) | `mapped` | consequential | Developer | Show Hermes project identity alongside Cabinet scope. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Worktrees | Project and session controls | Supported | /api/git/worktrees | [Hermes Developer](/hermes?mode=developer) | `visible_read_only` | consequential | Developer | Add confirmed add/remove only after read-only inventory proves safe paths. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Session tabs | Pane shell and session switcher | Desktop-local | Desktop pane store and Hermes session routes | [Cabinet task tabs and rail](/tasks) | `mapped` | low | Developer | Do not duplicate desktop pane layout state. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Session pinning | Session sidebar actions | Supported | Session metadata and Desktop ordering | [Hermes Sessions](/hermes?section=sessions) | `visible_read_only` | low | Operator | Stable remote pin mutation is not exposed by installed management API. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Command palette | Desktop command palette | Desktop-local | Desktop local contribution registry | [Cabinet command search](/) | `mapped` | low | Developer | Hermes actions are discoverable through Control Center search. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Keyboard shortcuts | Desktop keybind panel | Desktop-local | Desktop local keybind store | [Cabinet keyboard shortcuts](/help) | `mapped` | low | Developer | List Hermes-only keybindings diagnostically when safe source is available. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Layout controls | Pane shell layouts | Desktop-local | Desktop local pane store | [Cabinet layout controls](/hermes?mode=developer) | `mapped` | low | Developer | No cross-application layout synchronization. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Approvals and pending input | Chat tool approvals | Supported | Gateway decision events and run approval endpoint | [Cabinet Hermes conversations](/agents) | `first_class` | consequential | Operator | Existing confirmation, owner identity, and idempotency behavior is unchanged. | Cabinet Hermes gateway and run contract tests |
| Browser and OpenCLI | Hermes Terminal toolset | External installation detected at runtime | opencli doctor and browser bridge CLI | [Hermes Tools](/hermes?capability=browser-opencli) | `visible_read_only` | consequential | Operator | Add a reviewed repair/reconnect action and keep external OpenCLI distinct from Hermes-native skills. | OpenCLI doctor plus local read-only acceptance |
| Executor | Hermes terminal/code execution | Supported | Agent `GET /v1/toolsets` catalog; runtime tool events and terminal backend remain separate interfaces | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Show backend and active action without creating a second executor. | Installed Hermes Agent 0.19 source plus authenticated live Agent catalog observation; operational health remains unproven |
| Raw logs | Command Center maintenance | Supported | /api/logs | [Hermes Developer](/hermes?mode=developer) | `diagnostic_only` | secret | Developer | Redact secrets and bound log output before browser exposure. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Low-level gateway diagnostics | Gateway settings and logs | Supported | Gateway health, logs, drain, restart | [Hermes Developer](/hermes?mode=developer) | `diagnostic_only` | secret | Developer | Display URL identity without query tokens or authorization material. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Computer Use | /settings computer-use panel | Supported | /api/tools/computer-use/status | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Permission grants remain explicit OS-scoped actions. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Backup and restore | Command Center maintenance | Supported | /api/ops/backup and /api/ops/import | [Hermes Settings](/hermes?section=settings) | `diagnostic_only` | consequential | Operator | Add reviewed download/import workflow with confirmation. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Security audit | Command Center maintenance | Supported | /api/ops/security-audit | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | low | Operator | Show bounded audit results without package credentials. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Usage insights | Command Center analytics | Supported | /api/analytics/usage and /api/analytics/models | [Hermes Overview](/hermes) | `visible_read_only` | read_only | Operator | Add bounded cost/rate-limit summaries when reported. | Hermes Agent 0.18.2 live OpenAPI and management response |

## Functional implementation evidence

The Phase 1 matrix above remains the complete inventory. Runtime projection independently reports health, evidence, and credit without rewriting the registry-owned Cabinet surface state.

| Module | Live interface | Current delivery | Safety and remaining work |
| --- | --- | --- | --- |
| Agents and subagents | `/api/plugins/kanban/workers/active` and board runs | Active/recent workers, parent session/run, task, profile distinction, state, current action, result, and error | Governed termination of one specifically identified active Kanban run is implemented behind fresh live authority, exact typed confirmation, stale-state protection, and idempotent reconciliation. No live mutation has yet been performed. |
| Messaging | `/api/messaging/platforms` | Platform, configured/connected state, destination identity, incoming trigger state, outbound permission, last success, and failure | Test/send/setup remain disabled; no credential values reach the response. |
| Notifications | Cabinet browser/in-app notification surface | Six requested event preferences, completion sound preference, browser permission status, and in-app test | This is `mapped`, not a claim that Cabinet manages every Hermes Desktop preference. It never prompts for permission automatically. |
| Voice | `/api/audio/transcribe` and `/api/audio/speak` plus browser Permissions API | Unprobed server interfaces remain unknown; browser permission is observed without prompting | Recording and playback require Jeremy's explicit browser permission and live review. No permission prompt was triggered during implementation. |
| Artifacts | `/api/files` | Global typed file index with size, timestamp, and available associations | Safe preview/reveal/download and richer run/session association remain missing. |
| Memory / Starmap | `/api/learning/graph` | Exact nodes, edges, counts, source, age, profile, and honest empty state | A historical `operator-os` runtime record captured at `2026-07-19T21:06:53Z` reported 39 nodes and 38 edges. The Phase 2A.2 acceptance fixture for `operator-os`, captured at `2026-07-19T22:15:00.000Z`, is explicitly empty. Neither observation is treated as a profile-independent claim, and Cabinet does not fabricate relationships. Search/inspect and confirmed delete/archive remain missing. |
| Sessions / archives | `/api/sessions` | Searchable canonical session rows with date, profile, status, archive/pin fields, model, and preview | Export, restore, and confirmed delete remain missing. Cabinet opens the canonical session surface rather than inventing a resume mutation. |
| Providers, models, gateway | `/api/auth/providers`, `/api/model/info`, `/api/model/options`, live status | Redacted provider authentication state, model availability/current model, gateway mode/state, and last connection | Account setup, model changes, and gateway restart/reconnect remain owner-gated and are not enabled here. |
| Browser / OpenCLI | bounded `opencli doctor` plus local read-only acceptance | Version, safe binary path, daemon/extension/profile connectivity, capability support, last diagnostic, and explicit recheck | Repair/reconnect remains disabled pending a reviewed governed action. No duplicate Hermes-native OpenCLI skill is installed. |

### Exact missing capabilities

- Operator: safe artifact open/reveal/download; messaging repair/test; voice recording/transcription/playback after permission; memory search/inspect; archive restore/export/delete; confirmed OpenCLI repair/reconnect.
- Management: governed provider/account setup, model/default/profile changes, gateway lifecycle, plugin/MCP/skill administration, notification-center history, update controls, and safe bounded maintenance workflows.
- Developer: live typed projections for terminal, files, source-control review, projects, worktrees, raw configuration/logs, keybindings, session tabs/pinning, layout, and low-level gateway diagnostics. These remain discoverable but earn no Live Visibility, Governed Management, or Live-Proven credit yet.
- Installed-version unsupported: Billing remains `unsupported`; a future upstream feature is not counted as installed parity.

### Owner action queue

1. Grant microphone permission and review live record, transcription, playback, and failure behavior.
2. Approve any provider OAuth or account interaction before it is tested.
3. Approve model/default/profile changes before mutation testing.
4. Approve gateway or production-process restart/reconnect tests.
5. Approve plugin, skill, or MCP installation/change tests.
6. Review live session archive/export/restore behavior before destructive delete is added.
7. Review a governed OpenCLI repair/reconnect contract before that control is enabled.

## Source evidence

- Installed Desktop metadata: `/Applications/Hermes.app/Contents/Info.plist` and `install-stamp.json`.
- Installed Desktop source commit: unavailable from the installed bundle. Commit `311a5b0a552be78f5c58807e2be1db02e3badcb0` is historical Desktop source-audit evidence only, never detected installed metadata.
- Installed backend: `Hermes Agent v0.18.2 (2026.7.7.2)`, live detailed health, authenticated management OpenAPI, and stable management responses.
- Upstream main audit: `0d2ad3993eb91c486854bc71e2721b747ab1d0f4`, fetched 2026-07-19. Installed backend was 328 commits behind at audit time.
- Cabinet: current `feat/hermes-functional-parity` source, management/gateway/run clients, native skills, files, terminal, git, task, session, and approval surfaces.

## Architectural boundaries

Hermes remains canonical for profiles, skills, schedules, memory, sessions, runtime events, and gateway state. Cabinet is a searchable projection and control surface. The Control Center never returns raw keys, tokens, credential values, or secret-bearing gateway URLs. A visible capability is not automatically writable. Consequential mutations continue to require confirmation, reason, owner authorization, and idempotency. Cabinet does not create a duplicate scheduler, skill catalog, memory store, session history, or execution fallback.

## Proof and freshness semantics

Proof kind records how evidence was obtained; proof scope records what it can prove. Only a fresh successful `live_runtime_operation` or an explicit successful `historical_live_acceptance` earns Live-Proven credit. A `source_audit`, `exact_fixture_path`, `cabinet_local_surface`, registry record, failure, or conflict never earns that credit. Exact fixtures prove only the named projection or UI path and remain a non-parity signal.

The projection assembler derives effective freshness from the injected reference time, observation timestamp, proof scope, a bounded future-clock allowance, and a small source-class TTL policy. Caller-asserted freshness is retained for comparison but cannot override timestamp age. Historical evidence stays historical; invalid, missing, or implausibly future observation times become unknown. Generated time is never substituted for observation time.

Gateway reconciliation groups evidence by source and interface, retains the latest valid record per source, and reports a current conflict only when fresh concrete running and stopped sources disagree. Stale, invalid-time, unavailable, and unknown records remain visible as evidence but cannot create a current disagreement.

## Open review items

- Re-audit billing after an approved Hermes upgrade; it is upstream-only for the installed Desktop build.
- Promote diagnostic-only notification, raw configuration, raw log, backup/restore, and gateway diagnostic surfaces only after stable safe projections exist.
- Complete live owner review of the matrix and Control Center before closing this workstream.

<!-- GENERATED:HERMES_TRUTH_STATE:START -->
## Generated per-capability truth-state evidence

Generated at 2026-07-21T01:32:39Z. Live runtime projection captured 2026-07-21T01:32:43.293Z.

Implementation revision: `c547e79d3c6cf3ffb1fa93307d1e13ef623a075c`. Artifact generated at: 2026-07-21T01:32:39Z.

Installed Desktop source commit: **unknown**. The commit `311a5b0a552be78f5c58807e2be1db02e3badcb0` is historical Desktop source-audit evidence only.

All 48 rows and all displayed percentages use the production Hermes Control Center projection assembler. Generated time is not an observation time. Exact fixture path proof is non-parity evidence and never earns Live-Proven credit.

Overall credits: Discoverability 48/48 (100%); Current Live Visibility 0/48 (0%); Governed Management 3/48 (6%); Live-Proven 3/48 (6%).

<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:START -->
### Live-Proven attribution

Generated directly from the canonical capability projection.

| Capability ID | Classification | Evidence origin | Proof kind | Proof scope | Source | Interface | Observed at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `command-center` | current | `raw_observation` | live | live_runtime_operation | Hermes detailed health bridge | /health/detailed | 2026-07-21T01:32:40.983Z |
| `approvals` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | Cabinet Hermes M3-M7 acceptance suite | Hermes gateway and run decision contract | 2026-07-19T02:23:07Z |
| `browser-opencli` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | OpenCLI read-only acceptance | opencli local page title, DOM read, and screenshot | 2026-07-19T20:18:51Z |
<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:END -->

| Capability | Installed | Cabinet surface | Operational health | Kind / scope / outcome | Source | Interface | Observed at | Asserted / effective freshness | Fixture path | Credits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chat and sessions | supported | `mapped` | `degraded` | live / live_runtime_operation / success | Hermes Agent API sessions | /api/sessions?limit=100&offset=0&include_children=true | 2026-07-21T01:32:40.984Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Command Center | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes detailed health bridge | /health/detailed | 2026-07-21T01:32:40.983Z | fresh / fresh | no | D:yes L:no M:no P:yes |
| Skills | supported | `mapped` | `degraded` | live / live_runtime_operation / success | Hermes Agent API skill catalog | /v1/skills | 2026-07-21T01:32:40.986Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Messaging | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes messaging platforms | /api/messaging/platforms | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Artifacts | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes artifact metadata | /api/files | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Cron and background jobs | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes cron jobs | /api/cron/jobs | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Profiles | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes profiles | /api/profiles | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Agents and subagents | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes active workers | /api/plugins/kanban/workers/active | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:yes P:no |
| Starmap and memory graph | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes memory graph | /api/learning/graph | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Settings | supported | `visible_read_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Providers | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes model options | /api/model/options | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Provider accounts | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes model options | /api/model/options | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Models | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes Agent API advertised models | /v1/models | 2026-07-21T01:32:40.985Z | fresh / fresh | no | D:yes L:no M:no P:no |
| API keys and tools | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes Agent API toolset catalog | /v1/toolsets | 2026-07-21T01:32:40.986Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Gateway | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unknown | Hermes health bridge | /health/detailed gateway_state | 2026-07-21T01:32:40.983Z | fresh / fresh | no | D:yes L:no M:no P:no |
| MCP | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes MCP servers | /api/mcp/servers | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Plugins | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes dashboard plugins | /api/dashboard/plugins | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Notifications | supported | `mapped` | `unknown` | historical_audit / source_audit / success | Cabinet notification preference component contract | Hermes Desktop source audit | 2026-07-19T21:06:53Z | stale / stale | no | D:yes L:no M:yes P:no |
| Archived chats | supported | `visible_read_only` | `unknown` | live / live_runtime_operation / unknown | Hermes Agent API sessions | /api/sessions?limit=100&offset=0&include_children=true | 2026-07-21T01:32:40.984Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Billing | unsupported | `unsupported` | `unavailable` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| About and updates | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes Agent detailed health identity | /health/detailed | 2026-07-21T01:32:40.983Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Model settings | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes Agent API advertised models | /v1/models | 2026-07-21T01:32:40.985Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Chat settings | supported | `visible_read_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Appearance | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Workspace | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Safety | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Memory and context | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes memory | /api/memory | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Voice | supported | `visible_read_only` | `unknown` | live / live_runtime_operation / unknown | Hermes audio interface detection | /api/audio/transcribe and /api/audio/speak | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Advanced configuration | supported | `diagnostic_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Files | supported | `mapped` | `unavailable` | live / live_runtime_operation / unavailable | Hermes artifact metadata | /api/files | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Terminal | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Source-control review | supported | `mapped` | `unavailable` | live / live_runtime_operation / unavailable | Hermes Git status and review | /api/git/status + /api/git/review/list | 2026-07-21T01:32:43.289Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Projects | supported | `mapped` | `unavailable` | live / live_runtime_operation / unavailable | Hermes session project association | /api/sessions?limit=100 | 2026-07-21T01:32:43.289Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Worktrees | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes Git worktrees | /api/git/worktrees | 2026-07-21T01:32:43.289Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Session tabs | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Session pinning | supported | `visible_read_only` | `unknown` | live / live_runtime_operation / unknown | Hermes Agent API sessions | /api/sessions?limit=100&offset=0&include_children=true | 2026-07-21T01:32:40.984Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Command palette | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Keyboard shortcuts | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Layout controls | supported | `mapped` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Approvals and pending input | supported | `first_class` | `unavailable` | live / live_runtime_operation / unavailable | Hermes known-run pending input | /v1/runs/{run_id} + /events | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:yes P:yes |
| Browser and OpenCLI | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | OpenCLI doctor | opencli doctor | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:yes |
| Executor | supported | `visible_read_only` | `degraded` | live / live_runtime_operation / success | Hermes Agent API toolset catalog | /v1/toolsets | 2026-07-21T01:32:40.986Z | fresh / fresh | no | D:yes L:no M:no P:no |
| Raw logs | supported | `diagnostic_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Low-level gateway diagnostics | supported | `diagnostic_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Computer Use | supported | `visible_read_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Backup and restore | supported | `diagnostic_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Security audit | supported | `visible_read_only` | `unknown` | none | registry only | unknown | unknown | unknown / unknown | no | D:yes L:no M:no P:no |
| Usage insights | supported | `visible_read_only` | `unavailable` | live / live_runtime_operation / unavailable | Hermes usage analytics | /api/analytics/usage | 2026-07-21T01:32:43.292Z | fresh / fresh | no | D:yes L:no M:no P:no |

Memory graph observation: no typed graph-count evidence was supplied. No node or edge count is inferred.
<!-- GENERATED:HERMES_TRUTH_STATE:END -->
