import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleMcpGatewayContext } from "./mcp-gateway";

let tempRoot: string;
type McpServer = typeof import("./mcp-server");
let mcpServer: McpServer;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-mcp-server-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;

  await fs.writeFile(
    path.join(tempRoot, ".cabinet"),
    ["schemaVersion: 1", "id: mcp-test", "name: MCP Test", "kind: root", ""].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(tempRoot, "index.md"), "# MCP Test\n", "utf8");
  await fs.mkdir(path.join(tempRoot, "clients", "acme"), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, "clients", "acme", ".cabinet"),
    ["schemaVersion: 1", "id: acme", "name: Acme", "kind: cabinet", ""].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(tempRoot, "clients", "acme", "index.md"), "# Acme\n", "utf8");

  mcpServer = await import("./mcp-server");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("listOptaleMcpTools exposes read tools and hides actions by default", async () => {
  const names = (await mcpServer.listOptaleMcpTools()).map((tool) => tool.name);

  assert.ok(names.includes("optale_context_registry"));
  assert.ok(names.includes("optale_brain_summary"));
  assert.ok(names.includes("optale_command_center_snapshot"));
  assert.ok(!names.includes("optale_command_center_action"));
});

test("listOptaleMcpTools hides actions when gateway context is read-only", async () => {
  const names = (
    await mcpServer.listOptaleMcpTools({
      includeActions: true,
      gatewayContext: {
        requestId: "readonly-list",
        clientId: "readonly-client",
        authorized: true,
        authType: "bearer",
        cabinetPathLocked: false,
        permissions: ["read"],
        allowedTools: [],
        deniedTools: [],
        canUseActions: false,
        auditEnabled: false,
      },
    })
  ).map((tool) => tool.name);

  assert.ok(!names.includes("optale_command_center_action"));
});

test("handleOptaleMcpJsonRpc handles initialize and tools/list", async () => {
  const initialized = await mcpServer.handleOptaleMcpJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  assert.equal((initialized as { result?: { serverInfo?: { name?: string } } }).result?.serverInfo?.name, "optale-agents");

  const listed = await mcpServer.handleOptaleMcpJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  const tools = (listed as { result?: { tools?: Array<{ name: string }> } }).result?.tools || [];
  assert.ok(tools.find((tool) => tool.name === "optale_mcp_policy"));
});

test("callOptaleMcpTool returns cabinet brain data", async () => {
  const result = await mcpServer.callOptaleMcpTool("optale_brain_summary", {
    cabinetPath: ".",
  });
  const parsed = JSON.parse(result.content[0]?.text || "{}") as {
    cabinet?: { name?: string };
  };

  assert.equal(result.isError, undefined);
  assert.equal(parsed.cabinet?.name, "MCP Test");
});

test("gateway context can default and lock cabinet access", async () => {
  const context: OptaleMcpGatewayContext = {
    requestId: "scoped-call",
    clientId: "scoped-client",
    authorized: true,
    authType: "bearer" as const,
    defaultCabinetPath: "clients/acme",
    cabinetPathLocked: true,
    agentScope: "company" as const,
    permissions: ["read"],
    allowedTools: [],
    deniedTools: [],
    canUseActions: false,
    auditEnabled: false,
  };
  const result = await mcpServer.callOptaleMcpTool(
    "optale_brain_summary",
    {},
    { gatewayContext: context }
  );
  const parsed = JSON.parse(result.content[0]?.text || "{}") as {
    cabinet?: { name?: string };
  };

  assert.equal(result.isError, undefined);
  assert.equal(parsed.cabinet?.name, "Acme");

  const denied = await mcpServer.callOptaleMcpTool(
    "optale_brain_summary",
    { cabinetPath: "." },
    { gatewayContext: context }
  );

  assert.equal(denied.isError, true);
  assert.match(denied.content[0]?.text || "", /scoped to cabinet clients\/acme/);
});

test("gateway context can restrict visible and callable tools", async () => {
  const context: OptaleMcpGatewayContext = {
    requestId: "allowlist-call",
    clientId: "allowlist-client",
    authorized: true,
    authType: "bearer" as const,
    cabinetPathLocked: false,
    permissions: ["read"],
    allowedTools: ["optale_mcp_policy"],
    deniedTools: [],
    canUseActions: false,
    auditEnabled: false,
  };
  const listed = await mcpServer.listOptaleMcpTools({ gatewayContext: context });
  assert.deepEqual(listed.map((tool) => tool.name), ["optale_mcp_policy"]);

  const denied = await mcpServer.callOptaleMcpTool(
    "optale_brain_summary",
    {},
    { gatewayContext: context }
  );

  assert.equal(denied.isError, true);
  assert.match(denied.content[0]?.text || "", /not allowed/);
});

test("downstream gateway lists and calls read-only QMD/Graphiti tools", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    calls.push({ url, body });
    const method = body.method;
    const isGraphiti = url.includes("8102");
    const sessionId = isGraphiti ? "graphiti-session" : "qmd-session";

    if (method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: isGraphiti ? "graphiti" : "qmd" },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "mcp-session-id": sessionId,
          },
        }
      );
    }

    if (method === "notifications/initialized") {
      return new Response("", { status: 202 });
    }

    if (method === "tools/list") {
      const tools = isGraphiti
        ? [
            {
              name: "add_memory",
              description: "write memory",
              inputSchema: { type: "object" },
            },
            {
              name: "search_nodes",
              description: "search nodes",
              inputSchema: { type: "object" },
            },
            {
              name: "delete_episode",
              description: "delete episode",
              inputSchema: { type: "object" },
            },
            {
              name: "get_status",
              description: "status",
              inputSchema: { type: "object" },
            },
          ]
        : [
            {
              name: "query",
              description: "search vault",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
            },
            {
              name: "status",
              description: "index status",
              inputSchema: { type: "object" },
              annotations: { readOnlyHint: true },
            },
          ];
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (method === "tools/call") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, server: isGraphiti ? "graphiti" : "qmd" }),
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const context: OptaleMcpGatewayContext = {
    requestId: "downstream-list",
    clientId: "downstream-client",
    authorized: true,
    authType: "bearer",
    defaultCabinetPath: ".",
    cabinetPathLocked: false,
    permissions: ["read"],
    allowedTools: [],
    deniedTools: [],
    canUseActions: false,
    auditEnabled: false,
  };
  const tools = await mcpServer.listOptaleMcpTools({
    gatewayContext: context,
    includeDownstream: true,
  });
  const names = tools.map((tool) => tool.name);

  assert.ok(names.includes("qmd__query"));
  assert.ok(names.includes("qmd__status"));
  assert.ok(names.includes("graphiti__search_nodes"));
  assert.ok(names.includes("graphiti__get_status"));
  assert.ok(!names.includes("graphiti__add_memory"));
  assert.ok(!names.includes("graphiti__delete_episode"));

  const called = await mcpServer.callOptaleMcpTool(
    "qmd__status",
    {},
    { gatewayContext: context, includeDownstream: true }
  );

  assert.equal(called.isError, undefined);
  assert.match(called.content[0]?.text || "", /"server":"qmd"/);
  const toolCall = calls.find((call) => call.body.method === "tools/call");
  assert.ok(toolCall);
  assert.deepEqual(
    ((toolCall.body.params as Record<string, unknown>).arguments as Record<string, unknown>),
    {}
  );

  const writeDenied = await mcpServer.callOptaleMcpTool(
    "graphiti__add_memory",
    { name: "Nope", episode_body: "Do not write" },
    { gatewayContext: context, includeDownstream: true }
  );
  assert.equal(writeDenied.isError, true);
  assert.match(writeDenied.content[0]?.text || "", /read-only/);

  const allowlisted = await mcpServer.listOptaleMcpTools({
    gatewayContext: {
      ...context,
      allowedTools: ["qmd__status"],
    },
    includeDownstream: true,
  });
  assert.deepEqual(allowlisted.map((tool) => tool.name), ["qmd__status"]);

  const qmdServerOnly = await mcpServer.listOptaleMcpTools({
    gatewayContext: context,
    includeDownstream: true,
    allowedServerIds: ["qmd"],
  });
  const qmdServerOnlyNames = qmdServerOnly.map((tool) => tool.name);
  assert.deepEqual(qmdServerOnlyNames.sort(), ["qmd__query", "qmd__status"]);
  assert.ok(!qmdServerOnlyNames.includes("graphiti__search_nodes"));
  assert.ok(!qmdServerOnlyNames.includes("optale_context_registry"));

  const builtInDenied = await mcpServer.callOptaleMcpTool(
    "optale_context_registry",
    {},
    { gatewayContext: context, allowedServerIds: ["qmd"] }
  );
  assert.equal(builtInDenied.isError, true);
  assert.match(builtInDenied.content[0]?.text || "", /not allowed for this run/);

  const graphitiDenied = await mcpServer.callOptaleMcpTool(
    "graphiti__get_status",
    {},
    {
      gatewayContext: context,
      includeDownstream: true,
      allowedServerIds: ["qmd"],
    }
  );
  assert.equal(graphitiDenied.isError, true);
  assert.match(graphitiDenied.content[0]?.text || "", /not allowed for this run/);
});

test("gateway context enforces daily tool-call budget", async () => {
  const context: OptaleMcpGatewayContext = {
    requestId: "budget-call",
    clientId: `budget-client-${Date.now()}`,
    authorized: true,
    authType: "bearer" as const,
    cabinetPathLocked: false,
    permissions: ["read"],
    allowedTools: [],
    deniedTools: [],
    budget: { dailyToolCalls: 1 },
    canUseActions: false,
    auditEnabled: true,
  };

  const first = await mcpServer.callOptaleMcpTool(
    "optale_context_registry",
    {},
    { gatewayContext: context }
  );
  const second = await mcpServer.callOptaleMcpTool(
    "optale_context_registry",
    {},
    { gatewayContext: context }
  );

  assert.equal(first.isError, undefined);
  assert.equal(second.isError, true);
  assert.match(second.content[0]?.text || "", /daily tool-call budget/);
});

test("write/control action tool is gated", async () => {
  const result = await mcpServer.callOptaleMcpTool("optale_command_center_action", {
    action: "create_task",
    toAgent: "editor",
    title: "Test task",
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text || "", /disabled/i);
});

test("handleOptaleMcpJsonRpc writes compact audit events for gateway callers", async () => {
  const audit = await import("./mcp-audit-log");
  const requestId = "audit-jsonrpc";

  await mcpServer.handleOptaleMcpJsonRpc(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "optale_brain_summary",
        arguments: { cabinetPath: "clients/acme" },
      },
    },
    {
      gatewayContext: {
        requestId,
        clientId: "audit-client",
        authorized: true,
        authType: "bearer",
        cabinetPathLocked: false,
        permissions: ["read"],
        allowedTools: [],
        deniedTools: [],
        canUseActions: false,
        auditEnabled: true,
      },
    }
  );

  const lines = (await fs.readFile(audit.getOptaleMcpAuditLogPath(), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const event = lines.find((entry) => entry.requestId === requestId);

  assert.equal(event?.clientId, "audit-client");
  assert.equal(event?.method, "tools/call");
  assert.equal(event?.toolName, "optale_brain_summary");
  assert.equal(event?.cabinetPath, "clients/acme");
  assert.deepEqual(event?.argumentKeys, ["cabinetPath"]);
  assert.equal(event?.outcome, "ok");
});
