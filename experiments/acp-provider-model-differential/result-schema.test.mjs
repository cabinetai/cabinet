import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const resultPath = path.resolve(
  "docs/research/parallel/acp-provider-model-differential/differential.json",
);
const readinessPath = path.resolve(
  "docs/research/parallel/acp-provider-model-differential/readiness-result.json",
);
const burnInPath = path.resolve(
  "docs/research/parallel/acp-provider-model-differential/readiness-burnin.json",
);

test("committed differential is bounded, content-free, and machine-readable", () => {
  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.safety.modelRequests, 0);
  assert.equal(result.safety.providerCompletions, 0);
  assert.equal(result.safety.promptDispatches, 0);
  assert.equal(result.firstDivergence.field, "process.config_root");
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "\"apiKey\":",
    "\"credentialValue\":",
    "authorization",
    "bearer",
    "\"promptText\":",
    "\"requestBody\":",
    "response_body",
    "/Users/",
    "/private/",
    "/var/folders/",
  ]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("readiness differential proves the config-root divergence without dispatch", () => {
  const result = JSON.parse(fs.readFileSync(readinessPath, "utf8"));
  assert.equal(result.modelRequests, 0);
  assert.equal(result.providerCompletions, 0);
  assert.equal(result.promptDispatches, 0);
  assert.equal(result.passingStandalone.ready, true);
  assert.equal(result.passingStandalone.profile, "operator-os");
  assert.equal(result.passingStandalone.provider, "ollama-cloud");
  assert.equal(result.passingStandalone.model, "glm-5.2");
  assert.equal(result.failingIntegrated.ready, false);
  assert.equal(result.failingIntegrated.provider, "ollama-cloud");
  assert.equal(result.failingIntegrated.model, "");
  assert.equal(result.failingIntegrated.configSource, "missing");
});

test("committed 100/100 readiness burn-in is safe and path-free", () => {
  const result = JSON.parse(fs.readFileSync(burnInPath, "utf8"));
  assert.equal(result.contract, "cabinet.acp.readiness-burnin");
  assert.equal(result.iterations, 100);
  assert.equal(result.passed, 100);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.identity, {
    profile: "operator-os",
    provider: "ollama-cloud",
    model: "glm-5.2",
    modelSource: "profile",
    credentialState: "present",
    endpointClass: "provider",
    ready: true,
  });
  assert.deepEqual(result.safety, {
    promptDispatches: 0,
    modelRequestsAttempted: 0,
    providerRetries: 0,
    fallbackAttempts: 0,
    providerCompletions: 0,
    secretEgress: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /\/Users\/|\/private\/|\/tmp\/|authorization|bearer/i);
});
