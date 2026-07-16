# Templates and Library rework — design

**Date:** 2026-07-16
**Status:** Approved, pending implementation plan
**Priority:** Lowest of the three current specs — deliberately sequenced after
[onboarding trim](./2026-07-16-onboarding-trim-design.md) and
[update-dialog](./2026-07-16-update-dialog-never-block-design.md).
**Scope:** Taxonomy, naming cleanup, discoverability, and pre-install preview. Backfilling metadata
on existing entries is explicitly **out of scope** (see Follow-ups). Taxonomy follows
[ADR-0003](../../adr/0003-templates-create-cabinets-libraries-extend-them.md).

## Context

Three systems share the words "template" and "library":

1. **Registry templates** — whole pre-built Cabinets in `github.com/cabinetai/cabinets`
   (`src/lib/registry/registry-manifest.ts`, `RegistryTemplate` `:22-34`), imported via
   `POST /api/registry/import`, surfaced by the Home carousel (`home-screen.tsx`, `RegistryCarousel`
   `:242`, fetch `:660`) and `registry-browser.tsx`.
2. **Agent Library** — 43 personas (verified 2026-07-16) as `persona.md` files under `src/lib/agents/library/<slug>/`,
   added via `POST /api/agents/library/[slug]/add`, surfaced by `LibraryDialog`
   (`agent-list.tsx:82`), `new-agent-dialog.tsx`, and `use-agent-picker.ts`.
3. **Cabinet Guide** — markdown docs seeded into every Cabinet from `resources/getting-started/` by
   `seedGettingStartedDir` (`cabinet-scaffold.ts:85`, called `:176`).

Plus a **Job Library** (`src/lib/jobs/job-library.ts`, `JOB_LIBRARY_TEMPLATES` `:11`) which has an
API (`/api/jobs/library`) but **no frontend consumer at all**, and a **Skill Library**
(`skill-library.tsx`).

The word "template" therefore means three different things in code, and "getting started" means two.

## Verified facts

Everything in this section was confirmed firsthand against the code on 2026-07-16, not inherited from
the previous draft. Several of the previous draft's claims were **wrong** — see Corrections.

**Seed resolution is dev-only. This is the single most important finding in this spec.**

- `PROJECT_ROOT = process.cwd()` (`src/lib/runtime/runtime-config.ts:5`). It is *not* derived from
  `app.getAppPath()`, `process.resourcesPath`, or `__dirname`.
- `resolveGettingStartedSeedDir` (`cabinet-scaffold.ts:61-83`) resolves
  `path.join(PROJECT_ROOT, "resources", …)` (`:73`, `:76`).
- `electron/main.cjs` spawns the Next standalone server via `spawnBackend` (`:256-260`) with
  **no `cwd` option** — it inherits the Electron main process's cwd, which for a launched `.app`
  bundle is not the app root.
- `.next/standalone` contains **no `resources/` directory** (verified on disk). Next's output
  tracing never sees `resources/` because it is only referenced through a runtime `path.join`.
- **Therefore `seedGettingStartedDir` is a silent no-op in packaged Electron builds today.** It
  returns `null` from the resolver and exits at `:90-92`. Per-Cabinet guide seeding works in `npm run
  dev` and in the test suite, and nowhere else.

**Packaged builds seed by a completely different mechanism:**

- `scripts/prepare-electron-package.mjs:246-282` (`stageSeedContent`) copies
  `resources/getting-started` → `.next/standalone/.seed/getting-started` (`:252`), and
  `src/lib/agents/library` → `.seed/.agents/.library` (`:259-262`).
- `electron/main.cjs:385-407` (`seedDefaultContent`) copies `.seed/*` into `managedDataDir`
  non-destructively at boot.
- Net effect: packaged installs get **one** `getting-started/` at the **data root**, not one per
  Cabinet. Dev installs get one per Cabinet. These two behaviours have silently diverged.
- The same pattern explains `SOURCE_AGENT_LIBRARY_DIR` (`library-manager.ts:14-20`,
  `PROJECT_ROOT/src/lib/agents/library`): `src/` is both in `PACKAGER_IGNORE`
  (`forge.config.cjs:26`) and in `STANDALONE_PRUNE_PATHS` (`prepare-electron-package.mjs:44`), so in
  packaged builds only `SEEDED_AGENT_LIBRARY_DIR` (`DATA_DIR/.agents/.library`) ever resolves.

**`resources/getting-started-he` is never packaged.** `stageSeedContent` (`:251-256`) copies only the
literal `"getting-started"`. The locale-specific seed directory that
`resolveGettingStartedSeedDir:70-75` looks for does not exist in any packaged build. Pre-existing bug,
independent of this work.

**Seeding is idempotent at file level, but unconditional.** `copyDirectoryMerge`
(`cabinet-scaffold.ts:39-59`) skips any destination file that already exists (`:52-54`).
`scaffoldCabinet` calls `seedGettingStartedDir` unconditionally on every invocation (`:176`) — there
is no "already seeded" marker. `resolveGettingStartedSeedDir:79` also guards against source ==
destination self-copy. So re-scaffolding an existing Cabinet restores guide files the user deleted,
but never overwrites files the user edited.

**Import is already transactional on its error paths.** The previous draft's "possible bug" is
largely already fixed:

- `github-fetch.ts:86-112` wraps the whole download loop in `try/catch` and calls
  `fs.rm(targetDir, { recursive: true, force: true })` on any failure (`:109-112`).
- `import/route.ts:62-86` wraps every post-download step (manifest rewrite, `.cabinet-state`,
  guide seed) in `try/catch` with the same teardown (`:82-86`).
- Failures *before* `fs.mkdir` (rate limit `:44-51`, unknown slug `:77-79`) create nothing.

**`/api/registry/[slug]` already returns full contents, and RegistryBrowser already renders them.**
`GET /api/registry/[slug]` (`[slug]/route.ts:238-254`) returns `slug`, `meta`, `agents[]`
(name/slug/emoji/type/department/role/heartbeat), `jobs[]`
(id/name/description/ownerAgent/enabled/schedule), `children[]`, `readme`, `readmeHtml`, `tags`,
`domain`, `coverUrl`, and `stats` (`totalAgents`/`totalJobs`/`totalCabinets`). It builds these by
walking the GitHub contents API (`fetchAgents:124`, `fetchJobs:139`, `findChildCabinets:152`).
`registry-browser.tsx:550` already fetches it into `RegistryDetail` (`:77-89`) and renders an org
chart. **No manifest change is needed for preview, and preview is not net-new — it exists.**

**`/api/registry/import` `targetPath` is a *parent* path, not a destination.** `route.ts:44-46`
computes `virtualPath = targetPath ? \`${targetPath}/${dirName}\` : dirName`, then `:49-57` returns
**409** if the resolved directory already exists. There is no code path that scaffolds *into* an
existing directory.

**Locale reality: 40 locales, not two.** `src/i18n/locales/` holds `en` plus 39 others (`ar bn cs de
el es fa fil fr gu ha he hi hu id it ja kn ko ml mr nl pa pl pt ro ru sv sw ta te th tr uk ur vi yo
zh-CN zh-TW`). `npm run i18n:check` and `npm run i18n:translate` exist to gate and fill them.

## Corrections to the previous draft

Each of these was asserted in the prior revision and is false:

1. **"`GETTING_STARTED_DIRNAME` rename only affects seeded content in existing installs."** The
   rename's real blast radius is the **packaging script**, which hardcodes the string `"getting-started"`
   twice at `prepare-electron-package.mjs:252` — and `copyDirectory:133-141` **silently returns when the
   source is missing**. Renaming `resources/getting-started/` without touching that line produces a
   green build that ships a package with no guide seed. See Risks.
2. **"`/api/registry/[slug]` … Users import blind."** Half true. `RegistryBrowser` has had a full
   preview (org chart, agent list, job list, README) since before this spec. Only the **Home
   carousel** imports blind (`home-screen.tsx:1001-1010` → import dialog `:370-400`, which shows
   name + counts only).
3. **"The registry section … today it is only reachable via the Home carousel's `Browse all →`."**
   There are **two** existing entry points, both in `home-screen.tsx`: the `Browse all →` link
   (`:995-999`) and a `Browse templates` workspace tile (`:871-879`). Both call
   `setSection({ type: "registry" })`.
4. **"The only callers [of `/api/agents/library`] are `agent-list.tsx:94` and
   `new-agent-dialog.tsx:65`."** There is a **third**: `use-agent-picker.ts:27`, which reads
   `data.templates` at `:30` and feeds `new-cabinet-dialog.tsx:176` and the onboarding wizard. The
   conclusion (internal rename, no deprecation window) still holds; the regression surface is 50%
   larger than stated.
5. **"`LibraryTemplate` interface (`agent-list.tsx:18`)."** `LibraryTemplate` is declared **three
   times independently** — `agent-picker.tsx:16` (exported), `agent-list.tsx:18`,
   `onboarding-wizard.tsx:1371` — plus a fourth structural clone named `AgentTemplate`
   (`new-agent-dialog.tsx:16`).
6. **Line numbers.** `RegistryTemplate` is `:22-34` (not `:22-35`); its counts are `:30-32` (not
   `:30-31`); `RegistryCarousel` is `:242` (not `:240`); the registry fetch is `:660` (not `:600`);
   `Browse all →` is `:992-999` (not `:928-938`). `app-shell.tsx:113-116`, `:831`, `:461-462` are
   correct.

## The taxonomy

The boundary is **the action**, not the size of the thing:

- **Template** → `POST /api/registry/import` **scaffolds a new Cabinet** on disk. A *bootstrap*.
- **Library** → `POST /api/agents/library/[slug]/add` **copies one part into an existing Cabinet**.
  An *extend*.

| Moment | User wants | System |
| --- | --- | --- |
| Brand-new, empty app | "give me a working setup fast" | Template |
| Has a Cabinet, needs an SEO specialist | "add one more agent" | Library |
| Has a Cabinet, wants a weekly report | "add a scheduled job" | Library |

A single merged "Gallery" was considered and rejected: it hides the one distinction that matters at
click time — *does this create a Cabinet, or add to the one I'm in?* See ADR-0003.

## Design

### 1. Naming cleanup

"Template" must mean a whole Cabinet everywhere, in code and copy. This is the complete list —
grepped, not sampled.

**Agent Library — code:**

| Current | Becomes |
| --- | --- |
| `resolveAgentTemplateDir()` (`library-manager.ts:51`) | `resolveLibraryAgentDir()` |
| `getTemplateRecommendedSkills()` (`library-manager.ts:71`) | `getLibraryAgentRecommendedSkills()` |
| local `templateDir` (`library-manager.ts:55,56,60,75,76,77,139,140,147,156,157,159`) | `libraryAgentDir` |
| `import { resolveAgentTemplateDir }` + `templateDir` (`api/agents/library/[slug]/add/route.ts:6,29,30,49`) | follow rename |
| `import { getTemplateRecommendedSkills }`, `templateRecs` (`api/agents/personas/[slug]/route.ts:16,56`) | `getLibraryAgentRecommendedSkills`, `libraryRecs` |
| local `templateDir` (`api/cabinets/create/route.ts:109,113,131`) | `libraryAgentDir` |
| local `templateDir` (`api/onboarding/setup/route.ts:251,255,275`) | `libraryAgentDir` |
| doc comments saying "library template" (`library-manager.ts:64-69,128,141,144`) | "library agent" |

**Agent Library — API + types:**

| Current | Becomes |
| --- | --- |
| `/api/agents/library` response key `templates` (`route.ts:11,15,24,38,40`) | `agents` |
| `LibraryTemplate` (`agent-picker.tsx:16`, **exported**) | `LibraryAgent` |
| `LibraryTemplate` (`agent-list.tsx:18`) | `LibraryAgent` — **collapse into the `agent-picker.tsx` export** |
| `LibraryTemplate` (`onboarding-wizard.tsx:1371`) | `LibraryAgent` — collapse into the same export |
| `AgentTemplate` (`new-agent-dialog.tsx:16,47,72,137`) | `LibraryAgent` — collapse into the same export |
| `templates` state + `setTemplates` (`use-agent-picker.ts:19,34`; `agent-list.tsx:90,96,115`; `new-agent-dialog.tsx:47,72`) | `libraryAgents` |
| `data.templates` reads (`use-agent-picker.ts:30`; `agent-list.tsx:96`; `new-agent-dialog.tsx:72`) | `data.agents` |
| `libraryTemplates` prop (`agent-picker.tsx:79`; passed `new-cabinet-dialog.tsx:176`) | `libraryAgents` |
| `templates` prop (`agent-picker.tsx:55`; `onboarding-wizard.tsx:1382`) | `libraryAgents` |

The four duplicate interfaces are structurally near-identical (`agent-list.tsx`'s adds `description`;
`new-agent-dialog.tsx`'s is named differently). Collapsing them to one exported `LibraryAgent` in
`agent-picker.tsx` is part of this work — renaming four copies in place would entrench the duplication.

**Job Library:**

| Current | Becomes |
| --- | --- |
| `JobLibraryTemplate` (`job-library.ts:1,11`) | `JobLibraryEntry` |
| `JOB_LIBRARY_TEMPLATES` (`job-library.ts:11`; `api/jobs/library/route.ts:2,5`) | `JOB_LIBRARY_ENTRIES` |
| `/api/jobs/library` response key `templates` (`route.ts:5`) | `jobs` |

**Cabinet Guide: not renamed. Cut from scope (decision, 2026-07-16).**

The `resources/getting-started/` → `resources/cabinet-guide/` rename and every identifier that
follows it (`GETTING_STARTED_DIRNAME`, `resolveGettingStartedSeedDir`, `seedGettingStartedDir`, the
packaging-script strings) are **out of scope**. The trade is bad:

- It can **silently ship a broken package** — `prepare-electron-package.mjs:252` hardcodes the
  string and `copyDirectory:133-141` returns silently on a missing source, so the failure surfaces
  as a green build with no guide seed. See Risks.
- The seeder it renames is **already a no-op in packaged builds** (see Verified facts), so the
  rename churns code whose production behaviour is already broken by a separate defect.
- It is the **least valuable** part of the naming cleanup. The "template" overload is what confuses
  users and developers; "getting started" naming a docs directory confuses nobody today.

The glossary term **Cabinet Guide** still stands (see `CONTEXT.md`) — it is what we *call* the thing
in prose. The directory keeps its current name until the seeding divergence below is fixed, at which
point renaming becomes cheap and safe. Recorded as a follow-up, not a decision to revisit casually.

**Must NOT be renamed:**

- `RegistryTemplate` (`registry-manifest.ts:22`), `FALLBACK_TEMPLATES` (`:89`),
  `getRegistryTemplates` (`:215`), and the `/api/registry` response key `templates`
  (`api/registry/route.ts:13,15`) — genuine templates under the new taxonomy.
- `registryTemplates` / `setRegistryTemplates` / `importTemplate` (`home-screen.tsx:612,663,1002`)
  and `templates` in `registry-browser.tsx:899` — same.
- `home.templates.header` / `home.templates.browseAll` i18n keys — registry templates.
- `test/conversation-output-cleaning.test.ts:58` ("cabinet template placeholders") — unrelated
  prompt-echo parsing.
- `src/lib/agents/mcp-catalog.ts:431,886,1378` — external `docs.astral.sh/uv/getting-started/` URLs.
- `test/hash-route.test.ts:21,24,28,30` — hash-parsing fixtures that happen to use the string
  `getting-started` as an arbitrary page path. Harmless; renaming them is optional cosmetics.

**Verified (2026-07-16):** `/api/agents/library` and `/api/jobs/library` have no consumers outside
`src/` — `cli/`, `mcps/`, `server/`, `cabinetai/`, `e2e/`, and `test/` are all clean. Both response-key
renames are internal, not breaking API changes, and need no deprecation window.

**Verified (2026-07-16):** `/api/jobs/library` has no frontend consumer at all, so the Job Library
empty-state card below is net-new UI rather than a re-wire.


### 2. Discoverability

**Empty-state cards** — the point of highest intent. A Cabinet section with nothing in it shows an
inline card rather than blank space:

- No agents → "＋ Add from Agent Library" → opens `LibraryDialog` (`agent-list.tsx:82`)
- No jobs → "＋ Add from Job Library" → **requires building the Job Library's first frontend
  surface**, since `/api/jobs/library` has no consumer today. This is net-new UI, not a re-wire.

**Templates sidebar entry** — a labelled rail entry in `sidebar.tsx`, modelled on the Integrations
entry (`:279-311`: comment `:279-281`, wrapper `:282`, button `:283-310`), navigating to
`section.type: "registry"`. That section already exists and renders `RegistryBrowser`
(`app-shell.tsx:113-116`, `:831`, title `:461-462`).

Note this is a **third** entry point to a surface that already has two (`home-screen.tsx:995-999`
`Browse all →`, and the `Browse templates` tile `:871-879`). The justification is placement, not
absence: both existing entries live on Home, which a user in a Cabinet never sees. The sidebar is the
only always-present rail. Use `t("sidebar:templates", { defaultValue: "Templates" })` to match the
existing pattern at `:303`.

**Home carousel** — unchanged.

### 3. Preview before install

Corrected scope: preview already exists in `RegistryBrowser`. The gap is the **Home carousel**, whose
import dialog (`home-screen.tsx:370-400`) shows only a name field, and whose cards show only
`agentCount` / `jobCount` / `childCount` (`registry-manifest.ts:30-32`).

The Home carousel card expands to show what you actually get:

> **Marketing agency** — CEO, Copywriter, SEO Specialist · 1 job (weekly report) · 3 knowledge pages

**Decision: lazy-fetch on card expand** via the existing `GET /api/registry/[slug]`. It returns
everything needed (`agents[].name`, `jobs[].name`, `stats.totalCabinets`) with **no manifest change**
and no coordination with the `cabinetai/cabinets` repo. Expanding a card is an explicit user action
where a brief load is acceptable.

Reuse `registry-browser.tsx`'s `RegistryDetail` type (`:77-89`) — lift it to a shared module rather
than declaring a second copy. The stale-slug-as-loading pattern at `:530-537` is the reference
implementation; copy its shape.

The rejected alternative — extending `manifest.json` with a contents summary and bumping
`schemaVersion` (`registry-manifest.ts:50`) — would make the carousel faster but couples this work to
a second repository. Revisit only if expand latency proves bad in practice.

Fall back to counts when contents cannot be fetched. The offline path matters: `getRegistryTemplates`
(`:215-233`) falls back to `FALLBACK_TEMPLATES` (`:89-202`), and every fallback entry has
`coverUrl: null` and real counts — so counts are always available even when `/api/registry/[slug]`
(which has no fallback and 500s, `[slug]/route.ts:255-258`) cannot answer.

### 4. Metadata, going forward only

New and updated templates get a proper cover, a clear one-line description, and searchable tags.
Existing personas and older registry entries are **not** backfilled in this work. They need review,
and that review is a separate effort.

### 5. Onboarding integration

Onboarding's step 4 always creates a **blank** Cabinet. The template option appears **after**
onboarding, in the repurposed tour tail: alongside "create your first agent", an "or start from a
template instead" path that imports a pre-built Cabinet.

This is the seam with the onboarding spec, which ships the manual path first.

Importing a template creates a *new* Cabinet — consistent with the taxonomy — which collides with the
blank Cabinet the wizard just created. **Decision: when the tour tail's template path runs and the
wizard's Cabinet is still empty (no agents, no jobs), the import targets that Cabinet in place rather
than creating a second one.** The user named it during onboarding; that name is kept and the
template's contents are scaffolded into it. A stray empty Cabinet must never be left behind.

Outside the tour tail (sidebar, Home carousel), import keeps its normal behaviour: always create a new
Cabinet.

**This is not expressible with today's route and needs real work.** Verified against
`import/route.ts`:

- `targetPath` is a **parent**, not a destination: `virtualPath = targetPath ? \`${targetPath}/${dirName}\` : dirName` (`:44-46`). Passing the wizard's Cabinet as `targetPath` nests a *child* Cabinet inside it — not the intent.
- `:49-57` returns **409** when the resolved directory exists. The wizard's Cabinet always exists.
- `downloadRegistryTemplate` writes into a directory it created and, on failure, **`fs.rm`s that
  directory wholesale** (`github-fetch.ts:109-112`). Pointed at an existing Cabinet, a mid-download
  failure would delete the user's Cabinet, its name, and anything already in it. This is the sharpest
  edge in the whole spec.

Required shape:

1. Add a distinct request field — `intoPath?: string`, **not** an overload of `targetPath` — meaning
   "merge into this existing Cabinet". Mutually exclusive with `targetPath`; reject both together
   with 400.
2. When `intoPath` is set, skip the `:49-57` existence check, and **verify emptiness server-side**
   (no entries in `.agents/`, no entries in `.jobs/`). Do not trust a client-side "is it empty" check.
   Non-empty → 409 with a distinct error code so the caller falls back to creating a new Cabinet.
3. Download to a **temp directory** first, then merge into the target. The merge must use
   `copyDirectoryMerge` semantics (`cabinet-scaffold.ts:39-59`, skip-existing) so the wizard's
   `.cabinet` manifest and `index.md` survive.
4. Rollback must remove only the **temp directory**, never `intoPath`. Guard this explicitly — the
   current teardown is a `recursive: true, force: true` rm of the caller-supplied path.
5. Preserve the wizard's Cabinet name: skip the manifest name rewrite (`:63-74`) in `intoPath` mode.

Given (3) and (4), reworking `downloadRegistryTemplate` to always stage to temp and merge on success
is the cleaner path, and it fixes the crash-safety gap below for the normal flow too.

## Error handling

- **Registry unreachable** → existing bundled-fallback behaviour is preserved
  (`registry-manifest.ts:224-227`); preview degrades to counts.
- **Import fails midway** → **already handled for in-process errors.** `github-fetch.ts:109-112` and
  `import/route.ts:82-86` both tear down `targetDir` on throw. Three real gaps remain:
  1. **Not crash-safe.** A process kill or power loss mid-download leaves a partial directory, and
     the `:49-57` existence guard then blocks every retry with a 409 the user cannot clear from the
     UI. Staging to a temp dir and renaming into place on success fixes this and is the same change
     needed for `intoPath`.
  2. **Teardown is best-effort.** Both rollbacks end in `.catch(() => {})`. If the `rm` fails, the
     partial install is permanent and 409s forever.
  3. **Destructive by design.** The rollback rms the whole target path — safe only because that path
     is always newly created today. `intoPath` breaks that invariant. See §5.4.

  The tour-tail path makes import a first-run experience, so (1) is worth fixing within this work.
- **Empty-state card with a failing library fetch** → show the card with an error and a retry, not a
  blank section. Note `/api/agents/library` currently swallows all errors and returns
  `{ templates: [] }` with **HTTP 200** (`route.ts:39-41`), which is indistinguishable from a
  genuinely empty library. Return a 500 on read failure, or the retry affordance can never trigger.

## Risks

**Why the `resources/getting-started/` rename was cut.** Recorded here because the reasoning is the
risk, and a future reader will otherwise assume the rename was simply forgotten.

Renaming that directory fails *silently* — no build error, no test failure, no lint error:

- `prepare-electron-package.mjs:252` hardcodes the string `"getting-started"` as both source and
  destination.
- `copyDirectory` (`:133-141`) opens with `if (!(await pathExists(fromPath))) return;` — a missing
  source is a **no-op**, not an error.
- So `mv resources/getting-started resources/cabinet-guide` produces a green `npm run electron:make`
  that ships a `.seed` with no guide content. Users get a Cabinet with no docs. Nothing in CI catches
  it.
- Precedent that this drift is already happening: `:253` copies
  `resources/example-cabinet-carousel-factory`, which **does not exist** in `resources/`. It has been
  silently skipping for some time.

A disciplined implementer could mitigate this (update `:252` in the same commit; add a
`copyDirectoryRequired()` that throws; assert the seed exists in `test:bundle`). We are still not
doing it, because the mitigation cost is real and the payoff is the least valuable rename in this
spec. Revisit only after the seeding divergence below is fixed — at which point the rename is cheap.

**Secondary risk this cut also avoids: double guide directories on re-scaffold.** `scaffoldCabinet`
calls the seeder unconditionally (`:176`), and `copyDirectoryMerge`'s skip-existing protection
(`:52-54`) is keyed on the *destination file path*. Had the directory been renamed, an existing
Cabinet that gets re-scaffolded (`skipExisting: true` re-onboarding via
`api/onboarding/setup/route.ts:182`, or `api/cabinets/create/route.ts:85`) would receive a **second**
guide directory alongside its existing `getting-started/`. Any future attempt at this rename must
guard the seeder against a legacy `getting-started/` already present in the target.

**The dev/packaged seed divergence is a real production bug, pre-existing and out of scope.**
Per-Cabinet seeding works only in dev; packaged builds seed once at the data root via a different
mechanism. This spec does **not** fix it, and cutting the rename does not make it go away — it only
stops this spec from building on top of it.

It needs its own issue, because: (a) any test of `seedGettingStartedDir` passes in CI while proving
nothing about packaged behaviour, and (b) a reader will otherwise assume the function runs in
production. It is also the blocker that makes the rename expensive — fix the divergence first and
the rename becomes a cheap follow-up.

## Testing

- Unit: renames are mechanical — rely on the typechecker, plus a grep gate in CI asserting
  `template`/`Template` never appears in `src/lib/agents/library-manager.ts`,
  `src/lib/jobs/job-library.ts`, `src/app/api/agents/library/**`, or `src/app/api/jobs/library/**`.
  The gate must allowlist `src/lib/registry/**`, `src/components/registry/**`, and the registry
  identifiers in `home-screen.tsx`. `src/lib/storage/cabinet-scaffold.ts` is **not** in scope — the
  guide rename was cut (see Risks).
- Component: empty-state cards render and route correctly for agents and jobs.
- Component: Home carousel card expand shows contents; falls back to counts on `/api/registry/[slug]`
  failure.
- API: `POST /api/registry/import` with `intoPath` merges into an empty Cabinet, preserves its
  `.cabinet` name, and **leaves it intact when the download fails**. This is the regression test for
  the destructive-rollback edge.
- API: `POST /api/registry/import` with `intoPath` pointing at a non-empty Cabinet returns 409.
- E2E: sidebar Templates entry → `RegistryBrowser` → import → lands in the new Cabinet.
- Regression: all three `/api/agents/library` consumers (`use-agent-picker.ts:27`, `agent-list.tsx:94`,
  `new-agent-dialog.tsx:65`) work against the renamed `agents` response key.

## i18n

Smaller than the previous draft implied: **no existing key needs renaming.** Verified against
`en.json`:

- `home.templates.header` ("Start from a template") / `home.templates.browseAll` — registry
  templates. Correct under the new taxonomy. Keep.
- `agentList.agentLibrary` ("Agent Library"), `agents.dialog.searchLibraryPlaceholder`,
  `agents.dialog.errorLoadLibrary`, `agents.workspace.browseLibrary` — already correct. Keep.
- `onboarding.blueprint.rooms.library` ("Library") — a Room archetype, unrelated. Keep.

New keys required: `sidebar.templates`, plus the agent and job empty-state card strings. All new
strings must land in `en.json` and propagate to the **39 other locales** (not just `he` — the previous
draft assumed a two-locale repo). `he.json` already carries `home.templates` and `agentList`, so the
existing translation pipeline covers this; run `npm run i18n:check` to gate and `npm run i18n:translate`
to fill.

Copy constraints from `CLAUDE.md`: no em-dashes in user-facing strings (rule 17), no `Sparkles`
decoration (rule 19).

## Follow-ups (out of scope)

- **Backfill/review of existing template + persona metadata.** Explicitly deferred — the existing
  personas and older registry entries need a content review that is its own effort.
- **Fix the dev/packaged seed divergence** (`PROJECT_ROOT = process.cwd()` never resolves in packaged
  builds, so per-Cabinet guide seeding is dev-only). Own issue, and the prerequisite for the rename
  below.
- **Ship `resources/getting-started-he` in packaged builds.** `stageSeedContent` copies only the
  literal `"getting-started"`. Own bug — no longer folded into this work now that the rename is cut.
- **Rename `resources/getting-started/` → `resources/cabinet-guide/`.** Cut from this spec as
  production-breaking for too little value (see Risks). Revisit once the divergence above is fixed;
  it must also update `prepare-electron-package.mjs:252` and guard against double guide directories.
- **Make `stageSeedContent` fail loudly on a missing required seed.** `copyDirectory:133-141`
  silently returns, which is why the rename is dangerous — and why `:253` has been skipping a
  nonexistent `resources/example-cabinet-carousel-factory` unnoticed. Worth fixing on its own merits.
- Pruning or rewriting weak Agent Library personas.
- Filling missing use-case templates ("Solo founder", "Content studio", "Customer support").
- A central Library hub with tabs — rejected for now in favour of point-of-need empty states.
