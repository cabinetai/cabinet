// Local end-to-end smoke test: spawn the built server over real stdio and drive
// it through the MCP protocol. With TELEGRAM_BOT_TOKEN set, also exercises a live
// call. Run in your own terminal so the token doesn't land in a transcript.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
const env = {};
for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env,
  stderr: "inherit",
});
const client = new Client({ name: "cabinet-mcp-telegram-smoke", version: "0" });

function textOf(res) {
  return (res?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n") || JSON.stringify(res);
}

try {
  await client.connect(transport);
} catch (err) {
  console.error("\n[smoke] Server did not come up over stdio.");
  if (!hasToken) {
    console.error("[smoke] TELEGRAM_BOT_TOKEN not set — the server exits before connecting.");
    console.error("[smoke] Live test:  TELEGRAM_BOT_TOKEN=... npm run smoke");
    process.exit(2);
  }
  console.error("[smoke] error:", err?.message ?? err);
  process.exit(1);
}

const { tools } = await client.listTools();
console.log(`\n[smoke] ✅ connected — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

if (hasToken) {
  const r = await client.callTool({ name: "read_recent", arguments: { limit: 5 } });
  console.log("\n[smoke] read_recent →\n" + textOf(r));
  if (r.isError) {
    console.error("\n[smoke] ⚠️ a live call returned an error (see above).");
    await client.close();
    process.exit(1);
  }
  console.log("\n[smoke] ✅ live Telegram call succeeded.");
}

await client.close();
process.exit(0);
