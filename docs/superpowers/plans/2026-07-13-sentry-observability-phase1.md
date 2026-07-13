# Sentry Observability — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship crash visibility on the Next.js server, gated on a consent module extracted from the existing telemetry pipeline, and disclosed to the user during onboarding.

**Architecture:** `src/lib/consent/` is extracted from `src/lib/telemetry/` and becomes the single source of truth for "may we send anything?". A new peer module `src/lib/observability/` initializes Sentry, with a pure, exhaustively-tested scrubber (`redact.ts`) on every outbound path. The existing telemetry pipeline keeps working unchanged, now importing consent from its new home.

**Tech Stack:** TypeScript, Next.js 16 (App Router), `@sentry/nextjs@^10.65.0`, `node:test` + `tsx` for tests, i18next for copy.

**Spec:** `docs/superpowers/specs/2026-07-13-sentry-observability-design.md`

## Global Constraints

- **Phase 1 scope only.** Next.js server runtime. Do NOT add browser, Electron, or CLI Sentry init — those are Phases 2–4. Do NOT add session replay, profiling, or performance spans.
- **On-disk format is frozen.** `telemetry.json` keeps its exact shape (`installId`, `enabled`, `createdAt`, `bannerShownCount`) and its exact location. No migration code.
- **Telemetry behavior must not change.** The existing event pipeline is a refactor target only — same emits, same queue, same endpoint.
- **`redact.ts` must be pure, synchronous, and dependency-free.** No `node:fs`, no `node:os`, no imports from `@/lib/*`. Config is injected. This is what makes it testable and Phase-2-safe (it will run in the browser).
- **Sentry DSN is public by design** (write-only key). Hardcoding it is correct; do not treat it as a secret.
- **Test framework is `node:test`**, not Jest/Vitest. Tests are colocated as `src/**/*.test.ts` and run via `npm test`. Follow the style of `src/lib/analytics/jwt-cookie.test.ts`: `import { describe, it } from "node:test"; import assert from "node:assert/strict";`
- **Package manager is npm.**
- Env var names, verbatim: `CABINET_SENTRY_DSN`, `CABINET_SENTRY_DISABLED`, `CABINET_SENTRY_DEBUG`, `CABINET_TELEMETRY_DISABLED` (existing).

---

## File Structure

**Created:**
- `src/lib/consent/paths.ts` — resolves the shared `cabinet-telemetry` dir + state file path
- `src/lib/consent/state.ts` — moved verbatim from `src/lib/telemetry/state.ts`
- `src/lib/consent/kill-switches.ts` — `isConsentGranted()`, `isSentryEnabled()`, `invalidateConsentCache()`
- `src/lib/consent/kill-switches.test.ts` — precedence tests
- `src/lib/consent/index.ts` — public surface
- `src/lib/observability/redact.ts` — pure scrubber factory
- `src/lib/observability/redact.test.ts` — adversarial fixture corpus + property test
- `src/lib/observability/init.ts` — `initObservability()`
- `src/lib/observability/index.ts` — public surface

**Modified:**
- `src/lib/telemetry/paths.ts` — re-export the two shared paths from `consent/`, keep queue/session paths
- `src/lib/telemetry/emitter.ts:9`, `banner.ts:1-2`, `flusher.ts:11`, `index.ts:2-3` — import from `consent/`
- `src/app/api/telemetry/settings/route.ts` — use `invalidateConsentCache`
- `src/instrumentation.ts` — call `initObservability()`
- `next.config.ts` — wrap with `withSentryConfig`
- `src/components/onboarding/onboarding-wizard.tsx` — consent checkbox on the launch step
- `src/i18n/locales/en.json` — new copy keys
- `TELEMETRY.md`, `docs/TELEMETRY.md`, `README.md` — reconcile + document Sentry

**Deleted:**
- `src/lib/telemetry/state.ts`, `src/lib/telemetry/kill-switches.ts` (moved to `consent/`)

---

## Task 1: Extract the shared consent module

The dependency direction is strictly `telemetry → consent`. Consent must never import from telemetry.

**Files:**
- Create: `src/lib/consent/paths.ts`, `src/lib/consent/state.ts`, `src/lib/consent/kill-switches.ts`, `src/lib/consent/index.ts`
- Test: `src/lib/consent/kill-switches.test.ts`
- Modify: `src/lib/telemetry/paths.ts`, `src/lib/telemetry/emitter.ts:9`, `src/lib/telemetry/banner.ts:1-2`, `src/lib/telemetry/flusher.ts:11`, `src/lib/telemetry/index.ts:2-3`, `src/app/api/telemetry/settings/route.ts`
- Delete: `src/lib/telemetry/state.ts`, `src/lib/telemetry/kill-switches.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `isConsentGranted(): boolean`
  - `isSentryEnabled(): boolean`
  - `invalidateConsentCache(): void`
  - `readState(): TelemetryState`, `updateState(patch: Partial<TelemetryState>): TelemetryState`, `writeState(state: TelemetryState): void`
  - `interface TelemetryState { installId: string; enabled: boolean; createdAt: number; bannerShownCount: number }`
  - `getTelemetryDir(): string`, `getStateFilePath(): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/consent/kill-switches.test.ts`:

```ts
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isConsentGranted, isSentryEnabled, invalidateConsentCache } from "./kill-switches";
import { writeState } from "./state";

let tmpDir: string;
const saved = { ...process.env };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-consent-"));
  process.env.CABINET_TELEMETRY_DIR = tmpDir;
  delete process.env.CABINET_TELEMETRY_DISABLED;
  delete process.env.CABINET_SENTRY_DISABLED;
  invalidateConsentCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.env = { ...saved };
  invalidateConsentCache();
});

describe("consent kill switches", () => {
  it("grants consent by default (opt-out model)", () => {
    assert.equal(isConsentGranted(), true);
    assert.equal(isSentryEnabled(), true);
  });

  it("denies both when state.enabled is false", () => {
    writeState({ installId: "i", enabled: false, createdAt: 0, bannerShownCount: 0 });
    invalidateConsentCache();
    assert.equal(isConsentGranted(), false);
    assert.equal(isSentryEnabled(), false);
  });

  it("CABINET_TELEMETRY_DISABLED kills both pipelines", () => {
    process.env.CABINET_TELEMETRY_DISABLED = "1";
    invalidateConsentCache();
    assert.equal(isConsentGranted(), false);
    assert.equal(isSentryEnabled(), false);
  });

  it("CABINET_SENTRY_DISABLED kills only Sentry, leaving telemetry alive", () => {
    process.env.CABINET_SENTRY_DISABLED = "1";
    invalidateConsentCache();
    assert.equal(isConsentGranted(), true);
    assert.equal(isSentryEnabled(), false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/consent/kill-switches.test.ts`
Expected: FAIL — `Cannot find module './kill-switches'`

- [ ] **Step 3: Create `src/lib/consent/paths.ts`**

Only the two paths that consent owns. Queue/session/draining paths stay in telemetry.

```ts
import os from "node:os";
import path from "node:path";

export function getTelemetryDir(): string {
  const override = process.env.CABINET_TELEMETRY_DIR?.trim();
  if (override) return path.resolve(override);

  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "cabinet-telemetry");
  }
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(roaming, "cabinet-telemetry");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfig, "cabinet");
}

export function getStateFilePath(): string {
  return path.join(getTelemetryDir(), "telemetry.json");
}
```

- [ ] **Step 4: Move `state.ts` into `consent/`**

```bash
git mv src/lib/telemetry/state.ts src/lib/consent/state.ts
```

The file's contents are unchanged — its `import { getStateFilePath, getTelemetryDir } from "./paths"` now resolves to `src/lib/consent/paths.ts`, which exports both. Verify no edit is needed.

- [ ] **Step 5: Create `src/lib/consent/kill-switches.ts`**

Two caches, because the two pipelines can diverge (`CABINET_SENTRY_DISABLED` kills one and not the other).

```ts
import { readState } from "./state";

let consentCache: boolean | null = null;
let sentryCache: boolean | null = null;

/** Master switch: may we send ANY data at all? Gates telemetry and Sentry alike. */
export function isConsentGranted(): boolean {
  if (consentCache !== null) return consentCache;
  consentCache = evaluateConsent();
  return consentCache;
}

/** Sentry additionally honors its own kill switch, so it can be disabled alone. */
export function isSentryEnabled(): boolean {
  if (sentryCache !== null) return sentryCache;
  sentryCache = isConsentGranted() && process.env.CABINET_SENTRY_DISABLED !== "1";
  return sentryCache;
}

export function invalidateConsentCache(): void {
  consentCache = null;
  sentryCache = null;
}

function evaluateConsent(): boolean {
  if (process.env.CABINET_TELEMETRY_DISABLED === "1") return false;
  return readState().enabled !== false;
}
```

Then delete the old file:

```bash
git rm src/lib/telemetry/kill-switches.ts
```

- [ ] **Step 6: Create `src/lib/consent/index.ts`**

```ts
export { isConsentGranted, isSentryEnabled, invalidateConsentCache } from "./kill-switches";
export { readState, updateState, writeState, type TelemetryState } from "./state";
export { getTelemetryDir, getStateFilePath } from "./paths";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx tsx --test src/lib/consent/kill-switches.test.ts`
Expected: PASS — 4 tests passing

- [ ] **Step 8: Repoint telemetry's imports at `consent/`**

`src/lib/telemetry/paths.ts` — re-export the shared two, keep the telemetry-only three. Replace the top of the file (the `getTelemetryDir` and `getStateFilePath` definitions) with:

```ts
import path from "node:path";
import { getTelemetryDir } from "@/lib/consent";

export { getTelemetryDir, getStateFilePath } from "@/lib/consent";

export function getQueueFilePath(): string {
  return path.join(getTelemetryDir(), "telemetry-queue.ndjson");
}

export function getDrainingDir(): string {
  return path.join(getTelemetryDir(), "draining");
}

export function getSessionFilePath(): string {
  return path.join(getTelemetryDir(), "current-session.json");
}
```

(The `node:os` import is now unused — remove it.)

`src/lib/telemetry/emitter.ts:9` — replace:
```ts
import { isTelemetryEnabled } from "./kill-switches";
```
with:
```ts
import { isConsentGranted } from "@/lib/consent";
```
and update its single call site in that file from `isTelemetryEnabled()` to `isConsentGranted()`.

`src/lib/telemetry/banner.ts:1-2` — replace:
```ts
import { readState, updateState } from "./state";
import { isTelemetryEnabled } from "./kill-switches";
```
with:
```ts
import { readState, updateState, isConsentGranted } from "@/lib/consent";
```
and update its `isTelemetryEnabled()` call site to `isConsentGranted()`.

`src/lib/telemetry/flusher.ts:11` — replace:
```ts
import { readState } from "./state";
```
with:
```ts
import { readState } from "@/lib/consent";
```

`src/lib/telemetry/index.ts:2-3` — replace those two lines with:
```ts
export {
  isConsentGranted,
  isSentryEnabled,
  invalidateConsentCache,
  readState,
  updateState,
  writeState,
} from "@/lib/consent";
```

- [ ] **Step 9: Repoint the settings API route**

`src/app/api/telemetry/settings/route.ts` — replace the import and the call. The route's public JSON contract (`{ enabled, envDisabled }`) does not change.

```ts
import { NextResponse, type NextRequest } from "next/server";
import { invalidateConsentCache, readState, updateState } from "@/lib/consent";
```

and in `POST`, replace `invalidateKillSwitchCache();` with `invalidateConsentCache();`.

- [ ] **Step 10: Verify nothing still references the old symbols**

Run: `grep -rn "isTelemetryEnabled\|invalidateKillSwitchCache\|telemetry/state\|telemetry/kill-switches" --include=*.ts --include=*.tsx src/ server/ electron/ cabinetai/`
Expected: no output.

- [ ] **Step 11: Typecheck, lint, and run the full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean typecheck, clean lint, all tests pass (including the 4 new ones).

- [ ] **Step 12: Commit**

```bash
git add src/lib/consent src/lib/telemetry src/app/api/telemetry/settings/route.ts
git commit -m "refactor: extract shared consent module from telemetry

Consent state and kill switches move to src/lib/consent/ so Sentry and the
event pipeline can share one switch. On-disk telemetry.json is unchanged.
Adds CABINET_SENTRY_DISABLED, which kills Sentry only."
```

---

## Task 2: The scrubber

This is the load-bearing task. The scrubber is the only thing standing between a user's document titles and a third-party server, and the design deliberately chose a default-allow model — so the test corpus **is** the deliverable, not a formality.

`redact.ts` is pure and dependency-free: it takes its config (home dir, data dir) by injection rather than reading `node:os` or `@/lib/storage/path-utils`. That keeps it unit-testable without a filesystem and lets Phase 2 reuse it verbatim in the browser bundle.

**Files:**
- Create: `src/lib/observability/redact.ts`
- Test: `src/lib/observability/redact.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces:
  - `interface ScrubConfig { homeDir: string; dataDir: string }`
  - `createScrubber(config: ScrubConfig): (event: SentryEvent) => SentryEvent`
  - `scrubString(value: string, config: ScrubConfig): string`
  - `type SentryEvent` — a structural subset of Sentry's `Event`, defined locally so `redact.ts` stays dependency-free

- [ ] **Step 1: Write the failing test**

Create `src/lib/observability/redact.test.ts`. Every fixture below is a real shape Cabinet can produce.

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createScrubber, scrubString, type ScrubConfig } from "./redact";

const config: ScrubConfig = {
  homeDir: "/Users/sam",
  dataDir: "/Users/sam/Cabinet/data",
};
const scrub = (s: string) => scrubString(s, config);

describe("scrubString", () => {
  it("replaces the data dir before the home dir, so document paths never leak", () => {
    // Order matters: dataDir is nested inside homeDir. If homeDir ran first we'd
    // get "~/Cabinet/data/Finance/q3-layoffs.md" and still leak the filename.
    assert.equal(
      scrub("ENOENT: no such file or directory, open '/Users/sam/Cabinet/data/Finance/q3-layoffs.md'"),
      "ENOENT: no such file or directory, open '<data>'"
    );
  });

  it("replaces the home dir with ~, removing the OS username", () => {
    assert.equal(scrub("at read (/Users/sam/.config/cabinet/telemetry.json)"), "at read (~/.config/cabinet/telemetry.json)");
  });

  it("scrubs foreign home dirs it was not configured with", () => {
    // A stack from the daemon can carry paths this process's os.homedir() won't match.
    assert.equal(scrub("/home/alice/projects/x"), "~/projects/x");
    assert.equal(scrub("C:\\Users\\Alice\\AppData\\cabinet"), "~\\AppData\\cabinet");
  });

  it("redacts API key shapes", () => {
    assert.equal(scrub("auth failed for sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "auth failed for <redacted>");
    assert.equal(scrub("token ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "token <redacted>");
    assert.equal(scrub("bot xoxb-1234-5678-abcdefghijklmnop"), "bot <redacted>");
  });

  it("redacts JWTs", () => {
    assert.equal(
      scrub("cabinet_jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2ln"),
      "cabinet_jwt=<redacted>"
    );
  });

  it("redacts emails", () => {
    assert.equal(scrub("invalid recipient sam@example.com"), "invalid recipient <email>");
  });

  it("redacts git remotes", () => {
    assert.equal(scrub("fatal: could not read git@github.com:acme/secret-repo.git"), "fatal: could not read <remote>");
  });

  it("strips URL query strings, which carry tokens", () => {
    assert.equal(scrub("GET https://api.example.com/v1/x?token=abc123&u=1 failed"), "GET https://api.example.com/v1/x?<redacted> failed");
  });

  it("leaves clean strings untouched", () => {
    assert.equal(scrub("TypeError: cannot read property 'id' of undefined"), "TypeError: cannot read property 'id' of undefined");
  });
});

describe("createScrubber", () => {
  const scrubEvent = createScrubber(config);

  it("scrubs exception values and stack frame paths", () => {
    const out = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: "failed to open /Users/sam/Cabinet/data/notes/salary.md",
            stacktrace: {
              frames: [{ filename: "/Users/sam/cabinet/src/lib/fs.ts", abs_path: "/Users/sam/cabinet/src/lib/fs.ts" }],
            },
          },
        ],
      },
    });
    const ex = out.exception!.values![0];
    assert.equal(ex.value, "failed to open <data>");
    assert.equal(ex.stacktrace!.frames![0].filename, "~/cabinet/src/lib/fs.ts");
    assert.equal(ex.stacktrace!.frames![0].abs_path, "~/cabinet/src/lib/fs.ts");
  });

  it("scrubs the top-level message", () => {
    const out = scrubEvent({ message: "crash in /Users/sam/x" });
    assert.equal(out.message, "crash in ~/x");
  });

  it("drops ui.click and ui.input breadcrumbs entirely (they carry document text)", () => {
    const out = scrubEvent({
      breadcrumbs: [
        { category: "ui.click", message: "div.editor > p: Q3 layoffs plan" },
        { category: "ui.input", message: "textarea: confidential" },
        { category: "console", message: "loaded /Users/sam/x" },
      ],
    });
    assert.equal(out.breadcrumbs!.length, 1);
    assert.equal(out.breadcrumbs![0].category, "console");
    assert.equal(out.breadcrumbs![0].message, "loaded ~/x");
  });

  it("clears server_name, which is the machine hostname", () => {
    const out = scrubEvent({ server_name: "sams-macbook-pro.local", message: "x" });
    assert.equal(out.server_name, undefined);
  });

  it("drops the user object wholesale", () => {
    const out = scrubEvent({ user: { id: "u1", email: "sam@example.com", ip_address: "1.2.3.4" }, message: "x" });
    assert.equal(out.user, undefined);
  });

  it("is total: never throws on a malformed or empty event", () => {
    assert.doesNotThrow(() => scrubEvent({}));
    assert.doesNotThrow(() => scrubEvent({ exception: { values: [] } }));
  });
});

describe("property: no configured secret path survives any input", () => {
  const scrubEvent = createScrubber(config);
  const nasty = [
    "/Users/sam/Cabinet/data/a.md",
    "prefix /Users/sam suffix",
    "/Users/sam/Cabinet/data",
    "twice /Users/sam and /Users/sam/Cabinet/data/b.md",
  ];
  it("output never contains homeDir or dataDir", () => {
    for (const input of nasty) {
      const out = JSON.stringify(scrubEvent({ message: input, breadcrumbs: [{ category: "c", message: input }] }));
      assert.ok(!out.includes(config.dataDir), `dataDir leaked for input: ${input}`);
      assert.ok(!out.includes(config.homeDir), `homeDir leaked for input: ${input}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/observability/redact.test.ts`
Expected: FAIL — `Cannot find module './redact'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/observability/redact.ts`.

Note the ordering constraint the first test pins down: **`dataDir` must be replaced before `homeDir`**, because the data dir is nested inside the home dir. Get this backwards and document filenames survive.

```ts
/**
 * Pure, dependency-free scrubbing for outbound Sentry payloads.
 *
 * Cabinet's model is redact-known-patterns (default-allow): we send the real
 * error text, minus everything matching a known-dangerous shape. That is a
 * deliberate trade of leak-risk for debuggability — see the design doc. The
 * consequence is that THIS FILE'S TEST CORPUS IS THE SAFETY GUARANTEE. Any new
 * leak shape you discover in the wild belongs in redact.test.ts first.
 *
 * No node:* or @/* imports: config is injected so this stays unit-testable
 * without a filesystem, and so Phase 2 can ship it to the browser unchanged.
 */

export interface ScrubConfig {
  /** os.homedir() — its literal presence in a payload leaks the OS username. */
  homeDir: string;
  /** Cabinet's data dir — every user document lives under it, and filenames are content. */
  dataDir: string;
}

interface Frame {
  filename?: string;
  abs_path?: string;
}
interface Stacktrace {
  frames?: Frame[];
}
interface ExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: Stacktrace;
}
interface Breadcrumb {
  category?: string;
  message?: string;
}
/** Structural subset of Sentry's Event — declared locally to stay dependency-free. */
export interface SentryEvent {
  message?: string;
  server_name?: string;
  user?: unknown;
  exception?: { values?: ExceptionValue[] };
  breadcrumbs?: Breadcrumb[];
}

/** Breadcrumb categories that capture DOM text. In Cabinet, DOM text is the user's documents. */
const DROPPED_BREADCRUMB_CATEGORIES = new Set(["ui.click", "ui.input"]);

const PATTERNS: Array<[RegExp, string]> = [
  // Secrets first: a key inside a URL must be redacted as a key, not survive as a query string.
  [/\b(?:sk|pk)-[A-Za-z0-9_-]{16,}/g, "<redacted>"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "<redacted>"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "<redacted>"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<redacted>"],
  // git remotes before emails: git@github.com:x/y looks email-adjacent.
  [/\bgit@[\w.-]+:[\w./-]+/g, "<remote>"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "<email>"],
  // Foreign home dirs the configured homeDir won't match (e.g. daemon stacks).
  [/\/(?:Users|home)\/[^/\s'"]+/g, "~"],
  [/[A-Za-z]:\\Users\\[^\\\s'"]+/g, "~"],
  // Query strings carry tokens; keep the path so the endpoint is still identifiable.
  [/(\?)[^\s'"]+/g, "$1<redacted>"],
];

export function scrubString(value: string, config: ScrubConfig): string {
  let out = value;
  // Order is load-bearing: dataDir is NESTED INSIDE homeDir. Replacing homeDir
  // first would turn a document path into "~/Cabinet/data/Finance/q3-layoffs.md"
  // — username gone, filename leaked. Longest/most-specific path wins.
  if (config.dataDir) out = out.split(config.dataDir).join("<data>");
  if (config.homeDir) out = out.split(config.homeDir).join("~");
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function createScrubber(config: ScrubConfig): (event: SentryEvent) => SentryEvent {
  const s = (v: string | undefined): string | undefined =>
    typeof v === "string" ? scrubString(v, config) : v;

  return (event: SentryEvent): SentryEvent => {
    // Identity and machine fingerprint: never sent, regardless of content.
    event.server_name = undefined;
    event.user = undefined;

    event.message = s(event.message);

    for (const ex of event.exception?.values ?? []) {
      ex.value = s(ex.value);
      for (const frame of ex.stacktrace?.frames ?? []) {
        frame.filename = s(frame.filename);
        frame.abs_path = s(frame.abs_path);
      }
    }

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs
        .filter((b) => !DROPPED_BREADCRUMB_CATEGORIES.has(b.category ?? ""))
        .map((b) => ({ ...b, message: s(b.message) }));
    }

    return event;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/observability/redact.test.ts`
Expected: PASS — all tests green.

If the "replaces the data dir before the home dir" test fails, the `split/join` order in `scrubString` is inverted. That is the bug this test exists to catch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/observability/redact.ts src/lib/observability/redact.test.ts
git commit -m "feat(observability): pure scrubber for outbound Sentry payloads

Redacts data-dir paths, home dirs, API keys, JWTs, emails, git remotes and
URL query strings. Drops ui.click/ui.input breadcrumbs and the user object.
Test corpus is the safety guarantee for the default-allow model."
```

---

## Task 3: Initialize Sentry on the Next.js server

**Files:**
- Create: `src/lib/observability/init.ts`, `src/lib/observability/index.ts`
- Modify: `src/instrumentation.ts`, `next.config.ts`, `package.json`

**Interfaces:**
- Consumes: `isSentryEnabled()` from `@/lib/consent` (Task 1); `createScrubber`, `type ScrubConfig` from `./redact` (Task 2)
- Produces: `initObservability(): void` — idempotent, safe to call when consent is denied (it no-ops)

- [ ] **Step 1: Create the Sentry project and lock down its settings**

This is layer 2 of the three-layer defense in the design doc, and it is dashboard config, not code — so it must happen before the DSN can be hardcoded.

In sentry.io, under the Cabinet org:
1. Create a project: platform **Next.js**, name **cabinet**.
2. Copy the DSN — it looks like `https://<key>@o<org>.ingest.sentry.io/<project>`. It is a **write-only public key**; it ships in the client by design.
3. Settings → Security & Privacy, and enable **all** of:
   - **Prevent Storing of IP Addresses** — on
   - **Data Scrubber** — on
   - **Use Default Scrubbers** — on
   - **Additional Sensitive Fields**: `installId`, `install_id`, `email`, `path`, `filename`, `abs_path`, `cwd`, `home`
4. Settings → Inbound Filters: enable **Filter out events coming from localhost** so developer noise never reaches the project.

Record the DSN — it is pasted into `init.ts` in Step 3 as `DEFAULT_DSN`.

- [ ] **Step 2: Install the SDK**

Run: `npm install --save-exact @sentry/nextjs@10.65.0`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 3: Write `src/lib/observability/init.ts`**

`DATA_DIR` is imported here (not in `redact.ts`) precisely so the scrubber stays pure.

Paste the real DSN from Step 1 into `DEFAULT_DSN`. The version is read from disk with `fs` rather than imported as a JSON module, matching how `src/lib/system/release-manifest.ts:65` already does it — a bare JSON import is fragile across the tsx / Next-bundler / Electron-CJS boundaries this file will eventually cross.

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled, readState } from "@/lib/consent";
import { getOrCreateSessionId } from "@/lib/telemetry";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { createScrubber, type SentryEvent } from "./redact";

// Public, write-only key. Sentry DSNs are designed to ship in client code.
// Paste the DSN from the project created in Step 1.
const DEFAULT_DSN = "https://<key>@o<org>.ingest.sentry.io/<project>";

function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    // Release tagging is a nice-to-have; never let it block error reporting.
    return "unknown";
  }
}

let initialized = false;

export function initObservability(): void {
  if (initialized) return;
  if (!isSentryEnabled()) return;

  const dsn = process.env.CABINET_SENTRY_DSN?.trim() || DEFAULT_DSN;
  const scrub = createScrubber({ homeDir: os.homedir(), dataDir: DATA_DIR });
  const debug = process.env.CABINET_SENTRY_DEBUG === "1";

  Sentry.init({
    dsn,
    release: readVersion(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    sendDefaultPii: false,
    // Phase 4 adds spans. Until then, pay for nothing.
    tracesSampleRate: 0,
    beforeSend(event) {
      const scrubbed = scrub(event as SentryEvent);
      if (debug) {
        // Audit hatch: print exactly what WOULD leave this machine, and send nothing.
        console.log("[sentry:debug]", JSON.stringify(scrubbed, null, 2));
        return null;
      }
      return scrubbed as typeof event;
    },
    beforeBreadcrumb(breadcrumb) {
      const [kept] = scrub({ breadcrumbs: [breadcrumb] }).breadcrumbs ?? [];
      return (kept as typeof breadcrumb) ?? null;
    },
  });

  // Correlate with the first-party pipeline: logger.ts already emits a
  // `crash.detected` telemetry event on uncaught exceptions. Sharing installId
  // and sessionId turns a counter spike in D1 into a specific stack trace here.
  Sentry.setTag("install_id", readState().installId);
  Sentry.setTag("session_id", getOrCreateSessionId());

  initialized = true;
}
```

- [ ] **Step 4: Write `src/lib/observability/index.ts`**

```ts
export { initObservability } from "./init";
export { createScrubber, scrubString, type ScrubConfig, type SentryEvent } from "./redact";
```

- [ ] **Step 5: Call it from `src/instrumentation.ts`**

Insert as the **first** try/catch inside `register()`, before `initProcessLogging` — Sentry must be live before anything else can throw. Add immediately after the `if (process.env.NEXT_RUNTIME !== "nodejs") return;` line:

```ts
  // Sentry first: everything below this line can throw, and we want those
  // throws reported. No-ops when consent is denied.
  try {
    const { initObservability } = await import("./lib/observability");
    initObservability();
  } catch (err) {
    console.error("instrumentation: initObservability failed", err);
  }
```

- [ ] **Step 6: Wrap `next.config.ts`**

Replace the final `export default nextConfig;` line with:

```ts
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  // Source map upload is a release-pipeline concern, not a local-build one.
  // Self-hosters build Cabinet themselves and must never be asked for a token.
  silent: true,
  disableLogger: true,
  // Sentry's tunnel would route events through the Next server. Not wanted:
  // events go straight to Sentry, and CABINET_SENTRY_DISABLED must fully stop them.
  tunnelRoute: undefined,
});
```

Move the `import { withSentryConfig } from "@sentry/nextjs";` to the top of the file with the other imports.

- [ ] **Step 7: Verify the wiring end-to-end with the debug hatch**

This is the point of `CABINET_SENTRY_DEBUG` — prove what leaves the machine without sending anything.

Create a throwaway route `src/app/api/_sentry-check/route.ts`:

```ts
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  throw new Error(`sentry check: cannot open ${process.env.HOME}/Cabinet/data/secret-doc.md`);
  return NextResponse.json({ ok: true });
}
```

Run: `CABINET_SENTRY_DEBUG=1 npm run dev`, then in another shell: `curl localhost:3000/api/_sentry-check`

Expected: the dev server logs `[sentry:debug]` followed by a JSON event whose exception value reads `sentry check: cannot open <data>` — **not** the real path — and whose `server_name` and `user` are absent. No event is sent.

Then confirm the kill switch: run `CABINET_SENTRY_DISABLED=1 CABINET_SENTRY_DEBUG=1 npm run dev` and curl again. Expected: **no** `[sentry:debug]` output at all.

- [ ] **Step 8: Delete the throwaway route**

```bash
rm src/app/api/_sentry-check/route.ts
```

- [ ] **Step 9: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean. The build must succeed **without** any Sentry auth token in the environment — self-hosters build from source and can never be asked for one.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json next.config.ts src/instrumentation.ts src/lib/observability
git commit -m "feat(observability): init Sentry on the Next.js server

Gated on consent, scrubbed via redact.ts, tagged with installId/sessionId to
correlate with the crash.detected telemetry event. CABINET_SENTRY_DEBUG=1
prints the scrubbed payload instead of sending it."
```

---

## Task 4: Disclose it in onboarding

The wizard's launch step already has a `keepInTouch` consent checkbox. The telemetry checkbox mirrors it exactly — same markup, same placement, pre-checked, one click to refuse.

**Files:**
- Modify: `src/components/onboarding/onboarding-wizard.tsx` (state near `:1866`; checkbox after the `keep-in-touch` label at `:3517`; persist in the completion handler near `:2118`)
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `POST /api/telemetry/settings` with body `{ enabled: boolean }` (existing route, repointed in Task 1)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the copy keys**

In `src/i18n/locales/en.json`, inside the `onboarding.launch` object, add:

```json
"crashReporting": "Send anonymous crash reports and usage stats to help fix bugs. No file contents, names, or personal data — ever.",
"crashReportingLink": "What we collect"
```

Only `en.json` is edited. The other 40+ locales fall back to English until translated.

- [ ] **Step 2: Add the state**

In `onboarding-wizard.tsx`, directly below `const [keepInTouch, setKeepInTouch] = useState(true);` (line 1866):

```tsx
  // Pre-checked: telemetry is opt-out today. This checkbox is the disclosure
  // that was previously missing entirely — the user can refuse in one click.
  const [telemetryConsent, setTelemetryConsent] = useState(true);
```

- [ ] **Step 3: Add the checkbox**

In the launch step, immediately after the closing `</label>` of the `keep-in-touch` checkbox (line ~3517) and before the `disclaimer-accept` label:

```tsx
                <label
                  className="flex cursor-pointer items-start gap-2"
                  style={{ color: WEB.text }}
                >
                  <input
                    type="checkbox"
                    name="telemetry-consent"
                    checked={telemetryConsent}
                    onChange={(e) => setTelemetryConsent(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded"
                    style={{ borderColor: WEB.border, accentColor: WEB.accent }}
                  />
                  <span style={{ color: WEB.textSecondary }}>
                    {t("onboarding:launch.crashReporting")}
                    <a
                      href="https://github.com/cabinetai/cabinet/blob/main/TELEMETRY.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline underline-offset-2"
                    >
                      {t("onboarding:launch.crashReportingLink")}
                    </a>
                  </span>
                </label>
```

- [ ] **Step 4: Persist the choice on completion**

In the completion handler, immediately **before** the existing `sendTelemetry("onboarding.completed", {...})` call (line ~2118):

```tsx
      // Persist the launch-step consent choice before the last telemetry event,
      // so a user who unchecked the box does not get that event sent anyway.
      if (!telemetryConsent) {
        try {
          await fetch("/api/telemetry/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false }),
          });
        } catch {
          // Non-fatal: the toggle in Settings → About remains available.
        }
      }
```

Then add `telemetryConsent` to that callback's dependency array (line 2133).

**Ordering matters.** The `POST` must complete before `sendTelemetry("onboarding.completed")` fires, or a user who just opted out would still have one event sent. The `await` above guarantees that: the route writes state and calls `invalidateConsentCache()`, so `emit()` sees `enabled: false` on the very next call.

- [ ] **Step 5: Verify in the running app**

Run: `npm run dev`, then trigger onboarding with a fresh data dir:

```bash
CABINET_TELEMETRY_DIR=/tmp/cabinet-consent-check npm run dev
```

Walk the wizard to the launch step. Expected: the checkbox appears, pre-checked, above the disclaimer acceptance. Uncheck it and launch. Then confirm state was persisted:

```bash
cat /tmp/cabinet-consent-check/telemetry.json
```

Expected: `"enabled": false`.

Now re-run leaving it checked, and confirm `"enabled": true`.

- [ ] **Step 6: Confirm the Settings toggle reflects it**

In the running app, open Settings → About. Expected: the existing Privacy checkbox is unchecked, matching the choice made in onboarding — one switch, two surfaces.

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding/onboarding-wizard.tsx src/i18n/locales/en.json
git commit -m "feat(onboarding): disclose crash reporting and telemetry on the launch step

Pre-checked consent box mirroring keep-in-touch. Opting out writes through
the existing settings route before the final telemetry event fires."
```

---

## Task 5: Reconcile the privacy docs

`TELEMETRY.md` and `docs/TELEMETRY.md` are two substantially different documents describing the same pipeline (they disagree on field naming and on the "never collected" list). Both are linked from user-facing surfaces. Shipping Sentry against a contradictory privacy story is not acceptable, so this ships with Phase 1 — it is a consent-surface bug, not unrelated cleanup.

**Files:**
- Modify: `TELEMETRY.md` (becomes the single source of truth)
- Delete: `docs/TELEMETRY.md` (replaced by a one-line pointer)
- Modify: `README.md:288-304` (Privacy section)

- [ ] **Step 1: Read both documents and diff their claims**

Run: `diff <(cat TELEMETRY.md) <(cat docs/TELEMETRY.md)`

Reconcile against the **code**, not against either document — `src/lib/telemetry/catalog.ts` is the actual allowlist and is authoritative. Where the two docs disagree, the code wins.

- [ ] **Step 2: Rewrite `TELEMETRY.md` as the single source of truth**

It must state, accurately:
- The 21 allowlisted events, from `catalog.ts`
- The anonymous `installId` and per-run `sessionId`
- **New:** crash reporting via Sentry — what is sent (error class, message, stack trace, release, OS) and what is scrubbed (data-dir paths, home dirs, API keys, JWTs, emails, git remotes, URL query strings, DOM breadcrumbs, IP, hostname, user object)
- **New:** the honest limitation — scrubbing is pattern-based, so it is best-effort on error text, and `CABINET_SENTRY_DEBUG=1` lets anyone audit exactly what would be sent from their machine
- All four env vars: `CABINET_TELEMETRY_DISABLED`, `CABINET_SENTRY_DISABLED`, `CABINET_SENTRY_DSN`, `CABINET_SENTRY_DEBUG`
- **Corrected:** the toggle is at **Settings → About → Privacy**, not "Settings → Privacy" as both current docs claim

- [ ] **Step 3: Replace `docs/TELEMETRY.md` with a pointer**

```bash
printf '# Telemetry\n\nSee [TELEMETRY.md](../TELEMETRY.md) — the single source of truth for what Cabinet\ncollects, what it never collects, and how to turn it off.\n' > docs/TELEMETRY.md
```

- [ ] **Step 4: Fix the README Privacy section**

In `README.md` (lines ~288-304): correct the settings path to **Settings → About → Privacy**, mention crash reporting alongside telemetry, and list `CABINET_SENTRY_DISABLED`.

- [ ] **Step 5: Verify every documented path and env var actually exists**

Run:
```bash
grep -rn "CABINET_SENTRY_DISABLED\|CABINET_SENTRY_DSN\|CABINET_SENTRY_DEBUG\|CABINET_TELEMETRY_DISABLED" --include=*.ts --include=*.tsx --include=*.cjs src/ next.config.ts
grep -rn "Settings → Privacy" README.md TELEMETRY.md docs/TELEMETRY.md
```
Expected: the first command finds every env var in code; the second returns **no output** (the stale path is gone).

- [ ] **Step 6: Commit**

```bash
git add TELEMETRY.md docs/TELEMETRY.md README.md
git commit -m "docs: reconcile the two TELEMETRY.md files and document Sentry

The root doc becomes the single source of truth; docs/ points at it. Adds
crash reporting, its scrubbing guarantees and its honest limits, and fixes
the settings path (About → Privacy, not Privacy)."
```

---

## Done when

- `npm test` passes, including `src/lib/consent/kill-switches.test.ts` and `src/lib/observability/redact.test.ts`
- `npm run build` succeeds with no Sentry auth token in the environment
- `CABINET_SENTRY_DEBUG=1` prints a scrubbed payload containing neither the home dir nor the data dir
- `CABINET_SENTRY_DISABLED=1` produces no Sentry activity while telemetry still emits
- A fresh onboarding run shows the consent checkbox, and unchecking it writes `"enabled": false` to `telemetry.json`
- One privacy document, matching the code

## Deferred to later phases

- **Phase 2 (browser):** `instrumentation-client.ts`, the `layout.tsx` consent prop, the fail-closed `beforeSend` gate, React error boundaries, Web Vitals
- **Phase 3 (Electron):** `@sentry/electron/main`, native crash reporter
- **Phase 4 (CLI + performance):** lazy Sentry in `cabinetai`; spans for agent runs, search, git
