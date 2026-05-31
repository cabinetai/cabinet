# Changelog

All notable changes to Cabinet.

**Legend:** 🟢 New · 🔵 Improved · 🟡 Fixed · 🔴 Removed/Breaking · 🟣 AI & Skills

---

## v0.4.4 · 2026-05-23

The largest release since v0.4.0 (169 commits): Rooms, full internationalization, an Integrations Hub, a mobile layout, and a deep onboarding + tasks rework.

### 🟢 New
- 🟢 **Rooms (workspaces):** a home-button switcher over your top-level cabinets. Each room is a fully isolated cabinet with its own files, agents, tasks, search, theme, icon, and color, so Personal and Work never mix. Per-room theme applies on switch, and "Open in new window" gives each room its own window.
- 🟢 **Internationalization (40 locales) + RTL:** first-run system-locale auto-detection, full right-to-left support (Hebrew end to end, a 108-fix RTL pass), Simplified + Traditional Chinese, a localized brand word, and per-block bidi text in the composer and task panels.
- 🟢 **Integrations Hub:** a visual-first Settings hub for Slack, Discord, and Google over MCP, deployment-aware.
- 🟢 **Mobile layout:** responsive bottom-tab navigation, an AI overlay, and a tour that fits small screens.
- 🟢 **Sidebar overhaul:** a context menu for creating files and folders, linking knowledge (symlinks), file settings, and importing OS folders; inline file search in the Data drawer; renaming a page or folder keeps its wiki-links alive.
- 🟢 **Team page:** tabbed Agents / Routines / Heartbeats / Schedule, with a master on/off switch and per-heartbeat toggles (the Agents drawer is now "Team").
- 🟢 **Tasks:** a recent/running task rail, task chat consolidated into one drawer plus a full page, a Stop button while a run is live, editable inbox drafts, and inline artifact disclosure. The sidebar tree auto-refreshes when a run creates files.
- 🟢 **AI editor drawer:** resizable, animated, pins the open page, and opens with a file-aware greeting after you create a file. In-page find (⌘F) and a live word count in the editor.
- 🟢 **Transparency:** a "where your data lives" view, an onboarding data-location picker, and a feedback popup with a GitHub-star CTA.

### 🔵 Improved
- 🔵 **Onboarding rework:** a new agent picker, reworked provider step, blank-room setup, a heartbeat in the agent step, loading skeletons, a stable layout, step transitions, and a photo-viewer tour step.
- 🔵 **Composer:** file attachments via drag, paste, or pick; an auto-growing textarea; and bidi-aware input.
- 🔵 **Status bar:** a heartbeating green status dot (replacing the task count), back/forward arrows moved into the sidebar header, and warmer stars + Share pills.
- 🔵 **Conversations:** agent tool output is fenced and collapsible, markdown renders properly (no more red-diff bullet lists), and artifact detection is more robust.
- 🔵 **Themes:** theme thumbnails, era-signature styling, and a "match system" mode.
- 🔵 **Search:** a minimal slash-command mode (/theme, /open).

### 🟣 AI & providers
- 🟣 Dynamic model discovery wired end to end for OpenCode and Pi; refreshed model lists across all CLI providers.
- 🟣 Persona prompts template `{{cabinet.name}}` and `{{user.name}}` at build time.

### 🟡 Fixed
- 🟡 **Tasks:** @-mentioning a large binary file (for example a 74MB video) no longer inlines its bytes into the prompt, which used to fail the run and could crash the dev server; new pages, cabinets, and registry imports are created inside the current cabinet (not at the data root); onboarding always provisions the default "editor" agent; the task page loads scoped to its room.
- 🟡 **Onboarding:** the profile uses the name you typed (not your OS username); the email you enter is saved and, with the launch-screen "keep in touch" consent, registered.
- 🟡 **CLI / Electron:** `cabinetai` refuses to bootstrap in `$HOME` or `/` and recommends `~/Documents/Cabinet`; EMFILE recovery and npx-path onboarding; a stable Electron app port across launches.
- 🟡 **Sidebar:** drag-and-drop reorder math and UX, friendly errors and an orphan sweep on cabinet moves, and right-click anywhere in a drawer opens the menu.
- 🟡 **Misc:** link-shared Google Docs/Sheets embed via `/preview` (no sign-in wall); profile hydration loop fixed; remote-host terminal and dev origins; and a large batch of accessibility and UX polish from the pre-release audits.

### 🔴 Changed
- 🔴 **Rooms migration:** `data/` is now a neutral "home" container and each room is a top-level cabinet; the data root is no longer a working cabinet. Existing installs migrate automatically (data is backed up first).
- 🔴 Removed the status-bar page-scoped AI edit composer and the redundant task-page back buttons in favor of sidebar navigation.

### Thanks
Community contributions from @eibrahim (render markdown in AI messages), @alegmal (marquee resume on hover), and @anh-chu (dev-origin and remote terminal fixes).

---

## v0.4.3 — 2026-04-30

First fully working DMG since v0.3.4.

- 🟡 Hardened-runtime entitlements let the daemon load `better-sqlite3` and `node-pty` native modules in signed builds
- 🔵 Website "Download for Mac" links direct to the v0.4.3 DMG (was a waitlist modal)

---

## v0.4.2 — 2026-04-30

- 🟡 Daemon no longer crashes on Electron startup (`createRequire(undefined)` polyfill in esbuild bundle)
- 🟢 Settings → About → "Uninstall Cabinet" (macOS)

---

## v0.4.1 — 2026-04-30

- 🟢 `AgentPicker` dropdown in the home composer with an "Auto" sentinel
- 🔵 Every agent dispatches by default; home shows all 9 quick-action chips
- 🟡 `/api/cabinets/overview` 404 silenced; onboarding font fallback restored

---

## v0.4.0 — 2026-04-30

The biggest release yet — 433 commits since v0.3.4.

- 🟣 **Skills system** — installable agent skills (Anthropic format), tiered trust, `~/.cabinet/skills/`, registry page with live manifests
- 🟣 **Multi-provider runtime (BYOAI)** — 8 CLI providers (Claude, Codex, Gemini, OpenCode, Pi, +3) with shared runtime picker, effort sliders, dynamic `listModels()`, brand icons
- 🟢 **Terminal mode** — persistent shell panel, PTY adapters for all providers, fullscreen Terminal/Details toggle, session resume via stdin injection
- 🟢 **Tasks Board v2** — drag-and-drop with undo, multi-select + bulk delete, density toggle, lane collapse, agent/depth/trigger filters, within-lane reorder, activity feed, awaiting-input markers
- 🟢 **World-class search palette** — `Cmd+K` / `/` opens a 2-pane palette backed by a daemon-side FlexSearch index with live re-indexing
- 🟢 **Onboarding rebuilt** — 3-slide animated tour, blueprint home, staged data reveal, breadcrumb, no flicker
- 🟢 **Help section** — replaces the Tour chip; deep-dive cards per feature, Skills + API Keys demos, keyboard shortcuts
- 🟢 **Agent page v2** — chat-first, color-wash hero, conversations rail, editable identity, 100 famous-figure avatars, sub-task delegation
- 🟢 **Composer & scheduling** — unified Task/Routine/Heartbeat dialog, `WhenChip` with NL parsing, shared `AgentPicker`, drag-paste-pick attachments
- 🟢 **Sidebar redesign** — Cabinet drawer with Data/Agents/Tasks tabs, drag-reorder, OS file import, Recent Tasks list
- 🟢 **Editor upgrades** — text color/highlight, embeds, drag handles, `@` mention picker, inline Lucide icons, heading anchors, folder index toggle
- 🟢 **Notebook viewer** — renders `.ipynb` cells, outputs, and visualizations
- 🟢 **Themes** — Windows 95, Windows XP, Matrix, Apple
- 🟢 **Telemetry & privacy** — anonymous opt-out telemetry, Privacy toggle, `TELEMETRY.md`
- 🟢 **Calm legal/disclaimer flow** — full-screen card, server-side acceptance, ToS + Privacy links
- 🔵 **Cabinet-scoped URLs** — unified hash scheme; legacy paths auto-redirect; sync hidden for non-git cabinets
- 🔵 **Calendar** — off-window event chevrons, editable hours, density slider, deduped multi-cabinet cron events
- 🔵 **Conversations** — multi-turn runs, live chat stream, per-turn runtime + tokens, cold-paint dedup
- 🔵 **Performance** — server FS walk cache, section chunk splitting, cold-paint from localStorage, telemetry off in dev
- 🔵 **Accessibility** — P1/P2 audit pass, focus ring, aria-labels, AT-friendly task card report
- 🔵 **MIT licensed** — `LICENSE` added; `package.json` updated
- 🟡 50+ UX polish fixes from the pre-release audit (avatar tints, breadcrumb, CTA dedup, keyboard shortcuts, `console.log` strip, etc.)

---

## v0.3.4 — 2026-04-15

- 🟡 Last working DMG of the v0.3 line — packaging and runtime stability fixes

---

## v0.3.3 — 2026-04-14

- 🟡 `cabinetai` CLI type errors

---

## v0.3.2 — 2026-04-14

- 🟢 Seed `getting-started` content in newly created cabinets
- 🟡 Tasks no longer stuck on "running" after Claude CLI finishes
- 🔵 CLI uses `npx` prefix consistently in user-facing messages and docs

---

## v0.3.1 — 2026-04-14

- 🟢 `cabinetai uninstall` command (default removes cached app; `--all` removes `~/.cabinet`)
- 🔵 Unified `cabinetai-plan.md` + `CABINETAI_DEPLOYMENT.md` into a single `CABINETAI.md`
- 🔵 Synced `app`, `create-cabinet`, and `cabinetai` packages to 0.3.1

---

## v0.3.0 — 2026-04-13

- 🟢 New `cabinetai` CLI — primary runtime: `create`, `run`, `doctor`, `update`, `import`, `list`
- 🔵 App installs to `~/.cabinet/app/v{version}/`; cabinets are lightweight data dirs anywhere
- 🔵 `create-cabinet` refactored into a thin wrapper around `cabinetai`

---

## v0.2.7 → v0.2.12 — 2026-04-09 to 2026-04-10

- 🟡 npm OIDC trusted publishing fixes (token placeholder, auth flow)
- 🟡 Stale `cabinet-release.json` no longer triggers a false "Update available" prompt
- 🔵 `About` section moved to its own Settings tab with the correct version

---

## v0.2.4 — 2026-04-08

- 🟡 Seed content no longer missing on fresh install

---

## v0.2.1 → v0.2.3 — 2026-04-07 to 2026-04-08

- 🟢 First Electron DMG releases
- 🔵 App icon, bundled seed content, packaging fixes
- 🟡 Claude CLI discovery in packaged app (NVM bin paths)
