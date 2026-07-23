import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { HermesAcpError, runHermesAcpTurn } from "./acp-client";

async function fixtureExecutable(source: string): Promise<{ cliPath: string; cwd: string }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-acp-test-"));
  const cliPath = path.join(cwd, "fixture-hermes");
  await fs.writeFile(cliPath, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  return { cliPath, cwd };
}

const protocolFixture = String.raw`
if (process.env.HERMES_ACP_NO_TOOLS !== "1") process.exit(91);
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    const capabilities = message.params.clientCapabilities;
    if (capabilities.terminal !== false ||
        capabilities.fs.readTextFile !== false ||
        capabilities.fs.writeTextFile !== false) process.exit(92);
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1 } });
  } else if (message.method === "session/new") {
    if (!Array.isArray(message.params.mcpServers) || message.params.mcpServers.length !== 0) {
      process.exit(93);
    }
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "fixture-session" } });
  } else if (message.method === "session/load") {
    if (!Array.isArray(message.params.mcpServers) || message.params.mcpServers.length !== 0) {
      process.exit(94);
    }
    send({ jsonrpc: "2.0", id: message.id, result: {} });
  } else if (message.method === "session/prompt") {
    const update = { jsonrpc: "2.0", method: "session/update", params: {
      sessionId: message.params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "CABINET_ACCEPTANCE_OK" } }
    }};
    send(update);
    send(update);
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
  }
});
`;

test("ACP starts one durable session and suppresses duplicate stream frames", async () => {
  const fixture = await fixtureExecutable(protocolFixture);
  try {
    const deltas: string[] = [];
    const result = await runHermesAcpTurn({
      config: { cliPath: fixture.cliPath, profile: "operator-os", timeoutMs: 3_000, noTools: true },
      cwd: fixture.cwd,
      prompt: "safe acceptance prompt",
      timeoutMs: 3_000,
      onDelta: (text) => { deltas.push(text); },
    });
    assert.equal(result.sessionId, "fixture-session");
    assert.equal(result.output, "CABINET_ACCEPTANCE_OK");
    assert.deepEqual(deltas, ["CABINET_ACCEPTANCE_OK"]);
    assert.equal(result.toolEventCount, 0);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP loads the stored session before a follow-up", async () => {
  const fixture = await fixtureExecutable(protocolFixture);
  try {
    const result = await runHermesAcpTurn({
      config: { cliPath: fixture.cliPath, profile: "operator-os", timeoutMs: 3_000, noTools: true },
      cwd: fixture.cwd,
      prompt: "follow-up",
      sessionId: "fixture-session",
      timeoutMs: 3_000,
    });
    assert.equal(result.sessionId, "fixture-session");
    assert.equal(result.output, "CABINET_ACCEPTANCE_OK");
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP fails closed on malformed output without exposing it", async () => {
  const fixture = await fixtureExecutable(`process.stdout.write("not-json" + String.fromCharCode(10)); setTimeout(() => {}, 5000);`);
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", timeoutMs: 3_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "safe acceptance prompt",
        timeoutMs: 3_000,
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "protocol" && !error.message.includes("not-json"),
    );
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP rejects any tool event in no-tools mode", async () => {
  const fixture = await fixtureExecutable(protocolFixture.replace(
    'const update = { jsonrpc: "2.0", method: "session/update", params: {',
    'const update = { jsonrpc: "2.0", method: "session/update", params: {',
  ).replace(
    'update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "CABINET_ACCEPTANCE_OK" } }',
    'update: { sessionUpdate: "tool_call", toolCallId: "forbidden", title: "forbidden" }',
  ));
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", timeoutMs: 1_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "safe acceptance prompt",
        timeoutMs: 1_000,
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "tool_event",
    );
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP refuses to spawn when the no-tools invariant is false at runtime", async () => {
  const fixture = await fixtureExecutable("require('node:fs').writeFileSync('spawned', 'yes');");
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: {
          cliPath: fixture.cliPath,
          profile: "operator-os",
          timeoutMs: 1_000,
          noTools: false,
        } as never,
        cwd: fixture.cwd,
        prompt: "must not run",
        timeoutMs: 1_000,
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "configuration",
    );
    await assert.rejects(fs.access(path.join(fixture.cwd, "spawned")));
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("a partial assistant chunk followed by a tool event cannot complete successfully", async () => {
  const fixture = await fixtureExecutable(protocolFixture.replace(
    'send(update);\n    send(update);',
    `send(update);
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: message.params.sessionId,
      update: { sessionUpdate: "tool_call", toolCallId: "sentinel", title: "sentinel" }
    }});`,
  ));
  const deltas: string[] = [];
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", timeoutMs: 1_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "safe acceptance prompt",
        timeoutMs: 1_000,
        onDelta: (text) => { deltas.push(text); },
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "tool_event",
    );
    assert.deepEqual(deltas, ["CABINET_ACCEPTANCE_OK"]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});
