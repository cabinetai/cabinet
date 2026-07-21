# Hermes Agent catalog visibility — live acceptance

Classification: **Live runtime**. Captured: `2026-07-21T01:32:43.293Z`. Implementation revision: `c547e79d3c6cf3ffb1fa93307d1e13ef623a075c`.

The exact production build ran on `127.0.0.1:4011` with the existing Agent API configuration only. Hermes Management and Gateway remained independently unavailable. Interventions were disabled and the recorded Hermes mutation-call total was zero.

## Live sources reached

| Method and interface | Outcome | Projected result |
| --- | --- | --- |
| `GET /health/detailed` | Success | Running Agent version `0.19.0`; no active profile was reported by this source. |
| `GET /v1/capabilities` | Success | Installed Agent contract confirmed Skills and Toolsets routes. Arbitrary nested metadata was discarded. |
| `GET /api/sessions?limit=100&offset=0&include_children=true` | Success | Existing bounded session collection remained intact; no content-bearing session detail was requested. |
| `GET /v1/models` | Success | Existing advertised-model catalog remained a partial claim. |
| `GET /v1/skills` | Success | 37 bounded Skill records projected. Names and categories are visible; descriptions, enabled state, and provenance are not claimed. |
| `GET /v1/toolsets` | Success | 25 bounded Toolset records projected with labels, explicit enabled/configured state, provenance label, and tool counts. Concrete tool names and descriptions were discarded. |

Management and Gateway made zero requests because their credentials were not configured. No known-run read, content-bearing session read, message-history read, mutation route, or external message was invoked.

## Truth and parity result

Skills and Toolsets were successfully observed from their own fresh sources. They remain deliberately partial capability claims: the Skills route does not report per-skill enabled state or provenance, and the Toolsets route cannot prove Executor health or canonical API-key configuration. Therefore Skills, Executor, and API keys/tools are visible as degraded partial observations and earn neither Current Live Visibility nor Live-Proven credit.

- Discoverability: 48/48, 100%
- Current Live Visibility: 0/48, 0%
- Governed Management: 3/48, 6%
- Live-Proven: 3/48, 6%
- Status summary: 20 Available, 0 Connected, 8 Degraded, 0 Disabled, 1 Unsupported, 19 Needs setup

<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:START -->
### Live-Proven attribution

Generated directly from the canonical capability projection.

| Capability ID | Classification | Evidence origin | Proof kind | Proof scope | Source | Interface | Observed at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `command-center` | current | `raw_observation` | live | live_runtime_operation | Hermes detailed health bridge | /health/detailed | 2026-07-21T01:32:40.983Z |
| `approvals` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | Cabinet Hermes M3-M7 acceptance suite | Hermes gateway and run decision contract | 2026-07-19T02:23:07Z |
| `browser-opencli` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | OpenCLI read-only acceptance | opencli local page title, DOM read, and screenshot | 2026-07-19T20:18:51Z |
<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:END -->

## Preserved discrepancies

- Installed Hermes Agent is `0.19.0`, newer than the originally targeted `0.18.2`; evidence describes the installed contract actually observed.
- The configured profile is `operator-os`, but the Agent catalog and health sources do not explicitly report the active profile. Observed active profile remains unknown.
- Skills do not report enabled state or provenance. Cabinet displays those facts as not reported rather than inferring them.
- Toolsets expose enabled/configured flags and a tool list, but catalog presence does not prove Executor health, active execution, or canonical API-key state.
- One concurrent Control Center collection recorded a bounded `/v1/toolsets` timeout while a direct authenticated read returned HTTP 200; the next normal read-only refresh succeeded with all 25 Toolsets. The successful machine projection is retained for the catalog evidence, and the intermittent timeout remains an unresolved source-latency discrepancy rather than being silently reclassified.
- The disposable production instance reported its Cabinet agent daemon unavailable. The UI keeps that separate from the connected Hermes Agent runtime; it is visible in desktop evidence and was not used to classify Agent catalog health.
- Management and Gateway remain independently unavailable by configuration.
- Catalog partial claims intentionally leave overall parity unchanged.

## Verification

- Full unit suite: 600 passed, 0 failed.
- Complete Hermes contract, collector, truth-state, authority, freshness, intervention-gate, generator, and non-egress suite: 166 passed, 0 failed. The narrower catalog/projection subset passed 53/53.
- Focused production-browser catalog and Agent-readiness workflows: 7/7 passed at desktop and mobile with reduced motion, zero overflow, no relevant console errors, and zero mutation calls.
- TypeScript, focused ESLint, exact production build, and `git diff --check`: passed.
- Recursive credential, local-identity, URL, path, control-character, and catalog-payload non-egress: passed.
- Machine, parity matrix, browser rows, and percentages derive from the canonical projection.
- `.cabinet.env` remained ignored and uncommitted.

## Evidence

- `live-runtime-projection.json`
- `live-tools-1440x900.png`
- `live-skills-inspector-1440x900.png`
- `live-executor-inspector-1440x900.png`
- `live-tools-mobile-390x844.png`
