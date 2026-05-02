# Optale Observatory Handover - 2026-05-01

## Purpose

This document captures where we left off on the Cabinet fork experiment. Naming direction has changed: the product/app name is **Optale Command**, and **Observatory** is a workspace/mode inside Optale Command for Brain, Company Brain, Memory, Graph, Entities, Dreams, MCP policy, traces, evals, approvals, and operational visibility.

The current legacy Command Centre / LibreChat deployment remains the production chat/RAG/runtime bridge during migration. Do not rename the repo, folders, PM2 apps, or domains in this step. See `docs/OPTALE_COMMAND_DIRECTION.md`.

## Working Context

- Repo: `/home/thor/cabinet-optale-lab`
- Data dir: `/home/thor/cabinet-optale-data`
- Public app: `https://observatory.optale.com`
- Local web: `http://127.0.0.1:4310`
- Local daemon: `http://127.0.0.1:4311`
- PM2 apps:
  - `cabinet-optale-web`
  - `cabinet-optale-daemon`
- Core spec: `/home/thor/cabinet-optale-lab/docs/OPTALE_AGENTS_SPEC.md`
- This handover: `/home/thor/cabinet-optale-lab/docs/OPTALE_AGENTS_HANDOVER_2026-05-01.md`

Do not use DreamLab context or data. That was a dummy account and is not part of the active Optale Observatory/Cabinet fork work.

## Current State

The experiment is live and deployed through PM2. The app builds, typechecks, and the focused Optale suite passes.

The latest completed slice added an MCP client admin UI inside the cabinet workspace. It appears in the right-side governance column below the Brain panel.

The UI currently supports:

- Listing MCP clients.
- Creating a client.
- Editing client policy.
- Rotating a client token.
- Disabling a file-backed client.
- Showing the one-time raw token after create/rotate.

No real live MCP client was created during smoke testing, so production data has not been polluted with a test token.

## Important Design Decisions

- The product/app name is Optale Command.
- Observatory is a workspace/mode inside Optale Command, not a separate canonical product.
- Legacy Command Centre / LibreChat remains the current production chat/RAG/runtime bridge during migration.
- Long-term, Optale Command should consolidate agent administration, Brain, MCP policy, traces/evals, approvals, schedules, and eventually chat runtime.
- The Cabinet fork is being treated as a serious product shell for agent UX.
- We are keeping the legacy Command Centre working while Optale Command absorbs the traditional application surface for spaces, agents, tasks, clients, memory visibility, traces, evals, and MCP access.
- Avoid duplicate canonical agent definitions. Future Optale Agent Harness/manifest work should define agents once and project them into native Optale Command agents/personas/routines, plus legacy LibreChat agent docs only while the bridge is needed.
- Do not treat LibreChat `agent_optale_meta_*` Mongo scripts as canonical, and do not commit them as the source of truth.
- Do not rename the repo/folder/PM2/domain as part of the naming decision.
- MIT license allows forking, rebranding, modifying, commercial/client deployment, and proprietary additions, as long as copyright/license notices are preserved.
- Secrets must not be logged or included in docs. Client tokens are returned once and only `tokenSha256` is persisted.

## Implemented Slices

1. Optale product identity
   - Added Optale Observatory identity while preserving upstream Cabinet/MIT attribution.
   - Health endpoint reports `optale-observatory` as the product id.

2. Context registry
   - Added `/api/optale/context-registry`.
   - Exposes product, scopes, brain sources, MCP servers, and Command Center boundaries.

3. Delegated task scoping
   - Delegated agent tasks now preserve cabinet cwd/path scope more correctly.

4. Scope registry
   - Added `.optale/scope.json` support.
   - Cabinets and agents can resolve `company`, `personal`, or `system` scope.

5. MCP policy model
   - Added `.optale/mcp-policy.json`.
   - Default is deny-by-default, scope-derived.
   - Policy is injected into agent prompts.

6. Strict MCP run config
   - Claude structured runs get generated MCP config with `--mcp-config` and `--strict-mcp-config`.
   - Codex structured runs get `--ignore-user-config` plus generated `-c mcp_servers...` config.
   - Gemini and legacy PTY still rely on prompt-layer policy.

7. Command Center HTTP bridge
   - Added `/api/optale/command-center`.
   - Supports snapshots and actions for conversations, tasks, agents, jobs, and pending actions.

8. Brain panel
   - Added `/api/optale/brain`.
   - Cabinet view shows Vault, Memory, Graph, MCP policy, and brain source status.

9. Optale Observatory MCP server
   - Added `/api/optale/mcp`.
   - Supports JSON-RPC methods:
     - `initialize`
     - `ping`
     - `tools/list`
     - `tools/call`
   - Tools:
     - `optale_context_registry`
     - `optale_list_cabinets`
     - `optale_brain_summary`
     - `optale_mcp_policy`
     - `optale_command_center_snapshot`
     - `optale_command_center_action` when enabled

10. OpenRouter adapter
   - Added provider `openrouter`.
   - Added adapter `openrouter_api`.
   - Uses OpenRouter Chat Completions.
   - Converts Optale MCP tools to OpenAI-style function tools.
   - Executes tool calls server-side through Optale MCP.

11. MCP gateway layer
   - Gateway context includes request id, client id, auth type, cabinet path, scope, permissions, audit state, and action permission state.
   - Supports cabinet locking so clients cannot access outside their assigned cabinet subtree.
   - Adds compact JSONL audit logs.

12. MCP client registry
   - File/env backed client registry.
   - Supports:
     - `tokenSha256`
     - `cabinetPath`
     - `lockCabinet`
     - `agentScope`
     - `permissions`
     - `allowedTools`
     - `deniedTools`
     - `dailyToolCalls`
     - `auditEnabled`
     - `remoteActionsEnabled`

13. MCP clients management API
   - Added `/api/optale/mcp-clients`.
   - `GET`: list sanitized clients.
   - `POST`: create client and return one-time token.
   - `POST` with `action=rotate`: rotate token and return one-time token.
   - `PATCH`: update file-backed client policy.
   - `DELETE`: disable file-backed client.

14. MCP clients UI
   - Added `OptaleMcpClientsPanel`.
   - Mounted below Brain in the cabinet workspace.
   - Supports create/edit/rotate/disable/copy token flows.

## Key Files

- Product identity:
  - `/home/thor/cabinet-optale-lab/src/lib/optale/product.ts`
  - `/home/thor/cabinet-optale-lab/src/app/api/health/route.ts`

- Context/scope/policy:
  - `/home/thor/cabinet-optale-lab/src/lib/optale/context-registry.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/scope-registry.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-policy.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-runtime.ts`

- MCP server/gateway/clients:
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-server.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-gateway.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-client-registry.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/mcp-audit-log.ts`
  - `/home/thor/cabinet-optale-lab/src/app/api/optale/mcp/route.ts`
  - `/home/thor/cabinet-optale-lab/src/app/api/optale/mcp-clients/route.ts`

- OpenRouter:
  - `/home/thor/cabinet-optale-lab/src/lib/agents/providers/openrouter.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/agents/adapters/openrouter-api.ts`

- Command Center and Brain:
  - `/home/thor/cabinet-optale-lab/src/lib/optale/command-center-control.ts`
  - `/home/thor/cabinet-optale-lab/src/lib/optale/brain-summary.ts`
  - `/home/thor/cabinet-optale-lab/src/app/api/optale/command-center/route.ts`
  - `/home/thor/cabinet-optale-lab/src/app/api/optale/brain/route.ts`

- UI:
  - `/home/thor/cabinet-optale-lab/src/components/optale/brain-panel.tsx`
  - `/home/thor/cabinet-optale-lab/src/components/optale/mcp-clients-panel.tsx`
  - `/home/thor/cabinet-optale-lab/src/components/cabinets/cabinet-view.tsx`

## Environment Gates

- `OPENROUTER_API_KEY`
  - Required for OpenRouter adapter.

- `OPENROUTER_MODEL`
  - Optional. Defaults to `openrouter/auto`.

- `OPTALE_MCP_ENABLE_ACTIONS=true`
  - Required to expose/allow `optale_command_center_action`.

- `OPTALE_MCP_ENABLE_REMOTE_ACTIONS=true`
  - Required for non-loopback bearer clients to use write/control actions.

- `OPTALE_MCP_AUDIT_LOG=false`
  - Disables audit logging. Default is enabled.

- `OPTALE_MCP_CLIENTS_PATH`
  - Optional path override for file-backed MCP clients.
  - Default: `/home/thor/cabinet-optale-data/.cabinet-state/optale-mcp/clients.json`

- `OPTALE_MCP_CLIENTS_JSON`
  - Optional env-backed client registry.

- `OPTALE_MCP_TOKEN`
  - Legacy single-token fallback. Prefer the new client registry.

## Verification Commands

Run from `/home/thor/cabinet-optale-lab`.

```bash
./node_modules/.bin/tsc --noEmit
```

```bash
./node_modules/.bin/tsx --test src/lib/agents/adapters/openrouter-api.test.ts src/lib/agents/adapters/registry.test.ts src/lib/optale/mcp-client-registry.test.ts src/lib/optale/mcp-server.test.ts src/lib/optale/mcp-policy.test.ts src/lib/optale/mcp-runtime.test.ts src/lib/optale/scope-registry.test.ts src/lib/optale/brain-summary.test.ts src/lib/optale/command-center-control.test.ts
```

```bash
npm run build
```

```bash
pm2 restart cabinet-optale-web cabinet-optale-daemon
```

Smoke checks:

```bash
curl -sS http://127.0.0.1:4310/api/health
```

```bash
curl -sS http://127.0.0.1:4310/api/optale/mcp-clients
```

```bash
curl -sS -X POST http://127.0.0.1:4310/api/optale/mcp \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Known build warning:

- `next.config.ts` / `src/app/api/system/open-data-dir/route.ts` Turbopack NFT warning.
- It existed during these slices and does not currently block the build.

## Last Validation

Last validated on 2026-05-01:

- Typecheck passed.
- Focused Optale suite passed: 29 tests.
- Production build passed.
- Restarted:
  - `cabinet-optale-web`
  - `cabinet-optale-daemon`
- Smoke checks passed:
  - `/api/health`
  - `/api/optale/mcp-clients`
  - `/api/optale/mcp` JSON-RPC `tools/list`

## Worktree Note

The worktree is intentionally dirty with the Optale Agents experiment. There were also unrelated dirty files from earlier work, including:

- `package-lock.json`
- `server/cabinet-daemon.ts`
- `ecosystem.config.js`

Do not revert unrelated changes unless explicitly asked. Keep treating this as an active experiment branch/worktree.

## Path Forward

### First Priority Tomorrow

Do a real browser QA pass of the new MCP clients panel.

Check:

- The panel appears below Brain in the cabinet view.
- Create dialog fits on desktop and mobile.
- Edit dialog fits and text does not overflow.
- One-time token dialog is readable and copyable.
- Rotate and disable confirmations work.
- Empty state looks acceptable.
- Disabled and legacy/env clients cannot be edited/rotated from the panel.

Use Playwright or browser screenshots if available.

### Next Engineering Slices

1. **Polish MCP client UI**
   - Add better validation messages before submit.
   - Add a compact details view for allowed/denied tools.
   - Add clearer visual distinction between file-backed, env-backed, and legacy clients.

2. **End-to-end client token flow**
   - Create a disposable test client from the UI.
   - Verify the raw token works remotely via `Authorization: Bearer ...`.
   - Verify cabinet lock prevents access outside the assigned cabinet.
   - Disable the test client and verify auth fails.
   - Remove/clean the disposable client afterward.

3. **Command Center integration**
   - Expose MCP client state and audit summary to the Command Center bridge.
   - Let Command Center create/rotate/disable client tokens through governed actions.
   - Add approval hooks for remote write/action clients.

4. **Audit and budget improvements**
   - Current budget enforcement counts today’s audit JSONL lines.
   - Next improvement should use a compact daily counter/ledger so large logs do not need to be scanned.
   - Add audit viewer/export later.

5. **Real external MCP gateway**
   - Current `/api/optale/mcp` exposes Optale Observatory tools.
   - Still needed: governed proxy/gateway for QMD, Graphiti, OAG, Twenty, Plane, Matrix, GitNexus, etc.
   - This is where client token policy should control which downstream MCP servers/tools are reachable.

6. **Brain/Vault/Graph unification**
   - The Brain panel is currently a summary surface.
   - Next: richer unified view of vault docs, memory files, graph entities, MCP source health, and per-agent memory.
   - This is likely where Optale Observatory can absorb the most useful parts of `brain.optale.com` UX.

7. **Agent productization**
   - Make company agents and personal agents first-class in UI.
   - Show each agent’s scope, memory namespace, MCP policy, jobs, tasks, and recent runs.
   - Add per-agent brain/memory visibility.

8. **Eval/governance chains**
   - Add the missing Paperclip-style pieces Cabinet does not have natively:
     - eval chains
     - action review ledgers
     - execution traces
     - retro QA
     - budget/accounting surfaces

9. **Brand/product cleanup**
   - Continue replacing Cabinet-facing product language where appropriate while keeping internal storage/API names stable until a deeper migration is planned.
   - Preserve upstream license/copyright notices.
   - Avoid over-customizing until the fork direction is confirmed.

## Suggested Tomorrow Sequence

1. Open `https://observatory.optale.com`.
2. Check the cabinet dashboard with the Brain and MCP clients panels.
3. Create one disposable MCP client through the UI with:
   - `id`: `test-local-client`
   - `cabinetPath`: a disposable evaluation cabinet
   - `lockCabinet`: true
   - `permissions`: read
   - `dailyToolCalls`: low number, for example 5
4. Copy the one-time token.
5. Verify bearer auth through `/api/optale/mcp`.
6. Verify locked cabinet behavior.
7. Disable the disposable client from the UI.
8. Verify the token stops working.
9. Decide whether to polish UI or start the downstream MCP proxy/gateway slice.

## Current Strategic Read

Cabinet is stronger than expected as a UX shell. The promising path is not to replace the Command Center, but to fork Cabinet into **Optale Observatory** as the traditional application where clients and operators can manage spaces, agents, tasks, memory, MCP access, traces, evals, and governance. Command Center remains the day-to-day operator interface.

The most valuable near-term proof is a client-isolated workflow:

- client space
- company agents
- personal agents
- scoped brain/memory
- MCP client token
- Command Center oversight
- audited and budgeted execution

If that works cleanly, this becomes a serious fourth target/product surface.

## 2026-05-02 Update: Brain Native Merge

Completed native Observatory Brain tabs for Vault, Memory, Graph, Entities, Dreams, and a gated Company Brain reviewer/admin add-on.

Company Brain reviewer/admin is intentionally **not default**. Thor's root Observatory scope is currently opted in via:

- `companyBrainTargetId`: `optale-global`
- label: `company-brain-reviewer`

The new Company Brain endpoint is:

- `GET /api/optale/brain/company-brain`
- `POST /api/optale/brain/company-brain/action`

Current public smoke result for `https://observatory.optale.com/api/optale/brain/company-brain?cabinetPath=.`:

- `200`
- add-on enabled by `scope-label`
- target `optale-global`
- source status `healthy`
- bridge enabled/configured `true`
- actions enabled `true`
- health `5` healthy, `0` missing, `0` failing
- promotions loaded `2`
- review queue jobs loaded `8`
- downstream calls `4`, downstream errors `0`
- local `promote-dry-run` action smoke on an already promoted record returned `200`, `ok=true`, `idempotent=true`

The bridge now uses a server-side `service-jwt` connection to local Command Brain. Browser-direct Company Brain writes remain disabled; review actions go through the Observatory action endpoint, scope entitlement, target binding, env action gate, and a narrow upstream allowlist. Company Brain reviewer/admin remains gated to opted-in scopes, so it is not default for new Observatory spaces.

Dreams is interactive in Observatory. The native Dreams tab reads the scoped vault/Honcho dashboard and exposes server-side proposal review actions plus Ask Dream:

- public smoke `200`
- source status `healthy`
- downstream calls `4`, downstream errors `0`
- proposal total `95`
- proposals loaded `95`
- rules loaded `7`

Note: the earlier `25` count was an Observatory adapter bug. The adapter was normalizing from the compacted downstream preview, which caps arrays at 25 for debug payload safety. It now normalizes from the raw upstream Dreams payload and only caps the downstream preview.
