# Task Conversations — Build Log

> **2026-04-17 status: v2 integration shipped. All 7 phases complete.**
>
> Source of truth for intent: `data/TASK_CONVERSATIONS_PRD.md` (revised).

---

## v2 shipped

The Cabinet task UI now sits on top of the mature conversation system. One store, one runner, one viewer. Every prompt-builder reused verbatim. Single-shot conversations remain backward compatible (they render as 1-turn tasks).

### Phase 1 ✅ — ConversationMeta + store multi-turn extensions

- `src/types/conversations.ts` — added `ConversationTurn`, `SessionHandle`, `TurnTokens`, `ConversationTokens`; extended `ConversationMeta` with `turnCount`, `lastActivityAt`, `tokens`, `runtime`, `doneAt`, `archivedAt`, `awaitingInput`, `titlePinned`, `summaryEditedAt`.
- `src/lib/agents/conversation-turns.ts` — turn file helpers (path builders, gray-matter round-trip, normalization).
- `src/lib/agents/conversation-store.ts` — new: `readConversationTurns`, `appendUserTurn`, `appendAgentTurn`, `updateAgentTurn`, `readSession`, `writeSession`, `appendEventLog`, `extractAgentTurnContent`. Agent-turn appends run `parseCabinetBlock` so `ARTIFACT:` paths flow into `meta.artifactPaths`, `SUMMARY` becomes the rolling task summary (unless user-edited within 5 min).
- `readConversationDetail(id, path, { withTurns: true })` adds `turns[]` + `session` without touching the legacy shape.
- 9 tests in `conversation-store-turns.test.ts`.

### Phase 2 ✅ — `continueConversationRun`

- `src/lib/agents/conversation-runner.ts` — new `continueConversationRun(id, { userMessage, mentionedPaths })`:
  - Resume path (adapter supports it + live session): lightweight prompt = epilogue + new mentions + follow-up, with `ctx.sessionId` set.
  - Replay path: full prompt with `buildAgentContextHeader` + scope + diagram + epilogue + `<turn-user>...` history + follow-up.
  - Appends pending agent turn, executes adapter, updates turn with final content + tokens + sessionId + exit state.
  - Persists `SessionHandle` on success, marks `alive:false` when adapter signals `clearSession`.
  - Heuristic `looksLikeAwaitingInput` flips `meta.awaitingInput`.
- Reuses **verbatim**: `buildAgentContextHeader`, `buildKnowledgeBaseScopeInstructions`, `buildDiagramOutputInstructions`, `buildCabinetEpilogueInstructions`, `buildMentionContext`, `parseCabinetBlock`, `extractAgentTurnContent`, `readPersona`.
- 5 tests in `conversation-runner-continue.test.ts`.

### Phase 3 ✅ — API + SSE on conversations

- `GET /api/agents/conversations/[id]?withTurns=1` — includes `turns[]` + `session` gated on flag; legacy consumers unaffected.
- `PATCH /api/agents/conversations/[id]` — now supports field updates (`summary`, `title`, `titlePinned`, `done`, `archived`, `doneAt`, `archivedAt`) alongside existing `action: stop | restart`. Fires conversation event.
- `POST /api/agents/conversations/[id]/continue` — appends user turn + fires `continueConversationRun` in background. Returns 202.
- `GET /api/agents/conversations/[id]/events` — SSE stream, 15 s heartbeat, subscribes to in-memory event bus.
- `src/lib/agents/conversation-events.ts` — event bus singleton. Store turn ops publish `turn.appended`, `turn.updated`, `task.updated`, `task.deleted`.

### Phase 4 ✅ — UI rewired to conversation endpoints

- `src/lib/agents/conversation-to-task-view.ts` — pure view-model adapter: `ConversationMeta` → `TaskMeta`, `ConversationTurn` → `Turn`, derived status (`archived` / `done` / `running` / `awaiting-input` / `failed` / `idle`).
- `src/lib/agents/task-client.ts` — rewritten to call `/api/agents/conversations/*`. `fetchTask` → `GET ?withTurns=1` + adapter. `postTurn(user)` → `POST /continue`. `patchTask` → `PATCH` (translates task→conversation fields). `createTaskRequest` → `POST /api/agents/conversations` (reuses existing persona-aware prompt builder).
- `TaskConversationPage` SSE URL swapped.
- `/tasks` index page sources `listConversationMetas`.
- Sidebar recent-tasks fetches from conversations.

### Phase 5 ✅ — Artifact rows as KB-page cards

- `src/lib/ui/page-type-icons.tsx` — extracted type → icon + color util (`csv`, `pdf`, `markdown`, `image`, `video`, `audio`, `code`, `mermaid`, `cabinet`, `folder`, etc.) with `inferPageTypeFromPath` fallback.
- `POST /api/kb/pages/meta` — `{ paths: string[] }` → `[{ path, title, type }]` via `readPage()` frontmatter with basename fallback.
- `ArtifactsList` rewritten: one card per unique KB path, typed icon + real frontmatter title + muted directory. Click navigates to the page (`selectPage` + `setSection({ type: "page" })`).
- `TurnBlock` per-turn artifact panel uses the same card shape with inferred type.
- Dropped: command rows, tool-call rows, file-edit +/− rows. Cabinet's artifact = a KB file the agent wrote.

### Phase 6 ✅ — Retire v1 plumbing

Deleted:
- `src/app/api/tasks/**` (4 routes)
- `src/lib/agents/task-store.ts` (+ test)
- `src/lib/agents/task-runner.ts` (+ test)
- `src/lib/agents/task-events.ts`

Kept:
- `src/lib/agents/task-heuristics.ts` (+ test) — still used by `continueConversationRun` for awaiting-input detection + summary fallback.
- `src/types/tasks.ts` — UI view-model types (`Task`, `TaskMeta`, etc.) fed by the adapter.
- All `/tasks/*` URL routes — now backed by `/api/agents/conversations`.

On-disk: `data/.agents/.tasks/` renamed to `.agents/.tasks.v1-retired-<timestamp>` (non-destructive; inspect before deletion).

### Phase 7 ✅ — Agents workspace convergence

- `TaskConversationPage` — new `variant: "full" | "compact"` prop (compact drops the top header) and `readOnly?: boolean` (hides composer + wrap-up card).
- `TaskDetailPanel` (quick-peek side panel) — swapped `ConversationSessionView` for `<TaskConversationPage taskId={id} variant="compact" />`. Added arrow-up-right button that routes to the full in-shell viewer.
- `ConversationResultView` (Agents workspace past-runs) — prominent **Open in task viewer** button next to **Open transcript**, both instances.
- `/agents/conversations/[id]` legacy transcript page — **Open in task viewer** header link routes to `#/ops/tasks/{id}` or `#/cabinet/{path}/tasks/{id}`. Keeps **Back to Cabinet** for root home.

---

## Tests

Total after v2: **24 unit tests, all passing**

| File | Tests |
|---|---|
| `task-heuristics.test.ts` | 9 |
| `adapters/claude-local.test.ts` | 1 |
| `conversation-store-turns.test.ts` | 9 |
| `conversation-runner-continue.test.ts` | 5 |

Run: `npx tsx --test src/lib/agents/task-heuristics.test.ts src/lib/agents/adapters/claude-local.test.ts src/lib/agents/conversation-store-turns.test.ts src/lib/agents/conversation-runner-continue.test.ts`

---

## Key files

```
src/
  app/
    api/
      agents/conversations/
        route.ts                          GET list, POST create (unchanged)
        [id]/route.ts                     GET + PATCH + DELETE (PATCH extended)
        [id]/continue/route.ts            NEW — POST follow-up turn
        [id]/events/route.ts              NEW — SSE stream
      kb/pages/meta/route.ts              NEW — resolve KB page metadata
    tasks/
      page.tsx                            /tasks index (backed by conversations)
      new/page.tsx                        /tasks/new
      [id]/page.tsx                       /tasks/[id] standalone fullscreen
  components/
    tasks/
      conversation/
        task-conversation-page.tsx        the viewer — full + compact variants
        turn-block.tsx
        artifacts-list.tsx                KB-page cards
        task-composer-panel.tsx
        task-list.tsx
        markdown.tsx
        mock-data.ts                      /tasks/demo seed
      task-detail-panel.tsx               quick-peek side panel (compact embed)
    agents/
      conversation-result-view.tsx        Agents workspace past-run view
      conversation-live-view.tsx          Agents workspace live view
      conversation-session-view.tsx       (unchanged; still used elsewhere)
    sidebar/
      recent-tasks.tsx                    sidebar recent conversations
  lib/
    agents/
      conversation-store.ts               extended with multi-turn readers/writers
      conversation-runner.ts              + continueConversationRun
      conversation-turns.ts               NEW — turn file helpers
      conversation-events.ts              NEW — in-memory event bus
      conversation-to-task-view.ts        NEW — view-model adapter
      task-client.ts                      rewritten: calls /api/agents/conversations
      task-heuristics.ts                  (kept) awaiting-input + summary
    ui/
      page-type-icons.tsx                 NEW — icon + color util
    storage/
      page-io.ts                          (used by page-meta resolver)
  types/
    conversations.ts                      extended with turn + session types
    tasks.ts                              UI view-model types (adapted, not deleted)
```

---

## Commit log

```
5dc29f9  feat(tasks): embed TaskConversationPage in side panel + agents workspace  (phase 7)
637d286  feat(tasks): retire v1 parallel task plumbing                              (phase 6)
d399c4c  feat(tasks): artifact rows as KB page cards                                (phase 5)
64d7d58  feat(tasks): rewire UI to /api/agents/conversations endpoints              (phase 4)
212a097  feat(conversations): PATCH, /continue, /events on conversation routes      (phase 3)
1d86853  feat(conversations): continueConversationRun for multi-turn runs           (phase 2)
6090e42  feat(conversations): multi-turn support on existing conversation store     (phase 1)
```

---

## Verified end-to-end

- `http://localhost:5354/tasks` — lists real conversations from `listConversationMetas`.
- Clicking a conversation opens it in the app shell (sidebar visible) via `#/ops/tasks/{id}`.
- `/agents/conversations/{id}?cabinetPath=.` — the Minerva poem transcript page — now has **Open in task viewer** button.
- `GET /api/agents/conversations/{id}?withTurns=1` — returns 2 turns (user + agent synthesized from `prompt.md` + `transcript.txt`), plus `session` when present.
- `POST /api/agents/conversations/{id}/continue` — appends user turn + fires runner in background.
- SSE stream delivers `turn.appended` / `turn.updated` / `task.updated` live.
- `POST /api/kb/pages/meta` — returns `[{ path: "marketing/blog/harry-potter-poems/index.md", title: "Harry Potter Poems", type: "markdown" }]` from real frontmatter.

---

## Follow-ups shipped after v2

- ✅ **Runtime picker on `/tasks/new`** — `TaskRuntimePicker` plugged in; `createTaskRequest` forwards `providerId` / `adapterType` / `model` / `effort` to the conversations POST.
- ✅ **`/compact` action** — `compactConversation(id)` in runner collapses prior turns into a ≤200-word digest, kills the session handle. `POST /api/agents/conversations/[id]/compact` + header button.
- ✅ **Global SSE stream** — `GET /api/agents/conversations/events` feeds live refresh to sidebar recent-tasks + `/tasks` index.
- ✅ **Cabinet trailer strip** — `SUMMARY` / `CONTEXT` / `ARTIFACT:` block no longer visible in agent chat bubbles (metadata is already in frontmatter + meta).
- ✅ **Streaming partial content** — `continueConversationRun` writes incremental text to the pending turn (debounced 700ms). SSE delivers `turn.updated` and the viewer refetches so the response grows live.
- ✅ **80%/95% compact nudge banner** — prominent in-chat banner above turns when tokens approach the context limit, with a one-click Compact button.

## Follow-ups still open

- **Auto-summary via Haiku** — swap `deriveSummary` heuristic for a real LLM call when an agent turn has no `SUMMARY:` trailer. Adds per-turn API cost; heuristic already works for most cases.
- **Migration script** — codify the `.agents/.tasks.v1-retired` rename as an opt-in migrator once we have real user data to move.
- **Token accounting audit** — adapterUsage is captured from daemon continues but the initial `startConversationRun` daemon path doesn't propagate it to `meta.tokens` today. Multi-turn token bar works; first-turn is still 0 until a continue lands.

## Shipped after phase 7

- ✅ **Session-expired fallback** (resume error → replay retry)
- ✅ **Daemon-backed continues** (`continueConversationRun` → `createDaemonSession`, survives HMR)
- ✅ **Adapter session capture** (Claude session_id persisted for real `--resume`)
- ✅ **Runtime picker on `/tasks/new`**
- ✅ **`/compact` action** (header button + 80/95% nudge banner)
- ✅ **Global SSE stream** (sidebar + `/tasks` index auto-refresh)
- ✅ **Cabinet trailer strip** (no `SUMMARY:` leaking into chat bubbles)
- ✅ **Streaming partial content** (debounced 700ms writes to pending turn)
- ✅ **Logs tab** (events.log + raw transcript, color-coded)
- ✅ **Diff tab** (git history per artifact, unified diff rendering)
- ✅ **TasksBoard convergence** (SSE + in-shell routing)
- ✅ **Structured `<ask_user>` marker** (deterministic awaiting-input; `?`-heuristic kept as fallback)

## Follow-ups shipped this session

- ✅ **Session-expired fallback** — runner detects `No conversation found with session ID`-style errors from Claude `--resume`, clears `session.alive`, and retries with the full replay prompt. `appendUserTurn` now also clears `doneAt` / `archivedAt` so continuing a Done task reopens it cleanly.
- ✅ **Daemon-backed continues** — `continueConversationRun` routes through `createDaemonSession` (with in-process fallback for tests). Polls `getDaemonSessionOutput` every 700ms to stream partial content into the pending turn. Runs survive Next.js HMR and route handler teardown.
- ✅ **Adapter session capture** — daemon's `StructuredSession` tracks `adapterSessionId` + `adapterUsage`; `/session/:id/output` returns both; daemon writes `session.json` directly when the daemon's id matches a conversation. `claude-local` dropped `--no-session-persistence` so fresh runs create resumable Claude sessions.
