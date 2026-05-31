import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openCodeLocalAdapter } from "./opencode-local";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-opencode-local-test-"));
  const scriptPath = path.join(dir, "fake-opencode.sh");
  await fs.writeFile(scriptPath, source, "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("openCodeLocalAdapter parses JSONL run output, usage, and session id", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"text","sessionID":"session-oc-1","part":{"text":"Reading files."}}' \
  '{"type":"step_finish","sessionID":"session-oc-1","part":{"tokens":{"input":100,"output":20,"reasoning":5,"cache":{"read":30}},"cost":0.0018}}' \
  '{"type":"text","sessionID":"session-oc-1","part":{"text":"Done."}}'
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await openCodeLocalAdapter.execute?.({
    runId: "run-oc-1",
    adapterType: "opencode_local",
    config: {
      command: scriptPath,
      model: "openai/gpt-5.2-codex",
      variant: "medium",
    },
    prompt: "Inspect the repo",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.sessionId, "session-oc-1");
  assert.equal(result.sessionDisplayId, "session-oc-1");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "openai/gpt-5.2-codex");
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    outputTokens: 25,
    cachedInputTokens: 30,
  });
  assert.equal(result.output, "Reading files.\nDone.");
  assert.equal(result.summary, "Done.");
  assert.deepEqual(result.sessionParams, {
    sessionId: "session-oc-1",
    cwd: process.cwd(),
  });
  assert.deepEqual(chunks, [
    { stream: "stdout", chunk: "Reading files.\nDone.\n" },
  ]);
});

test("opencode session codec round-trips session params", () => {
  const codec = openCodeLocalAdapter.sessionCodec;
  assert.ok(codec);

  const serialized = codec.serialize({ sessionId: "oc-1", cwd: "/repo" });
  assert.deepEqual(serialized, { sessionId: "oc-1", cwd: "/repo" });

  const deserialized = codec.deserialize({ sessionId: "oc-1" });
  assert.deepEqual(deserialized, { sessionId: "oc-1" });

  assert.equal(codec.serialize({}), null);
  assert.equal(codec.deserialize({}), null);
});
