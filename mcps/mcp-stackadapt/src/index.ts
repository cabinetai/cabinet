import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import type { StackAdaptContext } from "./stackadapt.js";

declare const CABINET_MCP_STACKADAPT_VERSION: string;

const VERSION =
  typeof CABINET_MCP_STACKADAPT_VERSION === "string"
    ? CABINET_MCP_STACKADAPT_VERSION
    : "0.0.0";

async function main(): Promise<void> {
  const token = process.env.STACKADAPT_API_TOKEN?.trim();
  if (!token) {
    console.error(
      "cabinet-mcp-stackadapt: STACKADAPT_API_TOKEN is not set. Add it in Cabinet -> Settings -> Integrations -> StackAdapt.",
    );
    process.exit(1);
  }

  const ctx: StackAdaptContext = {
    token,
    endpoint:
      process.env.STACKADAPT_API_URL?.trim() ||
      "https://api.stackadapt.com/graphql",
  };

  const server = new McpServer({
    name: "cabinet-mcp-stackadapt",
    version: VERSION,
  });
  registerTools(server, ctx);

  await server.connect(new StdioServerTransport());
  console.error(`cabinet-mcp-stackadapt v${VERSION} ready.`);
}

main().catch((err) => {
  console.error(
    "cabinet-mcp-stackadapt: fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
