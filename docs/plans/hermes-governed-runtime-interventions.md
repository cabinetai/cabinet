# Hermes Governed Runtime Interventions Contract Audit

Phase 3B audits mutation contracts in the installed Hermes Agent `0.18.2` runtime at source commit `594308d4bbe95548c9fe418bb10c449099426f93` (`v2026.7.7.2-1150-g594308d4b`). Cabinet remains a bounded control surface over Hermes. It does not create a second executor, task store, or runtime state machine.

## Audit evidence

- The authenticated management OpenAPI identifies itself as Hermes Agent `0.18.2` and exposes the Kanban run, task, and worker contracts below.
- Authenticated live reads of `GET /api/plugins/kanban/workers/active` and `GET /api/plugins/kanban/board` succeeded during this audit. They reported zero active workers and eight connected-empty board columns.
- The API-server source and capability declaration expose known-run approval, stop, status, and event routes. The running API server requires a bearer credential, but no Cabinet API credential is configured in the current shell, so source and installed-contract evidence are recorded separately from authenticated management observations.
- No mutation endpoint was called during the audit.

## Candidate mutation matrix

| Priority and candidate | Exact installed contract | Request and response | Identity, duplicate, stale, and timeout behavior | Consequence and reversibility | Phase 3B decision |
| --- | --- | --- | --- | --- | --- |
| 1. Respond to run approval | `POST /v1/runs/{run_id}/approval` | JSON `{choice: once|session|always|deny, all?: boolean, resolve_all?: boolean}`. Success `{object: hermes.run.approval_response, run_id, choice, resolved}`. | Bearer auth. `run_id` is stable, but the body has no enforced approval request identity. The installed handler ignores any caller-supplied `request_id`. No idempotency key, ETag, version, or atomic expected-state parameter exists. No active approval or duplicate submission returns `409`; a timeout remains ambiguous. `all` and `resolve_all` can resolve more than one queued approval for the targeted run. | Approval can immediately release a consequential tool call; `always` persists broader authority. Not reversible. | **Unsafe for this slice.** It fails exact-request identity, idempotency, and no-batch requirements. No control is added. |
| 1. Clarification or pending human input response | No distinct installed HTTP endpoint or global pending-input enumeration contract | TUI Gateway JSON-RPC has session-keyed `approval.respond`; installed HTTP Run API has approval only. | Desktop approval events explicitly carry no request ID. No stable clarification request resource, idempotency behavior, or HTTP precondition exists. | May resume a blocked execution with user-supplied information. Not generally reversible. | **Unsupported.** No equivalent is invented. |
| 2. Stop a known API-server run | `POST /v1/runs/{run_id}/stop` | No request body. Success `{run_id, status: stopping}`; later `GET /v1/runs/{run_id}` reports terminal state. | Bearer auth. Stable `run_id`, but no reason, idempotency key, ETag, or expected state. Repeated requests while the run remains tracked can call interrupt again; after cleanup they return `404`. Timeout is ambiguous. | Interrupts active execution. Not reversible. | **Not selected.** The narrower Kanban contract has stronger identity, reason, compare-and-swap, and duplicate behavior. |
| 2. Terminate a known Kanban worker run | `GET /api/plugins/kanban/runs/{run_id}` then `POST /api/plugins/kanban/runs/{run_id}/terminate` | Read response `{run: {id, task_id, status, claim_lock, started_at, ended_at, outcome, ...}}`. Mutation JSON `{reason}`. Success `{ok: true, run_id, task_id}`; unknown `404`; ended or no longer reclaimable `409`. | `X-Hermes-Session-Token`, server-side only; Cabinet timeout is bounded and never retried automatically. Integer `run_id`, `task_id`, `started_at`, and the active `claim_lock` form the stable resource fingerprint. Hermes re-reads the run, then `reclaim_task` performs a transactional compare-and-swap on task state and claim lock. Exactly one transition can succeed; stale or duplicate transitions return `409`. A timeout is reconciled by read only and never reported as success without a verified Hermes terminal result. | Sends the worker termination signal, ends the run as `reclaimed`, clears its claim, and returns the task to `ready`. Not reversible; a later dispatcher may start a new run. | **Selected category: cancel one specific known Kanban run.** This is the smallest installed contract with reason, stable identity, transactional stale protection, and proven equivalent idempotency. |
| 3. Retry or resume a known run | No installed `/v1/runs/{run_id}/retry` or `/resume` endpoint | Session resume exists only as TUI Gateway session control. Cron resume is a scheduler mutation, outside this slice. | No stable known-run retry/resume contract, idempotency behavior, or expected-state guard is advertised. | Starts or resumes execution; not reliably reversible. | **Unsupported.** No control is added. |
| Worker/task transitions | `PATCH /api/plugins/kanban/tasks/{task_id}`, `POST .../reclaim`, `POST .../reassign`, and related task routes | Broad task fields and recovery operations. | Management session auth. These contracts can change status, assignment, content, and scheduling state; most do not provide a request idempotency key or expected-version input. | Broad operational impact. Some transitions can start later work. | **Excluded.** Only the run-specific termination wrapper is used. |

## Selected safety contract

The only Phase 3B mutation category is **terminate one specific active Kanban run**.

Prepare/preview must:

1. Read the exact run from Hermes.
2. Require an integer run identity, a bounded operator reason, and live-runtime provenance.
3. Reject fixture, stale, ended, non-running, or claimless targets.
4. Derive an opaque stable request identity from the action, run, task, start time, active claim fingerprint, evidence time, and reason. The claim value itself never reaches the browser.
5. Show action, target, current state, reason, expected consequence, irreversibility, evidence time, and request identity without mutating Hermes.

Commit must:

1. Require explicit Jeremy confirmation immediately before execution.
2. Re-read the run and require the prepared fingerprint to match.
3. Execute `POST /api/plugins/kanban/runs/{run_id}/terminate` exactly once with the prepared reason.
4. Cache the result by the stable request identity so duplicate browser commits cannot call Hermes twice.
5. Re-read Hermes and report success only when the run is terminal with the expected reclaimed outcome. A timeout or bounded failure remains visible and is not retried automatically.

Cabinet retains only bounded ephemeral server-side previews and receipts. Expired never-committed previews are removed, uncommitted previews have a deterministic maximum, in-flight receipts are never evicted, and completed duplicate receipts remain available for their bounded retention. An unknown result may be rechecked repeatedly through the exact run's read-only endpoint; every recheck performs zero mutation calls and can never redispatch termination.

Governed termination of one specifically identified active Kanban run is implemented behind fresh live authority, exact typed confirmation, stale-state protection, and idempotent reconciliation. No live mutation has yet been performed.

The UI must retain the rule: **Hermes prepares; Jeremy commits.** Acceptance fixtures may exercise preview, confirmation, duplicate, stale, conflict, success, timeout, and failure presentation, but fixture provenance can never enter the live mutation client.
