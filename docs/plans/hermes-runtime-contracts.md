# Hermes Runtime Contract Verification

Status: verified against the installed Hermes runtime on 2026-07-18

This record supports the Hermes-first Cabinet implementation plan. It is not a cutover approval. Cabinet must remain a secondary Hermes interface until M7 passes and the operator explicitly approves cutover.

## Verified runtime

- Hermes Agent: `0.18.2` (`2026.7.7.2`), upstream revision `862b1b37`
- Local Hermes source revision: `594308d4bbe95548c9fe418bb10c449099426f93`
- Local install: `/Users/ignitabull/.hermes/hermes-agent`
- Default authenticated API server: `127.0.0.1:8642`
- Hermes management server observed at discovery time: `127.0.0.1:56314`
- Dedicated headless TUI gateway used for interactive acceptance: `127.0.0.1:8645`
- The local source checkout reported that it was behind the available upstream. It was not updated because changing the operator's Hermes installation is outside this repository task and M0 remains operator-owned.

Live probes established:

- `GET /health` returned HTTP 200 with Hermes version `0.18.2`.
- `GET /health/detailed` and `GET /v1/capabilities` returned HTTP 401 without a bearer key, confirming that detailed health and capability discovery are protected.
- `GET /api/status` on the management server returned HTTP 200 and reported the available profiles without returning secret values.
- The management server's gateway status is scoped to that management process. It did not reflect the separately supervised gateway process, so it must not be treated as the only machine-wide liveness signal.
- The API server bearer key and the TUI gateway session token are distinct credentials. Reusing one as the other fails authentication. Cabinet therefore configures them independently as `CABINET_HERMES_API_KEY` and `CABINET_HERMES_GATEWAY_TOKEN`.

No API keys, session tokens, secret values, or sudo values were copied into this repository or this report.

## Client boundaries

### `HermesGatewayClient`

Use the TUI Gateway JSON-RPC protocol over a server-side WebSocket or stdio bridge for interactive conversations. Its endpoint is configured independently with `CABINET_HERMES_GATEWAY_URL`; the stable HTTP API endpoint remains `CABINET_HERMES_API_URL`.

Verified operations include:

- session create, list, activate, close, interrupt, history, branch, compress, title, usage, and status
- prompt submission and steering
- streamed message and tool events
- clarification responses
- approval responses
- `secret.request`, `secret.respond`, and expiry
- `sudo.request`, `sudo.respond`, and expiry

The event envelope contains `type`, `session_id`, and `payload`. It does not contain a durable event sequence or run ID. Cabinet must assign its own monotonic projection sequence after receipt if browser reconnect and fan-out are required. That projection is a cache of Hermes state, not a replacement source of truth.

### `HermesRunClient`

Use the authenticated HTTP Run API for background and cockpit-triggered work:

- `POST /v1/runs`
- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/events`
- `POST /v1/runs/{run_id}/approval`
- `POST /v1/runs/{run_id}/stop`

The Run API exposes run IDs, timestamps, lifecycle state, approval requests, and cooperative stop. It does not expose secret or sudo request and response endpoints in the verified version. Work that may require either interaction must use the gateway path or be rejected as unsupported before launch.

The Run SSE queue is not a replay log. It has no event ID, sequence, or `Last-Event-ID` contract, and a disconnected subscriber cannot deterministically recover a missed interval. Cabinet must keep one server-side subscription per run and fan out normalized events to browsers. On bridge recovery it can poll run status and rehydrate durable Hermes session history, but it must not claim exact replay of events Hermes did not retain.

### `HermesManagementClient`

Use stable authenticated API-server endpoints where capabilities advertise support. Public `/health` is sufficient for cheap liveness. Detailed health, capabilities, sessions, skills, and toolsets require the Hermes API key and stay server-side.

The verified `/v1/capabilities` implementation reports these management gaps:

- `admin_config_rw: false`
- `jobs_admin: false`
- `memory_write_api: false`

Hermes Desktop also exposes profile-scoped dashboard endpoints such as `/api/status`, `/api/config`, `/api/env`, `/api/mcp`, and `/api/skills`. The installed documentation does not present that dashboard surface as the stable public management contract. Any M6 adapter that uses it must be version-pinned, capability-checked, isolated behind `HermesManagementClient`, and treated as an internal compatibility adapter until Hermes advertises equivalent stable capabilities.

Browser code must never receive a Hermes bearer key, dashboard session token, secret value, or sudo value.

## Security and idempotency rules

- Secret and sudo values are pass-through response bodies. Cabinet must not persist, log, cache, echo, or include them in diagnostic bundles.
- Correlate secret and sudo responses only by the gateway `request_id`.
- Hermes removes a pending request when the first response is accepted. Missing, expired, and duplicate submissions must resolve safely without retrying the sensitive value.
- Hermes emits matching expiry events. The verified sudo timeout is 120 seconds; the default secret timeout is 300 seconds.
- Approval commands are redacted before gateway and Run API egress. Cabinet must preserve that redaction and apply its own defense-in-depth log filtering.
- Consequential commands need Cabinet-side idempotency keys because neither gateway events nor Run SSE provide durable replay IDs.

## Decisions for implementation

1. Interactive conversation traffic uses `HermesGatewayClient`.
2. Background execution uses the dedicated `HermesRunClient`; it is not folded into the gateway client.
3. Full management remains behind `HermesManagementClient` and capability gates.
4. Cabinet stores only normalized projections needed for UI recovery. Hermes remains authoritative for sessions, runs, tools, approvals, secrets, sudo, configuration, jobs, skills, and memory.
5. A bridge reconnect can recover current status and durable history, but exact event replay remains an upstream contract gap in Hermes `0.18.2`.
6. M4 reliability acceptance must test this degraded recovery path explicitly. It cannot treat a fresh SSE connection as proof of replay.

## Local configuration boundary

`CABINET_RUNTIME_MODE=hermes` selects the Hermes implementation path. The default remains `cabinet` so checking out this branch cannot silently convert an existing installation. This variable is server-only and must never use a `NEXT_PUBLIC_` prefix.

Runtime credentials and endpoints are server-side configuration only. They must remain in ignored local environment files or the existing secure Cabinet environment store, never committed source. Interactive and management configuration currently uses `CABINET_HERMES_API_URL`, `CABINET_HERMES_API_KEY`, `CABINET_HERMES_MANAGEMENT_URL`, `CABINET_HERMES_MANAGEMENT_TOKEN`, `CABINET_HERMES_GATEWAY_URL`, `CABINET_HERMES_GATEWAY_TOKEN`, and `CABINET_HERMES_PROFILE`. A co-launched Hermes process may provide the same management credential as `HERMES_DASHBOARD_SESSION_TOKEN`; Cabinet treats it as a server-only compatibility alias.
