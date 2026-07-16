# Sentry Observability — Design

**Date:** 2026-07-13
**Status:** Approved, not yet implemented

## Problem

Cabinet has a mature first-party telemetry pipeline (`src/lib/telemetry/`) that counts
events against a strict allowlist. It can tell us *that* a crash happened
(`crash.detected`, fired from `src/lib/log/logger.ts:299`) but not *what* it was. There
is no stack trace, no breadcrumb trail, no release grouping, and no latency data. When
Cabinet breaks on a user's machine, we are blind.

Two gaps to close:

1. **Crash and error visibility** — stack traces, grouped by release.
2. **Performance and latency** — how slow agent runs, search, and git operations are in
   the real world.

A third gap surfaced during design and is folded in because it shares the same surface:
telemetry currently defaults to enabled with **no disclosure anywhere in onboarding**.

## Non-goals

- Product analytics (funnels, retention). The existing event catalog owns counters, and
  Sentry is a poor fit for them.
- Session replay. It records the DOM; Cabinet's DOM is the user's documents. Non-starter.
- Profiling, user-feedback widgets, Sentry-as-event-store.
- Replacing the first-party telemetry pipeline. It works, it is audited, and its
  allowlist model is a stronger privacy guarantee than anything Sentry offers.

## Decisions

| Decision | Choice |
|---|---|
| Vendor | Sentry (hosted sentry.io) |
| Surfaces | All four runtimes: Next server, browser, Electron main, CLI |
| Consent | One switch gating both pipelines; disclosed in onboarding, defaults on, one-click opt-out |
| Scrubbing | Redact-known-patterns (default-allow), mitigated by three layers |
| Destination | Hardcoded Cabinet DSN, overridable via `CABINET_SENTRY_DSN` |
| Architecture | Peer pipeline beside telemetry, sharing an extracted consent module |

### Why redact-known-patterns and not a default-deny allowlist

A default-deny allowlist (drop any event that doesn't match a known-safe shape) is
strictly safer and mirrors the philosophy of `telemetry/catalog.ts`. It was rejected
because it destroys debuggability on *novel* errors — precisely the errors worth having
Sentry for. The accepted cost: **any leak shape we did not anticipate will ship.** The
three-layer mitigation below exists specifically to bound that risk, and the redaction
test corpus is the primary deliverable of Phase 1, not an afterthought.

## Architecture

```
src/lib/consent/            <- EXTRACTED from telemetry/
  ├─ state.ts               (installId, enabled, createdAt, bannerShownCount)
  └─ kill-switches.ts       (env vars + state flag, cached)

src/lib/telemetry/          <- UNCHANGED behavior; imports from consent/
  └─ emit() -> NDJSON queue -> reports.runcabinet.com

src/lib/observability/      <- NEW
  ├─ init.ts                (initObservability(runtime))
  ├─ redact.ts              (beforeSend / beforeSendTransaction / beforeBreadcrumb)
  └─ sampling.ts
      -> Sentry (errors + performance traces)
```

### Shared consent module

`src/lib/telemetry/state.ts` and `kill-switches.ts` move to `src/lib/consent/`. The
on-disk format is untouched — same `telemetry.json`, same `installId` UUID, same
`enabled` field, same platform paths. **No migration.** Telemetry imports from the new
path and otherwise does not change.

`isTelemetryEnabled()` is renamed `isConsentGranted()` and evaluates, in order:

1. `CABINET_TELEMETRY_DISABLED=1` → false (kills both pipelines; existing behavior)
2. `CABINET_SENTRY_DISABLED=1` → false **for Sentry only** (new; telemetry unaffected)
3. `state.enabled === false` → false
4. otherwise true

### Four init points, one core

All four call a single `initObservability(runtime)` and share `redact.ts` and
`sampling.ts`.

| Runtime | SDK | Entry point |
|---|---|---|
| Next server | `@sentry/nextjs` | `src/instrumentation.ts` (exists) |
| Browser | `@sentry/nextjs` | `src/instrumentation-client.ts` (new) |
| Electron main | `@sentry/electron/main` | `electron/main.cjs`, before `app.whenReady()` |
| CLI | `@sentry/node` | `cabinetai` entry, lazily imported to protect cold start |

### The browser consent race

Consent lives in a JSON file readable only from Node, but the browser SDK initializes at
module load, before it could `await` a fetch. Resolution:

- `src/app/layout.tsx` is a server component (it already mounts `PostHogProvider`). It
  reads consent server-side and injects it as a prop.
- The browser SDK initializes immediately with a `beforeSend` gate that **drops every
  event until that flag is set true**.

This **fails closed**: if the flag never arrives, nothing is ever sent.

### Onboarding disclosure

Not a new wizard step. A compact **"Crash Reporting & Telemetry"** block — pre-checked
toggle, one-line description, link to `TELEMETRY.md` — on the final launch step
(`COMMUNITY_END_STEP + 1`, `src/components/onboarding/onboarding-wizard.tsx:3332`),
where the user is already committing.

Toggling writes through the existing `POST /api/telemetry/settings`. Flipping it off
calls `invalidateKillSwitchCache()` and `Sentry.close()`.

## Redaction

`redact.ts` is a **pure, synchronous, dependency-free** function: `scrubEvent(event) →
event`. Purity is what makes it testable against an adversarial corpus, which is the
entire mitigation for the default-allow model.

Wired in at three hooks so nothing reaches the transport unscrubbed: `beforeSend`
(errors), `beforeSendTransaction` (performance), `beforeBreadcrumb`.

### What it rewrites

Applied uniformly to error messages, exception values, stack-frame paths, breadcrumb
messages, and span descriptions:

- **Home dir → `~`.** `os.homedir()` exact match first (catches the OS username), then a
  fallback regex for `/Users/<x>`, `/home/<x>`, `C:\Users\<x>` — daemon stacks can carry
  paths the renderer would not resolve identically.
- **Cabinet data dir → `<data>`.** The critical one: every user document lives under it,
  and document filenames are themselves content (`q3-layoffs.md`). Resolved at init from
  the same source `src/lib/storage/path-utils.ts` uses.
- **Node/build paths → repo-relative.** `/app/.next/server/chunks/…` →
  `.next/server/chunks/…`, so traces still group across machines.
- **Secrets and identifiers:** emails; API-key shapes (`sk-`, `ghp_`, `xoxb-`, JWTs, long
  base64/hex runs); URLs with query strings or userinfo; git remotes
  (`git@host:org/repo` → `<remote>`).

### What is disabled outright

- `sendDefaultPii: false`
- No IP addresses (`server_name` cleared; IP scrubbing also enabled org-side)
- No request bodies, cookies, or headers
- `beforeBreadcrumb` drops the `ui.click` and `ui.input` categories entirely — these
  capture DOM text, which in Cabinet is the user's documents.

### Three layers

Because the model is default-allow, redaction is not trusted alone:

1. `redact.ts`, client-side.
2. Sentry's server-side data scrubbing + "Prevent Storing of IP Addresses" enabled in
   project settings — catches shapes we missed.
3. `CABINET_SENTRY_DEBUG=1` prints the fully-scrubbed payload to stdout **instead of
   sending**, so the exact outbound bytes can be audited from a real machine.

### Testing

`redact.test.ts` is the primary deliverable of Phase 1.

- **Fixture corpus** of real-shaped dirty inputs: a macOS home-dir stack trace; an
  `ENOENT` naming a user's markdown file; a Slack token embedded in an error message; a
  JWT in a URL; a git remote; an email in a validation error.
- **Property test:** for any input, the output contains neither `os.homedir()` nor the
  resolved data dir.

Honest limit, stated for the record: this catches shapes we thought of. It cannot catch
shapes we did not. Layers 2 and 3 exist because of that.

This also closes the existing zero-test-coverage gap on the telemetry/consent code.

## What we capture

### Errors — sampled at 1.0

Global handlers in every runtime: `uncaughtException` / `unhandledRejection` (Node,
Electron, CLI); React error boundaries + `window.onerror` (browser); Electron's native
crash reporter for crashes that kill the process before any JS handler runs.

**Correlation:** `src/lib/log/logger.ts:299` already emits a `crash.detected` telemetry
event. Sentry events are tagged with the same `installId` and `sessionId`, so a counter
spike in the D1 dashboard can be traced to the actual stack trace in Sentry. This is the
payoff for keeping both pipelines.

Release tagging comes from the `package.json` version, so regressions are attributable.

### Performance — sampled at 0.1 in production

Scoped tightly; tracing everything is expensive and noisy. Three server-side span
families, where the latency actually is:

- **Agent runs** — `src/lib/agents/conversation-runner.ts` (already the emit site for
  `agent.run.started` / `agent.run.failed`)
- **Search**
- **Git operations** — `src/lib/git/git-service.ts`

Browser gets **Web Vitals only** — free, no custom instrumentation.

`tracesSampleRate`: `0.1` in production, `1.0` in dev, overridable via
`CABINET_SENTRY_TRACES_SAMPLE_RATE`.

## Rollout

Four phases, each independently shippable.

1. **Consent + server.** Extract `src/lib/consent/`; build `redact.ts` and its test
   corpus; init Sentry in `src/instrumentation.ts`; add the onboarding block. Ships
   crash visibility on the process where the real bugs live.
2. **Browser.** `instrumentation-client.ts`; the layout consent prop; error boundaries;
   Web Vitals.
3. **Electron main.** `@sentry/electron/main`; native crash reporter.
4. **CLI + performance spans.** Lazy-import Sentry in `cabinetai`; add the three span
   families.

### Docs, folded in

These are consent-surface bugs, not unrelated refactoring, so they ship with Phase 1:

- Reconcile the two drifting `TELEMETRY.md` files (root and `docs/`) into one, and
  document Sentry in it.
- Fix docs promising a Settings → **Privacy** tab that does not exist. The toggle lives
  under **About** (`src/components/settings/settings-page.tsx:1817`).

## Configuration surface

| Variable | Effect |
|---|---|
| `CABINET_SENTRY_DSN` | Override the built-in DSN (e.g. point at your own Sentry) |
| `CABINET_SENTRY_DISABLED=1` | Kill Sentry only; telemetry unaffected |
| `CABINET_TELEMETRY_DISABLED=1` | Kill both pipelines (existing) |
| `CABINET_SENTRY_TRACES_SAMPLE_RATE` | Override trace sampling |
| `CABINET_SENTRY_DEBUG=1` | Print scrubbed payloads to stdout instead of sending |

The DSN is hardcoded and public by design — Sentry DSNs are write-only keys.
