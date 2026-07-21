# M4 Session Reliability and Recovery

Status: accepted on 2026-07-18

This is the implementation and acceptance record for M4. It proves session reliability only. Cabinet remains a secondary Hermes interface until M7 passes and Jeremy explicitly approves cutover.

## Delivered architecture

- The authenticated, no-store `/api/hermes/sessions` surface lists and searches canonical Hermes history and combines it with live Hermes session state. Cabinet stores only a projection ID and Hermes reference.
- Resume, rename, archive, and branch operate through current Hermes Gateway contracts. Archive closes a live session without deleting its stored Hermes history.
- Imported and branched sessions create a minimal Cabinet projection. Transcript history is not copied into Cabinet or replayed as a new prompt.
- Branches retain an explicit parent Hermes session ID. A stable operation ID is atomically claimed in a mode `0600` record, completed with the original result, and returned for duplicate submissions. Failed operations release the claim for a safe retry.
- The session manager exposes search, refresh, resume, rename, branch, and archive with clear busy and failure states. A failed branch request retains the same operation ID until its outcome is known.
- SSE reconnect subscribes before durable replay, buffers live events during replay, resumes strictly after the last stable sequence, and de-duplicates and orders the combined stream by sequence.
- Hermes conversation state is explicit in the activity panel, including running, awaiting input, awaiting approval, awaiting secret, awaiting sudo, completed, failed, and cancelled states.
- Late asynchronous runtime events cannot regress a terminal Hermes status to streaming. Synthetic continuation run IDs are finalized by the app only, so the daemon no longer attempts to persist them as independent conversations.

## Live reliability matrix

All live rows used Hermes Agent 0.18.2, the clean `operator-os` profile, and the local Cabinet app and daemon.

| Scenario | Current evidence | Result |
| --- | --- | --- |
| Multiple sessions | The live session manager loaded 29 canonical Hermes sessions and associated existing Cabinet projections without replacing Hermes history. | Passed |
| List, search, rename, restore | Session `20260718_170813_76e7f8` was renamed to `M4 temporary rename acceptance`, found by search, and restored to its original title. | Passed |
| Resume | The same session resumed into its existing Cabinet projection instead of creating a duplicate projection. | Passed |
| Archive | Archive closed the live session and the stored canonical Hermes session remained available. | Passed |
| Branch isolation | Branch `20260718_171931_c579fe` produced `M4 BRANCH ISOLATED`; the parent stayed at four messages while the branch advanced independently. | Passed |
| Branch parent identity | Branch `20260718_172510_6357ae` persisted parent session `20260718_170813_76e7f8`. | Passed |
| Duplicate branch submission | Repeating one stable branch operation ID returned the original branch and projection IDs and created no second branch. | Passed |
| Refresh and ordered replay | An SSE reconnect after event 20 replayed events 21 through 30 exactly once, in order, with ten unique sequence IDs. | Passed |
| Network loss | A browser went offline during a run, showed no premature result, then recovered `WAKE-RECOVERY-91B2` once after reconnect. | Passed |
| Sleep and wake equivalent | The same offline and reconnect exercise retained the durable session and rendered one exact agent response after the client resumed. | Passed |
| Hermes gateway restart | The supervised gateway returned online in three seconds. Conversation `2026-07-19T00-29-08-966Z-3a52ce78-editor-manual` resumed durable session `20260718_172909_5fbdcf` and returned `GATEWAY-RESTART-RECOVERED-4C8D` once. | Passed |
| Cabinet app and daemon restart | Health returned `online` for `operator-os`; the same durable session resumed and returned `CABINET-RESTART-RECOVERED-7F31` once. A second acceptance turn returned `M4-DAEMON-BOUNDARY-CLEAN-6D02` once with both Cabinet and Hermes status `completed`. | Passed |
| Failed read-only retry | A failed `read_file` retry resumed session `20260718_164630_e944b9`, repeated only the allowlisted read, and did not repeat a consequential action. | Passed |
| Consequential retry protection | Decision claims and branch operation claims reject in-flight duplicates and return the completed original result. Automated coverage also proves a failed claim can be released safely. | Passed |
| Stale session | Unknown stored session identity returns an explicit not-found response. Gateway client coverage classifies stale resume identity as `session_expired` rather than silently creating a replacement. | Passed |
| Awaiting state | A live clarification rendered `awaiting input` with the exact request identity and choices, then resolved through the same session. | Passed |
| Terminal state consistency | Completed live turns now settle both the Cabinet conversation and canonical Hermes reference to `completed`; a regression test proves a late delta cannot move it back to streaming. | Passed |

## Failure handling verified during acceptance

- Restart verification initially brought up the web app without its separate daemon. The next continuation failed clearly with `fetch failed` and did not change the Hermes durable session. Starting the daemon restored the supported app-plus-daemon topology, and the same session resumed successfully.
- That exercise exposed a real asynchronous status race: a late runtime event could overwrite a completed Hermes reference with `streaming`. The persistence rule now preserves terminal state, with automated and live proof.
- It also exposed harmless but misleading daemon warnings for synthetic continuation run IDs. The app now declares that it owns those continuation projections, so the daemon does not attempt a second finalization.

## Automated verification

- Gateway client tests cover session listing, active-session mapping, rename, stale identity, and current JSON-RPC response shapes.
- Activity tests cover explicit running, awaiting-decision, completed, failed, and cancelled presentation.
- Conversation-store tests cover strict sequence replay and terminal-status race protection.
- Session-operation tests cover atomic duplicate claims, completed-result replay, mode `0600`, and safe release after failure.
- Full repository test, TypeScript, lint, and production build results are recorded in `PROGRESS.md` with the accepting commit.

## M4 decision

M4 passes. Session management, branching, reconnect, event reconciliation, restart recovery, retry safety, duplicate prevention, and terminal-state agreement are implemented and exercised. This does not authorize daily cutover.
