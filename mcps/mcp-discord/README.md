# cabinet-mcp-discord

A small, **agent-shaped** Discord [MCP](https://modelcontextprotocol.io) server,
maintained by [Cabinet](https://github.com/hilash/cabinet).

Discord has no official MCP server, and the community ones are built for
human-driven chat clients — they expose 60–139 tools, including destructive
admin actions, to whatever model is driving them. This server takes the
opposite stance: a **curated read + post + threads surface**, with destructive
admin actions **off by default** and gated behind an explicit flag.

## Tools

**Read** — `list_channels`, `read_messages`, `find_messages`, `get_server_info`
**Post** — `send_message`, `create_thread`, `add_reaction`, `edit_message`, `delete_message` *(own messages only)*
**Admin** *(only when `DISCORD_ALLOW_ADMIN=1`)* — `delete_any_message`, `kick_member`, `ban_member`

## Configuration

| Env var | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token (Developer Portal → Bot → Reset Token). |
| `DISCORD_GUILD_ID` | recommended | Pin every operation to one server. If the bot is in others, they become unreachable — defense-in-depth for autonomous agents. |
| `DISCORD_ALLOW_ADMIN` | no | `1`/`true` registers the destructive admin tools. Default: off. |

The bot requires the **Message Content** privileged intent (to read message
text) and the channel permissions for what you want it to do (e.g. *Send
Messages*). It does **not** request the *Server Members* intent — there is no
member-enumeration tool by design.

## Run

```bash
DISCORD_TOKEN=... DISCORD_GUILD_ID=... npx cabinet-mcp-discord
```

Or register it in any MCP client's config:

```jsonc
{
  "mcpServers": {
    "cabinet-discord": {
      "command": "npx",
      "args": ["-y", "cabinet-mcp-discord"],
      "env": { "DISCORD_TOKEN": "...", "DISCORD_GUILD_ID": "..." }
    }
  }
}
```

Inside Cabinet this entry is written for you by **Settings → Integrations →
Discord**; the token lives only in `.cabinet.env` (0600) and is injected at
spawn — never written into the CLI config.

## Develop

```bash
npm install
npm run build      # bundles src → dist/index.js (ESM, shebang)
npm run typecheck
```

## Security notes

- The bot token is a static credential with access to every server the bot
  joins. Scope it: set `DISCORD_GUILD_ID`, grant least-privilege channel
  permissions, and only enable Message Content if you need to read messages.
- `edit_message` / `delete_message` only touch the bot's own messages unless
  admin mode is on.
- stdout is reserved for the MCP transport; all logs go to stderr.
