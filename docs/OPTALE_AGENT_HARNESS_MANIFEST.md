# Optale Agent Harness Manifest

Status: first manifest slice
Date: 2026-05-02

## Canonical Source

The Optale Agent Harness manifest is the canonical source for Optale Command agent definitions.

The first slice lives in:

- `src/lib/optale/agent-harness/agent-definition.ts`
- `src/lib/optale/agent-harness/optale-meta-manifest.ts`

Each `AgentDefinition` is schema-versioned and includes identity, role, instructions, provider/model defaults, scope, memory namespace, MCP/tool policy, handoff edges, schedules, approval policy, and runtime projection metadata.

## AGENTS-FW Alignment

The current Agent Harness manifest and native persona projection are Phase 1: a tactical projection layer that keeps canonical agent definitions in one place while Optale Command migrates off bridge-first runtime paths.

The broader product-facing Optale Agent runtime is the canonical ORM project:

- project id: `9713d044-ae60-419c-8382-29079dc2767a`
- identifier: `AGENTS-FW`
- name: Optale Agents Framework
- status: `ACTIVE`

AGENTS-FW owns the long-term Optale Agent runtime direction. The Phase 1 Harness manifest should feed that runtime, native Optale Command agents/personas/routines, and temporary bridge projections without becoming a second product source of truth.

Sense Memory stack direction:

- Cognee for ingestion and document-to-KG
- Open Foundry for ontology, runtime, and digital twin
- Graphiti for temporal facts
- proprietary personal memory replacing Honcho for customer-facing use

Honcho remains internal-only. The private-to-company promotion boundary must remain enforced in code, with personal memory promotion explicitly gated before company/system memory receives it.

Optale Command remains the control plane and runtime surface. LibreChat remains the bridge/runtime during migration only.

## AGENTS-FW V2 Preview Metadata

AgentDefinition v1 remains the working tactical manifest for the current Harness slice. It is still the source used for validation, native Observatory persona projection, and temporary LibreChat bridge metadata.

The v2 layer is read-only AGENTS-FW alignment metadata derived from v1. It previews the broader Optale Agents Framework shape without changing runtime behavior:

- `src/lib/optale/agent-harness/agent-definition-v2.ts`
- `src/lib/optale/agent-harness/agent-definition-v2-preview.ts`

The v2 preview includes scope profile, private/company/system boundary metadata, Sense Memory bindings, identity, runtime, tool policy, action policy, observability, orchestration, and projection metadata. Generated personas remain projection artifacts and should not be hand-edited as canonical agent definitions.

Sense Memory in v2 points toward Cognee for ingestion/document-to-KG, Open Foundry/OAG for ontology/runtime/digital twin patterns, Graphiti for temporal facts, and proprietary personal memory for customer-facing memory. Honcho is represented only as an internal-only legacy memory bridge when present.

LibreChat remains bridge/runtime during migration. Legacy LibreChat agent ids, source scripts, model metadata, and tool ids are retained only as bridge projection data.

## LibreChat Bridge

The existing LibreChat Mongo scripts remain temporary reference and bridge material during migration:

- `/home/thor/projects/librechat/api/scripts/optale/upsert-optale-meta-agents.cjs`
- `/home/thor/projects/librechat/api/scripts/optale/smoke-optale-meta-agents.cjs`

Those scripts are not canonical agent definitions. The manifest records legacy LibreChat agent IDs and MCP server/tool metadata only so Optale Command can project into the bridge while LibreChat Command Centre remains the production chat, RAG, and runtime bridge.

## Future Projection

Native Optale Command agents, personas, and routines should be generated or imported from this manifest later. Runtime wiring is intentionally out of scope for this slice; validation only proves the manifest shape, roster coverage, bridge projection metadata, and handoff integrity.

Do not rename the repo, folder, PM2 process, or domain as part of this manifest work.

## Native Persona Projection

The first native projection path maps `AgentDefinition` records into Observatory-compatible `persona.md` documents without changing runtime behavior by default.

Code:

- `src/lib/optale/agent-harness/persona-projection.ts`
- `scripts/optale-agent-harness-personas.ts`

Default behavior:

- dry-run only
- targets the root native agents directory: `${CABINET_DATA_DIR}/.agents` or `data/.agents`
- generates paused personas with `active: false`
- skips any existing `persona.md`
- records `optaleHarness` frontmatter with manifest id, schema version, definition id, generator id, projection time, native projection metadata, and legacy LibreChat bridge id
- does not touch LibreChat

Dry-run the full meta roster:

```bash
npx tsx scripts/optale-agent-harness-personas.ts
```

Dry-run as JSON:

```bash
npx tsx scripts/optale-agent-harness-personas.ts --json
```

Dry-run one definition:

```bash
npx tsx scripts/optale-agent-harness-personas.ts --agent=optale-meta-lead
```

Write only missing personas:

```bash
npx tsx scripts/optale-agent-harness-personas.ts --write
```

Write to a temporary agents directory for inspection:

```bash
npx tsx scripts/optale-agent-harness-personas.ts --write --target-agents-dir=/tmp/optale-harness-agents
```

Overwrite existing generated or hand-edited personas only when explicitly approved:

```bash
npx tsx scripts/optale-agent-harness-personas.ts --write --overwrite
```

## Live Runtime Smoke

PM2-runtime no-tools smoke verified on 2026-05-02:

- persona: `optale-research-context`
- runtime data dir: `/home/thor/cabinet-optale-data`
- provider / adapter / model: `openrouter` / `openrouter_api` / `anthropic/claude-sonnet-4`
- status: `completed`
- active before / after: `false` / `false`
- MCP/tool markers: none
- inspect URL path: `/agents/conversations/2026-05-02T22-39-13-044Z-dbe0cc16-optale-research-context-manual`
- runtime conversation artifacts are stored under the PM2 runtime data dir and are not committed

PM2-runtime forced qmd smoke verified on 2026-05-02:

- commit dependencies: `d4fa435` OpenRouter hardening, `2219eaf` downstream MCP timeout
- persona: `optale-research-context`
- runtime data dir: `/home/thor/cabinet-optale-data`
- provider / adapter / model: `openrouter` / `openrouter_api` / `anthropic/claude-sonnet-4`
- governed MCP: `allowedServerIds: ["qmd"]`, `allowedTools: ["qmd__query"]`
- required tool: `requiredToolName: "qmd__query"`
- result: `completed`, `qmdToolCallCount: 1`, `nonQmdToolCalls: 0`, audit outcome `ok`
- active before / after: `false` / `false`
- inspect URL path: `/agents/conversations/2026-05-02T23-47-55-149Z-3a52ce78-optale-research-context-manual`
- runtime conversation artifacts are stored under the PM2 runtime data dir and are intentionally not committed
