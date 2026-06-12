# Telegram Remote Control — PRD

**Status:** Implemented 2026-06-10 (Phases 0–5 + catalog UI; Phase 6 pending an
`cabinet-mcp-telegram` npm release — see §12) · **Date:** 2026-06-10 ·
**Branch:** `feat/integrations-hub` · **Owner:** hilash

**Implementation notes (deltas from the spec below):**
- One extra contract change: the daemon sets `CABINET_DAEMON_SELF=1` and
  `continueConversationRun` honors it when picking the daemon route — without
  it, daemon-side continues run in-process with no abort hook, which would
  break `/stop` and partial streaming for follow-up turns.
- Captioned file uploads run immediately (caption = the message, file
  attached); only caption-less files wait for the next message.
- Streamed partial edits are sent as plain text (partial markdown has
  unbalanced entities by definition); only final replies render MarkdownV2
  with the plain fallback.
- Audit uses daemon log lines (`[telegram-gateway] …`); telemetry event names
  are catalog-allowlisted, so the §16 event set needs a catalog change and is
  deferred (runs themselves still emit `task.created` etc.).

## 1. Summary

Today's Telegram connector is **outbound only**: it installs an MCP server
(`cabinet-mcp-telegram`) that lets Cabinet *agents post to Telegram* (send /
edit / react, read messages received after the bot joined, optional pin/ban).
It does **not** let you drive Cabinet from Telegram.

This PRD adds the **inbound** direction: a **Telegram gateway** that turns the
bot into a remote control for Cabinet. You message the bot from your phone and
it **runs agents** and **queries the cabinet** — the same capabilities you have
inside the Cabinet app — modelled on
[`claude-code-telegram`](https://github.com/RichardAtCT/claude-code-telegram).

```
            TODAY (outbound)                     THIS PRD (inbound)
   agent run ──► send_message ──► Telegram   You ──► message ──► gateway ──►
   agent run ──► add_reaction ──► Telegram        run orchestrator agent /
   agent run ──► read_recent  ◄── Telegram        /search the cabinet ──► reply
```

## 2. Locked decisions

From product review (2026-06-10), both rounds:

| Decision | Choice | Implication |
|---|---|---|
| **Chat routing** | **Default orchestrator** | Plain text goes to one orchestrator/brain agent that answers and can dispatch others. No persistent agent-switch mode. |
| **Agent override** | **`@slug` per message** | Prefix a single message with `@editor` to run it against that agent once; the next plain message reverts to the orchestrator. No mode state. |
| **Bot identity** | **Reuse the connected bot** | One bot does both directions. The gateway owns Telegram `getUpdates` long-polling; it **supersedes** the MCP `read_recent` tool (see §10). |
| **Access** | **Allowlist only, always-on** | No separate enable toggle. If a bot token **and** a non-empty allowlist exist, the gateway runs. Senders not on the allowlist are refused. |
| **Chat surface** | **DM-only (v1)** | Responds only in private 1:1 chats. Group messages are ignored (groups are a follow-up). |
| **Orchestrator resolution** | **Auto-pick, fall back to editor** | `TELEGRAM_DEFAULT_AGENT` if set → else first `canDispatch:true` persona → else `editor`. Zero setup. |
| **Verbosity** | **Concise + `/verbose` toggle** | Default streams a "thinking…" placeholder then the final answer. `/verbose` opts into live tool-use/reasoning lines (per chat). |
| **File / photo** | **Attach to next message** | A sent file is saved to the cabinet, acked, and attached to the next text message's run. |
| **Concurrency** | **Queue** | A new message during a live run is queued and runs next (FIFO), not rejected or run in parallel. |
| **Reply format** | **Rich, fall back to plain** | Render as MarkdownV2 (bold/code/links); on escape error, resend as plain text. |
| **Rooms** | **`/room <slug>` in v1** | Per-chat active cabinet. **Default changed in use (2026-06-11): a chat starts in a real room** — home-config default room → last active room → first listed room — because the Rooms-v3 home is a neutral container, not a cabinet; agents writing into it pollute the data root. Home only when no rooms exist (or explicit `/room home`). Still no `TELEGRAM_DEFAULT_ROOM` env. |
| **Session state** | **Ephemeral (in-memory)** | Per-chat state (conversation pointer, active room, `verbose`, queue, staged files) lives in memory only. A daemon restart resets each chat to a fresh conversation in home with `/verbose` off; no disk snapshot. |
| **Run timeout** | **None — rely on `/stop`** | Telegram-triggered runs have no wall-clock cap, matching in-app behaviour. They end on completion or when the user sends `/stop`. Implementation note: the reused polling seams default to 15-minute deadlines — the gateway must pass explicit large deadlines (§5/§8). |
| **Rate limit** | **1 in-flight + 10 msgs/60 s** | One active run per chat; up to 10 messages per rolling 60 s before a soft "slow down" notice. The one-deep queue still gates concurrency. |
| **v1 scope** | **Full set** | Core (message → run agent → streamed reply) **plus** `@slug` override, `/search`, session controls (`/new`, `/status`, `/stop`), `/verbose`, `/room`, and file/photo → context. |

## 3. Goals / Non-goals

**Goals**
- Message the bot → an orchestrator agent runs in the cabinet and streams its
  reply back into Telegram.
- `@slug` prefix runs one message against a specific agent; otherwise orchestrator.
- `/search <query>` returns top KB hits without spending an agent run.
- Session continuity: messages continue the last conversation; `/new` resets.
- `/room <slug>` switches which cabinet the chat drives (default: home).
- `/verbose` toggles live tool-use lines; default is concise.
- Send a file/photo → it lands in the cabinet and attaches to the next run.
- Reuse existing seams (`startConversationRun`, daemon session API, the Bot API
  client, `.cabinet.env`). No new long-lived process, no new network surface.

**Non-goals (v1)**
- No persistent agent-switch *mode* (`/use <slug>`). One-shot `@slug` override is
  supported; sticky mode is not.
- DM-only. No group-chat handling in v1 (groups are a follow-up — see §13).
- No voice transcription, no `/git`, no cron-from-Telegram, no webhook server
  (claude-code-telegram has these; deferred — see §19).
- No MTProto / user-account access. Bot API only, as today.
- No cloud/relay. The gateway runs in the local daemon next to your data.
- No cross-restart session persistence. Sessions are in-memory; a daemon
  restart resets each chat to a fresh conversation in home (intentional, §5).

## 4. Reference mapping (claude-code-telegram → Cabinet)

| claude-code-telegram | Cabinet equivalent |
|---|---|
| Runs `claude` in `APPROVED_DIRECTORY` | Runs the **orchestrator persona** via `startConversationRun()` in the cabinet (`DATA_DIR` / persona `workdir`) |
| `ALLOWED_USERS` whitelist | `TELEGRAM_ALLOWED_USERS` in `.cabinet.env` |
| Per-user session persistence | Cabinet **conversations** (already persisted per agent) + per-chat "current conversation" pointer |
| Streamed tool/verbose output | Throttled message edits driven by daemon session output |
| `/projects` (switch dir) | `/room <slug>` switches the active cabinet (cabinet-scoped, not a raw filesystem path) |
| `/new`, `/status`, `/cd`, `/ls` | `/new`, `/status`, `/stop`, `/search`, `/agents`, `/verbose`, `/help` (no `/cd` — cabinet-scoped, not filesystem-scoped) |
| File upload + archive extract | File/photo → staging dir → `attachmentPaths` on next run |
| SQLite audit log | Telemetry events (`emitTelemetry`) + daemon logs |

## 5. Architecture

The gateway is a module **inside the daemon process** (`server/cabinet-daemon.ts`),
booted from the `server.listen` callback (`cabinet-daemon.ts:2001`) and torn
down in `shutdown()` (`:2060`). Running in-process gives it direct access to
persona/rooms lookups and the daemon's **live search index** (no rebuild, no
HTTP hop for `/search`).

Run execution is different: `startConversationRun` / `continueConversationRun`
execute via `createDaemonSession` → an HTTP POST to `getDaemonUrl()` — i.e. the
daemon **loopback-calls itself** with its own daemon token. That is fine (it is
exactly the path the app uses), but it is not "direct function calls", and it
has one hazard: the daemon **auto-bumps its port** when the default is busy. At
boot the gateway must verify the configured daemon URL resolves to the port
*this process actually bound*; if not (e.g. dev + packaged daemons running
side by side), log and stay down rather than drive a different daemon.

```
server/cabinet-daemon.ts  (server.listen callback)
        │  startTelegramGateway()  ← new, after startSearchWatcher()
        ▼
server/telegram/gateway.ts          long-poll loop (getUpdates)
        │            │
        │            ├─ parse update → command or text
        │            ▼
        │   server/telegram/router.ts
        │            ├─ /search        → runSearch()          (search-service)
        │            ├─ /new /status /stop /verbose /room → session store
        │            ├─ text / @slug    → startConversationRun() (conversation-runner)
        │            └─ file/photo       → stageTelegramFile()  → attachmentPaths
        ▼
server/telegram/bot-api.ts          getUpdates / sendMessage / editMessageText /
                                    getFile + download  (reuses callApi pattern
                                    from mcps/mcp-telegram/src/telegram.ts)
```

**New files**
- `server/telegram/gateway.ts` — lifecycle (`start` / `stop`), long-poll loop,
  offset bookkeeping, per-chat dedupe, error backoff.
- `server/telegram/bot-api.ts` — thin Bot API client (`getUpdates`,
  `sendMessage`, `editMessageText`, `sendChatAction`, `getFile`, file download).
  Factor the existing `callApi`/`sanitizeChatId` out of
  `mcps/mcp-telegram/src/telegram.ts` into a shared helper, or copy the pattern
  (the MCP package ships standalone via npx, so a small copy is acceptable).
- `server/telegram/router.ts` — command + text dispatch, reply formatting.
- `server/telegram/session-store.ts` — per-chat state: current conversation id,
  active run id, **active room (`cabinetPath`, default home)**, **`verbose` flag**,
  **queued message (FIFO)**, and staged attachment paths. **In-memory only
  (ephemeral)** — a `Map` keyed by chat id, no disk snapshot. On daemon restart
  every chat resets to a fresh conversation in home with `/verbose` off; any
  in-flight run is dropped and the next message starts clean. (The `owner.json`
  marker in §10 is a separate, tiny file for the `getUpdates` lock, not session
  state.)
- `server/telegram/config.ts` — read `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_ALLOWED_USERS`, `TELEGRAM_DEFAULT_AGENT`, `TELEGRAM_CHAT_ID` from
  `.cabinet.env` via `getCabinetEnvSnapshot()`; validate; expose `isEnabled()`.
  **Owns a chokidar watch on `.cabinet.env`** — the daemon loads it exactly
  once at boot (`loadCabinetEnv()`, `cabinet-daemon.ts:22`) and does *not*
  watch it, so without this the connect flow would require a daemon restart.
  On change: re-read, re-validate, start/stop/reconfigure the gateway.

**Reused seams**
- `startConversationRun()` (first turn) — `src/lib/agents/conversation-runner.ts:559`
- `continueConversationRun()` (follow-up turns in the same conversation) —
  `conversation-runner.ts:1465`. Required: `startConversationRun` *always
  creates a new conversation*, so "messages continue the last conversation"
  (§4/§6) is impossible with it alone.
- `runSearch()` — `server/search/search-service.ts:132`. Positional signature:
  `runSearch(sources, query, scope, limit, cabinet)` — needs the daemon's
  in-memory `SearchSources` (pages index + agent/task doc getters), which the
  daemon hands the gateway at boot; room scoping is the `cabinet` **slug**
  param (not a `cabinetPath`).
- `listPersonas()` / `readPersona()` / `resolvePersonaCanDispatch()` —
  `src/lib/agents/persona-manager.ts`
- `getCabinetEnvSnapshot()` — `src/lib/runtime/cabinet-env.ts`
- Bot API call shape — `mcps/mcp-telegram/src/telegram.ts`

**Contract changes (small, additive — the only ones)**
- Extend `ConversationTrigger` (`src/types/conversations.ts:3`) with
  `"telegram"` so Telegram-origin runs are actually distinguishable in task
  history (`"agent"` already means *dispatched by another agent*). UI renders
  an unknown trigger with a default badge, so the ripple is one type + one
  badge case.
- The gateway must pass **explicit large deadlines** to the polling seams —
  `pollDaemonSessionUntilDone` defaults `deadlineMs` to 15 min and **throws**
  past it, and `continueConversationRun` defaults `timeoutMs` the same way
  (§8). No signature changes needed; just never rely on the defaults.

## 6. Commands

Plain text (no leading `/`) → runs the orchestrator in the chat's active room.
Commands:

| Command | Behaviour |
|---|---|
| `/start` / `/welcome` | Personalized welcome ("Welcome <first name> to your Cabinet!"): active room + how to switch, how to run a task, `@slug`, `/search`, files, and the session-control one-liner. Refuse here too if the sender is not on the allowlist. |
| `/help` | List commands, the active orchestrator, the active room, and verbose state. |
| `/new` | Drop the chat's "current conversation" pointer and re-show the welcome guide. Next message starts a fresh conversation. |
| `/status` | Show the active run (agent, elapsed, conversation id), the **queued** message if any, the active room, and verbose state. |
| `/stop` | Cancel the chat's active run (`stopDaemonSession` / `session.stop`). A queued message, if any, then runs. |
| `/search <query>` | `runSearch(sources, query, "all", 5, activeRoomSlug)` against the daemon's live index; reply with titled, path-tagged hits (pages 📄 / agents 🤖 / tasks ✅). |
| `/agents` | List personas in the active room (`listPersonas()`) with emoji + role, marking the orchestrator. Each entry shows its `@slug` so you can target it (see `@slug` below). |
| `/room [<slug>]` | No arg: show current room + available rooms (`listRooms()`). With a slug: switch the chat's active cabinet. Unknown slug → list options. |
| `/verbose` | Toggle live tool-use/reasoning streaming for this chat (default off → concise). Reply confirms the new state. |
| `/model [<provider> [<model>] [<effort>]]` | Added 2026-06-11. No args: show the current runtime + every registered provider with its model ids (`*` marks effort support). With args: per-chat runtime override (provider registry validated; switching providers picks that provider's default adapter; model + effort ride `adapterConfig` on starts and the per-turn override on continues, which forces replay mode upstream). **When no effort is given, the highest available level (e.g. `max`) is applied automatically** — from the chosen model's levels, or from the provider-level list for provider-only overrides; effort-less models (haiku) get none forced. A bare effort token works too (`/model claude-code max`). `/model reset` returns to each agent's persona default. Sticky across `/new` and `/room`. |
| _text_ | Run the orchestrator with the message as the request; stream the reply. |
| `@slug <text>` | Run this one message against persona `<slug>` instead of the orchestrator. Unknown slug → fall back to orchestrator with a note. Next plain message reverts to orchestrator. |
| _file / photo_ | Download via `getFile`, stage under the active room, attach to the **next** text message's run. Ack with "📎 attached, what should I do with it?" |

Unknown `/command` → short "unknown command, try /help".
If a run is already active, a new text/`@slug`/file message is **queued** (one
deep) and acked with "⏳ queued, will run next"; `/stop` clears the active run
and the queued item proceeds.

## 7. Routing (orchestrator, `@slug`, room)

**Target agent** per message:
- If the message starts with `@slug ` and that persona exists in the active room
  → run that persona for this one message.
- Otherwise the **orchestrator**, resolved once per room and cached:
  1. `TELEGRAM_DEFAULT_AGENT` (`.cabinet.env`) if set and the persona exists.
  2. Else the first persona with `canDispatch: true` (an orchestrator/brain) from
     `listPersonas(cabinetPath)` — `resolvePersonaCanDispatch()` encodes this flag.
  3. Else the default-agent fallback (`readPersona("editor", …)`, the same
     fallback `buildConversationPrompt` uses at `conversation-runner.ts:492`).
- Unknown `@slug` → fall back to orchestrator and prepend a one-line note.

**Active room (`cabinetPath`)** comes from the chat's session state (set by
`/room`, default `undefined` = home cabinet). It scopes persona lookup, search,
and the run.

**Start vs continue.** `startConversationRun` always creates a *new*
conversation; continuity comes from `continueConversationRun`:

- First plain message (or first after `/new` or `/room`) →
  `startConversationRun({...})`; store `meta.id` as the chat's conversation
  pointer.
- Subsequent plain messages → `continueConversationRun(conversationId,
  { userMessage, attachmentPaths, cabinetPath, timeoutMs: LARGE })` — same
  conversation, same transcript the app shows.
- **`@slug` is a one-shot side conversation.** It starts a *fresh* conversation
  for that persona and does **not** touch the chat's main conversation pointer
  — the next plain message continues the orchestrator thread as if the
  `@slug` interjection never happened.

```ts
const cabinetPath = chatState.roomPath;            // undefined = home (default)

if (atMention) {
  // one-shot: separate conversation, pointer untouched
  await startConversationRun({
    agentSlug: atMention, cabinetPath, title: makeTitle(text),
    trigger: "telegram", prompt: text, attachmentPaths: stagedPaths,
  });
} else if (chatState.conversationId) {
  await continueConversationRun(chatState.conversationId, {
    userMessage: text, attachmentPaths: stagedPaths, cabinetPath,
    timeoutMs: GATEWAY_DEADLINE_MS,  // default is 15 min — never rely on it (§8)
  });
} else {
  const meta = await startConversationRun({
    agentSlug: resolveOrchestrator(cabinetPath), cabinetPath,
    title: makeTitle(text), trigger: "telegram",
    prompt: text, attachmentPaths: stagedPaths,
  });
  chatState.conversationId = meta.id;
}
```

Completion is detected by the gateway's **own poll loop** on the daemon
session (§8) — *not* `startConversationRun`'s `onComplete`, which rides
`waitForConversationCompletion` and its hard-coded 15-minute deadline
(`conversation-runner.ts:721`); relying on it would strand any longer run's
placeholder.

`startConversationRun` already assembles the full persona prompt (cabinet
header, skills, dispatch epilogue when `canDispatch`), persists the
conversation, and injects attachments, so dispatch-to-other-agents and KB
scoping come for free. Telegram-origin runs are tagged `trigger:"telegram"`
(new union value, §5 contract changes) so they're visible and filterable in
the in-app task history.

## 8. Streaming model

Telegram has no token stream; we **edit one message** as output grows.

1. On inbound text: `sendChatAction(chatId, "typing")`, then `sendMessage` a
   placeholder ("🧠 _thinking…_") and keep its `message_id`. The typing
   indicator expires after ~5 s, so re-send `sendChatAction` on a ~4 s loop
   while the run is live.
2. The run produces incremental output through the daemon session the
   conversation creates (turn 1: session id = conversation id; follow-up
   turns: the run id `continueConversationRun` spawns). The **gateway drives
   its own poll loop** via `pollDaemonSessionUntilDone(id, { onPartial,
   deadlineMs: GATEWAY_DEADLINE_MS })` (`daemon-client.ts:75`) — the deadline
   **must** be passed explicitly and effectively unbounded, because the helper
   defaults to 15 minutes and *throws* past it, which would violate the
   no-run-timeout decision (§2). On each partial, **throttle**
   `editMessageText` to **≥1.5 s apart** and only when text changed (Bot API
   edit rate limits + the 4096-char cap).
3. **Verbosity (per chat, default concise):**
   - **Concise (default):** keep the placeholder ("thinking…") while the run
     works; the streamed edits show only assistant text, not tool calls. On
     completion, show the final answer.
   - **`/verbose` on:** also surface tool-use/reasoning lines as they stream
     (e.g. "🔧 Read budget.md"), reusing the structured stream parsing the app
     already does for the transcript.
4. On the 4096-char boundary, finalize the current message and continue in a
   new one (chunked transcript). The chunker must never split **inside a
   MarkdownV2 entity** (an unclosed `*` or `` ` `` makes Telegram reject the
   edit, which would falsely trigger the plain-text fallback) — break at the
   last entity-safe boundary before the limit.
5. On completion — detected by the gateway's own poll loop returning a
   terminal status, **not** `onComplete` (see §7; `waitForConversationCompletion`
   hard-caps at 15 min) — write the final text and a compact footer (elapsed,
   tokens from `adapterUsage` if present). On error, replace the placeholder
   with a clear failure + the classified reason.

Render (per the **Rich, fall back to plain** decision): strip ANSI, convert the
agent's markdown to Telegram MarkdownV2 (bold, inline code, code blocks, links);
if MarkdownV2 escaping throws or Telegram rejects the entity, resend the same
text with no `parse_mode`. Reuse the truncation discipline from
`mcps/mcp-telegram/src/format.ts`.

## 9. Config & credentials

All via `.cabinet.env` (0600), surfaced through the existing connect flow. New
catalog credential fields on the Telegram entry (`mcp-catalog.ts:448`):

| Env key | Req? | Secret | Purpose |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | yes | Existing. Shared by outbound MCP + inbound gateway. |
| `TELEGRAM_ALLOWED_USERS` | **for remote control** | no | Comma-separated numeric Telegram **user IDs** allowed to drive Cabinet. Empty ⇒ gateway stays off. |
| `TELEGRAM_DEFAULT_AGENT` | no | no | Orchestrator slug override (§7). |
| `TELEGRAM_CHAT_ID` | no | no | Existing. Still scopes **outbound**; for inbound it can optionally restrict which chat the gateway answers in. |

The daemon loads `.cabinet.env` **once at boot** (`loadCabinetEnv()`,
`cabinet-daemon.ts:22`) and does not watch it — so the gateway brings its own
small chokidar watch on the file (§5, `config.ts`): on change it re-reads via
`getCabinetEnvSnapshot()`, re-validates, and starts/stops/reconfigures itself.
Connecting Telegram from the UI then takes effect without a daemon restart.
`isEnabled() = hasToken && allowedUsers.length > 0`.
Writing happens through the existing `mcp-config-writer` connect path — no new
storage. Secrets never enter CLI config; `TELEGRAM_BOT_TOKEN` continues to be a
`${…}` placeholder there.

## 10. The `getUpdates` conflict (must resolve)

Telegram allows **one** `getUpdates` consumer per bot. The outbound MCP tool
`read_recent` (`mcps/mcp-telegram/src/tools.ts`) also calls `getUpdates`. With
the gateway long-polling continuously, `read_recent` would either steal updates
or get nothing — and a webhook can't coexist with `getUpdates` either.

**Resolution (reuse-the-bot decision):** the gateway is the **sole** `getUpdates`
owner. Then:
- Outbound `send_message` / `edit_message` / `add_reaction` / `get_chat` are
  unaffected (they don't poll).
- `read_recent` becomes redundant for the gateway-owned bot. When the gateway is
  enabled, have `read_recent` return a clear notice ("Cabinet's Telegram remote
  is handling incoming messages; recent inbound text is delivered to your agent
  directly") instead of competing. Detect via a shared marker the gateway writes
  to `data/.agents/.runtime/telegram/owner.json`.
- Document that a **separate** bot is the clean path if someone wants both the
  raw `read_recent` polling tool *and* remote control (the rejected "separate
  bot" option remains available for power users via `TELEGRAM_CHAT_ID` scoping).

## 11. Security model

This feature lets whoever messages the bot **run agents on the user's machine**.
Controls:

- **Allowlist gate, fail-closed.** Every update is checked against
  `TELEGRAM_ALLOWED_USERS` by `from.id`. Not listed ⇒ single refusal reply,
  drop the update, telemetry `telegram.remote.denied`. No allowlist ⇒ gateway
  never starts.
- **DM-only.** Ignore any update whose `chat.type` is not `private` (groups are
  out of scope for v1). Belt-and-suspenders against group leakage.
- **Optional chat scoping.** If `TELEGRAM_CHAT_ID` is set, additionally ignore
  updates from any other chat id.
- **Per-user rate limit.** One in-flight run per chat **plus** a rolling counter
  of **10 messages per 60 s** per `from.id`. Excess ⇒ soft "⏳ slow down, try
  again in a moment" notice (the update is dropped, not queued). Separate from
  the one-deep run queue, which gates concurrency.
- **One active run per chat, queue one.** A new message while a run is live is
  queued (one deep, FIFO) and runs on completion; it never spawns concurrent
  agents. Further messages while one is queued are dropped with a notice.
- **Bot API only.** No MTProto. Inherits the existing safe-by-default posture.
- **No secret echo.** Never print token / allowlist back into chat.
- **Audit.** Every authorized command emits telemetry (sender id hashed) and a
  daemon log line.

## 12. v1 scope & phases

| Phase | Deliverable |
|---|---|
| **0 — Gateway skeleton** | `bot-api.ts` + `gateway.ts` long-poll loop, allowlist gate, **DM-only filter**, **boot fast-forward past the update backlog (§15)**, **`.cabinet.env` watch (§9)**, **daemon-URL/port self-check (§5)**, `/start` `/help`, boot/shutdown wiring in `cabinet-daemon.ts`. Echo-only reply to prove the loop. |
| **1 — Core run** | Text → `startConversationRun` (orchestrator, §7 resolution) → gateway-owned poll loop (explicit large `deadlineMs`) → streamed reply with throttled edits + entity-safe chunking + Rich/plain rendering. Add the `"telegram"` trigger value (§5). One-run-per-chat + **queue (one deep)** + rate limit. |
| **2 — Session controls** | Per-chat conversation pointer + **`continueConversationRun` for follow-up turns (§7)**, `/new`, `/status`, `/stop`. All state in-memory (ephemeral across restarts). |
| **3 — Search + agents** | `/search` → `runSearch(sources, …)` formatted hits (daemon hands the gateway its `SearchSources` at boot). `/agents` list with `@slug` targets. **`@slug` per-message override** routing (one-shot side conversation). |
| **4 — Verbose + rooms** | `/verbose` per-chat toggle (concise ↔ tool lines). `/room` switch via `listRooms()`; persist active room per chat. |
| **5 — Files** | File/photo download + staging under active room + `attachmentPaths` on next run. |
| **6 — `read_recent` coexistence** | Owner marker + `read_recent` notice (§10). **Pending:** the gateway already writes `owner.json` and logs loudly on a 409 getUpdates conflict; the `read_recent` notice itself lives in `cabinet-mcp-telegram` (pinned at 0.1.0 in the catalog) and ships with that package's next npm release. |
| **7 — UI** | Integration page reflects two-way capability + setup steps for allowlist (§14). Done via catalog: blurb, actions line, `TELEGRAM_ALLOWED_USERS` + `TELEGRAM_DEFAULT_AGENT` credential fields, and an "Allow yourself to drive Cabinet" setup step (@userinfobot link). Step-art frame is a nice-to-have follow-up. |

## 13. Multi-cabinet / rooms (in v1)

Cabinet is room-isolated (Rooms v3). Each chat has an **active room** stored in
session state. On first contact the router resolves a **real room** (home
config's `defaultRoom` → `lastActiveRoom` → first room from `listRooms()`);
the neutral home container is the default only when no rooms exist, since
agents writing into it pollute the data root (changed 2026-06-11 after
dogfooding; originally "always home").

- `/room` with no arg: reply with the current room and the list from
  `listRooms()` (which already excludes the home and plain folders).
- `/room <slug>`: validate against `listRooms()`; on match, set the chat's
  `roomPath` and clear the cached orchestrator + current-conversation pointer so
  the next message resolves fresh in the new room. Unknown slug → list options.
- Persona lookup, `/search`, `/agents`, file staging, and the run all use the
  active room's `cabinetPath`.

**Group chats remain out of scope for v1** (DM-only, §3/§11); group support and a
`/projects`-style multi-room picker UI are the natural follow-ups.

## 14. UI / integration page

`/integrations/telegram` currently sells outbound only. Changes:
- `preview-catalog.ts` (telegram item, ~96-104): blurb + actions gain a
  "Control Cabinet from Telegram — run agents, search your KB" capability line.
- `mcp-catalog.ts` Telegram entry: add the `TELEGRAM_ALLOWED_USERS` (and
  optional `TELEGRAM_DEFAULT_AGENT`) credential fields + a setup step "Allow
  yourself to drive Cabinet" explaining how to get your numeric Telegram user
  id (e.g. via @userinfobot).
- `telegram-setup-art.tsx`: add one step-art frame for the allowlist field.
- Detail page "What your agents can do" gains an inbound section ("What you can
  do from Telegram"). No new components — extend existing catalog-driven render.

## 15. Edge cases & failures

- **Token invalid / revoked:** `getMe` check at boot fails ⇒ gateway logs and
  stays down; surfaced as "not connected" without crashing the daemon.
- **Network blips:** long-poll uses bounded backoff. The `getUpdates` offset
  lives in memory only — Telegram acks updates server-side on the next
  `getUpdates` call, so intra-process reconnects neither miss nor duplicate.
- **Boot backlog (stale commands must not auto-run):** Telegram queues
  undelivered updates for ~24 h while the daemon is down. On boot the gateway
  **fast-forwards past the backlog** — drop any update older than ~5 min
  instead of executing stale messages as agent runs — and optionally replies
  once with "back online; ignored N messages sent while I was offline."
  (claude-code-telegram does the same, for the same reason.)
- **Long agent runs:** no wall-clock timeout (matches in-app); placeholder shows
  elapsed and `/stop` always works to end one.
- **Output > limits:** chunk at 4096; very large outputs summarized with a
  "full output in the app" pointer (link to the conversation).
- **Concurrent daemons (dev + packaged):** owner marker prevents two gateways
  fighting over one bot; second instance defers.
- **Markdown that breaks MarkdownV2:** fall back to plain text on escape error.
- **File too large:** Bot API `getFile` cap (~20 MB) ⇒ polite refusal.
- **Unknown `@slug`:** no matching persona in the active room ⇒ run the
  orchestrator and prepend "（no agent `@slug`; using <orchestrator>）".
- **Unknown `/room <slug>`:** reply with the available rooms instead of switching.
- **Queue full:** a message arriving while one is already queued ⇒ dropped with
  "⏳ one already queued, try again after it runs".
- **`/verbose` persistence:** the toggle lives in per-chat in-memory state; a
  daemon restart resets it to concise (off), like the rest of the session.
- **Daemon restart mid-conversation:** session state is in-memory, so each chat
  resets to a fresh conversation in home and any in-flight run is dropped. The
  next message starts clean; `/help` documents this so it isn't surprising.
- **Rate-limit trip:** more than 10 messages in 60 s ⇒ soft "slow down" notice,
  update dropped (not queued); the counter is per `from.id` and rolls.
- **No personas in a room:** orchestrator resolution falls through to `editor`;
  if even that is absent, reply with a clear "this room has no agents yet" note.

## 16. Telemetry

`telegram.remote.enabled`, `.denied`, `.command` (name), `.run.started` /
`.run.completed` (agent, ms, tokens, `viaAtMention`), `.queued`, `.search`,
`.room_switch`, `.verbose_toggle`, `.file_attached`, `.error` (classified).
Sender ids hashed.

## 17. Testing

- **Unit:** allowlist parsing/gate, DM-only filter, command + `@slug` parser,
  MarkdownV2 escaping + plain fallback + entity-safe 4096 chunker (never splits
  inside an entity), orchestrator resolution (§7 fallbacks), room resolution +
  cache invalidation, rate-limit bucket (10/60 s rolling), queue (one-deep FIFO
  + drop-when-full), boot fast-forward (stale updates dropped, fresh kept).
- **Integration (mocked Bot API):** update → run → throttled edits → final;
  first message uses `startConversationRun`, second uses
  `continueConversationRun` on the same conversation id; `@slug` starts a side
  conversation without touching the main pointer; run longer than 15 min still
  completes (explicit `deadlineMs`/`timeoutMs` actually passed); concise vs
  `/verbose` rendering; unknown-slug fallback; `/room` switch changes
  persona/search scope; `/search`; `/new` + resume; queued message runs after
  `/stop`; file → staging → `attachmentPaths`; `.cabinet.env` edit
  starts/stops/reconfigures the gateway without a daemon restart.
- **Manual smoke:** extend `mcps/mcp-telegram/scripts/smoke.mjs` analogue for
  the gateway with a live `TELEGRAM_BOT_TOKEN` + self-id allowlisted.
- **Conflict:** confirm `read_recent` notice when gateway owns the bot.

## 18. Decisions & remaining opens

**Resolved in review (2026-06-10):** chat surface = DM-only · orchestrator
resolution = `TELEGRAM_DEFAULT_AGENT` → first `canDispatch` → `editor` · verbosity
= concise + `/verbose` · agent override = `@slug` per message · file = attach to
next · concurrency = queue (one deep) · reply format = MarkdownV2 with plain
fallback · rooms = `/room` switch in v1 (default home) · **session state =
ephemeral in-memory (no snapshot)** · **run timeout = none, rely on `/stop`** ·
**default room = always home, no `TELEGRAM_DEFAULT_ROOM` env** · **rate limit =
1 in-flight + 10 messages / 60 s**. See §2.

**Verified against source (2026-06-10 review):** every cited seam was checked
against the code. Four claims were corrected as a result: (1) completion must
come from a gateway-owned poll loop with explicit large deadlines, because
`waitForConversationCompletion` and `pollDaemonSessionUntilDone` hard-default
to 15 minutes (§5/§7/§8); (2) the daemon does **not** watch `.cabinet.env` —
the gateway brings its own watch (§5/§9); (3) conversation continuity requires
`continueConversationRun`, since `startConversationRun` always creates a new
conversation (§5/§7); (4) `runSearch` is positional and needs the daemon's
`SearchSources` (§5/§6). Plus: new `"telegram"` trigger value (§5), boot
fast-forward past the update backlog (§15), daemon-URL/port self-check (§5),
typing keep-alive + entity-safe chunking (§8).

**Remaining minor open (sensible default assumed; flag to change):**
1. **Archive uploads:** auto-extract `.zip` into the staging dir, or attach the
   archive as-is? *Default: attach as-is in v1; extraction is a follow-up (§19).*

## 19. Out of scope (explicit, vs claude-code-telegram)

Group chats · sticky `/use <slug>` agent mode · voice transcription · `/git` ·
`/cd`/`/ls` filesystem nav · cron-from-Telegram · inbound webhook/GitHub HMAC
server · per-user cost ceilings · inline-keyboard quick actions · `/export` ·
archive auto-extraction. All are credible follow-ups; none are v1.
