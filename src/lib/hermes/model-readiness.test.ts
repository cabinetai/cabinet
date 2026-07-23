import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildHermesAcpLaunchEnvironment } from "./acp-launch";
import {
  HermesModelReadinessError,
  parseHermesModelReadiness,
  parseHermesProviderAttempts,
  resolveHermesModelReadiness,
} from "./model-readiness";

const validReadiness = {
  contract: "hermes.conversation.readiness",
  schema_version: 1,
  profile: "operator-os",
  provider: "ollama-cloud",
  model: "glm-5.2",
  model_source: "profile",
  credential_state: "present",
  endpoint_class: "provider",
  ready: true,
  blocked_reason: null,
  attempts: {
    model_requests_attempted: 0,
    provider_retries: 0,
    fallback_attempts: 0,
    last_provider_http_status: null,
  },
} as const;

test("strict ACP launch environment preserves exact profile/config source without broad inheritance", () => {
  const env = buildHermesAcpLaunchEnvironment({
    cliPath: "/opt/hermes/hermes-acp",
    hermesHome: "/isolated/hermes",
    profile: "operator-os",
    providerCredentialEnvName: "OLLAMA_API_KEY",
    timeoutMs: 3_000,
    noTools: true,
  }, {
    HOME: "/isolated/home",
    HERMES_HOME: "/wrong/home",
    PATH: "/usr/bin",
    OLLAMA_API_KEY: "fixture",
    UNRELATED_SECRET: "must-not-pass",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "HERMES_ACP_NO_TOOLS",
    "HERMES_HOME",
    "HERMES_PROFILE",
    "HOME",
    "NODE_ENV",
    "OLLAMA_API_KEY",
    "PATH",
  ]);
  assert.equal(env.HERMES_HOME, "/isolated/hermes");
  assert.equal(env.HERMES_PROFILE, "operator-os");
  assert.equal(env.HERMES_ACP_NO_TOOLS, "1");
  assert.equal(env.UNRELATED_SECRET, undefined);
});

test("readiness accepts one nonempty exact profile/provider/model resolution", () => {
  assert.deepEqual(
    parseHermesModelReadiness(validReadiness, "operator-os"),
    validReadiness,
  );
});

for (const [name, mutation] of [
  ["unknown schema", { schema_version: 2 }],
  ["wrong profile", { profile: "other-profile" }],
  ["empty provider", { provider: "" }],
  ["empty model", { model: "" }],
  ["null model", { model: null }],
  ["ambiguous source", { model_source: "ambiguous" }],
  ["missing credential", { credential_state: "absent" }],
  ["unknown credential state", { credential_state: "unknown" }],
  ["unknown endpoint class", { endpoint_class: "unknown" }],
  ["contradictory blocked reason", { blocked_reason: "blocked but marked ready" }],
  ["provider work during readiness", {
    attempts: { ...validReadiness.attempts, model_requests_attempted: 1 },
  }],
] as const) {
  test(`readiness fails closed on ${name}`, () => {
    assert.throws(
      () => parseHermesModelReadiness(
        { ...validReadiness, ...mutation },
        "operator-os",
      ),
      HermesModelReadinessError,
    );
  });
}

test("blocked readiness preserves only its bounded actionable reason", () => {
  assert.throws(
    () => parseHermesModelReadiness({
      ...validReadiness,
      ready: false,
      blocked_reason: "No effective Hermes model is configured for operator-os.",
    }, "operator-os"),
    (error: unknown) => error instanceof HermesModelReadinessError
      && error.message === "No effective Hermes model is configured for operator-os.",
  );
});

test("provider-attempt accounting rejects missing and unknown contracts", () => {
  const valid = {
    contract: "hermes.provider.attempts",
    schemaVersion: 1,
    modelRequestsAttempted: 1,
    providerRetries: 0,
    fallbackAttempts: 0,
    lastProviderHttpStatus: 200,
  };
  assert.deepEqual(parseHermesProviderAttempts(valid), valid);
  assert.throws(
    () => parseHermesProviderAttempts({ ...valid, schemaVersion: 2 }),
    HermesModelReadinessError,
  );
  assert.throws(() => parseHermesProviderAttempts(null), HermesModelReadinessError);
});

test("readiness command uses the same strict launch environment and dispatches no ACP prompt", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-readiness-"));
  const cliPath = path.join(cwd, "hermes-acp");
  const marker = path.join(cwd, "invocation.json");
  const source = `
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({
  args: process.argv.slice(2),
  profile: process.env.HERMES_PROFILE,
  hermesHome: process.env.HERMES_HOME,
  noTools: process.env.HERMES_ACP_NO_TOOLS,
  unrelatedPresent: process.env.UNRELATED_SECRET !== undefined
}));
process.stdout.write(${JSON.stringify(JSON.stringify(validReadiness))});
`;
  await fs.writeFile(cliPath, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  try {
    const result = await resolveHermesModelReadiness({
      config: {
        cliPath,
        hermesHome: path.join(cwd, "hermes-home"),
        profile: "operator-os",
        providerCredentialEnvName: "OLLAMA_API_KEY",
        timeoutMs: 3_000,
        noTools: true,
      },
      cwd,
      env: {
        HOME: cwd,
        PATH: process.env.PATH,
        OLLAMA_API_KEY: "fixture",
        UNRELATED_SECRET: "must-not-pass",
      },
    });
    assert.equal(result.model, "glm-5.2");
    assert.deepEqual(JSON.parse(await fs.readFile(marker, "utf8")), {
      args: ["--model-readiness-json"],
      profile: "operator-os",
      hermesHome: path.join(cwd, "hermes-home"),
      noTools: "1",
      unrelatedPresent: false,
    });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
});
