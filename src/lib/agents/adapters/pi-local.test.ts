import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { piLocalAdapter } from "./pi-local";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-pi-local-test-"));
  const scriptPath = path.join(dir, "fake-pi.sh");
  await fs.writeFile(scriptPath, source, "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("piLocalAdapter parses JSONL lifecycle events and usage", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
printf '%s\n' \
  '{"type":"agent_start"}' \
  '{"type":"turn_start"}' \
  '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Hello "}}' \
  '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"world"}}' \
  '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}],"usage":{"input":80,"output":12,"cacheRead":5,"cost":{"total":0.0007}}}}' \
  '{"type":"agent_end"}'
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await piLocalAdapter.execute?.({
    runId: "run-pi-1",
    adapterType: "pi_local",
    config: {
      command: scriptPath,
      model: "xai/grok-4",
      thinking: "medium",
    },
    prompt: "Say hello world",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.provider, "pi");
  assert.equal(result.model, "xai/grok-4");
  assert.deepEqual(result.usage, {
    inputTokens: 80,
    outputTokens: 12,
    cachedInputTokens: 5,
  });
  assert.equal(result.summary, "Hello world");
  assert.ok(result.output?.includes("Hello world"));
  assert.ok(result.sessionParams);
  const params = result.sessionParams as Record<string, unknown>;
  assert.equal(typeof params.sessionFile, "string");
  assert.ok((params.sessionFile as string).endsWith(".json"));
});

test("pi session codec round-trips session file path", () => {
  const codec = piLocalAdapter.sessionCodec;
  assert.ok(codec);

  const serialized = codec.serialize({ sessionFile: "/tmp/pi/session-1.json" });
  assert.deepEqual(serialized, { sessionFile: "/tmp/pi/session-1.json" });

  const deserialized = codec.deserialize({ sessionFile: "/tmp/pi/session-1.json" });
  assert.deepEqual(deserialized, { sessionFile: "/tmp/pi/session-1.json" });

  assert.equal(codec.serialize({}), null);
  assert.equal(codec.deserialize({ sessionFile: "" }), null);
  assert.equal(codec.getDisplayId?.({ sessionFile: "/tmp/pi/session-1.json" }), "session-1");
});
