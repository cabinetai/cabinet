import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hermesRuntimeAdapter } from "./hermes-runtime";

const ENV_KEYS = [
  "CABINET_HERMES_EXECUTION_CLI_PATH",
  "CABINET_HERMES_EXECUTION_NO_TOOLS",
  "CABINET_HERMES_PROFILE",
  "HERMES_HOME",
  "OLLAMA_API_KEY",
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

test("Hermes adapter blocks an empty effective model before ACP spawn without retry", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-hermes-blocked-"));
  const cliPath = path.join(cwd, "hermes-acp");
  const countPath = path.join(cwd, "count");
  const source = `
const fs = require("node:fs");
const countPath = ${JSON.stringify(countPath)};
const count = Number(fs.existsSync(countPath) ? fs.readFileSync(countPath, "utf8") : "0") + 1;
fs.writeFileSync(countPath, String(count));
if (process.argv[2] !== "--model-readiness-json") process.exit(90);
process.stdout.write(JSON.stringify({
  contract: "hermes.conversation.readiness",
  schema_version: 1,
  profile: "operator-os",
  provider: "ollama-cloud",
  model: "",
  model_source: "default",
  credential_state: "present",
  endpoint_class: "provider",
  ready: false,
  blocked_reason: "No effective Hermes model is configured for operator-os.",
  attempts: {
    model_requests_attempted: 0,
    provider_retries: 0,
    fallback_attempts: 0,
    last_provider_http_status: null
  }
}));
`;
  await fs.writeFile(cliPath, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  try {
    await withExecutionEnv({
      CABINET_HERMES_EXECUTION_CLI_PATH: cliPath,
      CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
      CABINET_HERMES_PROFILE: "operator-os",
      HERMES_HOME: path.join(cwd, "hermes-home"),
      OLLAMA_API_KEY: "fixture",
    }, async () => {
      let spawnCount = 0;
      const result = await hermesRuntimeAdapter.execute!({
        runId: "fixture",
        adapterType: "hermes_runtime",
        config: { model: "" },
        prompt: "must not dispatch",
        cwd,
        onLog: async () => undefined,
        onSpawn: async () => { spawnCount += 1; },
      });
      assert.equal(result.exitCode, 1);
      assert.equal(result.errorCode, "model_unavailable");
      assert.equal(
        result.errorMessage,
        "No effective Hermes model is configured for operator-os.",
      );
      assert.equal(spawnCount, 0);
      assert.equal(await fs.readFile(countPath, "utf8"), "1");
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});

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
      HERMES_HOME: "/var/empty/hermes",
      OLLAMA_API_KEY: "fixture",
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
