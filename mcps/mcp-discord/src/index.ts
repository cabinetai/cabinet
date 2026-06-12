/**
 * cabinet-mcp-discord — entry point.
 *
 * Reads config from the environment (Cabinet injects DISCORD_TOKEN et al. from
 * .cabinet.env at spawn — they are never written into the CLI config), logs in
 * to Discord with the minimal intents, then serves the tool surface over stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, type DiscordContext } from "./discord.js";
import { registerTools } from "./tools.js";

declare const CABINET_MCP_DISCORD_VERSION: string;

const VERSION = typeof CABINET_MCP_DISCORD_VERSION === "string" ? CABINET_MCP_DISCORD_VERSION : "0.0.0";

function truthy(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true";
}

/**
 * Accept only a real snowflake. This also makes the optional var safe when it
 * arrives empty or as an unexpanded `${DISCORD_GUILD_ID}` placeholder (e.g. the
 * user left Server ID blank) — we treat anything non-numeric as "unset".
 */
function sanitizeGuildId(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t && /^\d{15,21}$/.test(t) ? t : undefined;
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    // Write to stderr — stdout is the MCP transport and must stay clean.
    console.error(
      "cabinet-mcp-discord: DISCORD_TOKEN is not set. Add it in Cabinet → Settings → " +
        "Integrations → Discord (it is stored in .cabinet.env, never in the CLI config).",
    );
    process.exit(1);
  }

  const client = await createClient(token);

  const ctx: DiscordContext = {
    client,
    allowedGuildId: sanitizeGuildId(process.env.DISCORD_GUILD_ID),
    adminEnabled: truthy(process.env.DISCORD_ALLOW_ADMIN),
  };

  const server = new McpServer({ name: "cabinet-mcp-discord", version: VERSION });
  registerTools(server, ctx);

  const shutdown = async () => {
    try {
      await client.destroy();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
  console.error(
    `cabinet-mcp-discord v${VERSION} ready as ${client.user?.tag}` +
      `${ctx.allowedGuildId ? ` (scoped to guild ${ctx.allowedGuildId})` : ""}` +
      `${ctx.adminEnabled ? " [admin enabled]" : ""}.`,
  );
}

main().catch((err) => {
  console.error("cabinet-mcp-discord: fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
