# Provider CLI Runtime

Date: 2026-04-18

Consolidated reference for Cabinet's multi-CLI provider system. Describes the adapter runtime, the eight built-in providers, shared utilities, plugin loader, session codec, in-UI verification, runtime picker, migration history, and outstanding work.

## 1. Goal

Cabinet executes agent work through interchangeable CLI providers. Each provider is a local binary the user installs and authenticates once. Cabinet spawns it headless, streams structured output into the transcript, persists session handles, and classifies failures in the UI.

Previous state: Claude + Codex hard-wired into a terminal-first execution model with heavy per-provider duplication.

Current state: eight built-in providers + a plugin loader for third-party adapters, a shared adapter interface, a reusable runtime picker driven entirely off provider metadata, and a standalone troubleshooting page that exercises every provider server API.

## 2. Built-in Providers

| Provider | Adapter type | Auth | Session resume | Effort levels | Billing |
|----------|--------------|------|----------------|---------------|---------|
| Claude Code (`claude-code`) | `claude_local` | Anthropic login / API key | ✅ (`--resume`) | none | subscription / api |
| Codex CLI (`codex-cli`) | `codex_local` | OpenAI login / API key | ✅ | low / medium / high | subscription / api |
| Gemini CLI (`gemini-cli`) | `gemini_local` | Google login / API key | ✅ | none | subscription / api |
| Cursor CLI (`cursor-cli`) | `cursor_local` | Cursor login | ✅ | none | subscription |
| OpenCode (`opencode`) | `opencode_local` | per-provider keys | ✅ | `minimal … max` via `--variant` | api (multi-provider) |
| Pi (`pi-cli`) | `pi_local` | per-provider keys | ✅ (file-based) | `off … xhigh` thinking levels | api |
| Grok CLI (`grok-cli`) | `grok_local` | xAI API key | ❌ | none | api |
| Copilot CLI (`copilot-cli`) | `copilot_local` | GitHub login | ❌ | none | subscription |

Provider metadata lives under `src/lib/agents/providers/<id>.ts` and is registered in `src/lib/agents/provider-registry.ts`. Every provider carries an `installSteps` array — the final step is always `Verify setup — Confirm headless mode works`, which the in-UI verifier runs.

## 3. Adapter Interface

`src/lib/agents/adapters/types.ts` defines `AgentExecutionAdapter`:

```ts
interface AgentExecutionAdapter {
  type: string;                 // e.g. "claude_local"
  name: string;
  providerId: string;
  executionEngine: "structured_cli" | "pty" | ...;
  supportsSessionResume: boolean;
  experimental?: boolean;

  execute(ctx: AdapterExecuteContext): Promise<AdapterExecuteResult>;
  testEnvironment?(): Promise<AdapterEnvironmentReport>;

  // Optional paperclip-style extensions
  sessionCodec?: AdapterSessionCodec;
  listModels?(): Promise<AgentAdapterModel[]>;
  listSkills?(ctx: { cwd?: string }): Promise<AdapterSkillSnapshot>;
  syncSkills?(ctx: { cwd?: string }, desired: string[]): Promise<AdapterSkillSnapshot>;
}

interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown>): Record<string, unknown> | null;
  getDisplayId?(params: Record<string, unknown>): string | null;
}
```

## 4. Shared Utilities

All adapters reuse the same building blocks (currently co-located in `src/lib/agents/adapters/`, to be extracted into `_shared/`):

- **Stream-JSON consumer** — line-by-line JSONL accumulator with typed event callbacks. Template: `claude-stream.ts` accumulator shape.
- **`runChildProcess`** — spawn wrapper used by every adapter: handles PATH (`ADAPTER_RUNTIME_PATH`), stdin piping, stdout/stderr chunking, timeouts, clean termination.
- **Stderr noise filters** — per-provider regex lists that drop CLI bootstrap chatter (OpenCode `sqlite-migration:*`, Gemini YOLO notices) so only real errors reach the user.
- **Session-codec pattern** — `{ sessionId, cwd }` shape (Cursor/Claude/Codex) or file-backed snapshot (Pi). On unknown-session error the runner retries with `clearSession: true`.
- **CLI arg builders** — effort → flag mappings (`--variant`, `--thinking`, `--reasoning-effort`) kept beside each adapter; all return arrays so call sites compose cleanly.

## 5. Plugin Loader

`src/lib/agents/adapters/plugin-loader.ts` loads third-party adapters at daemon boot:

- Config: `~/.cabinet/adapter-plugins.json`
  ```json
  { "plugins": [
    { "package": "@vendor/cabinet-adapter-x", "enabled": true },
    { "package": "./local/dir", "enabled": true, "path": "./local/dir" }
  ]}
  ```
- Dynamic `import()` + extracts `createAgentAdapter()` / `createServerAdapter()` / default / `adapter` export.
- Registers via `agentAdapterRegistry.registerExternal(adapter)`. A fallback map preserves the built-in so `unregisterExternal()` restores it when the plugin is disabled.
- `server/cabinet-daemon.ts` awaits the loader after `listen()` so the first conversation sees every registered adapter.

## 6. In-UI Verification

`src/app/api/agents/providers/[id]/verify/route.ts` exposes `POST /api/agents/providers/:id/verify`:

1. Resolves the provider's last install step with a `command`.
2. Runs it via `/bin/sh -c` with `PATH=ADAPTER_RUNTIME_PATH`, 60 s timeout, 16k char cap on stdout/stderr.
3. Classifies the result via keyword heuristics on combined stdout+stderr+spawn error:
   - `pass` — `exitCode === 0` and no error pattern matched
   - `not_installed` — ENOENT / `command not found` / `no such file`
   - `auth_required` — 401 / `not authenticated` / `missing api key` / `please log in` / `run … login`
   - `payment_required` — `payment required` / `subscription required` / `upgrade plan` / `billing required`
   - `quota_exceeded` — `quota exceeded` / `resource.*exhausted` / `rate-limit` / `too many requests`
   - `other_error` — anything else
4. Returns `{ status, failedStepTitle, command, exitCode, signal, output, stderr, durationMs, hint }`.

Consumed by:

- **Settings → Providers** (`src/components/settings/settings-page.tsx`) — per-provider verify button, status chip, failed-step highlighting, hint line.
- **Onboarding wizard** (`src/components/onboarding/onboarding-wizard.tsx`) — 4-column responsive grid sorted ready → installed-but-not-auth → not-installed, with a single install/verify drawer below the grid (not inline per card). Auto-selects the first ready provider and reuses `RuntimeSelectionBanner` above the model chips.
- **Providers Demo** (`/providers-demo`, see §6.1) — full test harness that hits every provider server API end-to-end.

Both onboarding + settings surfaces drive their install steps off `provider.installSteps` (via `buildProviderSetupSteps`) — no hardcoded per-provider content.

Unified verify command per provider (matches the adapter's exact invocation so "works in terminal" implies "works in Cabinet"):

- **Claude Code** — `claude -p 'Reply with exactly OK' --output-format text`
- **Codex CLI** — `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Reply with exactly OK'`
- **Gemini CLI** — `gemini -p 'Reply with exactly OK' --yolo`
- **Cursor CLI** — `cursor-agent -p 'Reply with exactly OK' --output-format text --yolo`
- **OpenCode** — `opencode run 'Reply with exactly OK'`
- **Pi** — `pi --mode json -p 'Reply with exactly OK'`
- **Grok CLI** — `grok -p 'Reply with exactly OK'`
- **Copilot CLI** — `copilot -p 'Reply with exactly OK' --allow-all-tools`

### 6.1 Providers Demo page

`/providers-demo` (`src/app/providers-demo/page.tsx`) is a standalone troubleshooting harness. Linked from Settings → Providers via a **Troubleshoot AI providers** button (Stethoscope icon) that opens it in a new tab. Inherits the app's theme tokens so it renders in whichever theme the user picked.

What it exercises in one view:

- `GET /api/agents/providers` — populates the provider cards + summary bar (provider count, ready count, default provider/model/effort).
- `GET /api/agents/providers/status` — separate button; renders the cached `{ available, authenticated }` mini-grid.
- `POST /api/agents/providers/:id/verify` — per-card Verify button with inline result (status pill, exit code, duration, failed-step label, hint, collapsible command + stdout + stderr).
- `POST /api/agents/headless` — per-card Send prompt button; shared prompt textarea with `{{provider}}` templating replaced against the provider's display name. Disabled when the provider isn't ready.

UX details:

- Scrolling **API call log** at the bottom records every fetch (method, URL, status, duration, timestamp) with expandable request/response JSON.
- Model + effort selectors are rendered for reference; `/api/agents/headless` currently uses each provider's default model, noted inline.
- Log cap: 100 entries (FIFO). Clear button resets.

## 7. Runtime Picker (shared component)

`src/components/composer/task-runtime-picker.tsx` exports two reusable pieces:

```tsx
export function RuntimeSelectionBanner({
  providers, value, label, trailing, className,
});

export function RuntimeMatrixPicker({
  providers,
  value: { providerId, model, effort },
  onChange,
  includeUnavailable = false,      // true for Settings, false for composer
});
```

Behavior:

- **Ready-first ordering** — `ready.push(p); unready.push(p); return [...ready, ...unready]`. `isProviderReady = enabled && available && authenticated`.
- **Unready tabs** — rendered with `opacity-50 grayscale`, `disabled` prop, a "Not ready" chip, and a hint (`describeProviderUnreadyReason`) pulled from whichever of `enabled` / `available` / `authenticated` is failing.
- **Horizontal scroll** — `overflow-x-auto scrollbar-none` + `w-max min-w-full` so 8+ tabs don't clip in a narrow column.
- **Banner** — colored `Default Model: (icon)(provider)(model)` strip tied to the provider's own `iconAsset` + theme accent; shared between composer and Settings.

Settings replaced three hand-rolled blocks (provider buttons + model grid + effort grid) with a single `<RuntimeMatrixPicker includeUnavailable />` + `<RuntimeSelectionBanner />`.

## 8. Glyphs & Icons

- Every provider declares `iconAsset: "/providers/<slug>.svg"` on its metadata.
- `src/components/agents/provider-glyph.tsx` takes an `asset` prop and falls back to a lookup map for compatibility; the hardcoded icon map was removed in favor of provider-driven lookup.
- Placeholder SVG monograms shipped for cursor / opencode / pi / grok / copilot under `public/providers/`.

## 9. Tests

- `src/lib/agents/adapters/registry.test.ts` — asserts all 10 adapter types register and the 8 provider→adapter defaults map correctly.
- `src/lib/agents/adapters/{cursor-local,opencode-local,pi-local}.test.ts` — exercise stream-parsing, effort flag mapping, stderr noise filtering, and session-codec round-trip against fake shell scripts that emit real stream-json.
- Existing Claude / Codex / Gemini adapter tests untouched (behavior-neutral refactor for them).

## 10. Files Map

```
src/lib/agents/
  provider-interface.ts                     // AgentProvider + iconAsset field
  provider-registry.ts                      // registers all 8 providers
  providers/
    claude-code.ts  codex-cli.ts  gemini-cli.ts
    cursor-cli.ts   opencode.ts   pi.ts    grok-cli.ts   copilot-cli.ts
  adapters/
    types.ts                                // adapter interface + session codec
    registry.ts                             // built-in + registerExternal fallback
    plugin-loader.ts                        // ~/.cabinet/adapter-plugins.json
    claude-local.ts + claude-stream.ts
    codex-local.ts  + codex-stream.ts
    gemini-local.ts + gemini-stream.ts
    cursor-local.ts + cursor-stream.ts
    opencode-local.ts + opencode-stream.ts
    pi-local.ts + pi-stream.ts
    grok-local.ts
    copilot-local.ts
src/app/
  api/agents/providers/route.ts             // GET list + PUT settings
  api/agents/providers/status/route.ts      // GET { available, authenticated } cache (30s)
  api/agents/providers/[id]/verify/route.ts // POST verify + classify
  api/agents/headless/route.ts              // POST one-shot prompt
  providers-demo/page.tsx                   // troubleshooting harness
src/components/
  composer/task-runtime-picker.tsx          // RuntimeMatrixPicker + Banner
  settings/settings-page.tsx                // runtime picker + Troubleshoot link
  onboarding/onboarding-wizard.tsx          // 4-col grid + verify drawer
  onboarding/home-blueprint-background.tsx  // animated floorplan on Welcome home
  agents/provider-glyph.tsx                 // asset-driven glyph
  agents/conversation-{content-viewer,live-view,session-view}.tsx
public/providers/{claude,codex,gemini,cursor,opencode,pi,grok,copilot}.svg
server/cabinet-daemon.ts                    // awaits plugin loader at boot
```

## 11. Migration History

Phased work that landed on this branch (see commit trail below):

1. **Adapter foundation** — shared adapter system under `src/lib/agents/adapters/`, threading `adapterType` / `adapterConfig` / execution engine through personas, jobs, conversations, and daemon sessions.
2. **Structured adapters for Claude / Codex / Gemini** — stream-json parsing instead of raw PTY replay; structured usage + session metadata flow into transcripts natively.
3. **Daemon runtime generalization** — `server/cabinet-daemon.ts` manages both legacy PTY and structured adapter-backed sessions, writing into the same conversation store.
4. **Provider + adapter selection UI** — providers API exposes adapter metadata; runtime-selection helpers surface defaults, available adapters, and override semantics across agent settings / creation / job editors / mission control.
5. **Terminal mode promoted to first-class** — the `*_legacy` PTY adapters (named that way for historical reasons) power the user-selectable **Terminal** mode in the task composer; `WebTerminal` is the interactive surface for these sessions.
6. **Native live-session UI** — replaced task live-rendering that previously depended on `WebTerminal`. Shared renderer across `task-detail-panel`, `jobs-manager`, `agents-workspace`.
7. **Shared task composer** — per-task runtime overrides + compact runtime picker (brain-icon trigger) unified across task board, home screen, agents workspace, AI panel, and status-bar entry points.
8. **Runtime picker consolidation** — provider tabs / model rows / effort columns matrix with a selected-model summary row.
9. **Paperclip-style adapter shape** — three new providers (Cursor / OpenCode / Pi) added using CLI-spawn + stream-json + session-codec pattern, consistent with Claude / Codex / Gemini.
10. **Session codec groundwork** — optional `AdapterSessionCodec` on the adapter interface; each new adapter ships its own codec. Per-conversation persistence is the Round B item.
11. **External adapter plugin loader** — `~/.cabinet/adapter-plugins.json`, dynamic `import()`, `registerExternal` + fallback preservation.
12. **Provider branding** — `iconAsset` field + local SVG assets for all providers; `ProviderGlyph` shared component.
13. **Settings guide generalization** — hardcoded per-provider setup map replaced with `buildProviderSetupSteps(provider.installSteps)`.
14. **Unified headless verify step** — every provider's install guide ends with the same "Reply with exactly OK" one-shot that matches the adapter's exact invocation.
15. **Runtime picker layout for 6+ providers** — horizontal scroll on tab row + relaxed width constraint; Cursor renamed to "Cursor CLI" for tab balance.
16. **Grok CLI + Copilot CLI providers** — plain-stdout passthrough (no stream-json), subscription/api billing, ship monogram SVGs + registry entries.
17. **Adapter tests** — stream-parsing + session-codec round-trip tests for Cursor / OpenCode / Pi; registry test asserts all 10 adapter types + 8 provider defaults.
18. **Onboarding redesign (2026-04-18)** — 4-col responsive card grid sorted ready-first, single install/verify drawer below the grid, `RuntimeSelectionBanner` above model chips. Fixed refetch-on-select bug (`checkProvider` deps). Welcome home step gained `HomeBlueprintBackground` — animated SVG floor plan with 8 rooms + wandering agent dots, respects `prefers-reduced-motion`.
19. **Providers Demo page (2026-04-18)** — `/providers-demo` exercises every provider server API; API call log with expandable bodies; "Troubleshoot AI providers" button added to Settings → Providers.
20. **Terminal mode across all 8 providers (2026-04-19, round 1)** — registered `<provider>_legacy` PTY adapters for every provider (was Claude + Codex only). Runtime picker gains a Native/Terminal toggle above the provider tabs; Terminal mode swaps the picker to a dark chrome, hides model + effort controls (PTY uses the CLI's own defaults), and tags the selection banner with a `PTY` pill + terminal glyph. `ConversationRuntimeOverride` gains `runtimeMode: "native" | "terminal"`; POST `/api/agents/conversations` translates `runtimeMode === "terminal"` into the provider's legacy adapter type via `LEGACY_ADAPTER_BY_PROVIDER_ID`. Normalization + sameSelection preserve `runtimeMode` so the picker latches.
21. **Terminal-mode task viewer (2026-04-19, round 2)** — when `isLegacyAdapterType(meta.adapterType)`, the task's Chat tab swaps from the markdown TurnBlock list to a real xterm-backed `WebTerminal` (previously the PTY's raw TUI was being rendered as scrambled markdown). A fixed `TerminalPromptHeader` sits above the terminal with the original prompt, a copy button, provider chip, live-status pill, and PTY badge. When the task is idle, the composer renders below in a dark theme with `runtimeMode: "terminal"` pinned in the initial runtime so Continue routes back through the legacy adapter via `continueConversationRun`. Icon markers added on: task board cards (left emerald rail + `PTY` chip), task detail header (`PTY` chip next to title), and sidebar recent tasks (small terminal glyph at trailing edge). Finished status is deduced naturally from `meta.status === "idle"` when the daemon closes the PTY. Known limitation: each continuation spawns a fresh PTY process; the xterm buffer (scrollback) is preserved in the browser but the underlying CLI process restarts per turn.

### Commit trail (selected)

- `7cd6c31` scaffold adapter foundation
- `3e30f5a` thread adapter metadata through daemon sessions
- `5aa39a5` run claude through structured adapter sessions
- `0a9e52c` run codex through structured adapter sessions
- `5428af5` expose adapter selection in agent settings
- `1e0f1a3` expose adapter selection in mission control dialogs
- `85fa8d9` replace task live terminal with native view
- `2357097` share native live conversation view
- `88de2b1` 5 CLI providers + in-UI verification + shared runtime picker
- `89a3cc4` animated home blueprint + redesigned provider step + study default
- `19980e0` /providers-demo page + Troubleshoot button in Settings

## 12. Next Steps

### 12.0 TL;DR — what's actually left

Consolidated list of unclosed items. Everything not listed here is shipped (see detailed matrices in §12.1 / §12.2 / §12.3).

#### A. Needs code — mechanical, no decisions required

| Ref | Item | Notes |
|---|---|---|
| #2b | Skills injection for the other 6 providers — extend `adapterConfig.skillsDir` wiring to Cursor, OpenCode, Pi, Codex, Gemini, Grok, Copilot | Claude is done via `--add-dir`. Each CLI has its own context-dir flag (Cursor `--add-dir` too, OpenCode env var, Pi env var, Codex `-c`, Gemini ?, Grok/Copilot likely none). |
| #4 | Full per-provider directory split — `adapters/<provider>-local/{index,execute,parse,test,skills}.ts` + extract remaining shared helpers into `_shared/` (stream-json consumer, stderr-filter, session-codec, health-check) | Phase 1 shipped (`_shared/cli-args.ts`). Behavior-neutral churn; low ROI. |
| #5 | `agent-live-panel.tsx` should not render `WebTerminal` for structured-adapter conversations | WebTerminal works fine for both today; this is cleanup, not a bug. |

#### B. Needs product decision

| Ref | Item | Decision needed |
|---|---|---|
| #9 | Reasoning-effort policy per provider | How far to push effort controls — Cursor has none, OpenCode/Pi have per-variant levels, Codex has low/medium/high, Claude/Gemini/Grok/Copilot have none. Which providers should expose effort at all in UI? |

#### C. Needs external input

| Ref | Item | Blocked on |
|---|---|---|
| #11 | Polish placeholder glyphs for Cursor/OpenCode/Pi/Grok/Copilot | Licensed artwork |

#### D. Known limitations (out-of-scope by design)

| Ref | Item | Why out of scope |
|---|---|---|
| T19-full | Distill PTY output into a clean agent turn with artifact extraction + `<ask_user>` detection | Terminal mode is "I drive the CLI"; structured summary/artifacts belong to native mode. Current distillation is a 1-line deterministic summary. |
| T20-repl | Same-process continue keeping an interactive REPL alive across turns with a persistent read-eval loop | Current impl opportunistically stdin-injects when the PTY is alive, spawns fresh otherwise. True always-alive REPL would need a launch-mode refactor and only benefits providers with REPL mode. |

#### Product guarantees now in place

Worth calling out since these used to be caveats:

- **Terminal-mode Continue always preserves context** (shipped T25 `847c6e0` + `8ca5eb9`). Native resume via `--resume` / `--session` for Claude/Cursor/OpenCode; prompt-level replay via `buildContinuationPrompt({ mode: "replay" })` for Codex/Gemini/Grok/Copilot/Pi. No path loses the prior conversation.
- **Refresh a finished terminal task → transcript is always shown** (shipped T21 `80f2a44`). Three-tier fallback: live session → `completedOutput` cache → on-disk transcript → empty-state marker. The old silent-new-CLI bug is gone.
- **Skills are an end-to-end surface** (shipped §12.3 UI-1..4 + backend). Catalog at `~/.cabinet/skills/`, per-agent selection via persona frontmatter or the Details multiselect, Task-header chip shows what's attached, Settings → Skills lists the catalog, Claude adapter injects via `--add-dir`.

**Snapshot:**
- Provider track (§12.1): 9 / 12 shipped (3 partial).
- Terminal track (§12.2): 25 / 25 resolved.
- Skills UI (§12.3): 4 / 4 shipped.
- Unclosed items above: **6** (3 mechanical code + 1 product call + 1 artwork + 2 by-design limitations).

### 12.1 Status matrix

| # | Item | Status | Commit(s) |
|---|------|--------|-----------|
| 1 | Session codec persistence per conversation | ✅ Already shipped — `writeSession(conversationId, { codecBlob, resumeId, … })` + `deserialize(session.codecBlob)` on continuation | — |
| 2 | Skills injection — catalog at `~/.cabinet/skills/<slug>/SKILL.md`; `_shared/skills-injection.ts` exposes `readSkillCatalog` + `syncSkillsToTmpdir` (symlinks selected skills into `$TMPDIR/cabinet-skills/<sessionId>/`); persona frontmatter gains `skills: [slug, …]`; runner injects `skillsDir` into adapterConfig before spawn; Claude adapter wires it via `--add-dir`. Other 7 adapters ignore the field as no-ops until each CLI's skills contract is wired. | 🟡 Partial | `77c17af` |
| 3 | Dynamic model discovery (OpenCode / Pi) | ✅ Done — `listModels()` hook + `GET /api/agents/providers/:id/models` w/ 60 s cache | `0587bec` |
| 4 | Per-provider directory refactor (paperclip shape) — Phase 1: `_shared/cli-args.ts` extracted (`readStringConfig` + `readEffortConfig`), all 8 adapters consume from there instead of duplicating. Full per-provider directory split (`<provider>-local/{index,execute,parse,test,skills}.ts`) still deferred as low-ROI mechanical churn | 🟡 Partial | `98c757d` |
| 5 | Stop rendering WebTerminal in `agent-live-panel.tsx` for structured adapters | 🟨 Deferred — minor; PTY now has its own mode | — |
| 6 | Label legacy PTY adapters as experimental | ✅ Superseded — promoted to first-class **terminal mode** via Native/Terminal toggle | `a767892`, `e922c63` |
| 7 | Integration coverage for adapter lifecycle | ✅ Done — registry test covers 16 adapters + `legacy-ids.test.ts` asserts client/server sync | `656526d` |
| 8 | Reduce "provider = PTY CLI" assumptions — centralize the `type === "cli"` UX filter into `isAgentProviderSelectable()` so one predicate change lights up API providers across onboarding / settings / agents-workspace / providers-demo | ✅ Done | `1e0edbd` |
| 9 | Reasoning-effort policy per provider | 🟨 Deferred — product call | — |
| 10 | Model + effort on `/api/agents/headless` | ✅ Done for Claude + Codex — endpoint + `OneShotInvocationOptions` | `979d87a` |
| 10b | Model-override for the other 6 providers — Gemini (`-m`), Cursor/Grok/Copilot (`--model`), OpenCode (`--model` + `--variant`), Pi (`--model` + `--thinking`) | ✅ Done | `db351ac` |
| 11 | Polish placeholder glyphs | 🟨 Deferred — needs licensed artwork | — |
| 12 | Daemon-level PTY keep-alive (same-process continue) — daemon `POST /session/:id/input` writes stdin to live PTY; `continueConversationRun` legacy branch tries `writeDaemonSessionInput()` first, falls back to `createDaemonSession` if exited | ✅ Done | `5aebc4c` |

### 12.2 Terminal-streamed tasks — status matrix

Separate track covering the "user runs task in Terminal mode" experience. Audit and roadmap.

| # | Item | Status | Commit(s) |
|---|------|--------|-----------|
| T1 | Register legacy `<provider>_legacy` PTY adapters for all 8 providers | ✅ Done | `a767892` |
| T2 | `RuntimeMatrixValue.runtimeMode: "native" \| "terminal"` | ✅ Done | `a767892` |
| T3 | Native/Terminal toggle in the runtime picker (dark chrome, hides model/effort) | ✅ Done | `a767892` |
| T4 | `normalizeSelection` + `sameSelection` preserve `runtimeMode` (toggle latches) | ✅ Done | `e922c63` |
| T5 | POST `/api/agents/conversations` translates `runtimeMode === "terminal"` → `LEGACY_ADAPTER_BY_PROVIDER_ID[providerId]` | ✅ Done | `a767892` |
| T6 | POST `/api/agents/conversations/[id]/continue` same translation for continuations | ✅ Done | `745c655` |
| T7 | `task-client.ts` (`postTurn`, `createTaskRequest`) forward `runtimeMode` in payload | ✅ Done | `745c655` |
| T8 | Task viewer swaps Chat tab → `WebTerminal` when `isLegacyAdapterType(adapterType)` | ✅ Done | `c3a3f84` |
| T9 | Fixed `TerminalPromptHeader` (prompt, copy, provider chip, PTY badge, status pill) | ✅ Done (now folded into fullscreen top strip) | `c3a3f84`, `4313979` |
| T10 | Continue flow — composer appears when PTY exits, `runtimeMode: "terminal"` pinned | ✅ Done | `dc6aec1` |
| T11 | Client-safe `legacy-ids.ts` module (fixes `child_process` client-bundle error) | ✅ Done | `b0230c5` |
| T12 | Composer banner (emerald strip) when terminal mode is selected | ✅ Done | `9310067` |
| T13 | Task card marker: left emerald rail + `PTY` chip on tasks board | ✅ Done | `5e8ac62` |
| T14 | Task detail header: `PTY` chip next to title | ✅ Done (legacy view) | `5e8ac62` |
| T15 | Sidebar recent tasks: trailing terminal glyph | ✅ Done | `5e8ac62` |
| T16 | Fullscreen terminal layout (thin dark top strip + WebTerminal fills viewport) | ✅ Done | `4313979` |
| T17 | Running indicator = terminal-icon chip with pulsing ring when live (replaces separate "live" + "PTY" chips) | ✅ Done | `89f5b2a` |
| T18 | Legacy-adapter continuation — `continueConversationRun` reopens the PTY via `createDaemonSession` instead of bailing on the missing `adapter.execute` | ✅ Done | `a012478` |
| T19 | Distill PTY output on exit — `finalizeSessionConversation` now emits a deterministic summary (`Terminal <provider> session <status> · N lines[ — last output: …]`) for legacy_pty_cli sessions so `meta.summary` isn't box-drawing junk. Raw transcript on disk untouched; artifact extraction + `<ask_user>` detection explicitly skipped for PTY mode (out of scope — terminal mode is "I drive the CLI") | ✅ Done | `98c757d` |
| T20 | Same-process continue (keep CLI alive across turns, inject prompts via stdin) — daemon `POST /session/:id/input`; runner probes liveness first, writes to stdin if alive, spawns fresh PTY only on fallback | ✅ Done | `5aebc4c` |
| T21 | WebTerminal reconnect-after-navigate-away UX — covers both live reconnect (in-memory session replay via `attachSessionSocket`) and refresh of an already-finished task (WebTerminal passes `reconnect=1`; daemon serves transcript from `completedOutput` cache → on-disk transcript → empty-state marker, never spawns a new PTY). Replay prefixed with a provenance banner (`[cabinet] <providerId> · <adapterType> · started X · finished Y`) + clear-screen so xterm renders from the top instead of auto-scrolling to the transcript tail. Fixes the silent-new-CLI bug where refreshing a finished task re-ran the prompt, and the Claude-banner-at-tail confusion where xterm landed on stale output from pre-T21 spawn paths. | ✅ Done | `80f2a44`, `090d5ba` |
| T25 | Terminal-mode Continue uses provider-native resume OR prompt-level replay — two recovery paths after PTY exit: (a) native resume via `--resume` / `--session` for Claude / Cursor / OpenCode when the previous run captured a provider session id; (b) `buildContinuationPrompt({ mode: "replay" })` prepends the prior turns to the new user message for providers without resume (Codex / Gemini / Grok / Copilot / Pi) or when capture was missed. Both paths preserve context; only native resume is "free" (no extra input tokens). Runner threads `adapterSessionId` into `createDaemonSession`; the daemon forwards via `OneShotInvocationOptions.resumeId` / `SessionInvocationOptions.resumeId`. UI composer shows "resumes in the same <provider> session" for native; "Cabinet will prepend the prior transcript so the new run still has context" for replay. | ✅ Done | `847c6e0`, `8ca5eb9` |
| T22 | Token bar / context window hidden in terminal fullscreen layout | ✅ Done — fullscreen top strip already omits `TokenBar` (PTY output doesn't self-report usage uniformly) | `4313979` |
| T23 | Stop-PTY button in the top strip — calls `stopConversation()` → PATCH `{ action: "stop" }` → daemon SIGTERMs the PTY | ✅ Done | `a012478` |
| T24 | Terminal-mode "experimental" advisory vs. first-class messaging | ✅ First-class — Native/Terminal is a positive product choice, not a warning |
| T26 | Terminal / Details tab toggle in the fullscreen task viewer — two tabs at the very top: Terminal (xterm stream, default) and Details (renders `ConversationResultView` cards: PROMPT + RESULT + ARTIFACTS). Details body lives on a light theme-matched panel with a compact back-row header. Detail lazy-fetched on first click via `/api/agents/conversations/:id`, cached, refetched on task status/lastActivity change. Artifacts click through to the editor via `openArtifactPath()`. Tab row uses the same `rounded-t-md` + `-mb-px` seam pattern as the runtime picker. Details tab shows artifact count as an emerald chip when present. | ✅ Done | `fa1e5e4` |

### 12.3 Skills UI — status matrix

The skills system shipped with zero UI (see §12.1 #2). Track the four surfaces that would make skills visible:

| # | Item | Status | Commit |
|---|------|--------|--------|
| UI-1 | Agent detail → Skills field in Details section (superseded by UI-4) | ✅ Done | `63d3499`, `6a070fc` |
| UI-2 | Settings → "Skills catalog" browser — lists everything in `~/.cabinet/skills/` with name + description + path | ✅ Done (coming-soon preview) | `40c2865` |
| UI-3 | Task viewer → violet `Sparkles` chip "N skills" (single slug for N=1) in the header when `adapterConfig.skills` is populated; full list on hover | ✅ Done | `63d3499` |
| UI-4 | Agent editor → skills multiselect widget backed by the catalog — toggleable pills per entry, orphan-slug detection, replace-semantics save via PUT `/api/agents/personas/:slug { skills }` | ✅ Done | `6a070fc` |

Current UX: users edit `skills: [slug, slug]` directly in the agent's markdown frontmatter.

### 12.4 Runtime picker UX polish

| # | Item | Status | Commit |
|---|------|--------|--------|
| UX-1 | EFFORT_TONES table: dark-mode variants on every tone (header text, bg fills, borders, selected shadow) so the `SELECTED MODEL` banner + matrix chips read correctly against dark themes | ✅ Done | `2981581` |
| UX-2 | Terminal mode: replace the Tabs + matrix with a dedicated `TerminalProviderPanel` (dark card, header "Pick a CLI to spawn in a PTY:", 2-3 col grid of CLI cards with glyph + name + ready/log-in/not-installed status, footer noting model/effort defaults + resume-capable providers). Click a ready card = select it with an emerald highlight. | ✅ Done | `2981581` |
| UX-3 | Composer collapsed trigger button indicates terminal mode — `>_` terminal glyph in an emerald-bordered dark zinc container, trailing "Terminal" label in emerald uppercase (replacing the effort label since PTY uses CLI defaults). Whole button: dark zinc bg + emerald/40 border. | ✅ Done | `09c87a2` |
| UX-4 | Native-mode provider tabs collapse to icon-only when inactive. Active tab widens to icon + name (+ "Not ready" chip when unready); inactive tabs render just the ProviderGlyph with tooltip. Fits all 8 providers without horizontal scroll. | ✅ Done | `09c87a2` |
| UX-5 | Native/Terminal rendered as true **tabs** (not buttons) — 50/50 `grid-cols-2` with `px-2 pt-2` margin, each tab is `rounded-t-md` with `border-t/l/r`, `-mb-px` merges the active tab's bottom edge into the panel below. Active tab bg matches its panel (background for Native, zinc-950 + emerald-ring for Terminal) so the seam disappears. Inactive tabs get muted bg + transparent border. | ✅ Done | `542de01`, `ecdad67` |
| UX-6 | Terminal panel footer carries the EXPERIMENTAL + HACKER MODE framing (not the tab label). Three-paragraph notice: red `EXPERIMENTAL` + emerald `HACKER MODE` pills lead the trade-off copy ("Great if you want to watch the CLI talk to itself; less great if you want Cabinet to organize the output"), then the model/effort + resume wiring note, then the Discord CTA. Tab label itself is clean (just icon + "Terminal"). | ✅ Done | `542de01`, `ecdad67` |

## 13. Operational Notes

### Adding a new provider

The full file map is in §10. Minimum touch-list:

**New files**
- `src/lib/agents/providers/<id>.ts` — provider metadata. Must declare `iconAsset: "/providers/<id>.svg"` (§8) so the glyph picks it up without further wiring.
- `src/lib/agents/adapters/<id>-local.ts` — adapter implementation.
- `src/lib/agents/adapters/<id>-stream.ts` — only if the CLI emits structured streaming output (NDJSON / stream-json).
- `public/providers/<id>.svg` — logo asset.
- `src/lib/agents/adapters/<id>-local.test.ts` (+ `<id>-stream.test.ts` and `test/fixtures/<id>-stream/*.ndjson` for streaming providers).

**Edits**
- `src/lib/agents/provider-registry.ts` — import + `providerRegistry.register(...)`.
- `src/lib/agents/adapters/registry.ts` — four spots: `LEGACY_ADAPTER_BY_PROVIDER_ID`, `DEFAULT_ADAPTER_BY_PROVIDER_ID`, legacy adapter factory, `register()` call.
- `src/lib/agents/adapters/legacy-ids.ts` — add `<id>_legacy` to `LEGACY_ADAPTER_TYPES`. Plus add the provider id to `PROVIDERS_WITH_TERMINAL_RESUME` if the CLI supports `--resume` / `--session` (gates the "new session" advisory in the task viewer).
- `src/components/layout/status-bar.tsx` — `PROVIDER_INSTALL_URLS` (powers the "Install" button in the System Status popover).
- `test/provider-launch-mode.test.ts` — launch-mode case.
- `src/lib/agents/adapters/registry.test.ts` — adapter presence assertion.

**Install-step contract:** the final entry of `installSteps` must be a `Verify setup` command that exits 0 on success. The in-UI verifier (§6) runs it as the canonical health check.

**Do NOT add the new id to component-level lists.** The Settings page, composer picker (Native + Terminal tabs), onboarding grid, providers-demo, and troubleshooter all read `/api/agents/providers` and discover the provider via `iconAsset`, `runtimeModes`, and `supportsTerminalResume` flags on its metadata. If you find yourself editing `task-runtime-picker.tsx`, `settings-page.tsx`, or `onboarding-wizard.tsx` to enumerate providers, that's a smell.

### Other notes

- **Unready providers** stay visible in Settings (`includeUnavailable`) but are hidden in the composer picker by default. Users can always see what's available vs. installable from Settings.
- **Verify failures** surface the failing step title + hint inline — users know whether to install, authenticate, pay, or wait out a quota without reading raw stderr.
- **Debugging a provider**: open `/providers-demo` from Settings → Providers → **Troubleshoot AI providers**. Runs every provider API end-to-end with live logs.
