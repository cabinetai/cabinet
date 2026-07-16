# Onboarding trim: 12 steps → 5 — design

**Date:** 2026-07-16
**Status:** Approved, pending implementation plan
**Scope:** Shorten the first-run wizard and repurpose the post-wizard tour's tail. The templates
work that plugs into the tour tail is specified separately in
[templates/library rework](./2026-07-16-templates-library-rework-design.md); this spec ships without
it. Vocabulary follows [ADR-0001](../../adr/0001-cabinet-is-the-only-user-facing-noun.md).

## Context

`src/components/onboarding/onboarding-wizard.tsx` is 3,607 lines and renders **12 steps**
(`STEP_COUNT = 12` at `:155`; the step constants are `:153-162`, under an explanatory comment at
`:148-152`), driven by a single numeric `step` state (`useState(0)`, `:1664`) with no URL routing.
Around it sit a data-dir picker (before) and a product tour (after). *(All line numbers in this spec
were read against the working tree and verified 2026-07-16.)*

Of the 12 steps, **five** collect something that survives launch. The rest are intro, explainer,
community, or — in one case — a form whose value is never sent anywhere.

| # | Step | Purpose | Collects | Persisted by `launch()`? |
| --- | --- | --- | --- | --- |
| 0 | Intro (`IntroStep` `:440`, rendered `:2290`) | Brand | — | — |
| 1 | Welcome / name (rendered `:2295`) | **Functional** | name (req), email (opt) | yes |
| 2 | What is a Cabinet? (`WhatIsCabinetStep` `:750`, rendered `:2451`) | Explainer | — | — |
| 3 | Knowledge graph (`KnowledgeStep` `:667`, rendered `:2461`) | Explainer | — | — |
| 4 | Cabinet setup (rendered `:2469`) | **Functional** | cabinet name (req), description | yes |
| 5 | Provider (rendered `:2606`, `checkProvider` `:1981`) | **Functional** | provider/model/effort | yes |
| 6 | Hire first agent (`TeamBuildStep` `:1067`, rendered `:2581`) | **Functional** | agent name, role, instructions, heartbeat | yes |
| 7 | First task (`FirstTaskStep` `:828`, rendered `:2595`) | Decorative | task text | **no — see Corrections** |
| 8 | GitHub star (config `:2136-2143`) | Community | — | — |
| 9 | Discord (config `:2144-2169`) | Community | — | — |
| 10 | Cabinet Cloud (config `:2170-2193`) | Marketing | email (opt) | separate waitlist call |
| 11 | Launch (rendered `:3332`, `launch()` `:2047-2133`) | **Functional** | disclaimer (req), keep-in-touch consent | yes |

## Corrections to the previous draft

Each of these was asserted in the earlier draft of this spec and is wrong. They change the work.

1. **Step 7's task text is never persisted.** `firstTask` (`:1807`) is read by exactly two places:
   `FirstTaskStep` (`:828-905`, the field itself) and `OnboardingCabinetRail` (`:970`, a preview
   caption). It is **not** in the `launch()` payload (`:2077-2104`) and appears nowhere in
   `src/app/api/onboarding/setup/route.ts`. The step asks the user to think of a first task and then
   silently throws it away. Disabling it removes a decorative screen, not a feature — and there is
   no data-loss question to answer.
2. **`onLaunchTask` does not "end the demo". It is already the real task flow.** `TourModal`'s
   `finish()` (`tour-modal.tsx:86-89`) calls `onLaunchTask`, which is `handleLaunchTourTask`
   (`app-shell.tsx:609-620`). That opens the real `StartWorkDialog` (`app-shell.tsx:1233-1248`) with
   the live agent roster, and `onStarted` navigates to the created conversation. **The missing half
   is agent creation, not task creation** (§4).
3. **Step 4 is not a modal.** It is a plain centred form (`:2469-2578`) — two inputs plus
   `RotatingTags` marquees. There is no overlay, no focus trap, nothing to "connect behind". §3 is
   specified accordingly; do not build a modal to satisfy a metaphor.
4. **Step 4's copy is hardcoded English and violates ADR-0001 today.** `:2476-2477` reads *"Your room
   is your workspace. Inside your room you have one big cabinet…"* — both banned nouns, shipping, in
   the one screen this spec merges. The i18n keys `onboarding:roomSetup.{heading,subtitle}` exist in
   `en.json` but nothing reads them.
5. **This repo has no feature-flag mechanism.** Searched `src/` for flag registries, `FEATURES`
   maps, and `isEnabled(`: nothing. The only build-time toggle in the codebase is
   `process.env.NEXT_PUBLIC_CABINET_EDITION === "cloud"` (`data-dir-prompt.tsx:13`,
   `storage-backend-section.tsx:24`). §2 proposes the flag rather than reusing one.
6. **There is no component-test stack.** No `@testing-library/*`, no jsdom/happy-dom, and
   `scripts/run-unit-tests.mjs` collects `.test.ts` only (never `.test.tsx`). The previous Testing
   section's "component tests" cannot be written without first adding a renderer, a DOM, and a
   transform. Rewritten in Testing.
7. **`launch()` has a fourth side effect the draft omitted:** a best-effort PUT to
   `/api/agents/config/integration-environments` seeding the integration environment list from the
   chosen provider (`:2066-2074`), wrapped in its own try/catch.

## Design

Target: **five screens**. Nothing is deleted — removed steps are disabled behind a flag so the work
survives and the decision is reversible.

### 1. The new flow

| Screen | Source | Notes |
| --- | --- | --- |
| Data-dir picker | `data-dir-prompt.tsx` (unchanged) | Kept. First-run only, gated by `cabinet.dataDirConfirmed` (`:8-19`). |
| 1. Intro | step 0 | Kept as-is. |
| 2. Name | step 1 | Kept. **Kicks off provider detection in the background** (§3). |
| 3. What is a Cabinet? | step 2 | Kept. |
| 4. Create your Cabinet | steps 4 + 5 **merged** | One form; provider status resolves inline beneath the fields (§3). |
| 5. Launch | steps 8 + 9 + 10 + 11 **merged** | GitHub + Discord on one slide, plus cloud email capture and the disclaimer checkbox. |

### 2. Disabled, not deleted

Disabled behind the flag map in §2.2, with a comment pointing at this spec:

- **Step 3, knowledge graph** (`KnowledgeStep` `:667`; `home-blueprint-background.tsx` stays — it is
  also the welcome step's background, `:2230-2238`; `knowledge-graph.tsx` becomes unreferenced)
- **Step 6, hire first agent** (`TeamBuildStep` `:1067`, and `scheduleToCron` `:743`, whose only
  caller is `launch()` `:2099`)
- **Step 7, first task** (`FirstTaskStep` `:828`) — decorative, see Corrections #1

Step 6 does not disappear from the product — it **moves after onboarding**, into the tour tail (§4).
The wizard's job is to get the user *into* a Cabinet, not to populate it.

#### 2.1 Everything that depends on a step index

This is the main breakage risk. `STEP_COUNT` is hardcoded and eight other things are keyed off the
same integers. All of the following must move to the derived list, or the flow silently lies:

| Site | What breaks if missed |
| --- | --- |
| `:155` `STEP_COUNT = 12` | — the source of the lie |
| `:2271` progress dots — `Array.from({ length: STEP_COUNT })`, filled by `i <= step` | 12 dots for 5 screens; fill position wrong |
| `:153-154` `COMMUNITY_START_STEP` / `COMMUNITY_END_STEP` | see the five sites below |
| `:2195-2198` `communitySteps[step - COMMUNITY_START_STEP]` | **array index out of range → renders nothing** |
| `:1702` cloud-waitlist view telemetry (`step === COMMUNITY_END_STEP`) | view event fires on the wrong screen or never |
| `:1767` cloud email prefill from the welcome email | prefill never fires |
| `:3300`, `:3307`, `:3309`, `:3319` community back/next (`setStep(step ± 1)`, `setStep(COMMUNITY_END_STEP + 1)`) | dead-ends into a blank step |
| `:3332` launch render test (`step === COMMUNITY_END_STEP + 1`) | Launch never renders |
| `:3574` launch Back → `COMMUNITY_END_STEP` | back lands on a disabled step |
| `:1646-1659` `STEP_NAMES` telemetry map (index-keyed) → `:1667-1669` | every `onboarding.step` event mislabelled; funnel data corrupted silently |
| `:2207` `showRail = step >= STEP_ROOM_SETUP && step <= STEP_TASK` | rail on the wrong screens |
| `:974` rail tab select — `step >= STEP_TASK ? "tasks" : step >= STEP_PROVIDER ? "agents" : "data"` | wrong mockup tab |
| `:2243`, `:2250`, `:2252`, `:2254` layout width/anchor/background conditionals | cosmetic, but keyed on the same constants |
| Raw integer literals: `step === 0` (`:2250`, `:2269`, `:2290`), `setStep(1)` (`:2291`), `setStep(0)` (`:2429`) | survive a rename silently — grep for bare digits, not just constant names |

`STEP_NAMES` is the quiet one. It is a `Record<number, string>` and a wrong entry produces valid
telemetry with the wrong label, which no test and no user will catch.

The `OnboardingCabinetRail` (`:918`) previewed agent/task state from steps 6-7. With those gone,
`firstTask` and `firstAgent.name` are always empty, so the rail's team/tasks captions render their
empty states forever. Drop the rail from the merged screen, or reduce it to Cabinet
name/description.

#### 2.2 The flag: `ONBOARDING_STEP_FLAGS`

No flag pattern exists (Corrections #5), so propose the smallest thing that fits: a plain const map
in a **new non-React module**, `src/lib/onboarding/steps.ts` — alongside the existing
`src/lib/onboarding/rooms.ts`. Non-React and `.ts` is load-bearing: it is the only way the
derivation is unit-testable under this repo's runner (see Testing).

```ts
// src/lib/onboarding/steps.ts
export type OnboardingStepId =
  | "intro" | "welcome-home" | "what-is-cabinet"
  | "knowledge" | "cabinet-setup" | "team" | "first-task" | "launch";

/** Steps trimmed out of the first-run flow on 2026-07-16. Flip to re-enable.
 *  Rationale: docs/superpowers/specs/2026-07-16-onboarding-trim-design.md */
export const ONBOARDING_STEP_FLAGS: Record<string, boolean> = {
  knowledge: false,
  team: false,
  "first-task": false,
};

const ALL_STEPS: OnboardingStepId[] = [...];
export const ENABLED_STEPS = ALL_STEPS.filter((id) => ONBOARDING_STEP_FLAGS[id] !== false);
export const STEP_COUNT = ENABLED_STEPS.length;
export function stepIndex(id: OnboardingStepId): number;  // -1 when disabled
```

The wizard keeps its numeric `step` state (smallest diff; `setStep(step ± 1)` still works) and
replaces each `const STEP_X = <int>` with `const STEP_X = stepIndex("x")`. `STEP_NAMES` is rebuilt
from `ENABLED_STEPS` rather than hand-maintained.

**Trap:** type the map as `Record<string, boolean>`, **not** `as const`. With `as const`, TypeScript
narrows the values to the literal `false`, and every `if (FLAGS.knowledge)` becomes a
provably-dead branch — which trips `@typescript-eslint` no-unnecessary-condition rules and lets a
future compiler prune the components this spec is explicitly trying to preserve.

`stepIndex()` returning `-1` for a disabled step is the desired behaviour: `step === -1` is never
true, so a stale `{step === STEP_KNOWLEDGE && …}` guard renders nothing instead of crashing.

### 3. The merged Cabinet + provider screen

The only genuinely new behaviour in this spec: an async detection running behind a form the user is
already typing into.

**Today:** step 4 collects Cabinet name + description, then `goToProvider()` (`:2022-2024`, called
from the Next button `:2568` and the description field's Enter handler `:2535`) advances to step 5.
An effect (`:2014-2018`) fires `checkProvider()` on arrival, which GETs `/api/agents/providers`,
filters through `isAgentProviderSelectable`, auto-selects the first ready provider and seeds its
first model + suggested effort (`:1994-2006`).

**Proposed:** detection starts at **screen 2 (name)** and runs in the background. Screen 4 shows the
Cabinet form; the provider result lands in the section beneath it.

**State: no new state.** Everything already lives at the wizard level and outlives the step:
`providersLoading` (`:1868`, initialised `true`), `providers` (`:1869`), `selectedProvider` /
`selectedModel` / `selectedEffort` (`:1909-1911`). The only addition is a `detectionStartedRef` to
make the kickoff fire once.

**Wiring the prefetch.** Replace the arrival effect (`:2014-2018`) with a once-only kickoff:

```ts
const detectionStartedRef = useRef(false);
useEffect(() => {
  if (step < STEP_WELCOME_HOME || detectionStartedRef.current) return;
  detectionStartedRef.current = true;
  void checkProvider();
}, [step, checkProvider]);
```

**Why going back cannot break it** (three independent reasons, all verified):

1. The ref makes it fire once per wizard mount, and the wizard is only unmounted by completion
   (`app-shell.tsx:1068-1070`).
2. `GET /api/agents/providers` has a **15s shared in-memory response cache plus in-flight dedup**
   (`providers/route.ts:19-22`, `:100-122`). A duplicate call is a cache hit or joins the existing
   promise; the 8 CLI health-check probes (`:29-31`) never run twice.
3. Auto-select uses a **functional** `setSelectedProvider((current) => current ? current : …)`
   (`:1996-1997`) — explicitly written so a late resolve cannot clobber a user's click. Keep it.

**Resolution when detection completes:**

- **≥1 ready** → silently auto-select the first (existing behaviour, `:1994-2006`); show a quiet
  confirmation ("Connected to Claude ✓").
- **0 ready** → render the connect panel **inline in the same screen**, not a separate step. Reuse
  the existing provider rows (`:2648-…`), which already render install / log-in affordances per
  provider and a terminal helper.
- **Always** → the user may proceed without a working provider. This is already true and must stay
  true: today's Next (`:3077-3084`) is **never disabled** — it only relabels via `anyProviderReady`
  (`:3082`, "Next" vs. `provider.skipForNow`). Preserve that exactly. Detection must never gate Next.

**Manual re-check** ("I just installed Claude") must use `/api/agents/providers?refresh=1`, which
bypasses the cache (`route.ts:103-109`). Without `refresh=1` a re-check inside 15s returns the stale
"nothing installed" answer and looks broken.

Model/effort selection stays out of onboarding — it already is: the selectors are deliberately
hidden (`:3064-3066`) and the tile click seeds both. Per-provider verify (`onboardingVerifyState`
`:1871`) is not needed on the critical path; it remains available in Settings.

**Treat "0 ready" as the default case, not the edge case.** A fresh machine with no agent CLI
installed is the common first-run situation. The inline panel must be the well-designed path.

**Latency UI is a requirement, not a polish item.** Detection spawns 8 CLI probes. The screen must
say *why* it is waiting ("Looking for AI providers on your machine…") rather than showing the bare
skeleton at `:2618-2637`, and must remain fully interactive — the user can type their Cabinet name
and continue while detection is still running.

**Copy:** the merged screen is written from scratch against `onboarding:roomSetup.*` +
`onboarding:provider.*`. Do not port `:2472-2478` forward — it is hardcoded and says "room" and
"workspace" (Corrections #4).

### 4. Tour tail becomes real

The tour (`src/components/onboarding/tour/`, 1,782 lines) auto-opens once per browser after the
wizard (`use-tour.ts:13-20`, `cabinet.tour-done`; mounted at `app-shell.tsx:601`, `:1228-1232`). Its
slides are `intro`, `DATA_SCENE_COUNT`× `data`, `agents`, `tasks` (`tour-modal.tsx:27-36`).

Changes:

- **Condense the teaching slides.** `slide-data.tsx` alone is 602 lines across multiple back/next
  scenes and overlaps the "What is a Cabinet?" screen we kept. Each data scene is a separate slide
  (`tour-modal.tsx:29-33`), so `DATA_SCENE_COUNT` is the dial; the progress dots (`:186-198`) derive
  from `SLIDES` and need no change.
- **Add agent creation ahead of the task.** Task creation already works (Corrections #2). The step
  moved out of wizard step 6 is the *agent*: name, role, instructions, optional heartbeat.

**What it must call.** `POST /api/agents/personas` (`personas/route.ts:45-79`) — `slug` is the only
required field (`:53-55`); everything else spreads into the persona, with `provider` defaulting to
`getDefaultProviderId()` and `adapterType` derived (`:57-62`). It calls `ensureAgentScaffold` and
reloads daemon schedules (`:74-76`) — which the wizard's inline `setup/route.ts:296-339` persona
write does **not** do. Routing agent creation through the real endpoint is a net correctness gain,
not just a relocation. Pass `cabinetPath` (`:48-51`), then re-run
`fetchCabinetOverviewClient(..., { force: true })` so the new agent appears in the roster the task
composer reads.

**Open risk — verify before building.** `handleLaunchTourTask` and `StartWorkDialog` both target
`ROOT_CABINET_PATH` (`app-shell.tsx:613`, `:1236`), which is `"."` (`src/lib/cabinets/paths.ts:1`) —
the neutral **home** container. But `setup/route.ts` writes every agent into
`data/<roomSlug>/.agents/` (`:93`, `:250-252`, `:307`) and never into the root. Whether the `"all"`
visibility overview aggregates descendants into the root's roster was **not** verified here. If it
does not, the tour tail is today creating tasks in the wrong cabinet against an empty agent list.
Establish this first: it decides whether the tail needs a `cabinetPath` fix before it needs a new
screen.

When the templates spec lands, this same screen gains an "or start from a template instead" option.
This spec ships the manual path only; that is the seam between the two specs.

### 5. Vocabulary

Per ADR-0001, user-facing copy says **"Cabinet"** and nothing else. `homeName`, `roomType`, and
`workspaceName` stay internal. The Room picker stays hidden and `roomType` keeps defaulting to
`"blank"` (`:1750`).

The merged screen must fix the live violation at `:2476-2477` (Corrections #4).

Note the existing mismatch: the wizard sends `roomType: "blank"` while `setup/route.ts:80` defaults
an unset `roomType` to `"office"`. The client always sends a value, so the server default is dead in
practice. Leave both as-is — changing seeding behaviour is out of scope — but do not "fix" one to
match the other without deciding which is right.

## State and completion

Unchanged. Onboarding completion remains dual-tracked: `cabinet.wizard-done` in localStorage
(`app-shell.tsx:143`, read `:220-250`) for flash-free gating, reconciled against disk truth
(`.agents/.config/onboarding-complete.json`, written by `setup/route.ts:233-236`) by the
idle-deferred effect at `app-shell.tsx:558-593`. The reset marker (`:149`) and
`handleWizardComplete` (`:694`) keep working as they do now.

`launch()` (`:2047-2133`) keeps all five responsibilities: save provider prefs (`:2051-2061`), seed
integration environments (`:2066-2074`, Corrections #7), POST `/api/onboarding/setup`
(`:2077-2104`), record the consented email (`:2109-2116`), send telemetry (`:2118-2121`), and
acknowledge the disclaimer (`:2126`).

### What drops from the payload, and whether the server survives it

With steps 6/7 disabled, `firstAgent.{name,role,instructions}` are `""` and `heartbeatEnabled` is
`false`. `firstTask` was never in the payload at all (Corrections #1).

**The server tolerates this — verified 2026-07-16 by reading the route, not by inference:**

- `setup/route.ts` performs **no schema validation**. There is no zod, no field assertion; it is
  plain destructuring inside one big `try`/`catch` (`:77`, `:423-426`).
- `firstAgent` is optional in the interface (`:63`) and guarded at the use site:
  `if (firstAgent && typeof firstAgent.name === "string" && firstAgent.name.trim())` (`:302`). An
  empty name is already the documented "no agent" case (`:92-93` in the wizard's own comment).
- `selectedAgents` is coerced: `Array.isArray(body.selectedAgents) ? body.selectedAgents : []`
  (`:100-102`). The wizard already sends `[]` (`:2091`).
- `firstAgentSlug` stays `""`, so `#general` is created with the remaining members (`:347-350`).

**The Cabinet is not left agent-less.** The route unconditionally installs `editor`
(`:249`, `agentsToInstall = [...selectedAgents, "editor"]`) precisely because "a fresh room
dispatches tasks to a non-existent editor and they fail". This is what makes §4 viable: there is
always a doer for the tour tail's first task, even before the user creates their own agent.

The only field with no tolerance is `answers` itself — it is destructured unguarded (`:79`) and
`answers.workspaceName` would throw. The trim does not touch it; it must keep being sent.

**Cleanest option:** stop sending `firstAgent` entirely when the step is disabled, rather than
sending a hollow object. The route's `:302` guard handles both, but omitting it keeps the payload
honest about what onboarding collected.

## Error handling

- **Provider detection fails or times out** → `checkProvider`'s catch already does the right thing:
  `setProviders([])` (`:2007-2009`), which is indistinguishable from "0 ready" and lands on the
  inline connect panel. A detection failure must never block launch.
- **Detection resolves after the user has already advanced** → apply the result silently; never yank
  focus or reopen a screen the user has left. The functional auto-select (`:1996`) already
  guarantees a late resolve cannot overwrite a manual pick.
- **`/api/onboarding/setup` fails on launch** → **this is broken today and the trim must not inherit
  it.** `launch()` never checks `res.ok` (`:2077`); a 500 resolves the fetch, so the wizard proceeds
  to `onComplete()` and `handleWizardComplete` writes `cabinet.wizard-done = "1"`
  (`app-shell.tsx:697`) for a Cabinet that was never created. The `catch` at `:2129-2132` only fires
  on a network-level throw. Check `res.ok`, surface the error on the Launch screen, keep the wizard
  mounted, and do not set `wizard-done` — disk is the source of truth and a half-written setup must
  not be recorded as complete.

## Testing

What this repo actually has, verified 2026-07-16:

- **Unit:** `npm test` → `scripts/run-unit-tests.mjs` → `npx tsx --test` over every `**/*.test.ts`
  under `test/` and `src/`, against a temp `CABINET_DATA_DIR` seeded from
  `test/support/fixtures/seed-cabinet`. Node's built-in runner. **`.test.tsx` files are not
  collected** (`run-unit-tests.mjs`, `collect()`), and there is no DOM, no renderer, no
  `@testing-library`.
- **E2E:** Playwright, `testDir: ./e2e` (`playwright.config.ts`), `npm run test:e2e`. Each spec boots
  a real app + daemon on ephemeral ports against an isolated temp state root via
  `bootCabinet()` (`test/support/harness.ts`), with fake agent CLIs shadowing real installs on PATH
  (`test/support/fake-agent-cli.ts`). The five existing specs are all agent/conversation flows —
  **there is no onboarding test of any kind today.**

So:

- **Unit (`test/onboarding-steps.test.ts`, new):** step derivation from
  `src/lib/onboarding/steps.ts`. With the three flags off: `STEP_COUNT === 5`; `ENABLED_STEPS` is
  exactly the §1 list in order; `stepIndex("knowledge") === -1`; every enabled id round-trips
  through `stepIndex`. Flip a flag on → the count and the neighbours' indices move together. This is
  the whole reason the derivation lives in a React-free `.ts` module — it is the only unit-testable
  seam here, and it guards the entire §2.1 table.
- **Unit (`test/onboarding-setup-payload.test.ts`, new):** the trimmed `launch()` payload shape
  against `setup/route.ts`'s tolerance — `firstAgent` omitted, `selectedAgents: []`, `answers`
  present. Extract the payload builder out of the `launch()` closure to make this reachable;
  otherwise it is untestable without a renderer.
- **E2E (`e2e/onboarding-first-run.spec.ts`, new):** the load-bearing test. `bootCabinet()` with
  **no** `fakeAgents` — that is exactly the common first-run case (§3, "0 ready" is the default).
  Drive: data-dir picker → 5 screens → app. Assert 5 progress dots, that Next is never disabled on
  the merged screen, that the Cabinet name field accepts input while detection is in flight, and
  that `.agents/.config/onboarding-complete.json` plus `data/<slug>/` exist on disk afterwards.
- **E2E (same file, second case):** with a fake `claude` on PATH → the merged screen auto-selects it
  and reaches Launch. Covers the ≥1-ready branch that the no-provider run cannot.
- **Regression:** re-run `npm run test:e2e` (agent specs) — §4's persona-creation change touches
  `/api/agents/personas` and `reloadDaemonSchedules`.
- **`npm run i18n:check`** must pass (it fails on any `t()` key missing from `en.json`/`he.json`).

Component-level tests of the merged screen (detection stubbed slow / rejecting) are **not proposed**:
they would require adding jsdom + a renderer + a `.test.tsx` path to the runner. That is a real
option, but it is its own decision and its own PR — not a line item hidden inside an onboarding trim.
The e2e no-provider run covers the branch that matters.

## i18n

Copy lives in `src/i18n/locales/*.json` under the `onboarding` (and `tour`) namespaces. **40 locale
files**, all statically imported by `src/i18n/index.ts` — not just `he`.

The good news, and it decides the work: **missing keys fall back to English per-key at render time**,
so a stale or absent key never blanks the UI. Translations are generated from `en.json` by
`npm run i18n:translate` (`scripts/i18n-translate.mjs`, Gemini batch translator).
`npm run i18n:extract` **only ever adds** keys, and only to `en.json` + `he.json`
(`i18n-extract.mjs:20-21`); it never prunes. `i18n:check` fails only when a key a `t()` call *uses*
is missing.

Therefore: **edit `en.json` only, then run `npm run i18n:translate` for the other 39.** Do not
hand-edit `he.json` or the rest.

Keys that die with the disabled steps: `onboarding:knowledge.*` (3 uses), `onboarding:firstTask.*`
(8 uses), and the `onboarding:rail.*` team/task captions if the rail goes. Deleting them from
`en.json` is optional cleanup, not a requirement.

Already-dead keys, which prove the point — these have **zero** readers today because their screens
were hardcoded in English:

- `onboarding:roomSetup.{heading,subtitle}` — step 4 hardcodes `:2472-2478`
- `onboarding:heartbeat.*` and `onboarding:team.*` — `TeamBuildStep` (`:1067-1363`, ~300 lines) makes
  exactly **one** `t()` call

The merged screen (§3) should adopt `onboarding:roomSetup.*` and `onboarding:provider.*` rather than
carrying more hardcoded English forward. New `t()` keys → `npm run i18n:extract` → `i18n:translate`.

## Follow-ups (out of scope)

- A standalone agent-creation wizard beyond the tour tail.
- Re-exposing the Room archetype picker (would supersede part of ADR-0001).
- Reconciling the `roomType` blank/office default mismatch.
- Deleting (rather than flagging) the disabled steps, once the shorter flow is proven.
- i18n-ing `TeamBuildStep` — pointless while it is flagged off, required if it is ever re-enabled.
- Adding a component-test stack (jsdom + renderer + `.test.tsx` collection), which would make the
  merged screen's async branches directly testable.
