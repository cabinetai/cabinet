# PRD: Hebrew + RTL Localization for Cabinet

**Branch:** `feat/i18n-rtl-hebrew`
**Status:** Approved (planning) — implementation phased
**Issue:** [#79](https://github.com/hilash/cabinet/issues/79) (scope narrowed: Hebrew + English only; Chinese deferred)
**Author:** hilash, 2026-05-12

---

## 1. Context

Cabinet today is **English-only with hardcoded JSX strings** across ~172 component files. Issue #79 asks for i18n (with Chinese as the original ask). We will ship **Hebrew + English first**, with full RTL when locale=he, and defer Chinese to a later release.

Why this scope:
- **Hilash is the primary Hebrew speaker** — translation quality can be owned in-house.
- **Hebrew forces RTL**, which is the structurally hard piece. Once RTL is solved, adding any other LTR language (Chinese, Spanish, etc.) is mostly translation files.
- **Existing groundwork is unusually favorable:** Tiptap already reads `dir` from frontmatter, ~73% of Tailwind direction utilities are already logical (`ms-*`/`me-*`), and `he.lproj` is already kept in macOS DMG bundle pruning ([`forge.config.cjs`](../forge.config.cjs) line 31). Someone planned for this.

Intended outcome: a Hebrew-speaking user installs Cabinet, chooses Hebrew on first run (or switches from Settings), and gets a fully RTL UI, Hebrew onboarding tour, Hebrew seed content, and agents that reply in Hebrew. Mixed-language notes still work via per-document `dir`.

---

## 2. Goals / Non-Goals

### Goals
1. App-wide locale switching: `en` ↔ `he`, no restart, persisted to user prefs.
2. **`<html dir="rtl">`** applied when locale=he; entire UI mirrors correctly.
3. UI strings extracted to translation files (`en.json` + `he.json`) across all components.
4. Hebrew-capable font fallbacks for all 15 themes.
5. Directional icons (`ChevronRight`, `ArrowLeft`, etc.) flip correctly in RTL.
6. Onboarding tour + getting-started seed pages translated to Hebrew.
7. Agents (via `conversation-runner`) receive locale in their system prompt and reply in the user's language; generated notes auto-set `dir: rtl` when locale=he.
8. Per-document `dir` override remains — a Hebrew user can still write an English note (and vice versa) and the editor flips per-document.

### Non-Goals (deferred)
- Chinese (zh-CN/zh-TW), Arabic, or any third locale. Architecture must not block them.
- Hebrew tokenization for Flexsearch ([`src/stores/search-store.ts`](../src/stores/search-store.ts)) — search works on Hebrew text but ranking quality is best-effort. Tracked as follow-up.
- Localizing Slack/Gemini integration error strings sourced from external SDKs.
- Translating provider/CLI documentation under `docs/`.
- BiDi-aware Markdown export to other tools.

---

## 3. Architecture

### 3.1 Framework: `react-i18next`

**Why not `next-intl`:** Cabinet runs Next.js under Electron with static export. `next-intl`'s strength is locale-prefixed routing (`/en/...`, `/he/...`), which is fragile under Electron's `file://` loading. `react-i18next` is provider-based with no routing assumptions.

**Decision:** Use `react-i18next` + `i18next` + `i18next-browser-languagedetector` + `i18next-parser` (build-time key extraction).

**Bundle cost:** ~25KB gzipped including detector. Acceptable for a desktop app.

### 3.2 Locale model

Two independent axes:

| Axis | Scope | Source of truth | Affects |
|---|---|---|---|
| **App locale** | User preference | `cabinet.config.json` → `locale: "en" \| "he"` | UI strings, default `dir`, date/number formatting, agent prompt locale |
| **Document `dir`** | Per-note | Frontmatter `dir: "ltr" \| "rtl"` (already exists, [`src/types/index.ts`](../src/types/index.ts) line 8) | Editor + preview rendering only |

When a document has no explicit `dir`, it inherits from app locale. When it does, the editor area uses the document's `dir` even if the chrome around it is the opposite direction. This is the standard model for multilingual note-taking apps and is already wired in [`src/components/editor/editor.tsx`](../src/components/editor/editor.tsx) lines 120, 513, 522.

### 3.3 File layout

```
src/i18n/
  index.ts                  # i18next init, language detector, fallback chain
  use-locale.ts             # thin hook: { locale, setLocale, dir, t }
  formatters.ts             # date, number, relative-time wrappers (Intl-based)
  locales/
    en/
      common.json           # shared verbs/labels
      sidebar.json
      editor.json
      agents.json           # agents/missions/jobs UI
      settings.json
      tour.json             # onboarding tour + wizard
      errors.json
    he/
      <same namespaces>
```

Namespaces are lazy-loaded per page; common is eager.

### 3.4 Hook API

```ts
const { t, locale, setLocale, dir } = useLocale();
// dir is "ltr" | "rtl", derived from locale; usable directly in JSX/CSS
```

No new `t()` ergonomics — match `react-i18next` defaults. ICU MessageFormat plurals via `i18next-icu` for future-proofing.

### 3.5 Persisting locale

Stored in the existing cabinet config (the user's per-cabinet JSON; whatever file the runtime picker writes to — confirm during implementation in `src/lib/config` or equivalent). On app boot, the chosen locale sets `<html lang>` and `<html dir>` before first paint to avoid FOUC flicker.

---

## 4. RTL Implementation Strategy

### 4.1 Baseline: logical properties already cover ~73% of layout

The codebase already uses `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*` in ~1,232 places vs ~339 physical (`ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*`). This is the unusual gift — most Tailwind apps are the opposite ratio.

**Work:** Audit the 339 physical usages. Most are icon margins and scroll indicators. Replace with logical equivalents unless they are genuinely physical (e.g., fixed positioning of a status indicator).

### 4.2 Critical files for RTL retrofit

- [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx) — sidebar position (`fixed left-0` → logical), terminal/AI panel right-dock.
- [`src/components/sidebar/sidebar.tsx`](../src/components/sidebar/sidebar.tsx) — resize handle, collapse direction, mobile slide.
- [`src/components/sidebar/tree-node.tsx`](../src/components/sidebar/tree-node.tsx) — `ChevronRight` flip on expand.
- [`src/components/onboarding/tour/tour-modal.tsx`](../src/components/onboarding/tour/tour-modal.tsx) — back/next arrows, slide-in animations.
- [`src/components/onboarding/onboarding-wizard.tsx`](../src/components/onboarding/onboarding-wizard.tsx), [`src/components/home/home-screen.tsx`](../src/components/home/home-screen.tsx), [`src/components/onboarding/tour/slide-intro.tsx`](../src/components/onboarding/tour/slide-intro.tsx) — `translateX` carousels need sign flip.
- [`src/components/layout/nav-arrows.tsx`](../src/components/layout/nav-arrows.tsx) — breadcrumb forward/back.
- [`src/components/editor/editor-toolbar.tsx`](../src/components/editor/editor-toolbar.tsx) — Undo/Redo icons, existing "Switch to RTL" doc-level button.
- [`src/app/globals.css`](../src/app/globals.css) — Win95/XP era-theme bevel insets (`inset 1px 1px ...`) need `:dir(rtl)` overrides.

### 4.3 Icon flip strategy

For the ~53 directional icon sites, use a single helper:

```tsx
// src/components/ui/dir-icon.tsx
export function DirIcon({ ltr: Ltr, rtl: Rtl, ...props }) {
  const { dir } = useLocale();
  const Icon = dir === "rtl" ? Rtl : Ltr;
  return <Icon {...props} />;
}
// Usage: <DirIcon ltr={ChevronRight} rtl={ChevronLeft} />
```

For purely-decorative arrow icons (e.g., "next" button), use Tailwind's `rtl:rotate-180` modifier. The helper is for icons that have a true mirror twin in lucide-react.

### 4.4 Fonts: Hebrew fallback per theme

Of the 15 themes in [`src/lib/themes.ts`](../src/lib/themes.ts), only **meadow** (Rubik) and **winxp** (Open Sans) have native Hebrew coverage. The other 13 need a Hebrew fallback.

**Approach:** Add a `hebrewFallback` field per theme, default to `"Heebo"` (Google Font, modern Hebrew sans, harmonizes with most Latin sans). For heavy display themes:
- `cyber` / `matrix` (mono) → fallback `"Miriam Mono CLM"` or just `"Heebo"` mono-fall.
- `claude` / `aurora` / `forest` / `sakura` (serif headings) → fallback `"Frank Ruhl Libre"` (Hebrew serif).
- `win95` (Arimo) → swap to `"Open Sans"` for Hebrew text (kept on-system).

Font loading is dynamic per theme today ([`src/app/layout.tsx`](../src/app/layout.tsx) lines 689–710) — add the Hebrew variant to the Google Fonts URL when locale=he OR when a document is `dir: rtl`.

### 4.5 Animations

`translateX(-${position}px)` patterns flip with locale. Wrap in a helper:

```ts
const xSign = dir === "rtl" ? 1 : -1;
transform: `translateX(${xSign * position}px)`
```

Dropdown/tooltip slide-ins ([data-attribute-driven](../src/components/ui/dropdown-menu.tsx)) already auto-flip — no change needed.

### 4.6 Toasts

[`src/components/layout/system-toasts.tsx`](../src/components/layout/system-toasts.tsx) is center-bottom. RTL-safe as-is. No change.

### 4.7 Electron chrome

Native macOS title bar — traffic lights stay top-left per OS convention even in RTL. No work.

---

## 5. Per-Document Direction (already 90% done)

What exists:
- `FrontMatter.dir?: "ltr" | "rtl"` ([`src/types/index.ts`](../src/types/index.ts) line 8)
- `gray-matter` parses it ([`src/lib/storage/page-io.ts`](../src/lib/storage/page-io.ts) line 62)
- Editor applies `dir={isRtl ? "rtl" : undefined}` ([`src/components/editor/editor.tsx`](../src/components/editor/editor.tsx) lines 120, 513, 522)
- Toolbar already has a "Switch to RTL" button ([`src/components/editor/editor-toolbar.tsx`](../src/components/editor/editor-toolbar.tsx) lines 348–351)

What's needed:
1. **Verify Tiptap's ProseMirror node respects the wrapper `dir`** — known weak point. Test nested lists, tables, code blocks, text alignment. May need to pass `dir` into the `EditorContent` element directly and/or use a small ProseMirror plugin to set `dir` on the document node.
2. **Auto-detect direction on import** — when a new page is created from agent output or paste, check first ~100 chars for Hebrew Unicode range (`֐-׿`) and set `dir: rtl` in frontmatter if dominant.
3. **Default for new pages** — inherit app locale's direction unless overridden.

---

## 6. Agent Locale Propagation

Agents become locale-aware via `conversation-runner` ([`src/lib/agents/conversation-runner.ts`](../src/lib/agents/conversation-runner.ts)).

**Change:** Append a system instruction to every agent invocation:

```
The user's preferred language is {{language}}. Respond in {{language}} unless the user
explicitly requests another language. When writing markdown notes, set frontmatter
dir: "rtl" if writing in Hebrew/Arabic, otherwise dir: "ltr".
```

Where `{{language}}` is the English name of the user's locale (`English` or `Hebrew`).

**Saved notes:** When the agent writes a note and the LLM didn't set `dir` in frontmatter, run the same Hebrew-Unicode heuristic as in §5.2 and set it.

**Per-agent override (future, not MVP):** A `responseLanguage` field on the agent definition could pin a specific agent to English regardless of UI locale (e.g., a coding agent). Out of MVP scope, but design the propagation point so it's easy to thread an override through.

---

## 7. Seed Content & Onboarding Tour

### Seed pages
Today: `resources/getting-started/*.md` (English only).
Plan: add `resources/getting-started-he/*.md` (Hebrew translations). On first cabinet bootstrap, the seeder picks the directory matching the chosen locale, falling back to `getting-started/` if a locale-specific directory is missing.

Update [`src/lib/storage/page-io.ts`](../src/lib/storage/page-io.ts) or the bootstrap caller (likely under `src/lib/cabinet/bootstrap` — confirm in implementation) to select the right seed source. **Reuse the existing seed pipeline** — don't fork it.

### Onboarding tour
[`src/components/onboarding/tour/tour-modal.tsx`](../src/components/onboarding/tour/tour-modal.tsx) and [`src/components/onboarding/onboarding-wizard.tsx`](../src/components/onboarding/onboarding-wizard.tsx) — extract every string to `tour.json` namespace. Room presets ([`src/lib/onboarding/rooms.ts`](../src/lib/onboarding/rooms.ts)) also need translation (room names, descriptions).

---

## 8. Settings UI

Add a **Language** section in [`src/components/settings/settings-page.tsx`](../src/components/settings/settings-page.tsx), positioned above the Theme picker.

UX:
- Radio: English / עברית (each label written in its own language — standard convention)
- A short note: "Changes language and reading direction. Existing pages keep their per-document direction."
- Switch is **live**: no restart. i18next reload + `<html dir/lang>` update + re-render. Already supported by react-i18next out of the box.

---

## 9. Phasing

| Phase | Scope | Ship target |
|---|---|---|
| **P1 — MVP infra** | `react-i18next` setup, locale config, `<html dir>`, settings toggle, Tailwind logical-property audit, Hebrew font fallbacks, ~20 highest-traffic strings extracted (sidebar, top bar, settings shell). UI works in Hebrew RTL but most labels remain English. | First PR |
| **P2 — String extraction** | Extract remaining ~150 component files. `i18next-parser` to find untranslated keys. CI check: no new hardcoded user-facing strings. | Second PR (largest) |
| **P3 — RTL polish** | Directional icons via `DirIcon`, translateX animation flips, era-theme bevel `:dir(rtl)` overrides, Tiptap ProseMirror RTL verification. | Third PR |
| **P4 — Content & agents** | Seed page translations, tour translations, agent locale propagation in `conversation-runner`, Hebrew auto-detect on new pages. | Fourth PR |
| **P5 (deferred)** | Flexsearch Hebrew tokenization, third locale (Chinese?), per-agent `responseLanguage`. | Tracked, not in this PRD |

MVP slice is **P1** — it's shippable as a "Hebrew preview" with partial UI translation while P2 is in-flight.

---

## 10. Critical Files to Touch

**New:**
- `src/i18n/index.ts`, `src/i18n/use-locale.ts`, `src/i18n/formatters.ts`
- `src/i18n/locales/{en,he}/{common,sidebar,editor,agents,settings,tour,errors}.json`
- `src/components/ui/dir-icon.tsx`
- `resources/getting-started-he/` (translated seeds)

**Modify (highest impact):**
- [`src/app/layout.tsx`](../src/app/layout.tsx) — `<html lang>`/`<html dir>`, font URL builder includes Hebrew variant.
- [`src/lib/themes.ts`](../src/lib/themes.ts) — `hebrewFallback` per theme.
- [`src/components/settings/settings-page.tsx`](../src/components/settings/settings-page.tsx) — Language section.
- [`src/components/layout/app-shell.tsx`](../src/components/layout/app-shell.tsx), [`src/components/sidebar/sidebar.tsx`](../src/components/sidebar/sidebar.tsx) — logical-property audit.
- [`src/lib/agents/conversation-runner.ts`](../src/lib/agents/conversation-runner.ts) — locale in system prompt.
- [`src/lib/storage/page-io.ts`](../src/lib/storage/page-io.ts) (or bootstrap caller) — locale-aware seed selection.
- The ~172 component files with hardcoded strings (incremental, P2).

**Reuse:**
- Existing frontmatter `dir` field — don't reinvent.
- Existing editor `isRtl` derivation in `editor.tsx:120` — extend, don't replace.
- Existing theme font-loader in `layout.tsx:689-710` — augment with Hebrew variant.
- Existing macOS DMG locale-prune set (`he.lproj` is already kept).

---

## 11. Verification

For each phase:

**P1 (infra):**
- Toggle to Hebrew in Settings. Verify `<html dir="rtl" lang="he">` in DevTools.
- Sidebar appears on the right; main content flows RTL.
- Toggle back to English without restart; everything reverts.
- Hot-reload: change `he.json`, see UI update in dev.

**P2 (strings):**
- Run `i18next-parser` — zero missing keys for `en`.
- Set locale to `he` with one untranslated string deliberately removed — fallback to `en` works, doesn't crash.
- Visual scan of every top-level page in Hebrew: no English residue.

**P3 (RTL polish):**
- Open every directional icon site, verify mirror in RTL.
- Onboarding wizard slide animation runs in the correct direction.
- Win95/Matrix/Cyber themes don't have inverted bevel shadows in RTL.
- Tiptap test page with: nested bullet list, ordered list, table with 3 cols, code block, inline `mixed Hebrew עברית and English` — all render with correct alignment in both `dir: rtl` and `dir: ltr` pages.

**P4 (content & agents):**
- Fresh cabinet bootstrap with locale=he → seed pages are Hebrew.
- Onboarding tour runs in Hebrew, layout still correct.
- Run an agent with locale=he, prompt "tell me about Cabinet" → response is in Hebrew, saved as note with `dir: rtl` frontmatter.
- Run same agent with locale=en, English response, `dir: ltr`.
- Paste a Hebrew block into a new page → auto-detect sets `dir: rtl`.

**Cross-phase:**
- Manual a11y check: VoiceOver in Hebrew reads correctly.
- Build artifacts: DMG still under size budget (check `forge.config.cjs` pruning works).
- No regression in existing English UX (run through tour, create a page, run an agent, change themes).

---

## 12. Risks & Open Questions

1. **Tiptap ProseMirror RTL** — the wrapper `dir` may not propagate to all node types. If broken, may require a ProseMirror plugin or upgrading Tiptap to a version with first-class direction support. Test early in P3.
2. **Hebrew translation quality** — owned by hilash for MVP. If community translations come in later, need a contribution flow (CONTRIBUTING note + lint script to check key coverage).
3. **String extraction churn** — 172-file refactor will create huge diffs and conflict with in-flight feature work. Phase 2 PR needs to be merged fast or done in a sprint with a code-freeze on touched areas. Consider scripting the extraction (custom codemod over the AST + manual review) rather than hand-editing.
4. **Agent prompt locale injection** breaks deterministic prompt caching across users. Acceptable — caches are per-user. But log a metric so we know cache-hit rates didn't tank.
5. **Onboarding key registry** — memory notes a "client data registry" for onboarding explainer keys. Audit confirmed it's modal-centric, no DOM anchoring, so no positional flip work. Re-verify during P3.
6. **Date/number locale** — 9 call sites of `toLocaleDateString()` mostly pass `undefined` (browser locale). Replace with the central `formatters.ts` wrapper that always uses the app locale, otherwise system-locale users see inconsistent formatting. Cheap fix, do in P1.

---

## 13. Out of Scope (Captured for Future)

- Chinese (Simplified + Traditional) — the original ask in #79. Reopen after P4 ships.
- Arabic / other RTL languages — architecture supports them; needs only fonts + translations.
- Per-agent `responseLanguage` override.
- Flexsearch Hebrew tokenization.
- BiDi-aware markdown export to external tools (Notion, Obsidian).
- Hebrew calendar (Jewish calendar) — Hebrew speakers overwhelmingly use Gregorian in software contexts; only add if user demand surfaces.
