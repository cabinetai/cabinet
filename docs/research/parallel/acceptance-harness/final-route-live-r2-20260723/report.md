# Production acceptance harness

Verdict: **NOT_ACCEPTED**

The runner exercised an isolated application build on port 4354. It sent 2 bounded live model message request(s) and did not touch production or canonical data.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
| conversation | live-two-turn-contract | PASSED | hermes-acp-official-sdk returned the exact nonce once per response with two user and two completed assistant turns across a Cabinet restart. |
| routes | route-manifest | PASSED | Discovered 15 application and SPA routes from exact source. |
| navigation | desktop-navigation | PASSED | Discovered 22 visible desktop button labels. |
| drawers | drawers-data-team | PASSED | Data and Team drawers changed selected state and rendered their target surfaces. |
| new | new-composer | PASSED | New opened one keyboard-usable conversation composer. |
| availability | search-terminal-unavailable | PASSED | Search and Terminal were visibly unavailable with zero Search/PTY requests. |
| tasks | tasks-route | PASSED | Tasks loaded standalone and nested, including reload. |
| routes | primary-application-routes | PASSED | Loaded 7 independent application routes with deterministic Cockpit identity. |
| organization | org-chart | PASSED | Loaded the room overview that owns the Org-chart action. |
| organization | org-chart-trigger-present | PASSED | Found one visible Org-chart button by its accessible role and name. |
| organization | org-chart-trigger-enabled | PASSED | The Org-chart trigger was enabled for the isolated agent fixture. |
| organization | org-chart-trigger-click | PASSED | The enabled Org-chart trigger accepted a bounded click. |
| organization | org-chart-dialog | PASSED | The named Org-chart dialog opened after the trigger click. |
| organization | org-chart-bounds-and-close | PASSED | Org chart stayed viewport-bounded, closed by keyboard, and restored trigger focus. |
| Hermes | operator-mode | PASSED | Hermes Operator mode rendered against the non-mutating acceptance projection. |
| Skills | governed-skills | PASSED | Governed Skills rendered with explicit fixture provenance and no live mutation. |
| Hermes | hermes-operator-sections | PASSED | Opened 4 independently scoped Hermes Operator sections. |
| Developer | developer-diagnostics-48 | PASSED | Developer mode exposed exactly 48 diagnostic rows. |
| conversation | conversation-direct-reload-persistence | PASSED | The completed conversation survived direct task/transcript URLs and reload. |
| restart | restart-route-persistence | FAILED | Cabinet restart persistence failed: Error: Controlled restart console reset was not correlated to a failed read-only request. |
| supervision | launchd-child-restart | PASSED | The complete isolated supervision recovery suite passed without touching launchd. |
| navigation | history-navigation | PASSED | Back/forward navigation preserved route identity. |
| responsive | mobile-reduced-motion-overflow | PASSED | 390x844 reduced-motion room had 0px horizontal overflow. |
| network | legacy-daemon-output-accounting | PASSED | Observed 0 legacy daemon-output request(s). |
| routes | complete-route-inventory | PASSED | Exercised all 15 discovered and required routes. |
| browser | console-health | FAILED | 1 relevant browser issue(s) were observed with stage ownership. |
| safety | mutation-accounting | PASSED | Recorded 30 isolated HTTP mutation request(s) and 0 consequential Hermes mutation(s). |

## Exact blockers

- `cabinet-restart-persistence`: Cabinet restart persistence failed: Error: Controlled restart console reset was not correlated to a failed read-only request.

## Accounting

- Exact nonce present: initial=true, follow-up=true
- Nonce occurrence count: initial=1, follow-up=1
- Surrounding formatting present: initial=true, follow-up=true
- Altered or partial nonce present: initial=false, follow-up=false
- Persisted content matches rendered content: initial=false, follow-up=true
- Session context preserved: initial=true, follow-up=true
- Message-body selector: [data-testid="turn"][data-turn-role="agent"] > [data-testid="assistant-message-content"][data-message-author="assistant"][data-message-part="content"]
- Message-body element count: 2
- Requests: 1996
- Mutations observed: 30
- Legacy daemon-output requests: 0
- Search requests: 0
- PTY create/write requests: 0
- Model message requests: 2
- Provider identities observed: ollama-cloud
- Effective model identities observed: glm-5.2
- Provider requests attempted: 2
- Provider retries: 0
- Fallback attempts: 0
- Tool events: 0
- Decision events: 0
- Duplicate chunks: 0
- MCP servers: 0
- Pending required writes ledger: [{"checkpoint":"A","pendingRequiredWrites":{"state":"unknown","value":null,"source":"acceptance_observability","reason":"authoritative_absent"}},{"checkpoint":"B","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"C","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"D","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"E","pendingRequiredWrites":{"state":"known","value":1,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"F","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"G","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}},{"checkpoint":"H","pendingRequiredWrites":{"state":"known","value":0,"source":"acceptance_observability","legacyState":"absent"}}]
- Consequential Hermes mutations: 0
- Relevant browser issues: 1
- Developer diagnostics observed: 48
- Secret indicators: 0
- Local-path indicators: 0

## Recommendation

Resolve only the exact blockers above, then rerun the same bounded acceptance.

## Known limitation

Natural-language exact-output requests are not guaranteed byte-for-byte across all configured models. A future constrained-output contract is required for strict machine output.
