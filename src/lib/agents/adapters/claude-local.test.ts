import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { claudeLocalAdapter } from "./claude-local";
import type { AdapterInvocationMeta } from "./types";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-claude-local-test-"));
  const scriptPath = path.join(dir, "fake-claude.sh");
  await fs.writeFile(scriptPath, source, "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("claudeLocalAdapter executes a structured print-mode stream", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"system","subtype":"init","apiKeySource":"none","session_id":"session-123"}' \
  '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":12,"output_tokens":1,"cache_read_input_tokens":5}}},"session_id":"session-123"}' \
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}},"session_id":"session-123"}' \
  '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}},"session_id":"session-123"}' \
  '{"type":"result","result":"Hello world","usage":{"input_tokens":12,"output_tokens":2,"cache_read_input_tokens":5},"session_id":"session-123"}'
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await claudeLocalAdapter.execute?.({
    runId: "run-1",
    adapterType: "claude_local",
    config: { command: scriptPath },
    prompt: "Say hello",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "Hello world");
  assert.equal(result.summary, "Hello world");
  assert.equal(result.provider, "claude-code");
  assert.equal(result.model, "claude-sonnet-4-6");
  assert.equal(result.billingType, "subscription");
  assert.equal(result.sessionId, "session-123");
  assert.deepEqual(result.usage, {
    inputTokens: 12,
    outputTokens: 2,
    cachedInputTokens: 5,
  });
  assert.deepEqual(chunks, [{ stream: "stdout", chunk: "Hello world" }]);
});

test("claudeLocalAdapter passes governed MCP config in strict mode", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' '{"type":"result","result":"OK","session_id":"session-mcp"}'
`);

  let invocation: AdapterInvocationMeta | undefined;
  const result = await claudeLocalAdapter.execute?.({
    runId: "run-mcp",
    adapterType: "claude_local",
    config: {
      command: scriptPath,
      governedMcp: {
        enabled: true,
        claudeConfigPath: "/tmp/optale-claude-mcp.json",
        codexConfigArgs: [],
        allowedServerIds: ["qmd"],
      },
    },
    prompt: "Say hello",
    cwd: process.cwd(),
    onLog: async () => {},
    onMeta: async (meta) => {
      invocation = meta;
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    invocation?.commandArgs?.slice(-2),
    ["/tmp/optale-claude-mcp.json", "--strict-mcp-config"]
  );
  assert.ok(invocation?.commandArgs?.includes("--mcp-config"));
  assert.match(invocation?.commandNotes?.join("\n") || "", /strict per-run config/);
});
