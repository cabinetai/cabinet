import test from "node:test";
import assert from "node:assert/strict";
import {
  HermesConfigurationError,
  hermesInterventionsEnabled,
  readHermesReadOnlyServerConfig,
  readHermesExecutionServerConfig,
  readHermesRunServerConfig,
  readHermesServerConfig,
  readHermesSkillsServerConfig,
} from "./server-config";

test("Hermes intervention enablement is server-only and defaults false", () => {
  assert.equal(hermesInterventionsEnabled({}), false);
  assert.equal(hermesInterventionsEnabled({ CABINET_HERMES_INTERVENTIONS_ENABLED: "false" }), false);
  assert.equal(hermesInterventionsEnabled({ CABINET_HERMES_INTERVENTIONS_ENABLED: "1" }), false);
  assert.equal(hermesInterventionsEnabled({ CABINET_HERMES_INTERVENTIONS_ENABLED: " true " }), true);
});

const valid = {
  CABINET_HERMES_API_URL: "http://127.0.0.1:8642/",
  CABINET_HERMES_API_KEY: "server-secret",
  CABINET_HERMES_MANAGEMENT_URL: "http://127.0.0.1:56314/",
  CABINET_HERMES_MANAGEMENT_TOKEN: "management-secret",
  CABINET_HERMES_GATEWAY_URL: "http://127.0.0.1:8645/",
  CABINET_HERMES_GATEWAY_TOKEN: "gateway-secret",
  CABINET_HERMES_PROFILE: "operator-os",
};

test("Hermes server configuration validates and normalizes the complete contract", () => {
  assert.deepEqual(readHermesServerConfig(valid), {
    apiBaseUrl: "http://127.0.0.1:8642",
    apiKey: "server-secret",
    managementBaseUrl: "http://127.0.0.1:56314",
    managementToken: "management-secret",
    gatewayBaseUrl: "http://127.0.0.1:8645",
    gatewayToken: "gateway-secret",
    profile: "operator-os",
    timeoutMs: 3_000,
  });
});

test("Hermes server configuration fails clearly without echoing secret values", () => {
  for (const name of [
    "CABINET_HERMES_API_URL",
    "CABINET_HERMES_API_KEY",
    "CABINET_HERMES_MANAGEMENT_URL",
    "CABINET_HERMES_GATEWAY_URL",
    "CABINET_HERMES_GATEWAY_TOKEN",
    "CABINET_HERMES_PROFILE",
  ] as const) {
    const env = { ...valid, [name]: "" };
    assert.throws(
      () => readHermesServerConfig(env),
      (error: unknown) =>
        error instanceof HermesConfigurationError &&
        error.message.includes(name) &&
        !error.message.includes("server-secret")
    );
  }
});

test("Hermes server configuration rejects non-HTTP endpoints and unsafe timeouts", () => {
  assert.throws(
    () =>
      readHermesServerConfig({
        ...valid,
        CABINET_HERMES_API_URL: "file:///tmp/hermes.sock",
      }),
    /HTTP\(S\) loopback URL/
  );
  assert.throws(
    () =>
      readHermesServerConfig({
        ...valid,
        CABINET_HERMES_TIMEOUT_MS: "50",
      }),
    /250 to 30000/
  );
});

test("Hermes server configuration rejects public, credential-bearing, query, and fragment URLs before use", () => {
  const canary = "configuration-secret-canary";
  for (const url of [
    "https://example.com:8642",
    `http://user:${canary}@127.0.0.1:8642`,
    `http://127.0.0.1:8642?token=${canary}`,
    `http://127.0.0.1:8642/#${canary}`,
  ]) {
    assert.throws(
      () => readHermesServerConfig({ ...valid, CABINET_HERMES_API_URL: url }),
      (error: unknown) => error instanceof HermesConfigurationError && !error.message.includes(canary) && !error.message.includes("example.com"),
    );
  }
});

test("read-only configuration keeps source groups independent while strict mutation config remains complete", () => {
  const partial = readHermesReadOnlyServerConfig({
    CABINET_HERMES_API_URL: valid.CABINET_HERMES_API_URL,
    CABINET_HERMES_API_KEY: valid.CABINET_HERMES_API_KEY,
  });
  assert.equal(partial.apiBaseUrl, "http://127.0.0.1:8642");
  assert.equal(partial.apiKey, valid.CABINET_HERMES_API_KEY);
  assert.equal(partial.managementBaseUrl, null);
  assert.equal(partial.managementToken, null);
  assert.equal(partial.gatewayBaseUrl, null);
  assert.deepEqual(partial.sourceStates, {
    agent_api: "ready_to_probe",
    management: "unavailable",
    gateway: "unavailable",
  });
  assert.throws(() => readHermesServerConfig({
    CABINET_HERMES_API_URL: valid.CABINET_HERMES_API_URL,
    CABINET_HERMES_API_KEY: valid.CABINET_HERMES_API_KEY,
  }), /CABINET_HERMES_MANAGEMENT_URL/);
});

test("Hermes run configuration depends only on the Agent API and profile", () => {
  const run = readHermesRunServerConfig({
    CABINET_HERMES_API_URL: valid.CABINET_HERMES_API_URL,
    CABINET_HERMES_API_KEY: valid.CABINET_HERMES_API_KEY,
    CABINET_HERMES_PROFILE: valid.CABINET_HERMES_PROFILE,
  });
  assert.deepEqual(run, {
    apiBaseUrl: "http://127.0.0.1:8642",
    apiKey: valid.CABINET_HERMES_API_KEY,
    profile: "operator-os",
    timeoutMs: 3_000,
  });
  assert.throws(
    () => readHermesRunServerConfig({ CABINET_HERMES_PROFILE: "operator-os" }),
    (error: unknown) => error instanceof HermesConfigurationError
      && error.message === "Hermes Agent API run service is not configured."
      && !error.message.includes("CABINET_HERMES"),
  );
});

test("Hermes Skills configuration depends only on the canonical profile", () => {
  assert.deepEqual(readHermesSkillsServerConfig({
    CABINET_HERMES_PROFILE: " operator-os ",
    CABINET_HERMES_API_KEY: "must-not-be-required",
    CABINET_HERMES_MANAGEMENT_TOKEN: "must-not-be-required",
  }), { profile: "operator-os" });
  assert.deepEqual(readHermesSkillsServerConfig({}), { profile: null });
});

test("Hermes execution configuration is an absolute CLI and bounded profile contract", () => {
  assert.deepEqual(readHermesExecutionServerConfig({
    CABINET_HERMES_EXECUTION_CLI_PATH: "/opt/hermes/bin/hermes",
    CABINET_HERMES_PROFILE: "operator-os",
    CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
  }), {
    cliPath: "/opt/hermes/bin/hermes",
    profile: "operator-os",
    timeoutMs: 3_000,
    noTools: true,
  });
  for (const value of [undefined, "false", "1", " true ", "TRUE", "unexpected"]) {
    assert.throws(() => readHermesExecutionServerConfig({
      CABINET_HERMES_EXECUTION_CLI_PATH: "/opt/hermes/bin/hermes",
      CABINET_HERMES_PROFILE: "operator-os",
      CABINET_HERMES_EXECUTION_NO_TOOLS: value,
    }), /must be exactly true/);
  }
  assert.throws(
    () => readHermesExecutionServerConfig({
      CABINET_HERMES_EXECUTION_CLI_PATH: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
      CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
    }),
    /must be absolute/,
  );
  assert.throws(
    () => readHermesExecutionServerConfig({
      CABINET_HERMES_EXECUTION_CLI_PATH: "/opt/hermes/bin/hermes",
      CABINET_HERMES_PROFILE: "operator os; unsafe",
      CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
    }),
    /valid profile name/,
  );
});
