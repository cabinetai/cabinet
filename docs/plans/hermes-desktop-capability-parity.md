# Hermes Desktop Capability Parity and Visibility

Status: **Open for Jeremy review**

This audit compares the installed Hermes Desktop 0.17.0 build at commit `311a5b0a552b`, the live installed Hermes Agent 0.18.2 management/runtime surfaces, upstream `NousResearch/hermes-agent` main at `e361c5e20402`, Cabinet `feat/hermes-runtime`, and Cabinet-native equivalents. Installed Hermes determines what can work now. Upstream-only functionality is never counted as current installed support.

## Parity states

- `first_class`: Cabinet fully exposes and manages the capability.
- `mapped`: Cabinet has a different but equivalent surface.
- `visible_read_only`: status and details are visible, but management remains elsewhere.
- `diagnostic_only`: available through an explicit diagnostic escape path.
- `unsupported`: the installed Hermes version does not expose a stable interface.
- `missing`: Hermes supports it but Cabinet does not expose it.

## Current parity

- Operator: **71%**
- Management: **60%**
- Developer: **78%**

The percentage is deliberately weighted so visibility is not confused with full parity: `first_class` and `mapped` count as 1.0, `visible_read_only` as 0.6, `diagnostic_only` as 0.25, and `unsupported` or `missing` as 0. Diagnostic-only items therefore cannot produce a 100% score.

## Complete parity matrix

| Capability | Hermes Desktop route or source | Installed-version support | API, gateway method, or local interface | Existing Cabinet surface | Parity state | Risk | Mode | Missing work | Test evidence |
|---|---|---|---|---|---|---|---|---|---|
| Chat and sessions | / and apps/desktop/src/app/chat | Supported | Gateway WebSocket sessions and /api/sessions | [Agents conversations](/agents) | `mapped` | consequential | Operator | Keep Hermes transcript and execution history canonical. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Command Center | /command-center | Supported | /api/status, /api/system/stats, /api/ops/* | [Hermes Overview](/hermes) | `visible_read_only` | low | Operator | Add confirmed maintenance actions after owner review. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Skills | /skills | Supported | /api/skills and /api/skills/hub/* | [Cabinet Skills and Hermes Tools](/hermes?section=tools) | `mapped` | consequential | Operator | No duplicate catalog. Continue projecting Hermes skill provenance and enablement. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Messaging | /messaging | Supported | /api/messaging/platforms and Gateway | [Hermes Messaging](/hermes?section=messaging) | `visible_read_only` | consequential | Operator | Add confirmed platform repair and test actions without exposing credentials. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Artifacts | /artifacts | Supported | /api/sessions/{id}/messages, /api/files, runtime tool events | [Hermes Artifacts](/hermes?section=artifacts) | `mapped` | low | Operator | Unify session artifacts with Cabinet file viewers while preserving Hermes association. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Cron and background jobs | /cron | Supported | /api/cron/jobs and /api/cron/jobs/{id}/runs | [Hermes Automations](/hermes?section=automations) | `visible_read_only` | consequential | Operator | Add a reviewed management surface; existing mutations remain confirmation and idempotency gated. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Profiles | /profiles | Supported | /api/profiles and /api/profiles/{name}/soul | [Hermes Agents](/hermes?section=agents) | `visible_read_only` | consequential | Operator | Add reviewed profile management and keep profile and runtime agent identities visually distinct. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Agents and subagents | /agents | Supported | Gateway events, run state, kanban worker API when plugin is enabled | [Hermes Agents](/hermes?section=agents) | `visible_read_only` | consequential | Operator | Normalize current tool, parent session, result, error, and supported stop controls. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Starmap and memory graph | /starmap | Supported | /api/learning/graph and /api/learning/node | [Hermes Memory](/hermes?section=memory) | `visible_read_only` | consequential | Operator | Render only reported nodes and recall relationships. No fabricated edges. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Settings | /settings | Supported | /api/config/schema, /api/config and scoped management APIs | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Expose safe typed fields gradually; raw config remains Developer-only. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Providers | /settings?tab=providers | Supported | /api/auth/providers, /api/providers/oauth, /api/providers/validate | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | secret | Operator | Add safe OAuth/setup flows; never serialize tokens. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Provider accounts | /settings?tab=providers&pview=accounts | Supported | /api/providers/oauth and /api/credentials/pool | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | secret | Operator | Expose account labels and health only. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Models | /settings?tab=config:model | Supported | /api/model/info, /api/model/options, /api/model/set | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Add confirmed default and profile override controls. | Hermes Agent 0.18.2 live OpenAPI and management response |
| API keys and tools | /settings?tab=keys | Supported | /api/env, /api/tools/toolsets | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | secret | Operator | Show configured/not configured only. Values stay server-side. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Gateway | /settings?tab=gateway | Supported | /api/gateway/start\|stop\|restart and detailed health | [Hermes Overview](/hermes?capability=gateway) | `visible_read_only` | consequential | Operator | Add confirmed restart/reconnect with failure-log excerpt. | Hermes Agent 0.18.2 live OpenAPI and management response |
| MCP | /skills?tab=mcp | Supported | /api/mcp/servers and /api/mcp/catalog | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Add a reviewed management surface; mutations remain confirmation gated. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Plugins | /settings?tab=plugins | Supported | /api/dashboard/plugins and /api/dashboard/agent-plugins/* | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Add explicit install/update/disable confirmations. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Notifications | /settings?tab=notifications | Supported | Desktop local preferences plus OS notification permission | [Hermes Settings](/hermes?section=settings) | `diagnostic_only` | low | Operator | No stable remote management endpoint for all Desktop notification preferences. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Archived chats | /settings?tab=sessions | Supported | /api/sessions, search, export, delete | [Hermes Sessions](/hermes?section=sessions) | `visible_read_only` | consequential | Operator | Add restore/export and separately confirmed delete. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Billing | Upstream /settings billing module | Not in installed Desktop 0.17.0 | Upstream-only portal billing client | [Hermes Settings](/hermes?section=settings) | `unsupported` | consequential | Operator | Upgrade installed Desktop/backend only after separate approval and re-audit. | Present on upstream main, absent at installed Desktop commit |
| About and updates | /settings?tab=about | Supported | /api/hermes/update/check and app metadata | [Hermes Overview](/hermes?capability=about-updates) | `visible_read_only` | consequential | Operator | Upgrade requires explicit owner approval and restart handoff. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Model settings | /settings?tab=config:model | Supported | /api/model/* and config schema | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Add reasoned, confirmed mutations. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Chat settings | /settings?tab=config:chat | Supported | /api/config/schema and /api/config | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | consequential | Operator | Project safe fields into typed controls. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Appearance | /settings?tab=config:appearance | Desktop-local | Desktop local theme and font preferences | [Cabinet appearance](/settings/appearance) | `mapped` | low | Operator | Desktop-only themes remain diagnostic because Cabinet has its own theme system. | Hermes Desktop 0.17.0 source at 311a5b0a552be78f5c58807e2be1db02e3badcb0 |
| Workspace | /settings?tab=config:workspace | Supported | /api/config and /api/fs/default-cwd | [Cabinet rooms and linked repos](/) | `mapped` | consequential | Operator | Keep Hermes working directory visible without duplicating Cabinet workspace state. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Safety | /settings?tab=config:safety | Supported | Approvals config, hooks, security audit | [Existing Hermes approval boundaries](/hermes?section=settings) | `mapped` | consequential | Operator | Do not weaken Jeremy-only approval gates. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Memory and context | /settings?tab=config:memory | Supported | /api/memory and /api/memory/providers/* | [Hermes Memory](/hermes?section=memory) | `visible_read_only` | consequential | Operator | Add safe inspect/search; delete/archive only when supported and confirmed. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Voice | Chat composer and /settings voice fields | Supported | /api/audio/transcribe, /api/audio/speak, config status | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | low | Operator | Add browser permission probe and explicit start/stop/test controls. | Hermes Agent 0.18.2 live OpenAPI and management response |
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
| Browser and OpenCLI | Hermes Terminal toolset | OpenCLI 1.8.5 connected externally | opencli doctor and browser bridge CLI | [Hermes Tools](/hermes?capability=browser-opencli) | `visible_read_only` | consequential | Operator | Add a reviewed repair/reconnect action and keep external OpenCLI distinct from Hermes-native skills. | OpenCLI doctor plus local read-only acceptance |
| Executor | Hermes terminal/code execution | Supported | Toolsets, runtime tool events, terminal backend | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Show backend and active action without creating a second executor. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Raw logs | Command Center maintenance | Supported | /api/logs | [Hermes Developer](/hermes?mode=developer) | `diagnostic_only` | secret | Developer | Redact secrets and bound log output before browser exposure. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Low-level gateway diagnostics | Gateway settings and logs | Supported | Gateway health, logs, drain, restart | [Hermes Developer](/hermes?mode=developer) | `diagnostic_only` | secret | Developer | Display URL identity without query tokens or authorization material. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Computer Use | /settings computer-use panel | Supported | /api/tools/computer-use/status | [Hermes Tools](/hermes?section=tools) | `visible_read_only` | consequential | Operator | Permission grants remain explicit OS-scoped actions. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Backup and restore | Command Center maintenance | Supported | /api/ops/backup and /api/ops/import | [Hermes Settings](/hermes?section=settings) | `diagnostic_only` | consequential | Operator | Add reviewed download/import workflow with confirmation. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Security audit | Command Center maintenance | Supported | /api/ops/security-audit | [Hermes Settings](/hermes?section=settings) | `visible_read_only` | low | Operator | Show bounded audit results without package credentials. | Hermes Agent 0.18.2 live OpenAPI and management response |
| Usage insights | Command Center analytics | Supported | /api/analytics/usage and /api/analytics/models | [Hermes Overview](/hermes) | `visible_read_only` | read_only | Operator | Add bounded cost/rate-limit summaries when reported. | Hermes Agent 0.18.2 live OpenAPI and management response |

## Source evidence

- Installed Desktop metadata: `/Applications/Hermes.app/Contents/Info.plist` and `install-stamp.json`.
- Installed Desktop source: Git commit `311a5b0a552be78f5c58807e2be1db02e3badcb0`; routes in `apps/desktop/src/app/routes.ts`.
- Installed backend: `Hermes Agent v0.18.2 (2026.7.7.2)`, live detailed health, authenticated management OpenAPI, and stable management responses.
- Upstream main: `e361c5e20402375c74a65ca52810c6a380461226`, fetched 2026-07-19. Installed backend was 325 commits behind.
- Cabinet: current `feat/hermes-runtime` source, management/gateway/run clients, native skills, files, terminal, git, task, session, and approval surfaces.

## Architectural boundaries

Hermes remains canonical for profiles, skills, schedules, memory, sessions, runtime events, and gateway state. Cabinet is a searchable projection and control surface. The Control Center never returns raw keys, tokens, credential values, or secret-bearing gateway URLs. A visible capability is not automatically writable. Consequential mutations continue to require confirmation, reason, owner authorization, and idempotency. Cabinet does not create a duplicate scheduler, skill catalog, memory store, session history, or execution fallback.

## Open review items

- Re-audit billing after an approved Hermes upgrade; it is upstream-only for the installed Desktop build.
- Promote diagnostic-only notification, raw configuration, raw log, backup/restore, and gateway diagnostic surfaces only after stable safe projections exist.
- Complete live owner review of the matrix and Control Center before closing this workstream.
