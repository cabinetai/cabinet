# M8 Daily Business Intake acceptance

Status: technical implementation complete; Jeremy-only shadow trust and usefulness reviews remain open.

## Product boundary

Daily Business Intake is available at `/cockpit` in Hermes mode. It is a decision and exception surface, not a second runtime. Hermes remains the source of truth for sessions, runs, approvals, jobs, skills, tools, and memory. The cockpit persists only normalized intake snapshots, manual risk notes, card comments and snoozes, and bounded non-secret usage telemetry.

Shadow mode grants no write autonomy. Investigate, Draft response, and Ask why start read-only Hermes runs. Approve and Reject require the exact pending run and request identities plus explicit confirmation. Schedule creates a canonical Hermes job only after explicit confirmation. Gmail and Calendar intake is limited to read-only `gws` list/get operations; message bodies, raw provider payloads, and credentials are excluded from the projection.

## Issue acceptance matrix

| Linear | Acceptance evidence |
| --- | --- |
| IG-436 | Typed contract, normalized cards and coverage, bounded mode-0600 projection store, and Hermes source-of-truth boundary. |
| IG-437 | Real read-only intake runs queried Gmail metadata, Calendar, canonical Hermes jobs, manual risks, and Supermemory. Unavailable sources fail visibly. |
| IG-438 | Needs Jeremy, Business Risks, and Today's Mission render evidence, impact, urgency, and recommended next steps. |
| IG-439 | Hermes health, `operator-os:supermemory`, source coverage, intake history, and verified Recent Wins render in the cockpit. |
| IG-440 | Investigate, Draft response, Approve, Reject, Comment, Snooze, Schedule, and Ask why are implemented with governed confirmation and identity rules. |
| IG-441 | Governed Investigate roundtrip `run_fb23686c5f31441c95b2fa17f3ed429f` completed from card context with retained result and no material write. |
| IG-442 | Two representative shadow runs and their misses/false positives are documented below. Jeremy's trust decision remains required. |
| IG-443 | The working cockpit and instrumentation are ready for Jeremy's usefulness review after normal use. Jeremy's decision remains required. |

## Live shadow evidence

- Intake `run_86488309ed98414c938865940223f572` completed. It surfaced a false OpenCLI availability risk and initially marked Gmail and Calendar unavailable because the prompt had not yet been given the authenticated read-only `gws` path.
- Investigate `run_fb23686c5f31441c95b2fa17f3ed429f` proved the OpenCLI risk false: OpenCLI 1.8.5, its daemon, extension, and one browser profile were connected. The false manual risk was resolved and Advanced Hermes now reports the actual server-side diagnostic state.
- Intake `run_cc2b29f2a7464de6b1e39fa3699d832b` completed after the correction. All five source groups were connected: Gmail metadata, Calendar, Hermes jobs, manual risks, and Supermemory. It produced four Needs Jeremy cards, one Business Risk correction record, one Today's Mission, and two Recent Wins without an approval request or write.
- In-app browser acceptance loaded `/cockpit`, reported Hermes 0.18.2 online on `operator-os`, showed healthy Supermemory, rendered all five connected sources and the decision groups, expanded and cancelled the manual-risk flow, refreshed in place, produced no browser warning/error logs, and had no horizontal overflow at a 390 by 844 viewport.

## Shadow review notes

- False positive: the first intake conflated absence of a Hermes-native OpenCLI skill with absence of the external OpenCLI capability. The corrected diagnostic distinguishes those states.
- Initial miss: the first prompt did not discover authenticated Google Workspace access. The corrected prompt names the read-only `gws` methods and prohibits every write method.
- Ambiguity: Gmail cards use metadata and snippets only. A surfaced message may already be handled outside the visible evidence and always requires Jeremy's judgment.
- Empty source: the representative window contained zero canonical Hermes jobs. This is a valid connected-empty state, not a connection failure.
- Telemetry limitation: tool switches avoided is a directional estimate derived from covered source systems and cockpit views, not observed switching behavior.

## Remaining owner decisions

M8 cannot close until Jeremy records both decisions:

1. IG-442: whether the representative shadow output is trustworthy enough for normal use and which policy corrections, if any, are required.
2. IG-443: whether the cockpit materially reduces tool switching and feels useful after normal use, including whether any card grouping or action should change.

GitHub PR #1 remains draft and unmerged. M8 acceptance does not authorize merging it.
