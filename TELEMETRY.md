# Telemetry & Privacy

Cabinet sends anonymous product-usage events so we can see what's used, what
breaks, and what to fix next — without guessing. This document is the full
list of what's collected and how to turn it off.

If you'd rather not send anything, see [Turning it off](#turning-it-off) — a
single env var or a Settings toggle disables all emission before any I/O.

---

## What's collected

For each event we send:

- A random per-install UUID (`installId`) — generated locally on first run
  and stored in `~/Library/Application Support/cabinet-telemetry/telemetry.json`
  (macOS) or `~/.config/cabinet/telemetry.json` (Linux). It is not tied to
  your email, GitHub account, or project.
- A per-process session UUID (`sessionId`).
- The Cabinet version (`clientVersion`), platform (`cli` or `desktop`),
  Node.js version, OS (`darwin`/`linux`/`win32`), and CPU arch.
- The event name (from a fixed allowlist — see below).
- A small structured payload, restricted to a per-event allowlist of keys.

The server also records, from the network request itself:

- Approximate location derived from your IP at the edge: country, region
  (e.g. US state), and city.
- The IP address.
- A coarse browser/device hint parsed from the User-Agent header (the CLI
  doesn't send one, so this is usually blank for `npx cabinetai run`).

We never send: file contents, file paths, project names, prompts, agent
output, API keys, secrets, environment variables, or stack traces.

## The event list

These are the only event names the client will emit. Any other name is
dropped at the source (see `src/lib/telemetry/catalog.ts`):

| Event | Payload keys |
| --- | --- |
| `app.launched` | — |
| `app.exited` | — |
| `onboarding.step` | `step` |
| `onboarding.locale_autodetected` | `locale` |
| `onboarding.completed` | `roomType`, `provider` |
| `page.opened` | `ext` |
| `agent.run.started` | `provider`, `adapterType` |
| `agent.run.completed` | `provider`, `adapterType`, `success`, `durationMs` |
| `agent.run.failed` | `provider`, `adapterType`, `durationMs`, `errorCode` |
| `task.created` | `source` |
| `task.completed` | `durationMs`, `status` |
| `doctor.run` | — |
| `error.unhandled` | `where`, `errorCode` |
| `provider.verified` | `provider`, `success`, `durationMs` |
| `cabinet.switched` | — |
| `template.installed` | `templateKind`, `templateSlug` |
| `theme.changed` | `themeName` |
| `crash.detected` | `proc` |
| `diagnostics.exported` | — |
| `history.restored` | `source` |
| `history.tier` | `tier` |

Payload values are coerced to strings/numbers/booleans, capped at 256 chars
each, and any key not in the per-event allowlist is stripped before send.

## Where it goes

Events queue to disk first (NDJSON), then flush in batches to:

```
POST https://reports.runcabinet.com/telemetry
```

…which is a Cloudflare Worker writing to a Cloudflare D1 database. Anything
unsent stays on disk and ships on the next successful run.

## Turning it off

Any one of these is enough — pick whichever fits.

### 1. Environment variable (one-shot or persistent)

```bash
export CABINET_TELEMETRY_DISABLED=1
```

Set it in your shell profile to disable telemetry permanently. When this is
set, the emitter short-circuits before reading state, opening the queue, or
making any network call.

### 2. Settings toggle (desktop / web UI)

Open Cabinet → **Settings** → **Privacy** → toggle **Send anonymous usage
telemetry** off. The choice is persisted in `telemetry.json`.

### 3. Delete telemetry state

```bash
npx cabinetai uninstall --all
```

`--all` removes the platform-specific telemetry directory entirely (state,
queue, drains). The next run starts from scratch with a new random
`installId` — or stays disabled, if you also set the env var above.

## Auditing

The client telemetry module is open source and lives in
[`src/lib/telemetry/`](src/lib/telemetry/). The two files worth reading
first are `catalog.ts` (the event + payload-key allowlist) and
`flusher.ts` (exactly what gets sent over the wire).
