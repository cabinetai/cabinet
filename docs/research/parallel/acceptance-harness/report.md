# Production acceptance harness

Verdict: **NOT_ACCEPTED**

The runner exercised an isolated application build on port 4304. It sent 0 bounded live model message request(s) and did not touch production or canonical data.

## Checks

| Area | Check | Status | Result |
| --- | --- | --- | --- |
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
| conversation | fixture-two-turn-contract | FAILED | Two-turn transport contract failed: Error: deliberate conversation failure |
| conversation | live-two-turn-contract | BLOCKED | No live transport was selected; zero live model messages were sent. |
| conversation | conversation-direct-reload-persistence | BLOCKED | Blocked by the unavailable live two-turn conversation result. |
| restart | restart-route-persistence | PASSED | Isolated Cabinet restarted on port 4304 and the room route persisted. |
| supervision | launchd-child-restart | PASSED | The complete isolated supervision recovery suite passed without touching launchd. |
| navigation | history-navigation | PASSED | Back/forward navigation preserved route identity. |
| responsive | mobile-reduced-motion-overflow | PASSED | 390x844 reduced-motion room had 0px horizontal overflow. |
| network | legacy-daemon-output-accounting | PASSED | Observed 0 legacy daemon-output request(s). |
| routes | complete-route-inventory | FAILED | 2 route(s) were not accepted. |
| browser | console-health | PASSED | No relevant browser or framework errors were observed. |
| safety | mutation-accounting | PASSED | Recorded 34 isolated HTTP mutation request(s) and 0 consequential Hermes mutation(s). |

## Exact blockers

- `live-two-turn-contract-failed`: Two-turn transport contract failed: Error: deliberate conversation failure
- `incomplete-route-inventory`: 2 discovered or required route(s) were not accepted.

## Accounting

- Requests: 1629
- Mutations observed: 34
- Legacy daemon-output requests: 0
- Search requests: 0
- PTY create/write requests: 0
- Model message requests: 0
- Consequential Hermes mutations: 0
- Relevant browser issues: 0
- Developer diagnostics observed: 48
- Secret indicators: 0
- Local-path indicators: 0

## Recommendation

Resolve only the exact blockers above, then rerun the same bounded acceptance.
