import test from "node:test";
import assert from "node:assert/strict";
import { openRouterApiAdapter } from "./openrouter-api";
import type { AdapterInvocationMeta } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function governedConfig(
  governedMcp: Partial<{
    allowedServerIds: string[];
    allowedTools: string[];
  }> = {},
) {
  return {
    governedMcp: {
      enabled: true,
      enforcement: "strict-config",
      allowedServerIds: ["optale-agents"],
      allowedTools: [],
      claudeConfigPath: "/tmp/optale-mcp.json",
      codexConfigArgs: [],
      ...governedMcp,
    },
  };
}

test("openRouterApiAdapter sends a chat completion with Optale MCP tools", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAudit = process.env.OPTALE_MCP_AUDIT_LOG;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPTALE_MCP_AUDIT_LOG = "false";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
    if (originalAudit === undefined) {
      delete process.env.OPTALE_MCP_AUDIT_LOG;
    } else {
      process.env.OPTALE_MCP_AUDIT_LOG = originalAudit;
    }
  });

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(
      JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    );
    return jsonResponse({
      id: "gen-1",
      model: "openrouter/auto",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Hello from OpenRouter." },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
  }) as typeof fetch;

  let invocation: AdapterInvocationMeta | undefined;
  const chunks: string[] = [];
  const result = await openRouterApiAdapter.execute?.({
    runId: "run-openrouter-1",
    adapterType: "openrouter_api",
    config: governedConfig(),
    prompt: "Say hello",
    cwd: process.cwd(),
    onLog: async (_stream, chunk) => {
      chunks.push(chunk);
    },
    onMeta: async (meta) => {
      invocation = meta;
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "Hello from OpenRouter.");
  assert.equal(result.provider, "openrouter");
  assert.deepEqual(result.usage, { inputTokens: 5, outputTokens: 7 });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]?.model, "openrouter/auto");
  assert.equal(bodies[0]?.tool_choice, "auto");
  assert.ok(Array.isArray(bodies[0]?.tools));
  assert.ok(
    (bodies[0]?.tools as Array<{ function?: { name?: string } }>).some(
      (tool) => tool.function?.name === "optale_context_registry",
    ),
  );
  assert.match(invocation?.commandNotes?.join("\n") || "", /Optale MCP tools/);
  assert.deepEqual(chunks, ["Hello from OpenRouter.\n"]);
});

test("openRouterApiAdapter exposes only qmd tools for a per-run qmd allowlist", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAudit = process.env.OPTALE_MCP_AUDIT_LOG;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPTALE_MCP_AUDIT_LOG = "false";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
    if (originalAudit === undefined) {
      delete process.env.OPTALE_MCP_AUDIT_LOG;
    } else {
      process.env.OPTALE_MCP_AUDIT_LOG = originalAudit;
    }
  });

  const bodies: Array<Record<string, unknown>> = [];
  let graphitiRequested = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;

    if (url.includes("8102")) {
      graphitiRequested = true;
      return jsonResponse({});
    }

    if (url.includes("7333")) {
      if (body.method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "qmd" },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "mcp-session-id": "qmd-session",
            },
          },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
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
            ],
          },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: body.id, result: {} });
    }

    bodies.push(body);
    return jsonResponse({
      id: "gen-qmd-only",
      model: "openrouter/auto",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "qmd-only response" },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
  }) as typeof fetch;

  const result = await openRouterApiAdapter.execute?.({
    runId: "run-openrouter-qmd-only",
    adapterType: "openrouter_api",
    config: governedConfig({
      allowedServerIds: ["qmd"],
      allowedTools: ["qmd__query"],
    }),
    prompt: "Use qmd only",
    cwd: process.cwd(),
    onLog: async () => {},
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(graphitiRequested, false);
  assert.equal(bodies.length, 1);
  const tools = bodies[0]?.tools as Array<{ function?: { name?: string } }>;
  assert.deepEqual(
    tools.map((tool) => tool.function?.name),
    ["qmd__query"],
  );
});

test("openRouterApiAdapter forces requiredToolName through OpenRouter tool_choice", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAudit = process.env.OPTALE_MCP_AUDIT_LOG;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPTALE_MCP_AUDIT_LOG = "false";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
    if (originalAudit === undefined) {
      delete process.env.OPTALE_MCP_AUDIT_LOG;
    } else {
      process.env.OPTALE_MCP_AUDIT_LOG = originalAudit;
    }
  });

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;

    if (url.includes("7333")) {
      if (body.method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "qmd" },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "mcp-session-id": "qmd-session",
            },
          },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "query",
                description: "search vault",
                inputSchema: { type: "object" },
                annotations: { readOnlyHint: true },
              },
            ],
          },
        });
      }
      if (body.method === "tools/call") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [
              {
                type: "text",
                text: "Harness docs result",
              },
            ],
          },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: body.id, result: {} });
    }

    bodies.push(body);
    if (bodies.length === 1) {
      return jsonResponse({
        id: "gen-required-tool-1",
        model: "openrouter/auto",
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-qmd",
                  type: "function",
                  function: {
                    name: "qmd__query",
                    arguments: JSON.stringify({ query: "Harness" }),
                  },
                },
              ],
            },
          },
        ],
      });
    }

    return jsonResponse({
      id: "gen-required-tool-2",
      model: "openrouter/auto",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "forced tool response" },
        },
      ],
    });
  }) as typeof fetch;

  const result = await openRouterApiAdapter.execute?.({
    runId: "run-openrouter-required-tool",
    adapterType: "openrouter_api",
    config: {
      ...governedConfig({
        allowedServerIds: ["qmd"],
        allowedTools: ["qmd__query"],
      }),
      requiredToolName: "qmd__query",
    },
    prompt: "Use qmd only",
    cwd: process.cwd(),
    onLog: async () => {},
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "forced tool response");
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0]?.tool_choice, {
    type: "function",
    function: { name: "qmd__query" },
  });
  assert.equal(bodies[1]?.tool_choice, "auto");
});

test("openRouterApiAdapter executes requested Optale MCP tools and sends results back", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAudit = process.env.OPTALE_MCP_AUDIT_LOG;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPTALE_MCP_AUDIT_LOG = "false";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
    if (originalAudit === undefined) {
      delete process.env.OPTALE_MCP_AUDIT_LOG;
    } else {
      process.env.OPTALE_MCP_AUDIT_LOG = originalAudit;
    }
  });

  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(
      JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
    );
    if (bodies.length === 1) {
      return jsonResponse({
        id: "gen-tool-1",
        model: "openrouter/auto",
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "optale_context_registry",
                    arguments: "{}",
                  },
                },
              ],
            },
          },
        ],
      });
    }

    return jsonResponse({
      id: "gen-tool-2",
      model: "openrouter/auto",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Optale Observatory is reachable through MCP.",
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 6 },
    });
  }) as typeof fetch;

  const chunks: string[] = [];
  const result = await openRouterApiAdapter.execute?.({
    runId: "run-openrouter-tool",
    adapterType: "openrouter_api",
    config: governedConfig(),
    prompt: "Check the product registry",
    cwd: process.cwd(),
    onLog: async (_stream, chunk) => {
      chunks.push(chunk);
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "Optale Observatory is reachable through MCP.");
  assert.equal(bodies.length, 2);
  const secondMessages = bodies[1]?.messages as Array<{
    role?: string;
    content?: string;
  }>;
  const toolMessage = secondMessages.find((message) => message.role === "tool");
  assert.ok(toolMessage);
  assert.match(toolMessage.content || "", /Optale Observatory/);
  assert.ok(chunks.includes("[tool] optale_context_registry\n"));
});

test("openRouterApiAdapter fails when a model prints pseudo-tool text", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAudit = process.env.OPTALE_MCP_AUDIT_LOG;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.OPTALE_MCP_AUDIT_LOG = "false";
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
    if (originalAudit === undefined) {
      delete process.env.OPTALE_MCP_AUDIT_LOG;
    } else {
      process.env.OPTALE_MCP_AUDIT_LOG = originalAudit;
    }
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;

    if (url.includes("7333")) {
      if (body.method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "qmd" },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "mcp-session-id": "qmd-session",
            },
          },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response("", { status: 202 });
      }
      if (body.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "query",
                description: "search vault",
                inputSchema: { type: "object" },
                annotations: { readOnlyHint: true },
              },
            ],
          },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: body.id, result: {} });
    }

    return jsonResponse({
      id: "gen-pseudo-tool",
      model: "openrouter/auto",
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content:
              '<invoke name="qmd__query"><parameter name="query">Harness</parameter></invoke>',
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
    });
  }) as typeof fetch;

  const chunks: string[] = [];
  const result = await openRouterApiAdapter.execute?.({
    runId: "run-openrouter-pseudo-tool",
    adapterType: "openrouter_api",
    config: governedConfig({
      allowedServerIds: ["qmd"],
      allowedTools: ["qmd__query"],
    }),
    prompt: "Use qmd only",
    cwd: process.cwd(),
    onLog: async (_stream, chunk) => {
      chunks.push(chunk);
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 1);
  assert.match(result.errorMessage || "", /pseudo-tool text for qmd__query/);
  assert.match(result.output || "", /<invoke name="qmd__query">/);
  assert.equal(chunks.length, 1);
});
