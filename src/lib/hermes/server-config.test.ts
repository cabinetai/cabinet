import test from "node:test";
import assert from "node:assert/strict";
import {
  HermesConfigurationError,
  readHermesServerConfig,
} from "./server-config";

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
    /HTTP\(S\) URL/
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
