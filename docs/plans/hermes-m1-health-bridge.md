# Hermes M1 Health Bridge Evidence

Status: passed on 2026-07-18

This record supports Milestone 1 of the Hermes-first Cabinet project. It proves the server-only Hermes health bridge and connection indicator. It does not approve chat integration or primary-interface cutover.

## Server configuration contract

Cabinet reads these values only on the server:

- `CABINET_HERMES_API_URL`
- `CABINET_HERMES_API_KEY`
- `CABINET_HERMES_MANAGEMENT_URL`
- `CABINET_HERMES_PROFILE`
- optional `CABINET_HERMES_TIMEOUT_MS`

The loader requires complete values, accepts only HTTP or HTTPS endpoints, strips endpoint query and fragment data, bounds the timeout from 250 to 30,000 milliseconds, and reports missing variable names without echoing configured values. No Hermes setting uses a `NEXT_PUBLIC_` prefix.

## Management client contract

`HermesManagementClient` authenticates the server-to-server request to `/health/detailed`, normalizes version and gateway state, and checks the configured profile against the management server's `/api/status` profile list. It returns one of these normalized states:

- `online`
- `offline`
- `authentication_failure`
- `unavailable_profile`
- `misconfigured`

Raw Hermes responses, authorization headers, bearer values, unrelated profile details, and secret-shaped fields are discarded. Hermes remains the runtime source of truth.

## Cabinet health bridge

`GET /api/hermes/health` applies Cabinet's existing request authentication gate before contacting Hermes. When the Hermes runtime is disabled, the route returns a normalized disabled snapshot. When enabled, the response is limited to:

- `enabled`
- `status`
- `version`
- `profile`
- `gatewayState`
- `checkedAt`
- `message`

The response uses `Cache-Control: no-store`. A regression test proves an unauthenticated Cabinet request receives HTTP 401 when Cabinet authentication is enabled. Another test injects a credential marker into both upstream responses and confirms that neither it nor an authorization field reaches the response body.

## Connection indicator

The desktop status bar now shows a dedicated Hermes state with a shape, color, visible label, accessible label, and diagnostic title. It supports connecting, online, offline, authentication failure, unavailable profile, and incomplete setup. Clicking the indicator performs only a new health read. It does not restart, modify, or delete Hermes state.

Rendered browser verification against the live local bridge observed:

1. `Hermes connecting` during the first request.
2. `Hermes online` with version `0.18.2` and profile `operator-os`.
3. `Hermes offline` with a Cabinet bridge error after the Cabinet server stopped.
4. Automatic recovery to `Hermes online` after Cabinet restarted.

## Live outage and recovery matrix

The client was exercised against the installed Hermes services:

| Case | Result |
| --- | --- |
| Valid endpoint, token, and profile | `online`, version `0.18.2`, profile `operator-os`, gateway `running` |
| Wrong token | `authentication_failure` |
| Unreachable endpoint | `offline` |
| Missing configured profile | `unavailable_profile` |
| Supervised gateway restart | launchd moved from PID 43553 to PID 58826 and returned running |
| Cabinet server stop and restart | rendered indicator moved online to offline to online |

No recovery case changed profile contents or substituted Cabinet state for Hermes state.

## Credential-leak proof

A production build was created with the marker `HERMES_BROWSER_LEAK_CANARY_7f4d9c` as `CABINET_HERMES_API_KEY`. The completed `.next/static` browser bundle was scanned for:

- the marker value
- `CABINET_HERMES_API_KEY`
- `Authorization: Bearer`

All scans were empty. The marker may exist in the server build, where the credential is intentionally consumed; it does not exist in browser assets or normalized network responses.

## Verification

- focused Hermes suite: 8 passed
- full unit suite: 421 passed, 0 failed
- TypeScript: passed
- full lint: 0 errors; existing repository warnings remain
- production build: passed and produced `.next/BUILD_ID`
- browser-bundle credential scan: clean
- live route: HTTP 200, `Cache-Control: no-store`, `online`, version `0.18.2`, profile `operator-os`
- rendered browser state and Cabinet restart recovery: passed

The additional Hermes test files increased parallel process load enough to expose a one-second timeout in an existing fake-provider process test. Its test-only timeout was raised to five seconds; the production provider timeout remains unchanged.
