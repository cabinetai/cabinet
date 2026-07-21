# Hermes Agent API read-only expansion — live acceptance

Classification: **Live runtime**. Captured: `2026-07-21T01:05:23.763Z`. Implementation revision: `fa801ebd95d1fa951d9308a161be2d06d73dd9aa`.

The isolated production build ran on `127.0.0.1:4011` with the existing Agent API configuration only. Hermes Management and Gateway remained independently unavailable. Interventions were disabled and the recorded Hermes mutation-call total was zero.

## Live sources reached

| Method and interface | Outcome | Projected result |
| --- | --- | --- |
| `GET /health/detailed` | Success | Running Agent version `0.19.0`; no active profile was reported by this source. |
| `GET /v1/capabilities` | Success | Installed server contract confirmed; arbitrary nested metadata was not returned to the browser. |
| `GET /api/sessions?limit=100&offset=0&include_children=true` | Success | Requested 100 records at offset 0; response reported limit 100, offset 0, returned and loaded 100, displayed 50, and `has_more=true`. Coverage is `partial_page`. Raw identities, titles, previews, user identities, prompts, and messages were removed. |
| `GET /v1/models` | Success | One bounded server-advertised model identity returned. Current/default model, provider authentication, profile overrides, and billing remain unknown. |

No legitimate known run identity was supplied, so `GET /v1/runs/{run_id}` was not called during live acceptance. Session detail, message history, and run-event SSE were not called. The installed SSE contract remains classified as a current known-run stream, not retrospective history.

## Truth and parity result

Session enumeration is deliberately a partial claim for the combined Chat and sessions capability: it is visible and degraded, but earns no Current Live Visibility or Live-Proven credit because transcripts were not requested and the page is incomplete. Installed session identities contain only a timestamp plus a six-hex UUID suffix, so Cabinet uses honest page-local labels rather than stable pseudonyms. The UI states `100 records loaded; more records are available`, `Showing 50 of 100 loaded records`, and qualifies child counts and missing parents to the loaded page. `/v1/models` is now also a partial advertised-catalog claim; it does not satisfy the registry's canonical current/default-model contract and earns no live parity credit.

- Discoverability: 48/48, 100%
- Current Live Visibility: 0/48, 0%
- Governed Management: 3/48, 6%
- Live-Proven: 3/48, 6%
- Status summary: 20 Available, 0 Connected, 5 Degraded, 0 Disabled, 1 Unsupported, 22 Needs setup

<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:START -->
### Live-Proven attribution

Generated directly from the canonical capability projection.

| Capability ID | Classification | Evidence origin | Proof kind | Proof scope | Source | Interface | Observed at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `command-center` | current | `raw_observation` | live | live_runtime_operation | Hermes detailed health bridge | /health/detailed | 2026-07-21T01:05:21.428Z |
| `approvals` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | Cabinet Hermes M3-M7 acceptance suite | Hermes gateway and run decision contract | 2026-07-19T02:23:07Z |
| `browser-opencli` | historical | `approved_evidence_catalog` | historical_audit | historical_live_acceptance | OpenCLI read-only acceptance | opencli local page title, DOM read, and screenshot | 2026-07-19T20:18:51Z |
<!-- GENERATED:HERMES_LIVE_PROVEN_ATTRIBUTION:END -->

## Verification

- Full unit suite: 596 passed, 0 failed.
- Focused Agent API, management, projection, identity, pagination, lineage, and model-truth suite: 62 passed, 0 failed.
- Focused production-browser workflows: 9/9 passed after one transient harness daemon-health 502 was cleared by the clean rerun; the Agent-only readiness workflows passed on the first run.
- Focused ESLint: passed with no findings.
- Production build and its TypeScript gate: passed. Existing unrelated Turbopack broad NFT-trace warnings remain.
- Desktop `1440×900`: passed.
- Mobile `390×844`: passed with document width exactly 390 px and no horizontal overflow.
- Browser warning/error log: empty.
- Reduced-motion emulation: recognized; the Hermes surface introduced no continuous animation. Two pre-existing one-shot Cabinet shell entrance animations remain and are reported as an unrelated discrepancy.
- Machine, parity matrix, browser, and this report use the canonical projection. The machine evidence records the exact Live-Proven attribution.
- Credential, raw-content, and local-identity non-egress checks: passed.
- `.cabinet.env`: remained ignored and uncommitted.

## Evidence

- `live-runtime-projection.json`
- `configuration-readiness.json`
- `live-overview-1440x900.png`
- `live-sessions-lineage-1440x900.png`
- `live-overview-mobile-390x844.png`
- `live-sessions-mobile-390x844.png`

## Preserved discrepancies

- The Agent API returned 100 records with `has_more=true`; Cabinet intentionally does not claim complete session-history coverage from the bounded page.
- The page contained no duplicate identities during capture; deterministic duplicate and equal-time ambiguity behavior is covered by focused tests rather than claimed as a live observation.
- Many records have no end timestamp. Cabinet labels these `unended`; it does not infer that they are actively running.
- The configured profile is `operator-os`, but the live Agent health/session sources did not explicitly report an active profile. The observed profile therefore remains unknown.
- No durable global run enumeration, Agent artifact index, independent usage-history endpoint, or safe current-event history was found.
- Management and Gateway remain unavailable by design in this phase.
