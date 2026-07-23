import assert from "node:assert/strict";
import test from "node:test";
import { hermesRuntimeAdapter } from "./hermes-runtime";

const ENV_KEYS = [
  "CABINET_HERMES_EXECUTION_CLI_PATH",
  "CABINET_HERMES_EXECUTION_NO_TOOLS",
  "CABINET_HERMES_PROFILE",
] as const;

async function withExecutionEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
  try {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Hermes session codec never invents a no-tools claim", () => {
  const codec = hermesRuntimeAdapter.sessionCodec;
  assert.ok(codec);
  assert.equal(codec.serialize({
    profile: "operator-os",
    sessionId: "session",
    protocol: "acp-stdio-v1",
    noTools: false,
  }), null);
  assert.equal(codec.deserialize({
    profile: "operator-os",
    sessionId: "session",
    protocol: "acp-stdio-v1",
    noTools: false,
  }), null);
  assert.deepEqual(codec.serialize({
    profile: "operator-os",
    sessionId: "session",
    protocol: "acp-stdio-v1",
    noTools: true,
  }), {
    profile: "operator-os",
    sessionId: "session",
    protocol: "acp-stdio-v1",
    noTools: true,
  });
});

for (const value of [undefined, "false", "unexpected"]) {
  test(`Hermes adapter rejects ${value ?? "absent"} no-tools configuration before spawn`, async () => {
    await withExecutionEnv({
      CABINET_HERMES_EXECUTION_CLI_PATH: "/bin/false",
      CABINET_HERMES_EXECUTION_NO_TOOLS: value,
      CABINET_HERMES_PROFILE: "operator-os",
    }, async () => {
      let spawnCount = 0;
      const result = await hermesRuntimeAdapter.execute!({
        runId: "fixture",
        adapterType: "hermes_runtime",
        config: {},
        prompt: "must not run",
        cwd: "/tmp",
        onLog: async () => undefined,
        onSpawn: async () => { spawnCount += 1; },
      });
      assert.equal(result.exitCode, 1);
      assert.equal(result.sessionParams, undefined);
      assert.equal(spawnCount, 0);
    });
  });
}
