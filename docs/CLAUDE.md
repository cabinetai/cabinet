# CLAUDE.md — Cabinet

## What is this project?

Cabinet is an AI-first self-hosted knowledge base and startup OS. Durable knowledge lives as markdown files and assets on disk; local SQLite stores structured runtime, chat, activity, job-run, and index state. The web UI provides WYSIWYG editing, a collapsible tree sidebar, drag-and-drop page organization, structured AI runs, Hermes-first operator surfaces, and interactive `WebTerminal` sessions.

**Core philosophy:** Humans define intent. Agents do the work. The knowledge base is the shared memory between both.

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **UI:** Tailwind CSS + shadcn/ui (base-ui based, NOT Radix — no `asChild` prop)
- **Editor:** Tiptap (ProseMirror-based) with markdown roundtrip via HTML intermediate
- **State:** Zustand (tree-store, editor-store, ai-panel-store, task-store, app-store)
- **Local structured state:** better-sqlite3 at `<data-dir>/.cabinet.db`
- **Fonts:** Inter (sans) + JetBrains Mono (code)
- **Icons:** Lucide (no emoji in system chrome)
- **Markdown:** gray-matter (frontmatter), unified/remark (MD→HTML), turndown (HTML→MD)
- **AI runtimes:** Cabinet mode uses Claude Code, Codex CLI, Cursor CLI, OpenCode, Copilot CLI, Grok CLI, Pi, and a generic CLI adapter through `src/lib/agents/`. Hermes mode uses the `hermes_runtime` adapter and server-only clients in `src/lib/hermes/`.

## Architecture

```
src/
  app/api/tree/              → GET tree structure from /data
  app/api/pages/[...path]/   → GET/PUT/POST/DELETE/PATCH pages
  app/api/upload/[...path]/  → POST file upload to page directory
  app/api/assets/[...path]/  → GET/PUT static file serving + raw file writes
  app/api/search/            → GET full-text search
  app/api/agents/conversations/ → Manual task/conversation creation + listing
  app/api/agents/providers/  → Provider, model, adapter metadata
  app/api/agents/tasks/      → Task board data
  app/api/agents/scheduler/  → Scheduler control/status
  app/api/agents/skills/     → Skill library: list/CRUD, import (github/skills.sh/local), bundle-into-cabinet, audits, scan, catalog
  app/api/hermes/            → Health, cockpit, sessions/runs, management, capabilities, and governed interventions
  app/api/git/               → Git log, diff, commit endpoints
  stores/                    → Zustand (tree, editor, ai-panel, task, app)
  components/sidebar/        → Tree navigation, drag-and-drop, context menu
  components/editor/         → Tiptap WYSIWYG + toolbar, website/PDF/CSV/office viewers
  components/editor/office/  → Read-only viewers for .docx, .xlsx, .pptx
  components/tasks/          → Task board + task detail panel
  components/agents/         → Agents workspace + live/result conversation views
  components/hermes/         → Today cockpit, Control Center, live modules, runtime interventions
  components/terminal/       → xterm.js web terminal
  components/composer/       → Shared composer + task runtime picker (supports @page, @agent, @skill mentions)
  components/skills/         → Skill library, detail page, add dialog, picker, "Skills offered" transcript footer
  components/search/         → Cmd+K search dialog
  components/layout/         → App shell, header
  lib/storage/               → Filesystem ops (path-utils, page-io, tree-builder, references)
  lib/markdown/              → MD↔HTML conversion
  lib/git/                   → Git service (auto-commit, history, diff)
  lib/agents/                → Adapter runtime, conversation runner, personas, providers
  lib/agents/skills/         → Five-origin loader, trust classification, sync (mount/symlink), discovery scan, lock file
  lib/hermes/                → Hermes clients, contracts, projections, readiness, evidence, and safety boundaries
  lib/jobs/                  → Job scheduler (node-cron)
server/
  cabinet-daemon.ts          → Unified daemon: structured adapter runs, PTY sessions, scheduler, event bus
  pty/                       → PTY session module: ansi, claude-lifecycle, manager, types
data/                        → Managed data directory (KB files plus local runtime/index state)
```

## Key Rules

1. **Markdown is the durable knowledge source; SQLite is local operational state** — pages, personas, jobs, conversations, and artifacts remain inspectable on disk. `<data-dir>/.cabinet.db` stores structured runtime/chat/activity/job-run data and indexes; never describe the project as database-free.
2. **Pages** are directories with `index.md` + assets, or standalone `.md` files. PDFs and CSVs are also first-class content types.
3. **Frontmatter** (YAML) stores metadata: title, created, modified, tags, icon, order
4. **Path traversal prevention** — all resolved paths must start with DATA_DIR
5. **shadcn/ui uses base-ui** (not Radix) — DialogTrigger, ContextMenuTrigger etc. do NOT have `asChild`
6. **Dark mode default** — theme toggle available, use `next-themes` with `attribute="class"`
7. **Auto-save** — debounced 500ms after last keystroke in editor-store
8. **Runtime mode is server-selected** — `CABINET_RUNTIME_MODE` defaults to `cabinet`. Cabinet mode uses structured adapters plus user-selectable terminal mode. Hermes mode enforces `hermes` / `hermes_runtime`, hides legacy runtime controls, and sends execution through Hermes; it must fail visibly rather than silently fall back.
9. **Terminal is first-class in Cabinet mode** — it runs through `server/pty/` and `WebTerminal`. Hermes mode does not use Cabinet terminal execution as a fallback.
10. **Version restore** — users can restore any page to a previous git commit via the Version History panel
11. **Embedded apps** — dirs with `index.html` + no `index.md` render as iframes. Add `.app` marker for full-screen mode (sidebar + AI panel auto-collapse)
12. **Linked repos** — `.repo.yaml` in a data dir links it to a Git repo (local path + remote URL). `src/app/api/system/link-repo/route.ts` writes the link and `src/lib/storage/tree-builder.ts` exposes it in the tree; room boundaries are documented in `docs/ROOMS_WORKSPACES_PRD.md`.
13. **Office documents** — `.docx`, `.xlsx`/`.xlsm`, `.pptx` render inline via dynamically-imported client viewers (docx-preview, SheetJS, pptx-preview). Read-only; "Download" + "Reveal" actions in the viewer header. Legacy binary formats (`.doc`, `.xls`, `.ppt`) keep the Fallback viewer.
14. **Google Workspace pages** — a markdown page with a `google:` frontmatter key (`url`, optional `kind` / `embedUrl`) is rendered by `GoogleDocViewer` instead of the Tiptap editor. The iframe needs "Anyone with the link" or "Publish to Web" on Google's side. OAuth-based sync is not yet implemented.
15. **Skills** — Anthropic-format skill bundles (`SKILL.md` + frontmatter + optional `references/`/`scripts/`/`assets/`). Resolved across five origins with precedence: cabinet-scoped (`data/<cabinet>/.agents/skills/`) > cabinet-root (`<repo>/.agents/skills/`) > linked-repo > system (`~/.claude/skills/`, `~/.agents/skills/`, and discovered Claude plugin marketplaces) > legacy-home (`~/.cabinet/skills/`). Personas reference skills by key in `skills:` (persistent attachment) and `recommendedSkills:` (template defaults shown as preselected toggles in the new-agent flow). The loader derives a descriptive trust level from bundle contents and the UI warns on executable bundles; attaching a skill is currently the trust decision, so there is no runtime trust-policy gate or `.cabinet/skills-trust.json` decision store. Compose `@skill-name` to attach a skill run-only without persisting to the persona. See `docs/SKILLS_PLAN.md` for the as-built contract and remaining gap.
16. **Registry templates come from the cabinets manifest** — the home carousel and the *Cabinets / AI teams, off the shelf* page (`registry-browser.tsx`) read from `https://raw.githubusercontent.com/cabinetai/cabinets/HEAD/manifest.json`, which is auto-built by the `build-manifest.yml` GitHub Action in the [`cabinets`](https://github.com/cabinetai/cabinets) registry on every push. The fetch is cached in-process for 10 minutes (`src/lib/registry/registry-manifest.ts`) and falls back to a small bundled list if offline. Cover images are fetched directly from `…/HEAD/<slug>/cover.jpg`. **Do not** hand-edit registry-manifest.ts to add new cabinets — add them to the registry repo and CI rebuilds the manifest.
17. **No em-dashes in user-facing copy.** Do not use `—` (em-dash, `&mdash;`, U+2014) in UI strings, onboarding/marketing copy, in-app docs, or anything a user reads. Use a period, comma, parentheses, or rewrite. Em-dashes in code comments, commit messages, and internal docs (like this file) are fine. This rule exists because em-dashes read as "AI-written" and we want copy that sounds human.
18. **Connect Knowledge (cloud & local sources)** — per-room knowledge sources live in `<room>/.agents/.config/knowledge-sources.json` (`src/lib/knowledge-sources/store.ts`), NOT a global table. Two surfaces: a per-room cloud **browser** section (`surface: "browser"`, served read-only through the `gdrive:`-prefixed serve/reveal routes) and **inline mounts** (`surface: "inline"`) — a symlink at `treePath` pointing at the provider's desktop-sync folder, recorded with `provider` + `policy`. The tree-builder marks inline mount nodes (`knowledgeProvider`/`knowledgePolicy`) by cross-referencing `getInlineSourceMap()` and propagates policy to descendants. **Read-only is enforced server-side:** `assertWritablePath()` returns 403 for any write *strictly under* a read-only inline mount — add this guard to any NEW file-mutation route (pages/assets/upload already have it). Providers come from `detectProvider()` in `src/lib/google-drive/detect-desktop.ts` (Google Drive, iCloud, OneDrive/SharePoint, Dropbox) reading the local desktop-sync mount, no OAuth. Native `.gdoc/.gsheet` shortcuts are parsed by `src/lib/google-drive/native-docs.ts` (used by the tree-builder + `readPage`) so they render via `GoogleDocViewer` (rule 14). Notion/Confluence are MCP connectors (Integrations Hub), not file sources. Registry: `src/lib/knowledge-sources/providers.ts`. Plan: `docs/CONNECT_KNOWLEDGE_PRD.md`.
19. **No sparkle decoration (✨ / lucide `Sparkles`).** Never add the `✨` emoji or a decorative `Sparkles` icon as "AI flair" (headings, success screens, banners, floating glyphs). It reads as AI-slop and is banned. Use a plain heading, a `Check`, or a relevant icon instead. The lucide `Sparkles` glyph stays ONLY where it's functional iconography the app already relies on: a user-selectable choice in the icon picker / room icons (`icon-catalog.ts`, `room-icons.tsx`), Claude's provider glyph (`provider-glyph.tsx`), or an existing feature tab icon. Do not introduce new decorative uses.

## AI Editing Behavior (CRITICAL)

When Cabinet starts an AI edit or task run:

1. **The request becomes a conversation** with `providerId`, `adapterType`, and optional adapter config such as model or effort.
2. **Detached runs** go through `/api/agents/conversations` → `conversation-runner` → `cabinet-daemon`.
3. **Cabinet mode:** structured adapters are the default; terminal mode (PTY, named `*_legacy` historically) is selectable through the Native / Terminal composer toggle.
4. **Hermes mode:** persona/runtime writes are forced to `hermes` / `hermes_runtime`, provider controls are hidden, and the Hermes bridge owns execution. Terminal fallback is forbidden.
5. **Models should edit targeted files directly when useful** and reflect durable value in KB files, not only transcript text.
6. **If content gets corrupted** — users can restore from Version History (clock icon → select commit → Restore)

The AI panel supports `@` mentions — users type `@PageName` to attach pages as context, `@AgentName` to dispatch to another agent, or `@skill-name` to attach a skill for this run only (does NOT persist to the persona's `skills:` list). Mentioned pages' content is fetched and appended to the prompt; mentioned skills are merged with the persona's skills and mounted via `prepareSkillMount` after origin resolution. The current mount path classifies trust for display but does not enforce a separate approval gate.


## Commands

```bash
npm run dev          # Start Next.js dev server (default: localhost:4000, auto-bumps if busy)
npm run dev:daemon   # Start unified daemon (default: localhost:4100, auto-bumps if busy)
                     #   PTY sessions + structured adapters + scheduler + event bus, under tsx watch
npm run dev:all      # Start both servers
npm run debug:chrome # Launch Chrome with CDP on localhost:9222 for frontend debugging
npm run build        # Production build
npm run lint         # ESLint
npm run skills:sync  # Verify skills-lock.json against on-disk skill bundles (drift report)
```

## Frontend Debugging

Use `npm run debug:chrome` when you need a debuggable browser session. It launches Chrome or Chromium with `--remote-debugging-port=9222`, opens Cabinet at `http://localhost:4000` by default (override by passing a URL as the first argument), and prints the DevTools endpoints:

- `http://127.0.0.1:9222/json/version`
- `http://127.0.0.1:9222/json/list`

This makes it possible to attach over CDP and inspect real DOM, network, and screenshots instead of guessing at frontend state.

## Cabinetai CLI invariants

### Where the npx tools live

Both npm packages ship from this monorepo, not separate repos:

- **`cabinetai/`** — published as [`cabinetai`](https://www.npmjs.com/package/cabinetai). The full CLI: `create`, `run`, `update`, `doctor`, `import`, `list`, `uninstall`, `reset-config`. Built with esbuild from `cabinetai/src/`.
- **`cli/index.cjs`** — published as [`create-cabinet`](https://www.npmjs.com/package/create-cabinet). A thin wrapper that calls `cabinetai create <dir>` and then `cabinetai run` in the new subdir. Pinned to a matching `cabinetai` version via its `dependencies`.

### Safety rules (read before "fixing" anything in the bootstrap path)

1. **`cabinetai/src/lib/scaffold.ts::bootstrapCabinetAt()` refuses to scaffold a cabinet when the resolved target is `os.homedir()` or the filesystem root.** Exits 1 with a friendly message recommending an empty subdir or `--data-dir <empty-dir>`. Covers cwd fallthrough, `--data-dir ~`, and `CABINET_DATA_DIR=~`. See [#71](https://github.com/cabinetai/cabinet/pull/71) (closes [#59](https://github.com/cabinetai/cabinet/issues/59)).

2. **Do NOT "fix" this by relocating `CABINET_HOME`.** That approach was rejected in [#60](https://github.com/cabinetai/cabinet/pull/60) — read the close comment for the full reasoning. The historical ENOTDIR crash was a safety net; removing it without the guard lets `cabinetai run` from `~` silently scribble `.agents/`, `.jobs/`, `.cabinet-state/`, `index.md`, and a `.cabinet` manifest file directly into the user's home directory.

3. **`create-cabinet` (cli/index.cjs) is safe transitively** — `cabinetai create` always scaffolds into `cwd/<slug>` and errors on empty slug (so `.`, `..`, `~`, `$HOME` all bounce). The post-create `cabinetai run` then runs from the new subdir, never HOME. The guard in #71 is defense-in-depth.

4. **When fixing a crash anywhere in the bootstrap/install path, trace what happens *before* the crash.** If the crash is the only thing stopping a worse silent outcome (HOME pollution, data loss, unrecoverable state), fix the root cause upstream instead of removing the crash.

## Progress Tracking

After every change you make to this project, append an entry to `PROGRESS.md` using this format:

```
[YYYY-MM-DD] Brief description of what changed in 1-3 sentences.
```

This is mandatory. Do not skip it. The PROGRESS.md file is the changelog for this project.
