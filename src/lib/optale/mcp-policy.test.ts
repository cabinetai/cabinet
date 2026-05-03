import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type McpPolicy = typeof import("./mcp-policy");
let policy: McpPolicy;

before(async () => {
  tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-mcp-policy-test-"),
  );
  process.env.CABINET_DATA_DIR = tempRoot;
  policy = await import("./mcp-policy");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("readOptaleMcpPolicy derives a deny-by-default allowlist from cabinet scope", async () => {
  const personal = await policy.readOptaleMcpPolicy("personal/thor");
  const effective = policy.resolveMcpPolicyServersForScope(personal);
  const ids = effective.map((server) => server.serverId).sort();

  assert.equal(personal.scope, "personal");
  assert.equal(personal.source, "derived");
  assert.equal(personal.defaultDecision, "deny");
  assert.deepEqual(ids, ["graphiti", "matrix", "oag", "optale-agents", "qmd"]);
  assert.ok(!ids.includes("twenty"));
});

test("writeOptaleMcpPolicy persists explicit server overrides", async () => {
  const saved = await policy.writeOptaleMcpPolicy("clients/acme", {
    policyId: "policy-acme",
    companyId: "acme",
    servers: [
      {
        serverId: "qmd",
        enabled: true,
        permissions: ["read"],
        toolGroups: ["vault-search"],
        allowedTools: ["search"],
      },
      {
        serverId: "matrix",
        enabled: false,
        notes: "communications disabled for this client",
      },
    ],
  });

  assert.equal(saved.scope, "company");
  assert.equal(saved.source, "explicit");
  assert.equal(saved.policyId, "policy-acme");
  assert.equal(saved.companyId, "acme");
  assert.equal(
    saved.servers.find((server) => server.serverId === "qmd")?.allowedTools[0],
    "search",
  );
  assert.equal(
    saved.servers.find((server) => server.serverId === "matrix")?.enabled,
    false,
  );

  const reread = await policy.readOptaleMcpPolicy("clients/acme");
  assert.equal(reread.source, "explicit");
  assert.equal(
    reread.servers.find((server) => server.serverId === "matrix")?.enabled,
    false,
  );
});

test("redactOptaleMcpPolicyForClient exposes product server and tool aliases", async () => {
  const saved = await policy.writeOptaleMcpPolicy("clients/product-facing", {
    servers: [
      {
        serverId: "qmd",
        enabled: true,
        permissions: ["read"],
        allowedTools: ["qmd__query", "get"],
        deniedTools: ["qmd__status"],
        notes:
          "QMD URL http://127.0.0.1:7333/mcp token=secret Bearer oa_mcp_private /home/thor/private",
      },
    ],
  });

  const publicPolicy = policy.redactOptaleMcpPolicyForClient(saved);
  const publicSearch = publicPolicy.servers.find(
    (server) => server.id === "knowledge-search",
  );
  const rendered = JSON.stringify(publicPolicy).toLowerCase();

  assert.ok(publicSearch);
  assert.equal(publicSearch?.name, "Knowledge Search");
  assert.deepEqual(publicSearch?.allowedTools, [
    "sense_search_knowledge",
    "sense_downstream_call",
  ]);
  assert.deepEqual(publicSearch?.deniedTools, ["sense_knowledge_status"]);
  assert.equal(publicSearch?.notes?.includes("Knowledge Search"), true);
  assert.equal(publicSearch?.notes?.includes("[configured-url]"), true);
  assert.equal(publicSearch?.notes?.includes("[secret]"), true);
  assert.equal(publicSearch?.notes?.includes("[server-path]"), true);
  assert.equal(rendered.includes("serverid"), false);
  assert.equal(rendered.includes("qmd"), false);
  assert.equal(rendered.includes("http://"), false);
  assert.equal(rendered.includes("token=secret"), false);
  assert.equal(rendered.includes("oa_mcp_private"), false);
  assert.equal(rendered.includes("/home/thor"), false);
});

test("normalizeOptaleMcpPolicyWriteInputFromClient accepts product server ids", () => {
  const normalized = policy.normalizeOptaleMcpPolicyWriteInputFromClient({
    servers: [
      {
        id: "knowledge-search",
        enabled: true,
        permissions: ["read"],
        allowedTools: ["sense_search_knowledge"],
      },
    ],
  });
  const server = normalized.servers?.[0] as Record<string, unknown>;

  assert.equal(server.serverId, "qmd");
  assert.equal(server.id, "knowledge-search");

  const publicServer = policy.redactOptaleMcpPolicyServerForClient({
    serverId: "qmd",
    name: "QMD",
    enabled: true,
    permissions: ["read"],
    toolGroups: ["vault-search"],
    allowedTools: ["sense_search_knowledge"],
    deniedTools: [],
    scopes: ["company"],
    brainSourceIds: ["vault"],
  });
  assert.deepEqual(publicServer.allowedTools, ["sense_search_knowledge"]);
});

test("redactOptaleMcpPolicyServerForClient hides unknown internal server ids", () => {
  const publicServer = policy.redactOptaleMcpPolicyServerForClient({
    serverId: "private-mcp",
    name: "Private MCP",
    enabled: true,
    permissions: ["read"],
    toolGroups: ["read"],
    allowedTools: ["private-mcp__query"],
    deniedTools: [],
    scopes: ["company"],
    brainSourceIds: [],
    description: "Private MCP at private-mcp",
    notes: "private-mcp should not be shown",
  });
  const rendered = JSON.stringify(publicServer).toLowerCase();

  assert.equal(publicServer.id, "managed-source");
  assert.equal(publicServer.name, "Managed Source");
  assert.equal(
    publicServer.description,
    "Managed source governed by Optale policy.",
  );
  assert.equal(rendered.includes("private-mcp"), false);
});

test("buildOptaleMcpPolicyInstructions lists only effective allowed servers", async () => {
  await policy.writeOptaleMcpPolicy("personal/private", {
    servers: [
      { serverId: "qmd", enabled: true, permissions: ["read"] },
      { serverId: "matrix", enabled: false },
    ],
  });

  const instructions = (
    await policy.buildOptaleMcpPolicyInstructions({
      cabinetPath: "personal/private",
      agentScope: "personal",
    })
  ).join("\n");

  assert.match(instructions, /Default decision: deny/);
  assert.match(instructions, /qmd:/);
  assert.match(instructions, /graphiti:/);
  assert.doesNotMatch(instructions, /matrix:/);
  assert.doesNotMatch(instructions, /twenty:/);
});
