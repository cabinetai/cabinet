import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cursorLocalAdapter } from "./cursor-local";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-cursor-local-test-"));
  const scriptPath = path.join(dir, "fake-cursor.sh");
  await fs.writeFile(scriptPath, source, "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("cursorLocalAdapter parses stream-json assistant + result events", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"system","subtype":"init","session_id":"cursor-session-1"}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Running the task."}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"All done."}]}}' \
  '{"type":"result","usage":{"input_tokens":120,"cached_input_tokens":40,"output_tokens":18},"total_cost_usd":0.0021}'
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await cursorLocalAdapter.execute?.({
    runId: "run-1",
    adapterType: "cursor_local",
    config: { command: scriptPath, model: "composer-1.5" },
    prompt: "Say hello",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.sessionId, "cursor-session-1");
  assert.equal(result.sessionDisplayId, "cursor-session-1");
  assert.equal(result.provider, "cursor-cli");
  assert.equal(result.model, "composer-1.5");
  assert.equal(result.billingType, "subscription");
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    outputTokens: 18,
    cachedInputTokens: 40,
  });
  assert.equal(result.output, "Running the task.\nAll done.");
  assert.equal(result.summary, "All done.");
  assert.deepEqual(result.sessionParams, {
    sessionId: "cursor-session-1",
    cwd: process.cwd(),
  });
  assert.deepEqual(chunks, [
    { stream: "stdout", chunk: "Running the task.\nAll done.\n" },
  ]);
});

test("cursor session codec round-trips session params", () => {
  const codec = cursorLocalAdapter.sessionCodec;
  assert.ok(codec);

  const serialized = codec.serialize({ sessionId: "abc", cwd: "/tmp/work" });
  assert.deepEqual(serialized, { sessionId: "abc", cwd: "/tmp/work" });

  const deserialized = codec.deserialize({ sessionId: "abc", cwd: "/tmp/work" });
  assert.deepEqual(deserialized, { sessionId: "abc", cwd: "/tmp/work" });

  assert.equal(codec.serialize({ cwd: "/tmp/work" }), null);
  assert.equal(codec.deserialize({ cwd: "/tmp/work" }), null);
  assert.equal(codec.getDisplayId?.({ sessionId: "abc" }), "abc");
});
