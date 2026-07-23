import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";
import {
  HermesAcpError,
  runHermesAcpTurn,
  shutdownHermesAcpClients,
} from "./acp-client";

process.env.OLLAMA_API_KEY = "fixture";
afterEach(shutdownHermesAcpClients);

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

type ReplayFixtureOptions = {
  loadUpdates?: Array<{
    sessionId?: string;
    text: string;
    messageId?: string;
  }>;
  loadIdentity?: string;
  duplicateFinal?: boolean;
  latePreviousOnSecondPrompt?: boolean;
  exitAfterPrompt?: boolean;
  epochLogPath?: string;
};

function replayProtocolFixture(options: ReplayFixtureOptions = {}): string {
  const encoded = JSON.stringify(options);
  return String.raw`
const fs = require("node:fs");
const readline = require("node:readline");
const options = ${encoded};
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
let promptCount = 0;
const update = (sessionId, text, messageId) => ({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
      ...(messageId ? { messageId } : {}),
    },
  },
});
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      },
    });
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "fixture-session" } });
  } else if (message.method === "session/load") {
    for (const historical of options.loadUpdates || []) {
      send(update(
        historical.sessionId || message.params.sessionId,
        historical.text,
        historical.messageId,
      ));
    }
    const identity = options.loadIdentity === undefined
      ? message.params.sessionId
      : options.loadIdentity;
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        _meta: {
          hermes: {
            sessionProvenance: { acpSessionId: identity },
          },
        },
      },
    });
  } else if (message.method === "session/prompt") {
    promptCount += 1;
    if (options.epochLogPath) {
      fs.appendFileSync(
        options.epochLogPath,
        String(message.params._meta?.cabinet?.promptEpoch || "") + "\n",
      );
    }
    if (options.latePreviousOnSecondPrompt && promptCount === 2) {
      send(update(message.params.sessionId, "STALE", "prompt-old"));
    }
    const messageId = promptCount === 1 && options.latePreviousOnSecondPrompt
      ? "prompt-old"
      : "prompt-" + process.pid + "-" + promptCount;
    send(update(message.params.sessionId, "TURN_" + promptCount, messageId));
    const final = {
      jsonrpc: "2.0",
      id: message.id,
      result: { stopReason: "end_turn" },
    };
    send(final);
    if (options.duplicateFinal) send(final);
    if (options.exitAfterPrompt) setTimeout(() => process.exit(0), 5);
  }
});
`;
}

test("ACP starts one durable session and suppresses duplicate stream frames", async () => {
  const fixture = await fixtureExecutable(protocolFixture);
  try {
    const deltas: string[] = [];
    const result = await runHermesAcpTurn({
      config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
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
      config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
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

for (const scenario of [
  { name: "no history", updates: [] },
  {
    name: "full history",
    updates: [
      { text: "OLD_USER", messageId: "history-user" },
      { text: "OLD_ASSISTANT", messageId: "history-assistant" },
    ],
  },
  {
    name: "partial history",
    updates: [{ text: "OLD_PARTIAL", messageId: "history-partial" }],
  },
  {
    name: "duplicated history notifications",
    updates: [
      { text: "OLD_DUPLICATE", messageId: "history-duplicate" },
      { text: "OLD_DUPLICATE", messageId: "history-duplicate" },
    ],
  },
  {
    name: "reordered historical notifications",
    updates: [
      { text: "OLD_ASSISTANT", messageId: "history-assistant" },
      { text: "OLD_USER", messageId: "history-user" },
    ],
  },
]) {
  test(`ACP excludes ${scenario.name} from the first new prompt epoch`, async () => {
    const fixture = await fixtureExecutable(replayProtocolFixture({
      loadUpdates: scenario.updates,
    }));
    const deltas: string[] = [];
    try {
      const result = await runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "follow-up",
        sessionId: "fixture-session",
        timeoutMs: 3_000,
        onDelta: (text) => { deltas.push(text); },
      });
      assert.equal(result.output, "TURN_1");
      assert.deepEqual(deltas, ["TURN_1"]);
    } finally {
      await fs.rm(fixture.cwd, { recursive: true, force: true });
    }
  });
}

test("ACP keeps one official-SDK process across two turns in the same session", async () => {
  const fixture = await fixtureExecutable(protocolFixture);
  const pids: number[] = [];
  const config = {
    cliPath: fixture.cliPath,
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY" as const,
    timeoutMs: 3_000,
    noTools: true as const,
  };
  try {
    const first = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "first",
      timeoutMs: 3_000,
      onSpawn: (child) => { pids.push(child.pid ?? 0); },
    });
    const second = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "second",
      sessionId: first.sessionId,
      timeoutMs: 3_000,
      onSpawn: (child) => { pids.push(child.pid ?? 0); },
    });
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(pids.length, 2);
    assert.equal(pids[1], pids[0]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP reloads the same session after the Cabinet-side process pool restarts", async () => {
  const fixture = await fixtureExecutable(protocolFixture);
  const pids: number[] = [];
  const config = {
    cliPath: fixture.cliPath,
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY" as const,
    timeoutMs: 3_000,
    noTools: true as const,
  };
  try {
    const first = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "first",
      timeoutMs: 3_000,
      onSpawn: (child) => { pids.push(child.pid ?? 0); },
    });
    await shutdownHermesAcpClients();
    const second = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "second",
      sessionId: first.sessionId,
      timeoutMs: 3_000,
      onSpawn: (child) => { pids.push(child.pid ?? 0); },
    });
    assert.equal(second.sessionId, first.sessionId);
    assert.notEqual(pids[1], pids[0]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP assigns distinct prompt epochs across a Cabinet-side restart", async () => {
  const fixture = await fixtureExecutable("");
  const epochLogPath = path.join(fixture.cwd, "epochs");
  await fs.writeFile(
    fixture.cliPath,
    `#!${process.execPath}\n${replayProtocolFixture({ epochLogPath })}`,
    { mode: 0o700 },
  );
  const config = {
    cliPath: fixture.cliPath,
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY" as const,
    timeoutMs: 3_000,
    noTools: true as const,
  };
  try {
    const first = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "first",
      timeoutMs: 3_000,
    });
    await shutdownHermesAcpClients();
    await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "second",
      sessionId: first.sessionId,
      timeoutMs: 3_000,
    });
    const epochs = (await fs.readFile(epochLogPath, "utf8")).trim().split("\n");
    assert.equal(epochs.length, 2);
    assert.ok(epochs.every(Boolean));
    assert.notEqual(epochs[0], epochs[1]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP reloads after an ACP child process exits between turns", async () => {
  const fixture = await fixtureExecutable(replayProtocolFixture({ exitAfterPrompt: true }));
  const children: import("node:child_process").ChildProcessWithoutNullStreams[] = [];
  const config = {
    cliPath: fixture.cliPath,
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY" as const,
    timeoutMs: 3_000,
    noTools: true as const,
  };
  try {
    const first = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "first",
      timeoutMs: 3_000,
      onSpawn: (child) => { children.push(child); },
    });
    if (children[0].exitCode === null && children[0].signalCode === null) {
      await new Promise<void>((resolve) => children[0].once("exit", () => resolve()));
    }
    const second = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "second",
      sessionId: first.sessionId,
      timeoutMs: 3_000,
      onSpawn: (child) => { children.push(child); },
    });
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.output, "TURN_1");
    assert.notEqual(children[1].pid, children[0].pid);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP fails before prompt dispatch when load returns the wrong native identity", async () => {
  const fixture = await fixtureExecutable("");
  const marker = path.join(fixture.cwd, "prompt-dispatched");
  await fs.writeFile(
    fixture.cliPath,
    `#!${process.execPath}\n${replayProtocolFixture({
      loadIdentity: "wrong-session",
      epochLogPath: marker,
    })}`,
    { mode: 0o700 },
  );
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "must not dispatch",
        sessionId: "fixture-session",
        timeoutMs: 3_000,
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "protocol",
    );
    await assert.rejects(fs.access(marker));
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP delivers one completion when the agent duplicates the final response", async () => {
  const fixture = await fixtureExecutable(replayProtocolFixture({ duplicateFinal: true }));
  try {
    const result = await runHermesAcpTurn({
      config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
      cwd: fixture.cwd,
      prompt: "one completion",
      timeoutMs: 3_000,
    });
    assert.equal(result.output, "TURN_1");
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP ignores a late notification carrying the previous prompt message identity", async () => {
  const fixture = await fixtureExecutable(replayProtocolFixture({
    latePreviousOnSecondPrompt: true,
  }));
  const config = {
    cliPath: fixture.cliPath,
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY" as const,
    timeoutMs: 3_000,
    noTools: true as const,
  };
  try {
    const first = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "first",
      timeoutMs: 3_000,
    });
    assert.equal(first.output, "TURN_1");
    const deltas: string[] = [];
    const second = await runHermesAcpTurn({
      config,
      cwd: fixture.cwd,
      prompt: "second",
      sessionId: first.sessionId,
      timeoutMs: 3_000,
      onDelta: (text) => { deltas.push(text); },
    });
    assert.equal(second.output, "TURN_2");
    assert.deepEqual(deltas, ["TURN_2"]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});

test("ACP fails closed on malformed output without exposing it", async () => {
  const fixture = await fixtureExecutable(`process.stdout.write("not-json" + String.fromCharCode(10)); setTimeout(() => {}, 5000);`);
  try {
    await assert.rejects(
      runHermesAcpTurn({
        config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
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
        config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "safe acceptance prompt",
        timeoutMs: 3_000,
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
          providerCredentialEnvName: "OLLAMA_API_KEY",
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
        config: { cliPath: fixture.cliPath, profile: "operator-os", providerCredentialEnvName: "OLLAMA_API_KEY", timeoutMs: 3_000, noTools: true },
        cwd: fixture.cwd,
        prompt: "safe acceptance prompt",
        timeoutMs: 3_000,
        onDelta: (text) => { deltas.push(text); },
      }),
      (error: unknown) => error instanceof HermesAcpError && error.kind === "tool_event",
    );
    assert.deepEqual(deltas, ["CABINET_ACCEPTANCE_OK"]);
  } finally {
    await fs.rm(fixture.cwd, { recursive: true, force: true });
  }
});
