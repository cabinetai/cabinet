# Optale Observatory Spec

Optale Observatory is the space-oriented admin, governance, eval, trace, and observability application built from the Cabinet codebase. Cabinet provides the strong product shell: file-backed knowledge, agent personas, tasks, schedules, chat, terminal, embedded apps, and a usable operator UI. Optale adds the operating model: company and personal brains, governed MCP access, memory/eval/execution tracking, and Command Center control.

## Product Shape

- **Optale Observatory** is the human-facing application for spaces, agent administration, traces, evals, memory visibility, and governance.
- **Command Center** remains the day-to-day operator/chat interface for orchestration, MCP access, policy-aware work, and emergency control.
- **ORM** remains the structured operational data layer.
- **Brain/Vault/Graph/Memory** become first-class context surfaces inside Optale Observatory instead of separate technical tools.

## Client Model

- Each client can receive an isolated Optale Observatory instance or tenant.
- Each company has a company brain, company agents, company tasks, company memory, company MCP policy, and company execution history.
- Each user can have a personal brain and personal agents.
- Company agents may use company context by default.
- Personal agents may use personal context by default.
- Crossing between company and personal context requires explicit policy, membership, or sharing.

## Agent Scopes

- `company`: shared client/company workspace and memory.
- `personal`: individual user workspace and memory.
- `system`: Optale-controlled agents that operate infrastructure, governance, evals, bridges, and Command Center workflows.

Agents need scope metadata beyond Cabinet's current directory-level cabinet path. The first implementation should keep Cabinet's data model internally while exposing the user-facing unit as a **space**, then add explicit Optale scope metadata that maps a space to company/personal/system ownership.

## MCP Model

Optale Observatory needs two MCP roles.

- **MCP client**: agents can call approved MCP tools through Claude/Codex/Gemini or a native Optale MCP client.
- **MCP server**: Command Center can call Optale Observatory as a tool surface.

Initial MCP sources:

- `qmd`: vault and markdown search.
- `graphiti`: temporal/entity memory graph.
- `oag`: Optale action graph/context assembly.
- `gitnexus`: codebase analysis and repo intelligence.
- `plane`: issues and delivery workflows.
- `twenty`: CRM/company/person records.
- `matrix`: internal comms.

## Command Center Boundary

Command Center owns:

- policy decisions
- tool allowlists
- tenant/user membership
- secret routing
- approval ledgers
- execution traces
- budget/cost accounting
- deployment control
- emergency pause/kill

Optale Observatory owns:

- agent UX
- task boards
- conversations
- agent profiles
- knowledge editing
- memory inspection
- traces and eval surfaces
- schedule/job authoring
- action proposal and approval UI
- embedded dashboards/apps

## First Production Blockers

- Delegated child tasks must use the same cabinet-scoped prompt builder and cwd handling as manual runs.
- Shell/terminal/agent subprocesses need stricter environment and filesystem isolation.
- MCP tool access must be scoped by company/personal/system ownership.
- Telemetry, update, cloud, and branding surfaces must be reworked for Optale.
- Open-source license notices must be generated for client-distributed builds.

## First Implementation Slices

1. Add central Optale product identity/config. **Done.**
2. Add an Optale context registry API that exposes product, scope, brain, MCP, and Command Center integration metadata. **Done.**
3. Patch delegated task prompt/cwd scoping. **Done.**
4. Add scope metadata for cabinets and agents. **Done.**
5. Add MCP policy/allowlist model. **Initial prompt-layer policy done.**
6. Add Command Center MCP/server endpoints for agent/task/job operations. **Initial HTTP control API done.**
7. Add Brain/Vault/Graph panels into the agent and cabinet UI. **Initial cabinet Brain panel done.**
8. Add strict per-run MCP config for structured Claude/Codex runs. **Initial run-config enforcement done.**
9. Expose Optale Observatory itself as an MCP tool surface. **Initial HTTP JSON-RPC MCP endpoint done.**
10. Add OpenRouter API execution with Optale MCP tool-calling loop. **Initial adapter done.**
11. Add MCP gateway identity, cabinet scoping, and audit events. **Initial gateway layer done.**
12. Add MCP client token registry with permissions, cabinet locks, and budgets. **Initial registry done.**
13. Add admin API for creating, rotating, updating, and disabling MCP clients. **Initial API done.**
14. Add space UI for MCP client administration. **Initial panel done.**

## Implemented Notes

- `/api/optale/context-registry` exposes product, scopes, brain sources, MCP sources, and Command Center ownership boundaries.
- `/api/optale/scopes` reads and writes file-backed cabinet scope metadata via `.optale/scope.json`; agents inherit cabinet scope unless persona frontmatter overrides it.
- `/api/optale/mcp-policy` reads and writes file-backed MCP policy via `.optale/mcp-policy.json`.
- MCP policy is prompt-layer governance plus strict per-run config for structured Claude/Codex adapters. Manual runs, editor runs, continued runs, delegated child tasks, and scheduled jobs all receive the effective allowlist in their prompt.
- Structured Claude runs receive a generated `.cabinet-state/optale-mcp/<run>/claude-mcp.json` via `--mcp-config` and `--strict-mcp-config`.
- Structured Codex runs receive `--ignore-user-config` plus generated `-c mcp_servers.<id>...` entries so global MCP servers are not inherited into the run.
- Gemini and legacy PTY adapters still rely on prompt-layer policy until a provider-specific hard config path is added.
- Default MCP policy is deny-by-default and scope-derived. Personal scope receives only personal-compatible sources; company/system scopes can receive company/system sources.
- `/api/optale/command-center` exposes an initial Command Center bridge. `GET` returns cabinet, agent, job, task, conversation, pending-action, scope, and MCP-policy state. `POST` supports `launch_conversation`, `create_task`, `update_task`, `set_agent_active`, `run_job`, `toggle_job`, `stop_conversation`, and `review_actions`.
- `/api/optale/brain` exposes a cabinet-level Brain summary with Vault/file counts, memory counts, operating graph counts, MCP policy status, and brain-source allowlist status.
- The cabinet dashboard shows an initial Brain panel above scheduled runs, making Vault, Memory, Graph, and MCP-backed sources visible in the user-facing workspace.
- `/api/optale/mcp` exposes an initial MCP-compatible JSON-RPC endpoint with `initialize`, `ping`, `tools/list`, and `tools/call`.
- The Optale Observatory MCP endpoint currently exposes read tools for context registry, space listing, brain summary, MCP policy, and Command Center snapshot. The write/control action tool is gated behind `OPTALE_MCP_ENABLE_ACTIONS=true`; remote non-loopback callers also require `OPTALE_MCP_ENABLE_REMOTE_ACTIONS=true`.
- MCP gateway calls now carry request/client identity, auth type, optional default cabinet, optional agent scope, action permission state, and audit state. HTTP clients can send `X-Optale-MCP-Client`, `X-Optale-Cabinet-Path`, `X-Optale-Agent-Scope`, and `X-Optale-Lock-Cabinet`.
- Bearer MCP clients now resolve through a registry before the route serves metadata or JSON-RPC. Registry entries can come from `OPTALE_MCP_CLIENTS_JSON` or `.cabinet-state/optale-mcp/clients.json`, and should use `tokenSha256` instead of raw tokens.
- MCP client registry entries can define `cabinetPath`, `lockCabinet`, `agentScope`, `permissions`, `allowedTools`, `deniedTools`, `dailyToolCalls`, `auditEnabled`, and `remoteActionsEnabled`.
- `/api/optale/mcp-clients` exposes the app-authenticated management API for MCP clients. `GET` lists sanitized clients, `POST` creates a client and returns a one-time bearer token, `POST` with `action=rotate` rotates an existing token, `PATCH` updates client policy, and `DELETE` disables a file-backed client.
- File-backed MCP client tokens are generated as `oa_mcp_...` values and only `tokenSha256` is persisted. The raw token is returned once on create/rotate.
- The space workspace now includes an MCP clients panel below Brain. It lists client scope/permissions/budget state, opens a create/edit policy dialog, supports token rotation, disables file-backed clients, and shows one-time tokens in a copyable dialog.
- Tool listing and tool execution are filtered by the resolved client permissions and tool allow/deny lists. Read tools require `read`; Command Center actions require `write` or `execute`.
- Daily tool-call budgets are enforced from the audit log by client id. If a budget is set, audit remains enabled for that client so the counter has durable state.
- MCP audit events are appended as compact JSONL under `.cabinet-state/optale-mcp/audit/YYYY-MM-DD.jsonl` unless `OPTALE_MCP_AUDIT_LOG=false`. Events record method/tool, cabinet, scope, caller identity, outcome, duration, and argument keys, not full arguments.
- A locked gateway cabinet context prevents MCP tool calls from reading or controlling cabinets outside that cabinet subtree. This is the first deployable isolation hook for client-specific MCP gateways.
- `optale-agents` remains the stable internal MCP server id, so governed Claude/Codex run configs can include Optale Observatory itself as a reachable local tool surface.
- Public MCP access stays protected by the existing app auth. Local loopback MCP clients can call `/api/optale/mcp`; remote MCP clients need `Authorization: Bearer $OPTALE_MCP_TOKEN`.
- OpenRouter is available as an API provider when `OPENROUTER_API_KEY` is set. The `openrouter_api` adapter sends Chat Completions requests, exposes allowed Optale MCP tools as OpenAI-style function tools, executes tool calls server-side through the gateway context, and feeds tool results back to the model.
- OpenRouter defaults to `openrouter/auto` unless a model is selected or `OPENROUTER_MODEL` is set.
