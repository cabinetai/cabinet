# Contributing translations

Cabinet ships in English and Hebrew today. This doc explains how to add a
string, audit what's still hardcoded, and add a third locale when the time
comes.

## File layout

```
src/i18n/
  index.ts                  i18next init (eager-loaded, single file per locale)
  use-locale.ts             useLocale() hook: { t, locale, setLocale, dir }
  formatters.ts             Intl-based date/time/number helpers
  locales/
    en.json                 ALL English strings, organized by namespace
    he.json                 ALL Hebrew strings, organized by namespace
    <new-locale>.json       drop a new file here to add a language
```

Each locale is **one consolidated JSON file** with namespaces as top-level
keys:

```jsonc
{
  "common": { "actions": { "save": "Save", "cancel": "Cancel" } },
  "editor": { "toolbar": { "bold": "Bold", "italic": "Italic" } },
  "settings": { "language": { "title": "Language" } }
}
```

App locale lives in `localStorage` under `cabinet-locale` (`en` | `he`). A
pre-hydration inline script in `src/app/layout.tsx` reads it and sets
`<html dir>` / `<html lang>` before first paint so RTL doesn't flash.

Per-document direction is separate: every page's `dir: ltr | rtl` lives in
its markdown frontmatter (`src/types/index.ts`). The editor reads it and
respects it, even if the app chrome is the opposite direction.

## Adding a string

1. Pick a namespace from the top level of `en.json` (or create a new one
   if no existing namespace fits — keep the count small).
2. Add the key to **both** `en.json` and `he.json`. Prefer nested objects
   (`toolbar.bold`) over flat keys (`toolbarBold`).
3. If you don't have a translation, leave the Hebrew value empty (`""`) —
   `i18n.init` falls back to English at render time, and the empty value
   flags it in code review.
4. Wrap the call site:
   ```tsx
   import { useLocale } from "@/i18n/use-locale";

   export function MyComponent() {
     const { t } = useLocale();
     return <button title={t("editor:toolbar.bold")}>...</button>;
   }
   ```
5. For interpolated values:
   ```tsx
   t("sidebar:refreshedWithChanges", { added, removed })
   // JSON: "refreshedWithChanges": "Refreshed — {{added}} added, {{removed}} removed."
   ```

## Auto-extracting keys you forgot to add

If you sprinkled new `t()` calls through code but didn't add the keys to
the JSON yet, this script walks `src/` and fills them in:

```sh
npm run i18n:extract         # adds missing keys (en: defaults to key path, he: empty)
npm run i18n:check           # exits non-zero if any keys missing (use in CI)
```

`i18n:extract` is idempotent: existing keys are preserved, only missing
ones are added. Diff the JSON to review.

## Finding what's still hardcoded

```sh
npm run i18n:report
```

Walks `src/components/` for JSX text + `title=`/`aria-label=`/`placeholder=`
attribute values that look like user-facing English and aren't wrapped in
`t()`. Best-effort regex pass — false positives happen, but it's the right
starting point for "what's left." Treat the count as a budget that should
trend down.

## Adding a new locale

**TL;DR — to add Spanish:**

1. `cp src/i18n/locales/en.json src/i18n/locales/es.json`
2. Translate every value
3. Add 3 lines in `src/i18n/index.ts` (`import es`, `SUPPORTED_LOCALES`, `LOCALE_LABELS`)
4. Add a row in `formatters.ts` BCP47 map
5. Add a row in settings-page `LanguageSection` options

End-to-end (e.g. Spanish):

1. Copy `src/i18n/locales/en.json` → `es.json`. Translate every value.
2. In `src/i18n/index.ts`:
   - Add `import es from "./locales/es.json";`
   - Add to `SUPPORTED_LOCALES`: `["en", "he", "es"]`
   - Add to `LOCALE_LABELS`: `es: "Español"`
   - Add to `resources`: `{ en, he, es }`
3. In `src/i18n/formatters.ts` add `es: "es-ES"` to `LOCALE_TO_BCP47`.
4. In `src/components/settings/settings-page.tsx`, add a row to the
   `LanguageSection` options array.
5. If the new locale is RTL (Arabic, Persian, Urdu), update `localeToDir`
   in `src/i18n/index.ts` to return `"rtl"` for it. Most RTL polish for
   Hebrew also handles other RTL scripts.

That's it. No per-namespace files to sync; one file in, one language out.

## RTL polish patterns

- **Tailwind utilities:** prefer logical (`ms-2`, `pe-4`, `start-0`, `end-0`)
  over physical (`ml-2`, `pr-4`, `left-0`, `right-0`). They auto-flip when
  `<html dir="rtl">` is active.
- **Directional icons that flip meaning** (back/forward, expand/collapse):
  use the `<DirIcon ltr={IconA} rtl={IconB} />` helper from
  `src/components/ui/dir-icon.tsx`.
- **Purely decorative arrows on "next" buttons:** prefer the Tailwind
  modifier `rtl:rotate-180` over `<DirIcon>` — it's lighter.
- **Animations using `translateX`:** read `dir` from `useLocale()` and flip
  the sign in RTL so items still emerge from the leading edge. See
  `RegistryCarousel` in `src/components/home/home-screen.tsx`.
- **Keyboard ArrowLeft/ArrowRight:** in RTL, ArrowLeft = forward. See
  the `dir`-aware key handler in `src/components/onboarding/tour/tour-modal.tsx`.
- **Per-block auto-direction:** `unicode-bidi: plaintext` + `text-align: start`
  on `.tiptap` / `.registry-prose` block elements means each paragraph
  picks its direction from its first strong character. Layered with
  `dir="auto"` on Tiptap block nodes via the `AutoDirection` extension.

## Agent locale propagation

`createConversation()` in `src/lib/agents/conversation-client.ts` reads
the user's locale from `localStorage` and adds it to every POST to
`/api/agents/conversations`. The server route in
`src/app/api/agents/conversations/route.ts` threads it into the prompt
builders in `src/lib/agents/conversation-runner.ts`, which inject a
"Respond in {{language}}" system instruction near the top of the prompt.
This is how agents reply in Hebrew when the UI is in Hebrew.

When `writePage()` (`src/lib/storage/page-io.ts`) saves a note without
explicit `dir` in frontmatter, it auto-detects Hebrew Unicode range
(U+0590–U+05FF) in the first ~600 chars and defaults `dir: rtl` when
Hebrew letters dominate. Explicit frontmatter `dir` always wins.

## What is intentionally not translated

- **Brand mark `cabinet`** — Latin script, kept in both locales. Renders
  in Cardo italic when `<html dir="rtl">`.
- **Keyboard shortcuts** (⌘K, ⌘[, ⌘]) — inline, no translation needed.
- **Provider identifiers** (`gemini-cli`, `claude-code`, etc.) — code, not
  prose.
- **Starter team names** in `src/lib/onboarding/rooms.ts` (`Cold Email
  Agency`, `SEO War Room`, etc.) — these are SaaS jargon brand-names and
  rarely have natural Hebrew equivalents. Open to revisiting if a Hebrew
  speaker wants to redesign.
- **The dictionary-card intro** in `IntroStep` (English wordplay on
  "cabinet"). The CTA + tagline translate; the dictionary stays English.
- **Auto-update prompt text** — sourced from `update-electron-app`.
