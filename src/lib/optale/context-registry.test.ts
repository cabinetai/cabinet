import test from "node:test";
import assert from "node:assert/strict";
import {
  readOptaleMcpServers,
  readPublicOptaleContextRegistry,
} from "./context-registry";

test("readPublicOptaleContextRegistry hides internal MCP connection details", () => {
  const registry = readPublicOptaleContextRegistry();
  const rendered = JSON.stringify(registry);
  const lower = rendered.toLowerCase();

  assert.ok(
    registry.mcp.servers.some((server) => server.id === "knowledge-search"),
  );
  assert.equal(rendered.includes("mcpServerId"), false);
  assert.equal(rendered.includes("http://"), false);
  assert.equal(rendered.includes("/usr/bin"), false);
  assert.equal(rendered.includes('"transport"'), false);
  assert.equal(rendered.includes('"command"'), false);
  assert.equal(rendered.includes('"url"'), false);
  assert.equal(rendered.includes('"args"'), false);
  assert.equal(lower.includes("qmd"), false);
  assert.equal(lower.includes("graphiti"), false);
  assert.equal(lower.includes("honcho"), false);
  assert.equal(lower.includes("gitnexus"), false);
});

test("production registry does not treat local loopback MCP defaults as configured", (t) => {
  const env = process.env as Record<string, string | undefined>;
  const keys = [
    "NODE_ENV",
    "OPTALE_MCP_LOCAL_DEFAULTS",
    "OPTALE_MCP_QMD_URL",
    "OPTALE_MCP_GRAPHITI_URL",
    "OPTALE_MCP_OAG_URL",
    "OPTALE_MCP_TWENTY_URL",
    "OPTALE_MCP_PLANE_URL",
    "OPTALE_MCP_MATRIX_URL",
    "OPTALE_MCP_GITNEXUS_COMMAND",
  ] as const;
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  env.NODE_ENV = "production";
  delete process.env.OPTALE_MCP_LOCAL_DEFAULTS;
  delete process.env.OPTALE_MCP_QMD_URL;
  delete process.env.OPTALE_MCP_GRAPHITI_URL;
  delete process.env.OPTALE_MCP_OAG_URL;
  delete process.env.OPTALE_MCP_TWENTY_URL;
  delete process.env.OPTALE_MCP_PLANE_URL;
  delete process.env.OPTALE_MCP_MATRIX_URL;
  delete process.env.OPTALE_MCP_GITNEXUS_COMMAND;

  const servers = readOptaleMcpServers();
  for (const id of [
    "qmd",
    "graphiti",
    "oag",
    "gitnexus",
    "twenty",
    "plane",
    "matrix",
  ]) {
    const server = servers.find((entry) => entry.id === id);
    assert.equal(server?.status, "planned", id);
    if (server?.transport === "http") assert.equal(server.url, undefined, id);
  }

  const agents = servers.find((entry) => entry.id === "optale-agents");
  assert.equal(agents?.status, "configured");
});

test("explicit production MCP URLs remain configured", (t) => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalQmdUrl = process.env.OPTALE_MCP_QMD_URL;
  const originalLocalDefaults = process.env.OPTALE_MCP_LOCAL_DEFAULTS;
  t.after(() => {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalQmdUrl === undefined) delete process.env.OPTALE_MCP_QMD_URL;
    else process.env.OPTALE_MCP_QMD_URL = originalQmdUrl;
    if (originalLocalDefaults === undefined) {
      delete process.env.OPTALE_MCP_LOCAL_DEFAULTS;
    } else {
      process.env.OPTALE_MCP_LOCAL_DEFAULTS = originalLocalDefaults;
    }
  });

  env.NODE_ENV = "production";
  delete process.env.OPTALE_MCP_LOCAL_DEFAULTS;
  process.env.OPTALE_MCP_QMD_URL = "http://knowledge-search.internal/mcp";

  const qmd = readOptaleMcpServers().find((server) => server.id === "qmd");
  assert.equal(qmd?.status, "configured");
  assert.equal(qmd?.url, "http://knowledge-search.internal/mcp");
});
