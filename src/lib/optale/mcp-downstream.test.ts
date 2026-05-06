import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  readOptaleMcpServers,
  type OptaleMcpServerConfig,
} from "./context-registry";
import {
  callDownstreamOptaleMcpTool,
  parseEventStream,
  postDownstreamJsonRpc,
  resolveDownstreamHttpTimeoutMs,
} from "./mcp-downstream";
import { buildInternalOptaleMcpGatewayContext } from "./mcp-gateway";
import { writeCabinetOptaleScope } from "./scope-registry";

function testServer(
  overrides: Partial<OptaleMcpServerConfig> = {},
): OptaleMcpServerConfig {
  return {
    id: "qmd",
    name: "QMD",
    transport: "http",
    url: "http://example.test/mcp",
    timeoutMs: 120_000,
    scopes: ["system"],
    description: "test",
    status: "configured",
    ...overrides,
  };
}

function jsonRpcResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("parseEventStream returns the final parseable SSE payload", () => {
  const parsed = parseEventStream(
    [
      'event: message\ndata: {"jsonrpc":"2.0","method":"progress","params":{"step":1}}',
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"final"}]}}',
      "data: [DONE]",
    ].join("\n\n"),
  );

  assert.deepEqual(parsed, {
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [{ type: "text", text: "final" }],
    },
  });
});

test("qmd uses the longer downstream timeout by default", (t) => {
  const originalQmdTimeout = process.env.OPTALE_MCP_QMD_TIMEOUT_MS;
  const originalGraphitiTimeout = process.env.OPTALE_MCP_GRAPHITI_TIMEOUT_MS;
  delete process.env.OPTALE_MCP_QMD_TIMEOUT_MS;
  delete process.env.OPTALE_MCP_GRAPHITI_TIMEOUT_MS;
  t.after(() => {
    if (originalQmdTimeout === undefined) {
      delete process.env.OPTALE_MCP_QMD_TIMEOUT_MS;
    } else {
      process.env.OPTALE_MCP_QMD_TIMEOUT_MS = originalQmdTimeout;
    }
    if (originalGraphitiTimeout === undefined) {
      delete process.env.OPTALE_MCP_GRAPHITI_TIMEOUT_MS;
    } else {
      process.env.OPTALE_MCP_GRAPHITI_TIMEOUT_MS = originalGraphitiTimeout;
    }
  });

  const servers = readOptaleMcpServers();
  const qmd = servers.find((server) => server.id === "qmd");
  const graphiti = servers.find((server) => server.id === "graphiti");

  assert.equal(qmd?.timeoutMs, 120_000);
  assert.equal(qmd ? resolveDownstreamHttpTimeoutMs(qmd) : null, 120_000);
  assert.equal(
    graphiti ? resolveDownstreamHttpTimeoutMs(graphiti) : null,
    4_000,
  );
});

test("delayed qmd response below its timeout succeeds", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((init?.signal as AbortSignal | undefined)?.aborted, false);
    return jsonRpcResponse({
      jsonrpc: "2.0",
      id: 2,
      result: { content: [{ type: "text", text: "qmd result" }] },
    });
  }) as typeof fetch;

  const result = await postDownstreamJsonRpc(
    testServer({ timeoutMs: 120_000 }),
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "query", arguments: { searches: [] } },
    },
  );

  assert.deepEqual(result.body, {
    jsonrpc: "2.0",
    id: 2,
    result: { content: [{ type: "text", text: "qmd result" }] },
  });
});

test("downstream timeout reports an explicit server timeout error", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () =>
          reject(new DOMException("This operation was aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;

  await assert.rejects(
    () =>
      postDownstreamJsonRpc(testServer({ id: "qmd", timeoutMs: 10 }), {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "query", arguments: { searches: [] } },
      }),
    /Downstream MCP server qmd tools\/call timed out after 10ms/,
  );
});

test("non-qmd downstream servers remain bounded by the default timeout", () => {
  assert.equal(
    resolveDownstreamHttpTimeoutMs(
      testServer({
        id: "graphiti",
        timeoutMs: undefined,
      }),
    ),
    4_000,
  );
});

test("oag downstream calls inherit the cabinet workspace ontology scope", async (t) => {
  const originalFetch = globalThis.fetch;
  const env = process.env as Record<string, string | undefined>;
  const envKeys = [
    "CABINET_DATA_DIR",
    "NODE_ENV",
    "OPTALE_MCP_LOCAL_DEFAULTS",
    "OPTALE_MCP_OAG_URL",
    "OPTALE_OAG_WORKSPACE_ID",
    "OPTALE_OAG_ONTOLOGY_ID",
    "OAG_WORKSPACE_ID",
    "OAG_ONTOLOGY_ID",
  ] as const;
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-oag-downstream-test-"),
  );
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  env.CABINET_DATA_DIR = tempRoot;
  env.NODE_ENV = "production";
  env.OPTALE_MCP_LOCAL_DEFAULTS = "false";
  env.OPTALE_MCP_OAG_URL = "http://oag.test/mcp";
  delete env.OPTALE_OAG_WORKSPACE_ID;
  delete env.OPTALE_OAG_ONTOLOGY_ID;
  delete env.OAG_WORKSPACE_ID;
  delete env.OAG_ONTOLOGY_ID;
  await writeCabinetOptaleScope(".", {
    scope: "personal",
    ownerId: "thor",
    userId: "thor",
  });

  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;
    calls.push(body);
    if (body.method === "tools/list") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "graph",
              inputSchema: {
                type: "object",
                properties: {
                  limit: { type: "number" },
                  workspaceId: { type: "string" },
                  ontologyId: { type: "string" },
                },
              },
            },
          ],
        },
      });
    }
    if (body.method === "tools/call") {
      return jsonRpcResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: "ok" }] },
      });
    }
    return jsonRpcResponse({
      jsonrpc: "2.0",
      id: body.id,
      result: {},
    });
  }) as typeof fetch;

  const result = await callDownstreamOptaleMcpTool(
    "oag__graph",
    { cabinetPath: ".", limit: 9 },
    {
      includeDownstream: true,
      allowedServerIds: ["oag"],
      gatewayContext: buildInternalOptaleMcpGatewayContext({
        clientId: "test-oag-scope",
        defaultCabinetPath: ".",
        permissions: ["read"],
        auditEnabled: false,
      }),
    },
  );

  assert.equal(result?.isError, undefined);
  const toolCall = calls.find((call) => call.method === "tools/call");
  const params = toolCall?.params as
    | { name?: string; arguments?: Record<string, unknown> }
    | undefined;
  assert.equal(params?.name, "graph");
  assert.deepEqual(params?.arguments, {
    limit: 9,
    workspaceId: "personal:thor",
    ontologyId: "thor-personal-ontology-canary",
  });
});
