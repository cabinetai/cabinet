/**
 * Local end-to-end smoke test.
 *
 * Spawns the built server (`dist/index.js`) over real stdio — exactly how an
 * agent CLI launches it — and drives it through the MCP protocol:
 *   1. connect + initialize
 *   2. tools/list
 *   3. (only if DISCORD_TOKEN is set) call get_server_info + list_channels
 *
 * Run:
 *   npm run build
 *   DISCORD_TOKEN=... DISCORD_GUILD_ID=... npm run smoke
 *
 * Without a token it still verifies the spawn + that the server fails cleanly.
 * Tip: run it in your own terminal so the token never lands in a transcript.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const hasToken = !!process.env.DISCORD_TOKEN;

// The SDK's stdio transport scrubs env to a safe subset by default — pass our
// own so DISCORD_TOKEN / DISCORD_GUILD_ID actually reach the child.
const env = {};
for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env,
  stderr: "inherit", // surface the server's "ready as <bot>" / error logs
});

const client = new Client({ name: "cabinet-mcp-discord-smoke", version: "0" });

function textOf(res) {
  return (
    (res?.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n") || JSON.stringify(res)
  );
}

try {
  await client.connect(transport);
} catch (err) {
  console.error("\n[smoke] Server did not come up over stdio.");
  if (!hasToken) {
    console.error("[smoke] DISCORD_TOKEN is not set, so the server exits before connecting.");
    console.error("[smoke] Live test:  DISCORD_TOKEN=... DISCORD_GUILD_ID=... npm run smoke");
    process.exit(2);
  }
  console.error("[smoke] error:", err?.message ?? err);
  process.exit(1);
}

const { tools } = await client.listTools();
console.log(`\n[smoke] ✅ connected — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

if (hasToken) {
  try {
    const info = await client.callTool({ name: "get_server_info", arguments: {} });
    console.log("\n[smoke] get_server_info →\n" + textOf(info));
    const channels = await client.callTool({ name: "list_channels", arguments: {} });
    console.log("\n[smoke] list_channels →\n" + textOf(channels));
    if (info.isError || channels.isError) {
      console.error(
        "\n[smoke] ⚠️  Logged in, but a Discord call failed (see above). Usual causes: the bot " +
          "hasn't been invited to the server, or DISCORD_GUILD_ID is the wrong server.",
      );
      await client.close();
      process.exit(1);
    }
    console.log("\n[smoke] ✅ live Discord calls succeeded.");
  } catch (err) {
    console.error("\n[smoke] ❌ tool call failed:", err?.message ?? err);
    await client.close();
    process.exit(1);
  }
} else {
  console.log("[smoke] (set DISCORD_TOKEN to also exercise the live Discord path)");
}

await client.close();
process.exit(0);
