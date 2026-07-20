# Hermes Runtime Execution Visibility Contract Audit

Phase 3A is a read-only projection over interfaces verified in the installed Hermes Agent `0.18.2` runtime. The installed source identity is commit `594308d4bbe95548c9fe418bb10c449099426f93` (`v2026.7.7.2-1150-g594308d4b`). Cabinet does not create a second runtime store or executor.

## Verified installed interfaces

| Source | Method and interface | Verified response shape | Current runtime | Authentication and failure boundary | Projection decision |
| --- | --- | --- | --- | --- | --- |
| Runtime capability declaration | `GET /v1/capabilities` | Declares per-known-run status, SSE events, approval response, stop, tool-progress events, approval events, and session resources | Source implementation present; authenticated live request was not made because no Cabinet API credential is configured in the current shell | Bearer credential, server-side only; Cabinet timeout is 3 seconds | Contract evidence only. It cannot prove a current run source succeeded. |
| Run status | `GET /v1/runs/{run_id}` | `object`, `run_id`, `status`, `created_at`, `updated_at`, `session_id`, `model`, `last_event`, optional `output`, `error`, `usage` | Available only for a known run identifier and retained for a bounded runtime TTL | Bearer credential; 404 for an unknown or expired run | Stable for a known run. There is no installed global run-list endpoint. Output and error are bounded and sanitized; model input is not returned. |
| Run lifecycle events | `GET /v1/runs/{run_id}/events` | SSE events including `tool.started`, `tool.completed`, `approval.request`, `run.completed`, `run.failed`, and `run.cancelled` | Available only for a known live run; no retrospective event-list endpoint | Bearer credential; streaming connection, keepalive, 404 for unknown run | Stable for live known-run enrichment. Complete payloads, prompts, reasoning text, tool inputs, and tool outputs are excluded. |
| Sessions | `GET /api/sessions?limit=100&order=recent` | `sessions`, `total`, `limit`, `offset`; rows include identifiers, lifecycle timestamps, `is_active`, `end_reason`, parent session, token counts, estimated/actual cost, tool-call count, profile, source, and repository fields | Authenticated live response succeeded with 20 recent rows during audit | `X-Hermes-Session-Token`, server-side only; 3-second timeout; bounded fallback on error | Stable for session-backed execution and parent/child orientation. Prompts, previews, user/chat identities, cwd, repository paths, billing endpoints, and arbitrary metadata are removed. |
| Active agents | `GET /api/plugins/kanban/workers/active` | `workers`, `count`, `checked_at`; workers expose `run_id`, `task_id`, profile, worker timing and heartbeat fields | Authenticated live response succeeded with zero active workers | `X-Hermes-Session-Token`; 3-second timeout | Stable read-only agent source. Task titles, process identifiers, claim material, and worker command data are excluded. Zero workers is connected-empty. |
| Queue | `GET /api/plugins/kanban/board` | Eight named columns containing task rows plus board metadata | Authenticated live response succeeded; all eight columns were empty | `X-Hermes-Session-Token`; 3-second timeout | Stable for bounded Kanban queue counts. Task prompts, descriptions, arbitrary metadata, assignee identity, and mutation links are excluded. Empty columns are connected-empty. |
| Per-worker details | `GET /api/plugins/kanban/runs/{run_id}` and `/inspect` | Stored run row and live process diagnostics | Present in installed OpenAPI | `X-Hermes-Session-Token`; 3-second timeout | Not collected in Phase 3A. The inspect response can contain command lines and process details outside this slice. |
| Approvals and clarifications | Per-known-run `pending_decision` and `approval.request` event | Approval identity and choices for an already known run | Contract available, but no global pending-input list exists | Bearer credential; run identity required | Read-only when attached to a known run. Global approval, clarification, authentication, secret, file, and decision queues remain unavailable unless a source explicitly reports them. |
| Artifacts | `GET /api/files` | `entries` containing name, path, directory flag, MIME type, size, and modification time | Authenticated live response succeeded with 74 entries | `X-Hermes-Session-Token`; 3-second timeout | Stable for global safe metadata only. Complete paths are reduced to safe names. File contents, reveal, download, and unsupported run association are excluded. |
| Usage and cost | `GET /api/analytics/usage?days=30&profile={profile}` | `daily`, `by_model`, `by_task`, `totals`, `skills`, `tools`, `period_days` | Authenticated live response succeeded with two daily rows and one model row | `X-Hermes-Session-Token`; 3-second timeout | Stable for aggregate tokens, session count, API calls, and reported estimated/actual cost. It does not establish per-run cost unless the run/session row explicitly reports it. |
| Management status | `GET /api/status` | Includes bounded `active_agents`, `active_sessions`, Gateway state and version data | Authenticated live response succeeded | `X-Hermes-Session-Token`; 3-second timeout | Corroborating count only. It never replaces a failed source-specific worker, session, queue, artifact, or usage observation. |

## Explicitly absent or insufficient

- The installed runtime has no global `GET /v1/runs` enumeration endpoint.
- It has no global approval, clarification, secret, authentication, file-request, or pending-user-input endpoint.
- Queue state comes from the installed Kanban board, not from the API server's internal concurrency queue.
- `/api/files` does not currently report run or session association in its installed response.
- Session rows do not report the current step or current tool. Those fields remain unknown unless a known-run event explicitly supplies them.
- Per-run usage is available from a known run or session row. Duration is derived only from explicit timestamps. Aggregate analytics are not attributed to a run.
- Parent/child relationships are session relationships unless the source explicitly supplies run relationships.

## Safety boundary

The projection removes prompts, previews, task titles, complete tool payloads, outputs, reasoning, raw errors, command lines, process identifiers, usernames, email addresses, local paths, remote URLs, credential files, authorization material, and arbitrary metadata before the accepted recursive browser sanitizer. No Phase 3A route exposes approve, reject, cancel, retry, pause, resume, terminate, shell, file-content, restart, or configuration controls.

