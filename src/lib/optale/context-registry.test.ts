import test from "node:test";
import assert from "node:assert/strict";
import { readPublicOptaleContextRegistry } from "./context-registry";

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
