import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type McpPolicy = typeof import("./mcp-policy");
let policy: McpPolicy;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-mcp-policy-test-"));
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
  assert.equal(saved.servers.find((server) => server.serverId === "qmd")?.allowedTools[0], "search");
  assert.equal(saved.servers.find((server) => server.serverId === "matrix")?.enabled, false);

  const reread = await policy.readOptaleMcpPolicy("clients/acme");
  assert.equal(reread.source, "explicit");
  assert.equal(reread.servers.find((server) => server.serverId === "matrix")?.enabled, false);
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
