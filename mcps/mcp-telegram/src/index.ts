/**
 * cabinet-mcp-telegram — entry point.
 *
 * Reads config from the environment (Cabinet injects it from .cabinet.env at
 * spawn; never written into the CLI config), verifies the bot token, then serves
 * the tool surface over stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { callApi, sanitizeChatId, type TelegramContext, type TgUser } from "./telegram.js";
import { registerTools } from "./tools.js";

declare const CABINET_MCP_TELEGRAM_VERSION: string;
const VERSION = typeof CABINET_MCP_TELEGRAM_VERSION === "string" ? CABINET_MCP_TELEGRAM_VERSION : "0.0.0";

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error(
      "cabinet-mcp-telegram: TELEGRAM_BOT_TOKEN is not set. Add it in Cabinet → Settings → " +
        "Integrations → Telegram (stored in .cabinet.env, never in the CLI config).",
    );
    process.exit(1);
  }

  const ctx: TelegramContext = {
    token,
    allowedChatId: sanitizeChatId(process.env.TELEGRAM_CHAT_ID),
    adminEnabled: truthy(process.env.TELEGRAM_ALLOW_ADMIN),
  };

  // Verify the token up front (stdout stays clean for the MCP transport).
  let me: TgUser;
  try {
    me = await callApi<TgUser>(ctx, "getMe");
    ctx.botUsername = me.username;
  } catch (err) {
    console.error("cabinet-mcp-telegram: fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const server = new McpServer({ name: "cabinet-mcp-telegram", version: VERSION });
  registerTools(server, ctx);

  await server.connect(new StdioServerTransport());
  console.error(
    `cabinet-mcp-telegram v${VERSION} ready as @${ctx.botUsername}` +
      `${ctx.allowedChatId ? ` (scoped to chat ${ctx.allowedChatId})` : ""}` +
      `${ctx.adminEnabled ? " [admin enabled]" : ""}.`,
  );
}

main().catch((err) => {
  console.error("cabinet-mcp-telegram: fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
