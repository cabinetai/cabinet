# Optale Brain In Observatory Merge Spec

Status: Phase 1 native Vault, Memory, Graph, and Entities slices implemented
Owner: Optale
Date: 2026-05-02

Naming note: the product/app name is **Optale Command**. Observatory is a workspace/mode inside Optale Command for Brain, Company Brain, Memory, Graph, Entities, Dreams, MCP policy, traces, evals, approvals, and operational visibility. See `docs/OPTALE_COMMAND_DIRECTION.md`. Do not rename the repo, folders, PM2 processes, or domains in this migration slice.

## Goal

Optale Command becomes the canonical product for Optale spaces, agents, memory, MCP policy, Brain, Company Brain review, traces, and later evals. Observatory is the workspace/mode inside Optale Command where that admin and operational visibility work lands first.

The legacy Command Centre / LibreChat deployment remains the day-to-day production chat/RAG/runtime bridge during migration. The existing Command Brain implementation remains the working backend until Optale Command has UI and auth parity.

This is not a site demo. Optale Command is the destination application, with Observatory as the Brain/admin/visibility workspace.

## Product Boundary

### Observatory Workspace Owns

- Space/cabinet creation and administration.
- Native docs/vault editing through the Cabinet knowledge-base UI.
- Agent profiles, jobs, schedules, tasks, and operational state.
- Personal Brain inspection: memory, semantic graph, entities, Dreams, and promotion drafting.
- Company Brain administration: targets, health, queues, reviews, approvals, writes, and read-back verification.
- MCP client/admin policy: clients, scopes, tool allowlists, budgets, audit logs, and source health.
- Later: traces, evals, governance chains, paperclip agent divisions, and client dashboards.

### Legacy Command Centre / LibreChat Owns

- Current production command/chat workflow.
- Current RAG/runtime bridge.
- Global orchestration and operator MCP access during migration.
- Emergency control and execution control.
- Existing Brain backend services until Optale Command reaches parity.

### Agent Definition Boundary

Avoid duplicate canonical agent definitions. Future Optale Agent Harness/manifest work should define agents once and project them into native Optale Command agents/personas/routines, plus legacy LibreChat agent docs only while the bridge is needed. Do not treat LibreChat `agent_optale_meta_*` Mongo scripts as canonical, and do not commit them as the source of truth.

### Personal Brain vs Company Brain

Personal Brain is private discovery. Company Brain is reviewed, shared, audited company knowledge.

Private memory must never flow into Company Brain automatically. The only allowed path is:

1. User creates a promotion packet.
2. Agent review checks duplicate, contradiction, confidence, sensitivity, and policy fit.
3. Human reviewer approves, rejects, or requests changes.
4. Approved packet writes through the server-side Company Brain write adapter.
5. Downstream read-back verifies the write landed in Graphiti or the configured company store.

The browser must never write directly to Graphiti, Honcho, ORM, or Company Brain MCP.

## Current Source Systems

### Existing Command Brain

Repo: `/mnt/data/home/projects/librechat`

Main UI:

- `client/src/routes/Knowledge.tsx`
- `client/src/components/SidePanel/Knowledge/KnowledgePanelTabs.tsx`
- `client/src/routes/CompanyBrain.tsx`

Main APIs:

- `/api/knowledge`
- `/api/brain`
- `/api/company-brain`
- `/api/admin/company-brain`

Main backend services:

- `api/server/services/Brain/companyBrain.js`
- `api/server/services/Brain/reviewAgent.js`
- `api/server/services/Brain/reviewContext.js`
- `api/server/services/Brain/reviewQueue.js`
- `api/server/services/Brain/promotionWriter.js`

Models:

- `brainpromotions`
- `companybraintargets`

### Current Observatory Brain

Repo: `/home/thor/cabinet-optale-lab`

Current implementation is a native merge surface:

- `src/components/optale/brain-workspace.tsx`
- `src/components/optale/brain-panel.tsx`
- `src/app/api/optale/brain/route.ts`
- `src/app/api/optale/brain/graph/route.ts`
- `src/app/api/optale/brain/explore/route.ts` compatibility only
- `src/lib/optale/brain-summary.ts`

It currently provides:

- Cabinet-native Vault/local file inspection.
- Native Honcho memory inspection.
- Native Graphiti semantic graph reads for nodes, facts, and episodes.
- Native OAG/ORM operational entity graph reads.
- Native Honcho Dreams dashboard/proposal review surface.
- Downstream QMD/Graphiti calls through Observatory MCP.
- Scope/MCP policy/source status.

It does not yet provide the remaining promotion creation flow. Company Brain reviewer/admin now exists as a gated add-on shell backed by the read-only Command Brain bridge.

## Non-Negotiable Invariants

- No automatic private-to-company writes.
- Company Brain mutations require server-side review/approval/write/verification.
- Do not duplicate BrainPromotion or CompanyBrainTarget storage during phase 1.
- Do not expose broad Command admin metadata to normal Observatory users.
- Do not forward browser cookies blindly across domains.
- Service-auth must preserve the acting user identity and role, not collapse every action into an all-powerful service account.
- Tenant/company/person context must be explicit before write endpoints are enabled.
- Existing Command Brain must keep working while Observatory is being merged.
- Native Observatory docs/vault must be the Docs tab, not a LibreChat iframe.

## Target Information Architecture

### Main Brain Workspace

Mounted through Observatory's existing app section model:

- `brain`: full Brain workspace.
- `vault`: opens Brain workspace on Docs/Vault.
- `memory`: opens Brain workspace on Memory.
- `graph`: opens Brain workspace on Graph.
- `entities`: opens Brain workspace on Entities.
- `dreams`: opens Brain workspace on Dreams.

Tabs:

- Overview: Observatory source/policy/context summary.
- Docs: native Cabinet/Observatory KB and vault editing.
- Memory: Honcho/user/agent memory peer cards, context, sessions, conclusions.
- Graph: semantic memory graph from Graphiti/Falkor.
- Entities: operational ORM/entity graph.
- Dreams: native Observatory Dream proposal dashboard, ask endpoint, and explicit review actions.
- Promote: Personal Brain to Company Brain packet creation.
- Company Brain: reviewer/admin interface for target health, queue, reviews, approval, write, verification.
- Admin: read-only context, source binding, policy, and MCP client diagnostics.

### Cabinet Dashboard

Keep compact cards in cabinet/workspace pages:

- Brain source summary.
- MCP clients/admin summary.
- Entry points into the full Brain workspace.

Do not mount the full Brain app in the cabinet right rail.

### Agent Detail

Later phase:

- Add per-agent memory panel.
- Show agent memory namespace, sessions, conclusions, tool traces, and Company Brain promotion drafts.

## Tenant / Company / Person Portability

The merge must support onboarding a new company/person by provisioning fresh data roots and source profiles, not by editing code.

Required normalized context:

```ts
type OptaleBrainSubjectType = "company" | "personal" | "system";

interface OptaleBrainContext {
  subjectType: OptaleBrainSubjectType;
  tenantId?: string;
  companyId?: string;
  personId?: string;
  ownerId?: string;
  cabinetPath: string;
  dataRoot: string;
  vaultNamespace: string;
  memoryNamespace: string;
  graphNamespace: string;
  entityNamespace: string;
  qmdProfile: string;
  graphProfile: string;
  entityProfile: string;
  companyBrainTargetId?: string;
  mcpPolicyId?: string;
  mcpClientProfile: string;
  secretsRef: string;
  allowedScopes: OptaleBrainSubjectType[];
  source: "explicit" | "inferred" | "inherited";
}
```

Initial derivation should use existing `.optale/scope.json` fields:

- `scope`
- `ownerId`
- `companyId`
- `userId`
- `policyId`
- `memoryNamespace`
- `labels`

Conventions:

- Company space default target: `companyId` or slug from cabinet path.
- Personal space default target: `userId` or owner from cabinet path.
- System space default target: `optale-system`.
- `companyBrainTargetId` must be explicit or convention-derived, but write actions require active target health.
- `secretsRef` names a source profile; it should not contain secrets.

## API Strategy

### Phase 1: Observatory Proxy / Bridge

Add server-side Observatory APIs that call existing Command Brain APIs with the same response shapes.

Do not call Command directly from the browser.

Recommended route prefix:

- `/api/optale/brain/command/...` for internal bridge/proxy.
- UI-facing components can later use higher-level `/api/optale/brain/*` routes that compose native Observatory data and Command Brain data.

Read-only first:

- `GET /api/brain/company-targets`
- `GET /api/brain/promotions`
- `GET /api/brain/promotions/:promotionId`
- `GET /api/company-brain/targets`
- `GET /api/company-brain/:targetId/overview`
- `GET /api/company-brain/:targetId/promotions`
- `GET /api/company-brain/:targetId/review-queue`

Then submitter mutations:

- `POST /api/brain/promotions` with `submit=false` default.
- `POST /api/brain/promotions/:promotionId/submit`
- `POST /api/brain/promotions/:promotionId/withdraw`

Defer until auth impersonation and audit are explicit:

- `POST /api/company-brain/:targetId/promotions/:promotionId/review-agent`
- `PATCH /api/company-brain/:targetId/promotions/:promotionId/review`
- `POST /api/company-brain/:targetId/promotions/:promotionId/promote`
- `/api/knowledge/memory/*`
- `/api/knowledge/graph*`
- `/api/knowledge/entities`

Memory/graph/entities can be enabled earlier only if Observatory enforces fixed tenant/user source scopes and does not allow arbitrary `peer` or `group` values from the browser.

### Auth Bridge

Current Command Brain routes use LibreChat `requireJwtAuth`, which populates `req.user` and tenant context.

Acceptable phase-1 options:

1. Forward the acting user's valid Command JWT/session from Observatory if the same user is authenticated in both apps.
2. Add a narrow Command-side Observatory service-auth middleware that validates a service token and signed user claims, then materializes `req.user`.

Rejected option:

- One generic admin service token for all requests. That would break submitter ownership and personal/company isolation.

Required forwarded claims for service-auth:

- user id
- role
- tenant id, if present
- allowed target ids
- allowed subject type
- request id

### Environment

Proposed Observatory env:

- `OPTALE_COMMAND_BRAIN_ORIGIN`
- `OPTALE_COMMAND_BRAIN_AUTH_MODE=user-jwt|service-jwt|service-claims|disabled`
- `OPTALE_COMMAND_BRAIN_JWT_SECRET`
- `OPTALE_COMMAND_BRAIN_SERVICE_USER_ID`
- `OPTALE_COMMAND_BRAIN_SERVICE_USERNAME`
- `OPTALE_COMMAND_BRAIN_SERVICE_EMAIL`
- `OPTALE_COMMAND_BRAIN_JWT_TTL_SECONDS`
- `OPTALE_COMMAND_BRAIN_SERVICE_TOKEN`
- `OPTALE_COMMAND_BRAIN_USER_HEADER_SECRET`
- `OPTALE_BRAIN_PROXY_READ_ONLY=true` initially

Proposed Command env:

- `OPTALE_OBSERVATORY_SERVICE_TOKEN`
- `OPTALE_OBSERVATORY_ALLOWED_ORIGINS`
- `OPTALE_OBSERVATORY_ENABLE_BRAIN_PROXY=true`

## Native UI Port Strategy

Do not copy the LibreChat UI wholesale.

Port behavior and response contracts, but adapt components to Observatory:

- Use Observatory/Cabinet docs for Docs/Vault.
- Use Observatory design tokens and components.
- Keep the graph explainability improvements:
  - source labels
  - loaded-vs-total counts
  - semantic Graphiti vs operational ORM distinction
  - node raw fields
  - upstream/downstream relationships
- Preserve promotion drafting from memory/graph/entity/doc nodes.
- Keep Company Brain review status, confidence, rationale, recommendation, write status, and read-back verification visible.

Dependency note:

- Command Brain uses `@xyflow/react`.
- Observatory currently does not include it.
- Phase 1 can either add `@xyflow/react` or implement a simpler native graph list/detail view first.
- Do not add a heavy graph dependency until the first Graph tab port is ready.

## Backend Migration Strategy

Phase 1 keeps backend services in Command.

Phase 2 can migrate backend services into Observatory only after:

- Auth bridge is tested.
- Tenant/person/company context resolver is in use.
- UI parity exists for Personal Brain and Company Brain.
- Command Brain deploy checker still passes.
- Observatory has database connectivity and model isolation equivalent to Command.

Candidate migration order:

1. Shared TypeScript contracts.
2. Read-only knowledge adapters.
3. BrainPromotion and CompanyBrainTarget models.
4. Review queue.
5. Review agent.
6. Promotion writer and read-back verifier.

The promotion writer should be the last write path moved.

## Implementation Phases

### Phase 0: Spec And Context Foundation

- Add this spec.
- Add `resolveOptaleBrainContext(cabinetPath)`.
- Return context from current `/api/optale/brain`.
- Add read-only Admin tab shell showing context, source bindings, and MCP policy.
- No behavior removal.

### Phase 1: Read-Only Command Brain Bridge

- Add server-side Command Brain bridge client.
- Implement allowlisted read-only proxy endpoints.
- Add health/status for bridge configuration.
- Add tests for path allowlist, query forwarding, and missing auth config.
- Do not expose mutations.

### Phase 2: Personal Brain Tabs

- Port Memory tab using proxied `/api/knowledge/memory/overview`.
- Port Graph tab using proxied `/api/knowledge/graph`.
- Port Entities tab using proxied `/api/knowledge/entities`.
- Add Dreams iframe through an Observatory proxy.
- Keep Docs native.

### Phase 3: Promotion Drafts

- Port Promote tab.
- Enable `POST /api/brain/promotions` draft creation.
- Enable submit/withdraw after audit and acting-user forwarding are verified.
- Promotion from Docs/Memory/Graph/Entities creates packets, not direct writes.

### Phase 4: Company Brain Admin

- Port Company Brain reviewer.
- Enable read-only overview/queue/promotions first.
- Enable review-agent/review/promote only after service-auth and audit pass.

### Phase 5: Native Backend Migration

- Move contracts/models/services only after UI parity.
- Keep Command Brain compatible or redirect to Observatory.

### Phase 6: Client/Company Provisioning

- Add provisioning command/runbook to create a new instance:
  - fresh `CABINET_DATA_DIR`
  - fresh `.optale/scope.json`
  - fresh QMD profile
  - fresh Graphiti group/database
  - fresh Honcho workspace/peer namespace
  - fresh Company Brain target
  - fresh MCP client registry/policy
  - no personal vault copied unless explicitly requested

## Testing And Verification

Minimum per phase:

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- Existing focused Optale tests.
- Command deploy checker:
  - `node api/scripts/optale/check-company-brain-deploy.cjs --json` from Command repo.

Proxy tests:

- Missing Command origin returns explicit disabled status.
- Disallowed path returns 404 or 403.
- Read-only mode rejects mutation methods.
- Browser cookies are not forwarded.
- Acting-user metadata is required before mutations.

Product tests:

- Personal Brain browsing does not create Company Brain writes.
- Promotion draft creation does not submit unless explicitly requested.
- Approval does not promote automatically unless configured and audited.
- Promotion write result includes downstream verification.

## First Safe Next Step

Implement Phase 0:

1. Add `src/lib/optale/brain-context.ts`.
2. Extend `/api/optale/brain` response with `context`.
3. Extend `/api/optale/brain/explore` response with `context`.
4. Add an Admin tab shell to `OptaleBrainWorkspace`.
5. Keep existing Brain overview/vault/graph behavior intact.

This creates the scalable foundation without touching Command Brain writes or breaking the current demo.

## Phase 0 Completion Notes

Completed on 2026-05-02:

- Added `src/lib/optale/brain-context.ts`.
- Added context to `/api/optale/brain`.
- Added context to `/api/optale/brain/explore`.
- Added a read-only Admin tab to `OptaleBrainWorkspace`.
- Added focused resolver tests in `src/lib/optale/brain-context.test.ts`.
- Extended summary tests to assert the context contract.

Verification:

- `./node_modules/.bin/tsx --test src/lib/optale/brain-context.test.ts src/lib/optale/brain-summary.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `curl -sS http://127.0.0.1:4310/api/optale/brain?cabinetPath=.`
- `curl -sS "http://127.0.0.1:4310/api/optale/brain/explore?cabinetPath=.&source=vault&limit=2"`

## Phase 1 Bridge Notes

Implemented on 2026-05-02:

- Added `src/lib/optale/command-brain-bridge.ts`.
- Added public bridge status endpoint at `/api/optale/brain/command`.
- Added read-only proxy endpoint at `/api/optale/brain/command/[...path]`.
- Added Admin tab bridge status card.
- Added focused bridge tests in `src/lib/optale/command-brain-bridge.test.ts`.

Current allowlist:

- `/api/brain/company-targets`
- `/api/brain/company-targets/:targetId/health`
- `/api/brain/promotions`
- `/api/brain/promotions/:promotionId`
- `/api/company-brain/targets`
- `/api/company-brain/:targetId/overview`
- `/api/company-brain/:targetId/health`
- `/api/company-brain/:targetId/promotions`
- `/api/company-brain/:targetId/review-queue`

Safety state:

- Only `GET` is allowed.
- Mutation methods return `405`.
- Disallowed paths return `403`.
- Malformed path segments fail closed.
- Browser cookies are not forwarded to Command.
- Public bridge status redacts upstream origin and concrete auth mode.
- Deployed Observatory uses `service-jwt` for local server-to-server reads to Command Brain. The bridge mints short-lived HS256 JWTs for the configured Command service user, then still applies Observatory entitlement, target binding, and read-only route allowlists.
- `user-jwt` remains supported for deployments that already receive a valid Command JWT.
- `service-claims` remains disabled until Command accepts a verified service token plus acting-user and tenant claims.

Verification:

- `./node_modules/.bin/tsx --test src/lib/optale/command-brain-bridge.test.ts src/lib/optale/brain-context.test.ts src/lib/optale/brain-summary.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `curl -sS http://127.0.0.1:4310/api/optale/brain/command`
- `curl -i -sS http://127.0.0.1:4310/api/optale/brain/command/brain/promotions`
- `curl -i -sS -X POST http://127.0.0.1:4310/api/optale/brain/command/brain/promotions`

## Canonical Brain Core Notes

Implemented on 2026-05-02:

- Added canonical contracts in `src/lib/optale/brain-contracts.ts`.
- Added native core status service in `src/lib/optale/brain-core.ts`.
- Added product API endpoint at `/api/optale/brain/core`.
- Added a Brain Admin tab `Core contract` card.
- Added contract/core tests in:
  - `src/lib/optale/brain-contracts.test.ts`
  - `src/lib/optale/brain-core.test.ts`

The core contract is the target API surface for Observatory-owned Brain work. Command Brain bridge endpoints remain a migration harness.

The core status response includes:

- normalized actor/request context
- tenant/company/person Brain context
- provisioning profile for cloning/fresh onboarding
- source adapter bindings
- explicit Personal Brain to Company Brain promotion boundary
- bridge migration status

Contract invariants:

- `privateToCompanyAutomaticWrite` is always `false`.
- `browserDirectSourceWrites` is always `false`.
- Company writes require promotion, agent review, human approval, and read-back verification.
- Provisioning profiles never copy personal vault or memory by default.
- Unknown/system fallback actors get minimum current-scope access, not all context scopes.
- Actor target ids are intersected with the active Company Brain target.
- Public core status redacts server filesystem roots and secret profile refs.
- Effective Brain permissions stay read-only even when raw MCP policy permissions later include write/execute.
- Observatory is the canonical owner of Brain going forward.

## Native Vault Adapter Notes

Implemented on 2026-05-02:

- Added shared adapter spine in `src/lib/optale/brain-adapters.ts`.
- Added native Vault adapter in `src/lib/optale/brain-vault-adapter.ts`.
- Added product API endpoint at `/api/optale/brain/vault`.
- Pointed the Observatory Brain Vault tab at `/api/optale/brain/vault`.
- Added adapter tests in `src/lib/optale/brain-vault-adapter.test.ts`.

Adapter behavior:

- Uses the canonical Brain core status and redacted request context.
- Reads local Cabinet/Observatory vault markdown natively.
- Calls QMD through the server-side MCP gateway only when QMD is enabled for the active Brain policy.
- Keeps browser-direct source writes disabled.
- Returns source binding, query, local documents, downstream QMD calls, and scan stats.
- Uses shared adapter limits, read-only MCP context, server-path redaction, downstream error shape, and retryable abort classification.

This replaces the Vault tab's dependency on the older generic `/api/optale/brain/explore?source=vault` path. The old explore route remains as a compatibility path while Graph is migrated next.

## Native Memory Adapter Notes

Implemented on 2026-05-02:

- Added Memory/Honcho config resolution in `src/lib/optale/brain-memory-config.ts`.
- Added native Memory read adapter in `src/lib/optale/brain-memory-adapter.ts`.
- Added product API endpoint at `/api/optale/brain/memory`.
- Added a native Memory tab inside the Observatory Brain workspace.
- Added Memory as a first-class native Brain source in the context registry and core status.
- Added tests in `src/lib/optale/brain-memory-adapter.test.ts`.

Adapter behavior:

- Uses the canonical Brain core status and redacted request context.
- Reads Honcho memory server-side only; the browser never calls Honcho directly.
- Derives workspace from scoped env or the active `memoryNamespace`.
- Does not hard-code a personal peer such as `thor`; peer selection comes from request, scoped env, or the first peer returned by the scoped workspace.
- Returns peers, selected peer card, context, sessions, conclusions, queue payload, downstream call status, and stats.
- Redacts server filesystem paths from returned strings and nested JSON.
- Exposes read/search/draft-promotion capability only; no memory write or dream scheduling endpoint is exposed in Observatory yet.

The Memory tab is now native Observatory product surface. Command Brain remains the reference implementation for the richer promotion creation UX until Promote is ported into the same adapter/core pattern.

Local validation state:

- The running Observatory root space was bound through `/api/optale/scopes` to a local personal demo scope:
  - `scope=personal`
  - `ownerId=thor`
  - `userId=thor`
  - `policyId=optale-thor`
  - `memoryNamespace=thor-individual`
- This creates `/home/thor/cabinet-optale-data/.optale/scope.json`.
- This is local tenant data, not a product default. A new company/person should get a fresh scope file, vault namespace, memory namespace, graph namespace, entity namespace, MCP policy id, and client profile.
- Live smoke after deploy returned workspace `thor-individual`, peers `thor`, `claude`, and `codex`, selected peer `thor`, peer card/context/sessions/conclusions, and capped downstream debug payloads.
- Public-host smoke confirmed `https://observatory.optale.com/api/optale/brain/memory?limit=1` returns `403 BrainAuthRequired` while `KB_PASSWORD` is unset. Local loopback reads still work for development.
- Auth was then enabled for the live demo by generating `KB_PASSWORD` into ignored `.env.local` with file mode `600` and loading it from `ecosystem.config.js`.
- Public unauthenticated checks now return:
  - `/` -> `307 /login`
  - `/api/auth/check` -> `{ authenticated:false, authEnabled:true }`
  - `/api/optale/brain/memory?limit=1` -> `401 Unauthorized`
- Authenticated public smoke through `/api/auth/login` returned Memory data for workspace `thor-individual`, selected peer `thor`, peers `thor`, `claude`, and `codex`.

## Native Graph Adapter Notes

Implemented on 2026-05-02:

- Added native Graph adapter in `src/lib/optale/brain-graph-adapter.ts`.
- Added product API endpoint at `/api/optale/brain/graph`.
- Pointed the Observatory Brain Graph tab at `/api/optale/brain/graph`.
- Added semantic Graph UI sections for entities, facts, episodes, loaded-vs-total counts, memory graph edges, and downstream payloads.
- Added Graph adapter tests in `src/lib/optale/brain-graph-adapter.test.ts`.
- Fixed downstream MCP SSE parsing in `src/lib/optale/mcp-downstream.ts` so streamed MCP responses use the final parseable event frame.
- Added SSE parser coverage in `src/lib/optale/mcp-downstream.test.ts`.

Adapter behavior:

- Uses canonical Brain core status and redacted request context.
- Reads Graphiti through the server-side MCP gateway only when the `memory-graph` source is enabled for the active Brain policy.
- Scopes search calls with `group_ids: [context.graphNamespace]`.
- Scopes episode overview calls with `group_id: context.graphNamespace`.
- Calls `graphiti__get_status` plus:
  - query mode: `graphiti__search_nodes` and `graphiti__search_memory_facts`
  - empty-query mode: `graphiti__get_episodes`
- Normalizes direct or nested Graphiti payloads into stable Observatory nodes, facts, episodes, edges, and graph stats.
- Redacts server paths from raw and display payloads.
- Keeps browser-direct source writes disabled. Graphiti writes remain out of scope until promotion/review/write/read-back is native.

Validation state:

- `./node_modules/.bin/tsx --test src/lib/optale/brain-graph-adapter.test.ts src/lib/optale/mcp-downstream.test.ts src/lib/optale/mcp-server.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/eslint src/lib/optale/brain-graph-adapter.ts src/lib/optale/brain-graph-adapter.test.ts src/app/api/optale/brain/graph/route.ts src/components/optale/brain-workspace.tsx src/lib/optale/mcp-downstream.ts src/lib/optale/mcp-downstream.test.ts`
- `npm run build`
- PM2 restarted and saved for `cabinet-optale-web` / `cabinet-optale-daemon`.
- Authenticated public smoke against `https://observatory.optale.com/api/optale/brain/graph?limit=2&q=Optale` returned:
  - `200`
  - `namespace=thor-individual`
  - `profile=thor`
  - `sourceStatus=healthy`
  - `downstreamCalls=3`
  - `downstreamErrors=0`
  - `scopedByNamespace=true`

The smoke query currently returned zero semantic matches, which is a data/query state rather than a route failure. The next useful check is trying known Thor graph terms or inspecting Graphiti group contents for `thor-individual`.

## Native Entities Adapter Notes

Implemented on 2026-05-02:

- Added native Entities/OAG adapter in `src/lib/optale/brain-entities-adapter.ts`.
- Added product API endpoint at `/api/optale/brain/entities`.
- Added an Entities tab inside the Observatory Brain workspace.
- Added `#/entities` and `#/cabinet/{cabinetPath}/entities` navigation support.
- Added Entities sidebar and Observatory quick-entry links.
- Added adapter tests in `src/lib/optale/brain-entities-adapter.test.ts`.
- Enabled OAG/action-graph for personal scopes in the MCP/source registry so Thor's personal Observatory Brain can read the private OAG graph.

Adapter behavior:

- Uses canonical Brain core status and redacted request context.
- Reads OAG server-side through the configured OAG/entity API base URL.
- Default local API base is `http://127.0.0.1:3604`; production/client onboarding should provide scoped `OPTALE_ENTITY_API_URL_*` or `OPTALE_OAG_API_URL_*` values.
- Calls:
  - `GET /api/oag/status`
  - `GET /api/oag/graph?limit&offset&q&relationship&as_of`
- Normalizes OAG nodes, edges, clusters, pagination, time range, and lens metadata into a stable Observatory response.
- Keeps browser-direct ORM/Falkor/OAG writes disabled.
- Exposes pagination controls in the Entities tab using OAG `offset`, `limit`, `has_next`, and `total_edge_count`.
- Preserves OAG health/lens hints such as duplicate-title/root-candidate state for UI inspection.

Validation state:

- `./node_modules/.bin/tsx --test src/lib/optale/brain-entities-adapter.test.ts src/lib/optale/brain-core.test.ts src/lib/optale/mcp-policy.test.ts test/hash-route.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- touched-file ESLint passed with only the pre-existing sidebar `<img>` warning.
- `npm run build`
- PM2 restarted and saved for `cabinet-optale-web` / `cabinet-optale-daemon`.
- Authenticated public smoke against `https://observatory.optale.com/api/optale/brain/entities?limit=3&q=Optale` returned:
  - `200`
  - `namespace=personal:thor`
  - `profile=thor`
  - `sourceStatus=healthy`
  - `downstreamCalls=2`
  - `downstreamErrors=0`
  - `nodesLoaded=2`
  - `edgesLoaded=1`
  - `graphName=optale_vault`
  - `totalEdgeCount=425`

## Native Dreams Adapter Notes

Implemented on 2026-05-02:

- Added native Dreams/Honcho adapter in `src/lib/optale/brain-dreams-adapter.ts`.
- Added Dreams configuration/source binding in `src/lib/optale/brain-dreams-config.ts`.
- Added product API endpoints:
  - `GET /api/optale/brain/dreams`
  - `POST /api/optale/brain/dreams/action`
  - `POST /api/optale/brain/dreams/ask`
- Added a Dreams tab inside the Observatory Brain workspace.
- Added `#/dreams` and `#/cabinet/{cabinetPath}/dreams` navigation support.
- Added Dreams sidebar and Observatory quick-entry links.
- Added adapter tests in `src/lib/optale/brain-dreams-adapter.test.ts`.

Adapter behavior:

- Uses canonical Brain core status and redacted request context.
- Reads the scoped Dreams/vault app server-side instead of iframing or proxying `brain.optale.com`.
- Default local API base is `http://127.0.0.1:3601`; production/client onboarding should provide scoped `OPTALE_DREAMS_API_URL_*`, `OPTALE_VAULT_APP_URL_*`, `DOCS_API_BASE_*`, `BRAIN_DOCS_API_BASE_*`, or `VAULT_API_BASE_*` values.
- Calls:
  - `GET /api/honcho/dashboard/stats`
  - `GET /api/honcho/proposals`
  - `GET /api/honcho/dashboard/rejections`
  - `GET /api/honcho/dashboard/rules`
- Review actions are explicit server-side calls to `POST /api/honcho/proposals/action`.
- Ask Dream is an explicit server-side call to `POST /api/honcho/dashboard/ask`.
- Proposal action paths are constrained to `_proposals/{file}.md`.
- Browser-direct vault/Honcho writes remain disabled; the browser only talks to Observatory.
- Company Brain is still protected by the promotion boundary. Dream approvals write private/personal belief targets only through the configured private vault API.

Validation state:

- `./node_modules/.bin/tsx --test src/lib/optale/brain-dreams-adapter.test.ts src/lib/optale/brain-core.test.ts test/hash-route.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- touched-file ESLint passed with only the pre-existing sidebar `<img>` warning.
- `npm run build`
- PM2 restarted and saved for `cabinet-optale-web` / `cabinet-optale-daemon`.
- Authenticated public smoke against `https://observatory.optale.com/api/optale/brain/dreams?limit=100` returned:
  - `200`
  - `namespace=thor-individual`
  - `profile=thor`
  - `sourceStatus=healthy`
  - `downstreamCalls=4`
  - `downstreamErrors=0`
  - `proposalTotal=95`
  - `proposalFilteredTotal=95`
  - `proposalsLoaded=95`
  - `messages=24110`
  - `dreams=38`
  - `rulesLoaded=7`
  - Downstream debug preview still caps the raw proposals array at `25`; dashboard normalization now uses the raw upstream payload so totals are not truncated.

## Company Brain Reviewer Add-on Notes

Implemented on 2026-05-02:

- Added gated reviewer/admin entitlement in `src/lib/optale/brain-company-brain-addon.ts`.
- Added read-only Company Brain adapter in `src/lib/optale/brain-company-brain-adapter.ts`.
- Added product API endpoint:
  - `GET /api/optale/brain/company-brain`
  - `POST /api/optale/brain/company-brain/action`
- Added a Company Brain tab inside the Observatory Brain workspace.
- Added `#/company-brain` and `#/cabinet/{cabinetPath}/company-brain` navigation support.
- Bound Thor's root Observatory scope to `companyBrainTargetId=optale-global` with the `company-brain-reviewer` label.

Entitlement model:

- Company Brain reviewer/admin is not default.
- A scope opts in with one of these labels:
  - `company-brain`
  - `company-brain-reviewer`
  - `company-brain-admin`
- Environment can also enable it with `OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW` or `OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED=true`.
- `OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED=false` disables it even if labels or allowlists are present.
- The active target is constrained to the scope's `companyBrainTargetId`.
- Review actions require `OPTALE_COMPANY_BRAIN_ACTIONS_ENABLED=true`.

Adapter behavior:

- Uses canonical Brain core status and redacted request context.
- Keeps browser-direct Company Brain writes disabled.
- Proxies only read-only Command Brain routes through the server-side allowlist:
  - `GET /api/company-brain/targets`
  - `GET /api/company-brain/:targetId/overview`
  - `GET /api/company-brain/:targetId/promotions`
  - `GET /api/company-brain/:targetId/review-queue`
- Company Brain action mutations are not exposed through the generic bridge. The product action endpoint maps explicit UI actions to this narrow server-side allowlist:
  - `POST /api/company-brain/:targetId/promotions/:promotionId/review-agent`
  - `PATCH /api/company-brain/:targetId/promotions/:promotionId/review`
  - `POST /api/company-brain/:targetId/promotions/:promotionId/promote`
- Returns a stable Observatory response with add-on status, bridge status, target binding, health sources, promotions, review queue, downstream call summaries, and errors.
- If the Command Brain bridge env is not configured, the add-on still appears for entitled scopes but reports `unconfigured` instead of attempting browser-side writes.
- Current deployment is configured against the local Command Brain origin with `service-jwt`.

Validation state:

- `node --test --import tsx src/lib/optale/command-brain-bridge.test.ts src/lib/optale/brain-company-brain-addon.test.ts src/lib/optale/brain-core.test.ts test/hash-route.test.ts`
- `./node_modules/.bin/tsc --noEmit`
- `./node_modules/.bin/eslint src/lib/optale/command-brain-bridge.ts src/lib/optale/command-brain-bridge.test.ts src/lib/optale/brain-company-brain-adapter.ts src/app/api/optale/brain/company-brain/action/route.ts src/components/optale/brain-workspace.tsx`
- `npm run build`
- Local and public smoke against `GET /api/optale/brain/company-brain?cabinetPath=.&status=promoted`
- Local and public invalid-action smoke against `POST /api/optale/brain/company-brain/action` returned controlled `400` without touching upstream state.
- Local `promote-dry-run` smoke against an already promoted record returned `200`, `ok=true`, `idempotent=true`, and existing write status `completed`.

Current deployed smoke:

- HTTP `200`
- add-on enabled by `scope-label`
- target `optale-global`
- source status `healthy`
- bridge enabled/configured `true`
- actions enabled `true`
- health `5` healthy, `0` missing, `0` failing
- promotions loaded `2`
- review queue jobs loaded `8`
- downstream calls `4`, downstream errors `0`

Current deployed Dreams smoke:

- HTTP `200`
- source status `healthy`
- Dreams API configured `true`
- downstream calls `4`, downstream errors `0`
- proposal total `95`
- proposals loaded `95`
- downstream preview proposals `25`
- rejections loaded `0`
- rules loaded `7`
