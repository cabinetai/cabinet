import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type McpRuntime = typeof import("./mcp-runtime");
let runtime: McpRuntime;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-mcp-runtime-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  runtime = await import("./mcp-runtime");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("prepareGovernedMcpRuntime materializes scoped Claude and Codex MCP config", async () => {
  const prepared = await runtime.prepareGovernedMcpRuntime({
    sessionId: "run:personal/test",
    cabinetPath: "personal/thor",
    agentScope: "personal",
  });
  const governed = prepared.adapterConfigPatch.governedMcp;
  const ids = [...governed.allowedServerIds].sort();

  assert.equal(governed.enabled, true);
  assert.equal(governed.enforcement, "strict-config");
  assert.equal(governed.cabinetScope, "personal");
  assert.equal(governed.agentScope, "personal");
  assert.deepEqual(ids, ["graphiti", "matrix", "oag", "optale-agents", "qmd"]);

  const claudeConfig = JSON.parse(
    await fs.readFile(governed.claudeConfigPath, "utf8")
  ) as { mcpServers: Record<string, { type?: string; url?: string }> };
  assert.deepEqual(Object.keys(claudeConfig.mcpServers).sort(), ids);
  assert.equal(claudeConfig.mcpServers.qmd.type, "http");
  assert.match(claudeConfig.mcpServers.qmd.url || "", /7333\/mcp$/);

  const codexArgs = governed.codexConfigArgs.join("\n");
  assert.match(codexArgs, /--ignore-user-config/);
  assert.match(codexArgs, /mcp_servers\.qmd\.url/);
  assert.match(codexArgs, /mcp_servers\.graphiti\.url/);
  assert.match(codexArgs, /mcp_servers\.matrix\.url/);
  assert.match(codexArgs, /mcp_servers\.oag\.url/);
  assert.match(codexArgs, /mcp_servers\.optale-agents\.url/);
  assert.doesNotMatch(codexArgs, /mcp_servers\.twenty/);
});

test("prepareGovernedMcpRuntime applies per-run server and tool allowlist overrides", async () => {
  const prepared = await runtime.prepareGovernedMcpRuntime({
    sessionId: "run:qmd-only/test",
    cabinetPath: "personal/thor",
    agentScope: "personal",
    allowedServerIds: ["qmd"],
    allowedTools: ["qmd__query"],
  });
  const governed = prepared.adapterConfigPatch.governedMcp;

  assert.deepEqual(governed.allowedServerIds, ["qmd"]);
  assert.deepEqual(governed.allowedTools, ["qmd__query"]);

  const claudeConfig = JSON.parse(
    await fs.readFile(governed.claudeConfigPath, "utf8")
  ) as { mcpServers: Record<string, { type?: string; url?: string }> };
  assert.deepEqual(Object.keys(claudeConfig.mcpServers), ["qmd"]);

  const codexArgs = governed.codexConfigArgs.join("\n");
  assert.match(codexArgs, /mcp_servers\.qmd\.url/);
  assert.doesNotMatch(codexArgs, /mcp_servers\.graphiti/);
  assert.doesNotMatch(codexArgs, /mcp_servers\.optale-agents/);
});
