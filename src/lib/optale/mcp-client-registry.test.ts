import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createOptaleMcpClient,
  hashOptaleMcpBearerToken,
  listPublicOptaleMcpClients,
  listSanitizedOptaleMcpClients,
  redactOptaleMcpClientForClient,
  resolveOptaleMcpBearerClient,
  rotateOptaleMcpClientToken,
  updateOptaleMcpClient,
} from "./mcp-client-registry";

test("resolveOptaleMcpBearerClient resolves hashed registry clients", async (t) => {
  const original = process.env.OPTALE_MCP_CLIENTS_JSON;
  const token = "test-client-token";
  process.env.OPTALE_MCP_CLIENTS_JSON = JSON.stringify({
    clients: [
      {
        id: "client-acme",
        name: "Acme client",
        tokenSha256: hashOptaleMcpBearerToken(token),
        cabinetPath: "clients/acme",
        lockCabinet: true,
        agentScope: "company",
        permissions: ["read", "execute"],
        allowedTools: ["optale_brain_summary"],
        dailyToolCalls: 25,
        auditEnabled: true,
        remoteActionsEnabled: true,
      },
    ],
  });
  t.after(() => {
    if (original === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_JSON;
    } else {
      process.env.OPTALE_MCP_CLIENTS_JSON = original;
    }
  });

  const client = await resolveOptaleMcpBearerClient(token);

  assert.equal(client?.id, "client-acme");
  assert.equal(client?.cabinetPath, "clients/acme");
  assert.equal(client?.lockCabinet, true);
  assert.equal(client?.agentScope, "company");
  assert.deepEqual(client?.permissions, ["read", "execute"]);
  assert.deepEqual(client?.allowedTools, ["optale_brain_summary"]);
  assert.deepEqual(client?.budget, { dailyToolCalls: 25 });
  assert.equal(client?.remoteActionsEnabled, true);
});

test("resolveOptaleMcpBearerClient ignores invalid bearer tokens", async (t) => {
  const originalClients = process.env.OPTALE_MCP_CLIENTS_JSON;
  const originalLegacy = process.env.OPTALE_MCP_TOKEN;
  process.env.OPTALE_MCP_CLIENTS_JSON = JSON.stringify([
    {
      id: "client-only",
      tokenSha256: hashOptaleMcpBearerToken("correct-token"),
      permissions: ["read"],
    },
  ]);
  delete process.env.OPTALE_MCP_TOKEN;
  t.after(() => {
    if (originalClients === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_JSON;
    } else {
      process.env.OPTALE_MCP_CLIENTS_JSON = originalClients;
    }
    if (originalLegacy === undefined) {
      delete process.env.OPTALE_MCP_TOKEN;
    } else {
      process.env.OPTALE_MCP_TOKEN = originalLegacy;
    }
  });

  const client = await resolveOptaleMcpBearerClient("wrong-token");

  assert.equal(client, null);
});

test("file-backed MCP client creation and rotation stores only token hashes", async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-mcp-clients-"),
  );
  const originalPath = process.env.OPTALE_MCP_CLIENTS_PATH;
  const originalJson = process.env.OPTALE_MCP_CLIENTS_JSON;
  const originalLegacy = process.env.OPTALE_MCP_TOKEN;
  process.env.OPTALE_MCP_CLIENTS_PATH = path.join(tempRoot, "clients.json");
  delete process.env.OPTALE_MCP_CLIENTS_JSON;
  delete process.env.OPTALE_MCP_TOKEN;
  t.after(async () => {
    if (originalPath === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_PATH;
    } else {
      process.env.OPTALE_MCP_CLIENTS_PATH = originalPath;
    }
    if (originalJson === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_JSON;
    } else {
      process.env.OPTALE_MCP_CLIENTS_JSON = originalJson;
    }
    if (originalLegacy === undefined) {
      delete process.env.OPTALE_MCP_TOKEN;
    } else {
      process.env.OPTALE_MCP_TOKEN = originalLegacy;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const created = await createOptaleMcpClient({
    id: "client-acme-file",
    name: "Acme file client",
    cabinetPath: "clients/acme",
    agentScope: "company",
    permissions: ["read"],
    allowedTools: ["optale_brain_summary"],
    dailyToolCalls: 10,
  });

  assert.match(created.token, /^oa_mcp_/);
  assert.equal(created.client.id, "client-acme-file");
  assert.equal(created.client.tokenConfigured, true);
  assert.equal(created.client.tokenHashPrefix?.length, 12);

  const rawFile = await fs.readFile(
    process.env.OPTALE_MCP_CLIENTS_PATH,
    "utf8",
  );
  assert.ok(!rawFile.includes(created.token));
  assert.match(rawFile, /tokenSha256/);

  const resolved = await resolveOptaleMcpBearerClient(created.token);
  assert.equal(resolved?.id, "client-acme-file");
  assert.equal(resolved?.cabinetPath, "clients/acme");

  const rotated = await rotateOptaleMcpClientToken("client-acme-file");
  assert.match(rotated.token, /^oa_mcp_/);
  assert.notEqual(rotated.token, created.token);
  assert.equal(await resolveOptaleMcpBearerClient(created.token), null);
  assert.equal(
    (await resolveOptaleMcpBearerClient(rotated.token))?.id,
    "client-acme-file",
  );
});

test("file-backed MCP client updates and sanitized listing do not expose tokens", async (t) => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-mcp-clients-list-"),
  );
  const originalPath = process.env.OPTALE_MCP_CLIENTS_PATH;
  const originalJson = process.env.OPTALE_MCP_CLIENTS_JSON;
  const originalLegacy = process.env.OPTALE_MCP_TOKEN;
  process.env.OPTALE_MCP_CLIENTS_PATH = path.join(tempRoot, "clients.json");
  delete process.env.OPTALE_MCP_CLIENTS_JSON;
  delete process.env.OPTALE_MCP_TOKEN;
  t.after(async () => {
    if (originalPath === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_PATH;
    } else {
      process.env.OPTALE_MCP_CLIENTS_PATH = originalPath;
    }
    if (originalJson === undefined) {
      delete process.env.OPTALE_MCP_CLIENTS_JSON;
    } else {
      process.env.OPTALE_MCP_CLIENTS_JSON = originalJson;
    }
    if (originalLegacy === undefined) {
      delete process.env.OPTALE_MCP_TOKEN;
    } else {
      process.env.OPTALE_MCP_TOKEN = originalLegacy;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const created = await createOptaleMcpClient({
    id: "client-update",
    permissions: ["read"],
  });
  const updated = await updateOptaleMcpClient({
    id: "client-update",
    name: "Updated client",
    permissions: ["read", "execute"],
    deniedTools: ["optale_command_center_action"],
    dailyToolCalls: 5,
  });
  const clients = await listSanitizedOptaleMcpClients();
  const listed = clients.find((client) => client.id === "client-update");
  const publicClients = await listPublicOptaleMcpClients();
  const publicListed = publicClients.find(
    (client) => client.id === "client-update",
  );

  assert.equal(updated.client.name, "Updated client");
  assert.deepEqual(updated.client.permissions, ["read", "execute"]);
  assert.deepEqual(updated.client.deniedTools, [
    "optale_command_center_action",
  ]);
  assert.deepEqual(updated.client.budget, { dailyToolCalls: 5 });
  assert.equal(listed?.tokenConfigured, true);
  assert.equal(JSON.stringify(clients).includes(created.token), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(publicListed || {}, "tokenHashPrefix"),
    false,
  );
});

test("redactOptaleMcpClientForClient productizes tool names and hides fingerprints", () => {
  const client = redactOptaleMcpClientForClient({
    id: "client-public",
    enabled: true,
    lockCabinet: false,
    permissions: ["read"],
    allowedTools: ["qmd__query", "get", "optale_brain_summary"],
    deniedTools: ["qmd__status"],
    auditEnabled: true,
    remoteActionsEnabled: false,
    source: "registry",
    tokenConfigured: true,
    tokenHashPrefix: "a".repeat(12),
  });
  const rendered = JSON.stringify(client).toLowerCase();

  assert.deepEqual(client.allowedTools, [
    "sense_search_knowledge",
    "sense_downstream_call",
    "observatory_brain_summary",
  ]);
  assert.deepEqual(client.deniedTools, ["sense_knowledge_status"]);
  assert.equal(rendered.includes("optale_"), false);
  assert.equal(rendered.includes("qmd"), false);
  assert.equal(rendered.includes("tokenhashprefix"), false);
  assert.equal(rendered.includes("aaaaaaaaaaaa"), false);
});
