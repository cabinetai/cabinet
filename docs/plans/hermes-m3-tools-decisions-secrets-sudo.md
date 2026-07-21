# M3 Tools, Decisions, Secrets, and Sudo

Status: accepted on 2026-07-18

This is the implementation and acceptance record for the M3 governed Hermes interaction layer. It is not cutover approval. Cabinet remains a secondary Hermes interface until M7 passes and Jeremy explicitly approves cutover.

## Delivered architecture

- Cabinet normalizes Hermes tool events into structured cards with stable run and event identity, progress, arguments, result summaries, failures, duration, inline diffs, artifacts, screenshots, and links.
- Failed operations offer a direct retry only for an exact allowlist of read-only tools. Potentially consequential failures offer investigation without replaying the action.
- Clarification, approval, secret, and sudo requests render as explicit decision cards with session, run, request, and event identity wherever Hermes supplies it.
- Clarifications support defined choices and free text. Approval requests support one-time or session approval, rejection, and comments that steer Hermes without resolving the request.
- Secret and sudo values travel from a masked, non-autocompleting field to an exact server-side Hermes request. Cabinet disables copy, cut, and paste for the field, clears it after success, and never writes the value to browser storage. Sudo also exposes explicit Reject and Cancel controls.
- Server-side response handling re-reads the current event log, matches the exact pending request, enforces Hermes expiry, and atomically claims a one-time decision marker before sending a response.
- Decision markers contain only the request identity, action, and claim time. They are created with mode `0600`; no clarification answer, comment, secret, or sudo value is written to them.
- Secret and sudo flows switch the adapter into sensitive mode. Subsequent message, reasoning, tool, completion, and error payload values are replaced before any transcript, event, or telemetry persistence.
- Cancelling a run with an unresolved decision interrupts Hermes and appends an explicit `runtime.decision` cancellation record, so the UI cannot confuse cancellation with a response.

## Live acceptance evidence

All flows were exercised against Hermes Agent 0.18.2 using the clean `operator-os` profile and a dedicated local gateway.

### Structured tool lifecycle

- Conversation `2026-07-18T23-46-30-052Z-3a52ce78-editor-manual` exercised real `read_file`, `search_files`, and `terminal` calls against `package.json`.
- The first `read_file` failure rendered its arguments, error, and read-only retry control. The later calls rendered current context and successful result evidence.
- Hermes speculative `tool.generating` frames are intentionally folded into the authoritative `tool.start` card rather than appearing as duplicate operations.
- Browser verification rendered the `Hermes activity and decisions` panel, the actual tool names and arguments, the failure, `Retry read-only tool`, and `Investigate` controls.

### Clarification, approval, and cancellation

- Conversation `2026-07-18T23-49-25-357Z-3a52ce78-editor-manual` emitted clarification request `d008059e` at event 32. Cabinet answered `Alpha`; Hermes completed the same durable session with `You selected Alpha`. A second response returned HTTP 409.
- Conversation `2026-07-18T23-51-44-687Z-3a52ce78-editor-manual` emitted a real approval request for the harmless absent-target command `rm /tmp/hermes-cabinet-m3-approval-reject-test-does-not-exist`. Cabinet rejected it, Hermes completed the same durable session, and the target remained absent.
- A browser exercised a fresh clarification card end to end. Before the click it showed the question, Alpha and Beta controls, pending status, and run/session/request/event identity. Clicking Alpha changed the same request to resolved.
- Conversation `2026-07-18T23-56-39-710Z-3a52ce78-editor-manual` was cancelled while clarification request `fda20029` was pending. Cabinet ended as `cancelled`, Hermes ended as `interrupted`, and event 26 received a matching `run_cancelled` decision record.

### Secret and sudo safety

- Conversation `2026-07-18T23-53-08-154Z-3a52ce78-editor-manual` emitted a real `secret.request` for a temporary acceptance variable. A random one-use canary resolved it. Replaying the resolved request returned HTTP 409.
- The temporary profile skill and environment entry used to trigger that request were removed immediately after the test. The key is absent from both profile environment locations.
- Conversation `2026-07-18T23-56-12-741Z-3a52ce78-editor-manual` ran the harmless command `sudo true`, received sudo request `da01b597` at event 41, and submitted a random fake password. The first response returned HTTP 200, the duplicate returned HTTP 409, and the run completed without a privileged side effect.
- Conversation `2026-07-19T00-08-13-371Z-3a52ce78-editor-manual` exercised the distinct sudo rejection contract from the browser. The card showed the exact `sudo true` action, privileged risk, requesting identity, derived current-contract expiry, Approve once, Reject, and Cancel controls. Clicking Reject sent Hermes's defined empty-password rejection, changed the request to resolved with decision `rejected`, and completed without privilege.
- Exact canary scans of the Cabinet conversation projection and Hermes logs found no sudo canary. The persisted decision marker contained only `action`, `claimedAt`, `kind`, `requestEventSeq`, and `requestId`.
- Persisted post-secret and post-sudo output contains redaction placeholders rather than model text, tool values, reasoning, or credential material.

## Automated verification

- Focused Hermes activity and gateway tests cover exact RPC method identity, nested current-contract tool results, speculative event de-duplication, strict read-only retry allowlisting, and governed request normalization.
- Full repository test, TypeScript, lint, and production build results are recorded in `PROGRESS.md` with the accepting commit.

## M3 decision

M3 passes. Real tools, clarifications, approvals, secret requests, sudo requests, duplicate prevention, expiry handling, cancellation, redaction, and the browser interaction layer are implemented and exercised. This does not authorize daily cutover.
