# M2 Persistent Conversation Vertical Slice

Status: accepted on 2026-07-18

This is the implementation and acceptance record for the M2 Hermes conversation vertical slice. It is not cutover approval. Cabinet remains a secondary Hermes interface until M7 passes and Jeremy explicitly approves cutover.

## Delivered architecture

- `HermesGatewayClient` owns the server-side WebSocket JSON-RPC connection and typed session create, activate, resume, branch, close, prompt, steering, and interrupt operations.
- `hermes_runtime` is an isolated structured adapter. `CABINET_RUNTIME_MODE=hermes` routes native work through it at the shared runtime override boundary, without scattering Hermes conditionals through request handlers.
- The API server bearer key and TUI gateway token are separate server-only credentials. Neither reaches browser code, conversation metadata, event logs, telemetry, or build assets.
- Every Hermes event is preserved through the adapter `onEvent` callback. Cabinet assigns a monotonic projection sequence because Hermes 0.18.2 does not provide a durable gateway event sequence.
- A Cabinet conversation records a canonical Hermes reference: profile, durable session ID, current live session ID, run lineage, event sequence, status, and artifact paths.
- Hermes remains authoritative for conversation history. Cabinet transcript, event, and telemetry files are rebuildable projections for display and recovery.
- Cooperative interruption works for the Hermes adapter without a child-process PID. A stopped run resolves as `cancelled` with exit code 130 and an interrupted Hermes reference.
- Gateway disconnect, timeout, restart, stale session, busy, authentication, and RPC failures normalize into typed, actionable failure categories.
- Runtime telemetry is appended to `telemetry.jsonl` with session, run, parent, profile, agent, sequence, provider, model, status, duration, error, retry, approval, artifacts, screenshots, token, and cost fields when available. Text and sensitive-key values are redacted before persistence.

## Live acceptance evidence

The vertical slice was exercised against Hermes Agent 0.18.2 using the clean `operator-os` profile.

### Streaming and continuity

- A direct gateway session returned `HERMES CABINET M2 ONLINE` and emitted structured session, message, thinking, reasoning, and completion events.
- Cabinet conversation `2026-07-18T23-22-46-803Z-dbe0cc16-editor-manual` returned `CABINET HERMES VERTICAL SLICE ONLINE`, recalled that phrase on the next turn, and completed a second continuation.
- All turns used durable Hermes session `20260718_162246_07f69f`. Live connection IDs and run lineage changed as expected while the durable session remained stable.
- Browser verification showed readable incremental output, runtime `hermes`, and identical transcript counts before and after refresh. No final-message duplication or ordering error appeared.

### Recovery and source of truth

- The dedicated gateway was stopped and restarted. A new conversation while offline failed with normalized `transport` status and an actionable hint.
- The existing conversation then resumed the same durable Hermes session and returned `RECOVERED AFTER GATEWAY RESTART` through a new live connection.
- The Cabinet conversation projection directory was moved aside recoverably. The durable Hermes session still reported its prior history and returned `HERMES HISTORY SURVIVES CABINET CACHE REMOVAL`. The projection directory was then restored.
- Branch creation, activation, and close were exercised against the durable parent session. The branch retained its parent reference.

### Interrupt and security

- An active Hermes conversation was stopped through Cabinet. It completed as `cancelled`, exit code 130, with Hermes status `interrupted`, rather than an unknown failure.
- Structured event logs and telemetry were scanned with a sensitive canary. The canary was absent from both files.
- Persisted message, thinking, reasoning, secret, credential, token, password, authorization, sudo, and generic sensitive-value fields are recursively redacted.
- Live telemetry captured the selected provider and model from Hermes `session.info` without persisting credentials.

## Automated verification

- Unit suite: 426/426 passing after the focused runtime routing checks were added.
- TypeScript: `npx tsc --noEmit` passing.
- Lint: 0 errors and 110 existing repository warnings.
- Production build: passing, with the existing broad NFT trace warning from `src/app/api/system/open-path/route.ts`.

## M2 decision

M2 passes. The persistent conversation path, structured events, session continuity, interruption, failure normalization, telemetry, and Hermes source-of-truth rules are implemented and proven. This does not authorize daily cutover.
