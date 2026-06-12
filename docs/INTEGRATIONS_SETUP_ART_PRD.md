# PRD — Integrations: Illustrated Per-Step Setup Art

**Status:** Implemented (Phases 0–1) · **Author:** hilash · **Date:** 2026-06-08
**Driver:** Every integration in the Hub now has a step-by-step setup guide, but only
Discord shipped with illustrations. The other 51 connectors render the guide as plain
numbered prose. Non-developers — the people this Hub is built for — get stuck on exactly
the third-party screens (Azure app registration, Slack scopes, "Copy Server ID") that an
illustration would make obvious. Phase 0 closed most of that gap with a pattern-keyed art
dispatcher; this PRD documents what shipped and scopes what's left.

> **Status note (2026-06-08):** Phase 0 is implemented (commit `0e96b9b`). Every catalog
> entry now resolves to *some* per-step art through `stepArtFor()`
> (`src/components/integrations/hub/generic-setup-art.tsx`): Discord & Telegram keep their
> bespoke art, Microsoft 365 / Shopify / Figma / Salesforce get tailored mockups, and the
> remaining ~45 connectors fall to two reusable pattern renderers (official-OAuth consent,
> bring-your-own-URL) keyed off `authBackend` / `transport` / `urlCredentialKey`. The
> detail page (`integration-detail-page.tsx`) was rewired from the Discord-only special
> case to this dispatcher. tsc/eslint clean.
>
> **Phase 1 done (2026-06-08):** the four multi-step official-OAuth connectors now
> illustrate every step — Slack (create-your-own-app + user-token-scopes), Google Workspace
> (GCP console: enable APIs + download Desktop OAuth client JSON), GitHub (Settings →
> Applications grant/revoke), Notion (page/database picker). Each delegates step 0 to the
> shared consent mock. The byte-identical primitives (`MockWindow`, `Hint`, `Avatar`,
> `CheckRow`, `BtnMock`, `FieldMock`, `KvRow`, `ToggleRow`) were promoted into
> `setup-art-primitives.tsx`; `generic-setup-art.tsx` + the Discord/Telegram bespoke files
> now import them instead of re-declaring. `CheckRow` gained an `on` prop (unchecked rows).
> tsc + eslint clean.
>
> **Not yet done (Phases 2–4):** the dispatcher can still silently return `undefined` for
> future catalog shapes (no coverage test), the step↔catalog alignment is unguarded, and
> none of the art (or the catalog copy it sits under) is i18n'd or verified across themes /
> RTL.

---

## 1. Summary

The Integrations Hub gives each connector a full-page detail view with a numbered
**setup guide** rendered by `SetupGuide` (`src/components/integrations/hub/setup-guide.tsx`)
straight from the catalog's `setupSteps` (`src/lib/agents/mcp-catalog.ts`). Discord pioneered
per-step "mini-mockups" — tiny, theme-token renditions of the third-party screens (Developer
Portal, intents toggles, OAuth URL generator, "Copy Server ID" right-click) so a non-developer
can *see* where to click. Those mockups are pure markup: no screenshots to capture, brand-color
parameterized, and theme-aware.

Phase 0 generalized that pattern to the whole catalog. Rather than hand-draw 52 bespoke
guides, the insight is that **connectors share a small number of setup *patterns***, so one
dispatcher renders reusable, brand-parameterized art keyed by pattern, with a handful of
bespoke exceptions:

- **Bespoke** — Discord (`discord-setup-art.tsx`, 5 steps), Telegram (`telegram-setup-art.tsx`, 4 steps).
- **Tailored single/multi-screen** — Microsoft 365 (Azure register → Graph scopes → secret), Shopify (npx terminal), Figma (Dev Mode toggle), Salesforce (`sf org login` terminal).
- **Pattern: official one-click OAuth** (`OAuthConsentArt`) — a browser consent-screen mock, for `transport: "http"` + `authBackend: "cli-pkce"`.
- **Pattern: bring-your-own URL** (`ByoUrlArt`) — copy-your-URL then paste-it mocks, for `authBackend: "token"` + a `urlCredentialKey`.

This PRD has two parts:

- **Part A — What shipped (Phase 0).** The dispatcher, the two pattern renderers, the four
  tailored mockups, and the detail-page rewire. Documented here as the baseline.
- **Part B — Finish the job (Phases 1–4).** Illustrate the unillustrated later steps, make
  coverage a contract instead of a best-effort fallthrough, guard the alignment invariant,
  and bring the art up to the rest of the app's bar: i18n + RTL + theme verification.

---

## 2. Goals & non-goals

**Goals**
- Every setup *step* a user has to act on is illustrated — not just step 1 of multi-step flows.
- Adding a catalog entry can never *silently* ship with no art; coverage is enforced or
  visibly flagged in dev.
- The art↔catalog step alignment (a fragile, comment-only invariant today) is guarded.
- Setup art meets the app's existing bar: localized (39 locales), RTL-correct, and legible
  across all ~15 themes and any brand color.

**Non-goals**
- No screenshots or raster assets. The "pure theme-token markup" constraint is load-bearing
  (stays accurate, themes for free, no asset pipeline) and stays.
- Not redrawing Discord/Telegram — their bespoke art is the quality bar, not a target.
- No change to the connect mechanics, catalog shape, `AuthBackend` model, or
  `mcp-config-writer`. This is presentation only.
- Not building per-connector bespoke art for all 52 — the pattern approach is deliberate;
  bespoke is reserved for connectors whose setup genuinely doesn't fit a pattern.

---

## 3. Background & constraints

- **Single caller.** `IntegrationDetailPage` is the only consumer: it reads the catalog
  entry via `getCatalogEntry(item.id)` and passes `entry.setupSteps` plus
  `stepArtFor({ id, label, brand, authBackend, transport, hasUrlCredential })` into
  `SetupGuide`. `SetupGuide` calls `art?.(i)` once per step and renders the result under that
  step (`max-w-sm`), or nothing if the renderer returns `null`/`undefined`.
- **Art is keyed by signals, not by id (mostly).** Six ids are special-cased
  (`discord`, `telegram`, `microsoft-365`, `shopify`, `figma`, `salesforce`); everything
  else is resolved from `authBackend` / `transport` / `urlCredentialKey`. That's what lets
  ~45 connectors share two renderers.
- **The alignment invariant.** Every art file's `step` index must line up with the catalog's
  `setupSteps` order for that connector. It's enforced only by a code comment ("keep aligned
  with that order"). Reordering or inserting a catalog step silently desyncs the art.
- **`brand` is the only theming input the renderers take.** Buttons/avatars use the brand
  color as a solid background with white text. Pale brands (e.g. a near-white or bright-yellow
  mark) can produce white-on-pale, i.e. invisible labels. No contrast guard today.
- **The Hub is i18n'd elsewhere; this isn't.** Onboarding and most surfaces are translated
  into 39 locales with RTL arrow handling (see memory: onboarding i18n). The setup art's
  hint/label strings *and* the catalog `setupSteps` copy are hardcoded English, and the art
  uses LTR-only affordances ("paste it on the right →", chat bubbles pinned right/left).

---

## 4. Current coverage (the Phase 0 baseline)

`stepArtFor` resolves, in order:

| Connector(s) | Renderer | Steps illustrated | Gap |
|---|---|---|---|
| Discord | `DiscordStepArt` (bespoke) | 0–4 (all 5) | — |
| Telegram | `TelegramStepArt` (bespoke) | 0–3 (all 4) | — |
| Microsoft 365 | `MicrosoftArt` | 0–2 (all 3) | — |
| Shopify, Figma, Salesforce | tailored single-screen | step 0 (only step) | ignores `step` arg → would duplicate if a step is added |
| Linear, Jira, Stripe, Sentry, Asana, HubSpot, ClickUp, Box, monday.com | `OAuthConsentArt` | step 0 (only step) | — (single-step flows) |
| **Slack** (3 steps) | `SlackArt` (consent + own-app + scopes) | 0–2 (all) | — *(Phase 1)* |
| **Google Workspace** (2 steps) | `GoogleArt` (consent + GCP console) | 0–1 (all) | — *(Phase 1)* |
| **GitHub** (2 steps) | `GithubArt` (consent + Applications) | 0–1 (all) | — *(Phase 1)* |
| **Notion** (2 steps) | `NotionArt` (consent + page picker) | 0–1 (all) | — *(Phase 1)* |
| 33 bring-your-own (Zapier, Make, ServiceNow, … Mixpanel) | `ByoUrlArt` | steps 0–1 (both) | — |

**Net (post-Phase 1):** 52/52 connectors illustrate **every** step a user must act on. The
multi-step official-OAuth flows — the steps users are most likely to need help with
(registering an own app, enabling scopes, narrowing access) — are now fully covered. The
remaining work (Phases 2–4) is about *hardening* the system, not filling step-level gaps.

---

## 5. Gaps → phased work

### Phase 1 — Illustrate the multi-step OAuth flows ✅ Done (2026-06-08)
The four connectors above shipped art only on step 0; their remaining steps are where
non-developers actually get stuck. Now illustrated (`SlackArt` / `GoogleArt` / `GithubArt` /
`NotionArt` in `generic-setup-art.tsx`), with the shared primitives extracted to
`setup-art-primitives.tsx`.

- **Slack** — step 1 ("If your workspace blocks one-click"): a `api.slack.com/apps` "Create
  app" mock. Step 2 ("Scopes to enable"): a User Token Scopes checklist mock echoing the
  `copy` chip's scope list.
- **Google Workspace** — step 1 ("your own GCP app"): a Google Cloud Console mock — enable
  Gmail/Calendar/Drive APIs → OAuth client (Desktop) → download JSON → point the path field
  at it.
- **GitHub** — step 1 ("Scope the access"): a GitHub → Settings → Applications mock showing
  org/repo grant + revoke.
- **Notion** — step 1 ("Choose what to share"): a Notion connection-picker mock (pages/DBs
  with checkboxes).

Most reuse existing primitives (`MockWindow`, `CheckRow`, `KvRow`, `FieldMock`, `BtnMock`,
`Hint`). Promote these into a shared `setup-art-primitives.tsx` so the three art files and
`generic-setup-art.tsx` stop re-declaring identical `MockWindow`/`Hint`/`Avatar` locals
(they're duplicated four times today).

### Phase 2 — Make coverage a contract
`stepArtFor` returns `undefined` for any shape not matched (e.g. a future `user-app` + `http`
connector, or a `token` + `stdio` server that isn't one of the four named ids, or the future
`cabinet-broker` backend). That's a silent no-art regression waiting to happen.

- Add a `token` + `stdio` default ("runs locally via npx / paste a token") so new local
  servers aren't blank.
- Add a dev-only invariant: a unit test (or a dev-mode `console.warn` in `stepArtFor`) that
  asserts **every** `MCP_CATALOG` entry yields non-null art for step 0. New entry with an
  unhandled shape → red test, not a silently empty guide.
- Document the supported (signal → renderer) matrix in `generic-setup-art.tsx`'s header so
  the contract is discoverable.

### Phase 3 — Guard the alignment invariant
The `step`-index↔`setupSteps`-order coupling is comment-only and silently breaks on reorder.

- Co-locate the expectation: give bespoke art (Discord/Telegram/Microsoft) a tiny per-step
  `assert`/dev-warn that the catalog step `title` at that index matches an expected keyword,
  **or** key the art switch on a stable step `kind` field added to `CatalogSetupStep` rather
  than a numeric index.
- Lightest viable version: a test that snapshots each bespoke connector's `setupSteps.length`
  and titles, so a catalog edit that desyncs the art fails CI.

### Phase 4 — App-bar polish (i18n · RTL · themes)
Bring the art up to the rest of the Hub.

- **i18n.** Externalize the art's hint/label strings and the catalog `setupSteps` copy into
  the locale system (39 locales). This is the larger lift — the catalog is currently the
  single source of English copy.
- **RTL.** Mirror directional affordances: the "→ paste on the right" hint, chat-bubble
  sides, and the `CornerDownRight` arrow. Reuse onboarding's RTL arrow pattern.
- **Layout truth.** The "paste it on the right →" hint assumes the `lg:` two-column layout;
  below `lg` the ConnectPanel stacks *below* the guide. Make the hint direction-/layout-aware
  (or neutral: "paste it into the field").
- **Contrast.** Guard brand-on-white legibility — derive an accessible text/foreground color
  from `brand` (or fall back to a neutral chip) so pale/bright marks don't render invisible
  buttons. Verify across all ~15 themes in light and dark.

---

## 6. Design principles (carried from Phase 0)

- **Pattern-first, bespoke-by-exception.** Hand-draw only when a connector's setup genuinely
  doesn't fit a pattern. Default to the shared renderers.
- **Pure theme-token markup.** No screenshots, no raster assets, no asset sync. Everything is
  derived from `brand` + theme tokens so it's correct in every theme by construction.
- **Illustrate the action, not the chrome.** Each mockup shows the one thing the user must do
  on that screen (the button to click, the toggle to flip, the value to copy), with a single
  `Hint` line tying it back to the Cabinet panel.
- **Steps are the source of truth.** Art is an overlay on `setupSteps`; the prose stands
  alone if art is absent. Never put load-bearing instructions *only* in the art.

---

## 7. Success criteria

- Every connector with N setup steps has illustration on each step a user must act on (no
  "step 1 illustrated, steps 2–3 bare" flows).
- Adding a catalog entry with an unhandled `authBackend`/`transport` shape fails a test
  (or warns in dev) rather than shipping a blank guide.
- A catalog step reorder that desyncs bespoke art fails CI.
- Setup-guide copy and art render correctly in a non-English locale, in RTL, and across all
  themes in light + dark, with no invisible brand-colored controls.

---

## 8. Open questions

- **Catalog copy as the i18n boundary.** `setupSteps` strings live in `mcp-catalog.ts` (a
  pure TS module, imported client-side). Do we move them into the locale JSON (key per step)
  or keep English copy in the catalog and translate via a wrapper? The former is cleaner but
  touches every entry.
- **`kind` field vs. index.** Is it worth adding a `kind` to `CatalogSetupStep` to decouple
  art from step order (Phase 3), or is a title-snapshot test enough?
- **Scope of bespoke.** Slack/Google/GitHub/Notion fallback steps (Phase 1) — pattern
  renderers (a generic "register your own app" mock parameterized by console name) or four
  tailored ones? Pattern is cheaper; tailored is clearer. Lean pattern, escalate to tailored
  only where the console differs materially (Azure already is tailored).

---

## 9. Files

- `src/components/integrations/hub/generic-setup-art.tsx` — `stepArtFor()` dispatcher + the
  two pattern renderers (`OAuthConsentArt`, `ByoUrlArt`) + the four tailored mockups
  (`MicrosoftArt`, `ShopifyArt`, `FigmaArt`, `SalesforceArt`) + shared primitives.
- `src/components/integrations/hub/discord-setup-art.tsx` — bespoke Discord art (5 steps).
- `src/components/integrations/hub/telegram-setup-art.tsx` — bespoke Telegram art (4 steps).
- `src/components/integrations/hub/setup-guide.tsx` — renders `setupSteps` + calls `art?.(i)`.
- `src/components/integrations/hub/integration-detail-page.tsx` — the only caller; wires
  catalog signals into `stepArtFor`.
- `src/lib/agents/mcp-catalog.ts` — `CatalogEntry` / `CatalogSetupStep`; source of truth for
  steps, `authBackend`, `transport`, `urlCredentialKey`.
</content>
</invoke>
