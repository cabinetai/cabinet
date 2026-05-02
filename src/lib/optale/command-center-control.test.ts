import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type CommandCenter = typeof import("./command-center-control");
let commandCenter: CommandCenter;
const originalEnv: Record<string, string | undefined> = {};

function setIsolatedEnv(name: string, value?: string): void {
  originalEnv[name] = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-command-center-test-"));
  setIsolatedEnv("CABINET_DATA_DIR", tempRoot);
  setIsolatedEnv("OPTALE_MCP_CLIENTS_JSON");
  setIsolatedEnv("OPTALE_MCP_CLIENTS_PATH");
  setIsolatedEnv("OPTALE_MCP_TOKEN");
  setIsolatedEnv("OPTALE_MCP_AUDIT_LOG", "true");

  await fs.writeFile(
    path.join(tempRoot, ".cabinet"),
    [
      "schemaVersion: 1",
      "id: test-root",
      "name: Test Root",
      "kind: root",
      "description: Command Center test cabinet",
      "",
    ].join("\n"),
    "utf8"
  );
  await fs.mkdir(path.join(tempRoot, ".agents", "editor"), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, ".agents", "editor", "persona.md"),
    [
      "---",
      "name: Editor",
      "role: General editor",
      "provider: claude-code",
      "heartbeat: 0 9 * * *",
      "budget: 10",
      "active: false",
      "workdir: /data",
      "focus: []",
      "tags: []",
      "emoji: E",
      "department: general",
      "type: specialist",
      "workspace: /",
      "setupComplete: true",
      "---",
      "Editor persona.",
      "",
    ].join("\n"),
    "utf8"
  );
  await fs.mkdir(path.join(tempRoot, ".cabinet-state", "optale-mcp", "audit"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(tempRoot, ".cabinet-state", "optale-mcp", "clients.json"),
    `${JSON.stringify(
      {
        version: 1,
        clients: [
          {
            id: "command-center-client",
            name: "Command Center Client",
            enabled: true,
            tokenSha256: "a".repeat(64),
            permissions: ["read"],
            allowedTools: ["optale_brain_summary"],
            budget: { dailyToolCalls: 5 },
            auditEnabled: true,
            createdAt: "2026-05-01T00:00:00.000Z",
          },
          {
            id: "disabled-client",
            enabled: false,
            tokenSha256: "b".repeat(64),
            permissions: ["read"],
            auditEnabled: false,
            disabledAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  const auditDate = new Date().toISOString().slice(0, 10);
  const auditEvents = [
    {
      timestamp: new Date(Date.now() - 1000).toISOString(),
      requestId: "audit-ok",
      clientId: "command-center-client",
      authType: "bearer",
      method: "tools/call",
      toolName: "optale_brain_summary",
      cabinetPath: ".",
      outcome: "ok",
      durationMs: 12,
      argumentKeys: ["cabinetPath"],
    },
    {
      timestamp: new Date().toISOString(),
      requestId: "audit-denied",
      clientId: "command-center-client",
      authType: "bearer",
      method: "tools/call",
      toolName: "optale_command_center_action",
      cabinetPath: ".",
      outcome: "denied",
      durationMs: 2,
      argumentKeys: ["action"],
      error: "MCP client is read-only.",
    },
  ];
  await fs.writeFile(
    path.join(tempRoot, ".cabinet-state", "optale-mcp", "audit", `${auditDate}.jsonl`),
    `${auditEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8"
  );

  commandCenter = await import("./command-center-control");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

test("readOptaleCommandCenterSnapshot returns cabinet operational state and controls", async () => {
  const snapshot = await commandCenter.readOptaleCommandCenterSnapshot({
    cabinetPath: ".",
  });

  assert.equal(snapshot.cabinet.name, "Test Root");
  assert.equal(snapshot.counts.agents, 1);
  assert.equal(snapshot.counts.activeAgents, 0);
  assert.equal(snapshot.counts.jobs, 0);
  assert.equal(snapshot.counts.mcpClients, 2);
  assert.equal(snapshot.counts.activeMcpClients, 1);
  assert.equal(snapshot.counts.mcpToolCallsToday, 2);
  assert.equal(snapshot.mcpPolicy.scope, "system");
  assert.equal(snapshot.mcp.counts.registryClients, 2);
  assert.equal(snapshot.mcp.counts.clientsWithBudgets, 1);
  assert.equal(snapshot.mcp.audit.enabled, true);
  assert.equal(snapshot.mcp.audit.toolCalls, 2);
  assert.equal(snapshot.mcp.audit.outcomes.ok, 1);
  assert.equal(snapshot.mcp.audit.outcomes.denied, 1);
  assert.equal(snapshot.mcp.audit.clients[0]?.clientId, "command-center-client");
  assert.equal(snapshot.mcp.audit.recentEvents[0]?.requestId, "audit-denied");
  const client = snapshot.mcp.clients.find((entry) => entry.id === "command-center-client");
  assert.equal(client?.tokenConfigured, true);
  assert.equal(client?.tokenHashPrefix, "a".repeat(12));
  assert.equal(Object.prototype.hasOwnProperty.call(client || {}, "tokenSha256"), false);
  assert.ok(snapshot.controls.includes("launch_conversation"));
  assert.ok(snapshot.controls.includes("review_actions"));
});

test("executeOptaleCommandCenterAction can create/update tasks and toggle agent activity", async () => {
  const created = await commandCenter.executeOptaleCommandCenterAction({
    action: "create_task",
    cabinetPath: ".",
    toAgent: "editor",
    title: "Review the command center API",
    description: "Check the new control surface.",
    priority: 2,
  });
  assert.equal(created.ok, true);
  assert.equal(created.action, "create_task");
  const task = (created as unknown as { task: { id: string } }).task;
  assert.ok(task.id);

  const updated = await commandCenter.executeOptaleCommandCenterAction({
    action: "update_task",
    cabinetPath: ".",
    agent: "editor",
    taskId: task.id,
    status: "completed",
    result: "Reviewed.",
  });
  assert.equal(updated.ok, true);
  assert.equal(
    (updated as unknown as { task: { status: string } }).task.status,
    "completed"
  );

  const active = await commandCenter.executeOptaleCommandCenterAction({
    action: "set_agent_active",
    cabinetPath: ".",
    agentSlug: "editor",
    active: true,
  });
  assert.equal(active.ok, true);
  assert.equal(
    (active as unknown as { agent: { active: boolean } }).agent.active,
    true
  );

  const snapshot = await commandCenter.readOptaleCommandCenterSnapshot({
    cabinetPath: ".",
  });
  assert.equal(snapshot.counts.activeAgents, 1);
  assert.equal(snapshot.counts.taskStatus.completed, 1);
});
