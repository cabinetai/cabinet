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
    outputTokens: 20,
    reasoningTokens: 5,
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

test("injects OPENCODE_CONFIG_CONTENT with compaction settings into the child process env", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"text","part":{"text":"compaction-test"}}'
`);

  const metaCalls: Array<Record<string, unknown>> = [];
  const result = await openCodeLocalAdapter.execute?.({
    runId: "run-oc-cfg",
    adapterType: "opencode_local",
    config: { command: scriptPath, model: "deepseek/deepseek-v4-pro" },
    prompt: "test compaction env",
    cwd: process.cwd(),
    onMeta: async (meta) => {
      metaCalls.push(meta as unknown as Record<string, unknown>);
    },
    onLog: async () => {},
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);

  // Verify onMeta reports OPENCODE_CONFIG_CONTENT in the env
  assert.ok(metaCalls.length > 0, "onMeta should have been called");
  const metaEnv = metaCalls[0].env as Record<string, string> | undefined;
  assert.ok(metaEnv, "onMeta should include env");
  assert.ok(
    typeof metaEnv.OPENCODE_CONFIG_CONTENT === "string" &&
      metaEnv.OPENCODE_CONFIG_CONTENT.length > 0,
    "OPENCODE_CONFIG_CONTENT should be set in meta env"
  );

  // Verify the content is valid JSON and contains compaction settings
  const parsed = JSON.parse(metaEnv.OPENCODE_CONFIG_CONTENT);
  assert.ok(parsed.compaction, "config should include compaction settings");
  assert.equal(parsed.compaction.auto, true);
  assert.equal(parsed.compaction.prune, true);
  assert.ok(
    typeof parsed.compaction.reserved === "number",
    "compaction.reserved should be a number"
  );

  // OPENCODE_DISABLE_PROJECT_CONFIG must still be set to prevent leakage
  assert.equal(
    metaEnv.OPENCODE_DISABLE_PROJECT_CONFIG,
    "true",
    "project config must still be disabled"
  );
});
