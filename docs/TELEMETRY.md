# Cabinet Telemetry

**To opt out:** set `CABINET_TELEMETRY_DISABLED=1` in your environment before
launching Cabinet, **or** open *Settings → About → Privacy* and turn off
*Anonymous usage telemetry*. Either path disables telemetry completely — no
events are queued, no network requests are made. See [How to turn it
off](#how-to-turn-it-off) below for a third option (editing the config file)
and the exact paths involved.

Cabinet sends anonymous usage telemetry by default to help us understand which
features are used and where the product breaks. This document is the complete,
authoritative description of what leaves your machine. If it is not listed
here, it is not collected.

## What is collected

Every event includes:

- `install_id` — a random UUIDv4 generated once per OS user profile and stored
  in `telemetry.json` (see paths below). Not derived from your hostname, MAC
  address, machine serial, or any other system identifier — it's just a fresh
  random id. Different machines, or different OS user accounts on the same
  machine, get different `install_id`s. Deleting `telemetry.json` produces a
  fresh id on next launch. Not tied to any account or identity.
- `session_id` — a random UUIDv4 minted each time you launch Cabinet (one
  session per run, shared between the daemon and the local web server so all
  events from a single launch share the same id).
- `event_name` — one of the names from the allowlist below. Other names are
  rejected at the server.
- `payload` — small structured fields documented per-event below.
- `client_version` — Cabinet version (e.g. `0.3.4`).
- `platform` — `cli` or `desktop`.
- `os`, `arch`, `node_version` — e.g. `darwin` / `arm64` / `v22.4.0`.
- `occurred_at`, `received_at` — millisecond timestamps.

The server also records, from HTTP metadata:

- The IP address Cloudflare sees for your request. Used only to detect abusive
  traffic. Not linked to any identity we collect (there is no user id or email
  in the schema). See "Where the data goes" below.
- `country` and Cloudflare `colo` (edge region) — coarse location only.

## What is never collected

- File contents, page titles, page bodies.
- Absolute or relative local paths. Repo or project names.
- Prompts, model responses, or any LLM input or output.
- API keys, tokens, passwords, environment variable values.
- Raw command-line arguments.
- MAC addresses, hostnames, usernames, account IDs, email addresses.
- Any personally identifying information beyond the request IP noted above.

## Event allowlist

| Event | When it fires | Payload fields |
| --- | --- | --- |
| `app.launched` | Cabinet process starts | *(none)* |
| `app.exited` | Cabinet process shuts down | *(none)* |
| `onboarding.step` | User advances to a named step in onboarding | `step` |
| `onboarding.completed` | Onboarding finishes | `roomType`, `provider` |
| `page.opened` | Reserved — not emitted in this release | `ext` |
| `agent.run.started` | An agent run begins | `provider`, `adapterType` |
| `agent.run.completed` | An agent run finishes successfully | `provider`, `adapterType`, `durationMs`, `success` |
| `agent.run.failed` | An agent run errors or times out | `provider`, `adapterType`, `durationMs`, `errorCode` |
| `task.created` | A task is created (manual / composer / editor trigger) | `source` |
| `task.completed` | A task reaches a terminal state | `durationMs`, `status` |
| `doctor.run` | The doctor / diagnostics command runs | *(none)* |
| `error.unhandled` | The top-level error handler catches something | `where`, `errorCode` |
| `provider.verified` | A provider CLI verify command finishes | `provider`, `success`, `durationMs` |
| `cabinet.switched` | The user switches between workspaces | *(none)* |
| `template.installed` | A registry template is installed | `templateKind`, `templateSlug` |
| `theme.changed` | The user changes themes | `themeName` |

The emitter strips any payload key outside the fields listed above for each
event. If a new field is needed, this table is updated in the same commit.

Any new events added to Cabinet are added to this table in the same commit.

## How to turn it off

Three ways, any one is enough:

1. **Environment variable:** `CABINET_TELEMETRY_DISABLED=1` before starting
   Cabinet. Also sets the Settings toggle to a disabled / read-only state.
2. **Settings toggle:** open Settings → About → Privacy, uncheck
   *Anonymous usage telemetry*.
3. **Edit the config file directly:** set `"enabled": false` in
   `telemetry.json` at the path below.

When telemetry is off, no events are enqueued and no network requests are
made to the ingest endpoint.

## Where state lives

- macOS: `~/Library/Application Support/cabinet-telemetry/telemetry.json`
- Windows: `%APPDATA%\cabinet-telemetry\telemetry.json`
- Linux: `$XDG_CONFIG_HOME/cabinet/telemetry.json`
  (falls back to `~/.config/cabinet/telemetry.json`)

The same directory contains `telemetry-queue.ndjson`, a short-lived queue of
events waiting to be sent. Delete these files at any time — Cabinet will
generate a fresh `install_id` on next start.

## Where the data goes

- Endpoint: `POST https://reports.runcabinet.com/telemetry`
- Transport: TLS. Rate-limited at the Cloudflare edge.
- Storage: Cloudflare D1 (SQLite on Cloudflare). Access is limited to the
  maintainers.

## Questions or concerns

Open an issue on GitHub or email hi@runcabinet.com. If you want a specific
event or field removed, we take that seriously — open an issue and we will
respond.
