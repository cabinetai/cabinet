# Cabinet v0.4.0

The biggest release yet. v0.4.0 ships a complete Tasks Board rewrite, a native terminal runtime, an installable Skills system, eight AI provider adapters, a world-class search palette, and over 50 UX/accessibility fixes from a full pre-release audit.

---

## Terminal Mode

Run any task directly in a real shell — not just through the native Claude API.

- **Persistent shell panel** — bottom or right placement, tabs for multiple sessions, survives navigation
- **Terminal-mode tasks** — tasks can now run in a PTY terminal with streamed output, stop button, status chip with pulsing ring
- **Fullscreen terminal viewer** — Terminal / Details tab toggle inside the task fullscreen view
- **Session resume** — `Continue` reuses the same process via stdin injection; falls back to prompt-level replay for providers that don't support native resume
- **PTY adapters for all 8 providers** — Claude, Codex, Gemini CLI, OpenCode, Pi, and more; each adapter streams cabinet-block metadata, status pill, and overflow menu
- **Legacy adapter continuation** — providers without native session resume get replay output on reconnect

---

## Tasks Board v2

The old board is gone. v2 is now the only board.

- **Drag-and-drop** — reorder cards within lanes; archive/restore with undo toast; destructive drops show inline confirm
- **Keyboard DnD + accessibility** — full keyboard drag support, aria-compliant card reporting
- **Multi-select** — shift/cmd-click to select multiple cards; bulk delete with typed `DELETE` confirmation
- **People rail handoff** — drag cards to the People rail to reassign
- **Density toggle** — compact / comfortable mode, persisted in localStorage
- **Collapse any lane** — not just Archive
- **Mute noisy tasks** — skip "Just Finished" heartbeat runs from the board
- **Persist view + filter** — agent filter and view mode survive refresh
- **Within-lane reorder** — persisted via `boardOrder` field
- **Depth + trigger filters** in the header row; flat list option
- **"Add to Inbox" composer** — full composer dialog with board shortcut hint
- **Activity feed** — rebuilt with three-line task rows: agent pill, status icon, model + time + tokens on the right
- **Thinking indicator** on pending agent turns
- **Structured `<ask_user>` marker** — board surfaces awaiting-input state visually
- **Artifact rows** rendered as KB page cards in task viewer
- **Artifact clicks** scroll+blink the sidebar, infer the right viewer, and offer back-to-task

---

## Skills System

Installable agent skills — Anthropic tool-call format, installed on demand.

- **Skills foundation** — `~/.cabinet/skills/` directory, manifest format, trust tiers
- **Catalog + tmpdir injection** — skills catalog wired for Claude provider; skill content injected into task context at runtime
- **Agent detail Skills field** — editable multiselect of attached skills per agent
- **Task header chip** — shows which skills are attached to the running task
- **Settings preview** — Skills section in Settings shows what's installed in `~/.cabinet/skills/`
- **In-app guidance** — "New skill / Open folder" buttons while the full marketplace is in progress
- **Registry page** — live manifest fetch from GitHub; cover-art carousel cards; unified card style with cover hero on detail page

---

## Multi-Provider Runtime (BYOAI)

Eight CLI providers, all wired to the same runtime picker.

- **Providers** — Claude, Codex, Gemini CLI, OpenCode, Pi (Inflection), and 3 more
- **Shared runtime picker** — Native / Terminal tabs; icon-only inactive tabs; EXPERIMENTAL badge; Discord CTA
- **Effort controls** — model-specific effort slider on Task composer and agent settings
- **Model + effort passthrough** — all 6 remaining providers now receive model and effort through `headless` and `continue` routes
- **Dynamic `listModels()`** — OpenCode and Pi refresh model lists with a 60 s cache
- **In-UI provider verification** — `/providers-demo` page + Troubleshoot button in Settings
- **Provider brand icons** — bundled locally, shown in runtime picker and task header
- **`adapterType` on job configs** — routines and heartbeats can specify which provider to use

---

## Onboarding

A complete rethink of first-run for new users.

- **3-slide "Meet your Cabinet" tour** — animated intro, sidebar-accurate mockup, mocha palette, vivid file-type icons
- **Seamless wizard → app → tour** — no flash between transitions; disclaimer folded into final wizard step
- **Animated home blueprint** — rooms (Study, Lab, Studio, Archive, Vault) wrap the welcome popup as a central patio
- **Staged data reveal** — DATA slide animation sequence with half-duration tweens for snappier feel
- **Home > Room > Cabinet breadcrumb** on cabinet-created screen
- **Tour persistence** — sidebar flicker on cabinet name load fixed; tour state tracked correctly
- **2× faster file-click → viewer reveal** in the data slide

---

## Help Section

Replaced the Tour chip in the status bar with a dedicated Help page.

- **Deep-dive demo cards** for: AI Team, Task Board, Knowledge Base, Cabinets/Nested Teams, Routines & Schedules, Conversations & Approvals, Themes & BYOAI
- **Alternating card layout** — visual and text swap sides every other row
- **Skills + API Keys cards** with guided demos
- **Keyboard Shortcuts section** — two-slide demo
- **Onboarding finish** routes through a popup instead of a redirect

---

## World-Class Search

- **Command palette** — instant fuzzy search across all pages, agents, tasks, and files
- **Daemon live index** — search results backed by the real-time file-system index
- **Search snippets** — results show context around the match
- **No Tab hijack** — Tab key no longer stolen inside search

---

## Editor Upgrades

- **Notion-grade features** — text color, text highlight, embeds, image/video buttons, drag handles, link popover
- **Folder index** — folders with both `index.md` and children show a List/Gallery toggle
- **Page/Files tab** — new tab mode when a folder has both an index and children
- **@ mention picker** — type `@` to link to any KB page, with clean URL scheme
- **Inline Lucide icons** — `IconExtension` renders named icons inline and they survive Markdown roundtrip
- **Toolbar overflow** — chevron buttons for unreachable toolbar items; always-visible scrollbar on macOS (1 px, 10% opacity)
- **Heading anchors** — decoration-based, gutter add button, slug generation, MutationObserver loop guard
- **Save failed pill** — clickable to retry
- **Stale-content flash fix** — opening Markdown artifacts no longer shows old content first
- **flushSync guard** — folder-tab reset no longer collides with Tiptap during render

---

## Composer & Scheduling

- **Unified Task/Routine/Heartbeat dialog** — single composer surface replaces three separate flows
- **WhenChip** — human-friendly scheduling UI with natural-language parsing, anchored top-right on all kickoff surfaces
- **Shared AgentPicker chip** — same component across home, cabinet inline, and launch surfaces
- **Drag-drop, paste, and file-picker attachments** — attach files to any task before launch
- **Inline terminal banner** — shown in composer when `runtimeMode` is terminal
- **Disabled send tooltip** — explains why the button is inactive when input is empty

---

## Agent Page v2

The agent detail page is now chat-first.

- **Color-wash hero** — agent color applied even when an avatar image is set
- **Conversations rail** — recent conversations listed alongside the agent
- **Editable identity** — name, icon, color, and avatar all editable inline
- **Inbox section** — assigned `AgentTask` items appear on the agent page
- **100 famous-figure avatars** — with cryptic labels; expanded icon catalog
- **Vivid Tailwind-500 default palette** for new agents
- **Provider-agnostic task delegation** — agents can dispatch sub-tasks with human approval; dispatched tasks inherit parent runtime + per-row overrides
- **Single `ConversationApprovalPanel`** — shared by all three views

---

## Sidebar Redesign

- **Cabinet drawer** — Data / Agents / Tasks tabs replace the old sidebar layout; drawer stagger animation
- **Tab-aware footer actions** — context-sensitive actions per drawer
- **Drag-reorder + move-to dialog** — reorder sidebar items; order persisted
- **Import files** — via context menu or OS drag-drop into the tree
- **Recent Tasks list** — under the Tasks header with richer status dots
- **20 tasks shown by default** with progressive "Show older"
- **Reliable tree refresh** after file import and page mutations (tree cache invalidated)

---

## Viewers

- **Jupyter notebook (.ipynb) support** — renders cells, outputs, and visualizations
- **Unified toolbar** — type-aware artifact buttons, consistent across all viewer types
- **User-initiated top-nav** from webapp iframes allowed

---

## Settings

- **MCP Servers** — read-only list of connected MCP servers
- **Storage backend section** — shown only in the cloud edition
- **Workspace section** — promoted above the avatar grid in Profile
- **Cabinet Cloud waitlist** — inline form in onboarding + dedicated section in Settings/About
- **Settings tabs as anchor links** — deep-linking to specific settings sections works
- **Profile sticky save bar** — stays visible while scrolling

---

## Themes

Four new built-in themes: **Windows 95**, **Windows XP**, **Matrix**, and **Apple**.

---

## Telemetry & Privacy

- **Anonymous opt-out telemetry** — no PII collected; fully opt-out
- **Privacy toggle** in Settings
- `TELEMETRY.md` documents what is and isn't collected

---

## Legal & Disclaimer

- **Calm legal-tech redesign** — full-screen card, no red/flying icons
- **Explicit acceptance required** — checkbox must be clicked; no X close button
- **Server-side acceptance state** — mirrored to a state file, not just localStorage
- **Terms of Service + Privacy Policy** links in the layout warning

---

## Routing & Navigation

- **Cabinet-scoped URLs** — unified scheme; legacy `#/cabinet/<path>/<slug>` auto-redirected
- **Task launches + notification clicks** open the conversation side panel directly
- **Hash aliases** resolved correctly; task-detail timeout fixed
- **Sync button** hidden for non-git cabinets via `isGit` flag

---

## Calendar

- **Off-window event chevrons** — navigate to events outside the visible range
- **Editable visible hours** — customize the hour window shown
- **Compact density slider** for Jobs & heartbeats
- **Past events** linked to their real conversations; missed runs flagged
- **`scheduledAt` propagation** — threaded through jobs and heartbeats end-to-end
- **Deduped cron events** that span multiple cabinets

---

## Conversations

- **Multi-turn support** — `continueConversationRun` for multi-turn agent runs
- **Live chat stream** — sidebar tree refreshes on agent writes
- **Per-turn runtime** — codec, tokens, errorKind stored per turn
- **Cold-paint dedup** — conversation fetches deduplicated on first load
- **Sub-agent run cleanup** — shell-init leaks stripped from transcripts

---

## Performance

- **Server FS walk cache** — deduplicated across requests
- **Section chunk splitting** — lazy-loaded page sections reduce initial bundle
- **Cold-paint from localStorage** — tree and last page painted from cache before server responds
- **Telemetry off in dev** — no noise in development mode

---

## Accessibility

- **P1/P2 audit bundle** — labels, status shape, keyboard reorder
- **Task card AT report** — reports only the title to assistive technology, not 50 words
- **Focus ring** — darkened in light theme for visibility
- **Aria-labels** on icon buttons throughout

---

## MIT License

Cabinet is now MIT-licensed. `LICENSE` file added; `package.json` updated with `"license": "MIT"`.

---

## 50+ UX & Polish Fixes

Selected highlights from the pre-release audit (120+ items triaged):

- Agent avatar/pill tints softened across the board
- Breadcrumb navigation fixed in agent detail; leaf node larger
- "New Agent" CTA normalized (was inconsistent across surfaces)
- `Add scheduled job` deduplication — single "Add routine" CTA
- Compact density + `needs` lane status badges fixed
- GitHub stars formatted as `12.3k` above 10k, exact below
- Terminal opening another tab instead of replacing; close clears state
- Sidebar collapsed state persisted; home tooltip added; ⌘S hint surfaced
- Contextual `+` icons per drawer: FilePlus / UserPlus / ListPlus
- Cmd+1/2/3 keyboard shortcuts for sidebar Data/Agents/Tasks tabs
- Cmd+N opens floating new-task dialog in place
- 3 system-conflicting shortcuts replaced
- Markdown table editing improved
- Accent color contrast warning for light/unreadable agent backgrounds
- `console.log` stripped from production builds
- Skeleton loader on agents list; empty state copy clarified
- About version pulled from `package.json`; empty calendar day hint added
- Toolbar active state updates on cursor move
- Inbox duplicate CTA removed
- Pi (Inflection) label corrected
- IP-evocative avatar labels renamed to generic descriptors

---

**Full diff:** `git log v0.3.x..v0.4.0`
