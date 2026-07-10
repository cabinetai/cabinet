# cabinet-mcp-telegram

A small, **agent-shaped** Telegram [MCP](https://modelcontextprotocol.io) server,
maintained by [Cabinet](https://github.com/cabinetai/cabinet).

Telegram has no official MCP, and the community ones use **MTProto** (full
*user-account* access — every private chat, impersonation, ToS-gray). This server
takes the safe path: the **Bot API** with a bot token, so the bot only ever
touches chats it was explicitly added to — the same stance as our Discord server.

## Tools

**Read** — `get_chat`, `read_recent`
**Post** — `send_message`, `edit_message`, `delete_message`, `add_reaction`
**Admin** *(only when `TELEGRAM_ALLOW_ADMIN=1`)* — `pin_message`, `ban_member`

> Bot API limitation: bots **cannot read old chat history** — `read_recent` only
> returns messages delivered to the bot after it joined. Full history would
> require MTProto (user-account), which we intentionally don't do.

## Configuration

| Env var | Required | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_CHAT_ID` | recommended | Pin every action to one chat (numeric id or `@username`). |
| `TELEGRAM_ALLOW_ADMIN` | no | `1`/`true` registers pin/ban. Default: off. |

## Run

```bash
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=@yourchannel npx cabinet-mcp-telegram
```

Inside Cabinet this is registered for you by **Settings → Integrations →
Telegram**; the token lives only in `.cabinet.env` (0600) and is injected at
spawn — never written into the CLI config.

## Develop

```bash
npm install
npm run build     # bundles src → dist/index.js (ESM, shebang)
npm run typecheck
npm run smoke     # spawns the server over stdio; add TELEGRAM_BOT_TOKEN for a live check
```
