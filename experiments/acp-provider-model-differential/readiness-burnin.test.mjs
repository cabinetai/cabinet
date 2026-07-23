import assert from "node:assert/strict";
import test from "node:test";

import { validateBurnInReadiness } from "./run-readiness-burnin.mjs";

const valid = {
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
};

test("burn-in accepts only the exact content-free zero-dispatch readiness contract", () => {
  assert.deepEqual(validateBurnInReadiness(valid), {
    profile: "operator-os",
    provider: "ollama-cloud",
    model: "glm-5.2",
    modelSource: "profile",
    credentialState: "present",
    endpointClass: "provider",
    ready: true,
  });
  assert.throws(() =>
    validateBurnInReadiness({
      ...valid,
      attempts: { ...valid.attempts, model_requests_attempted: 1 },
    })
  );
  assert.throws(() => validateBurnInReadiness({ ...valid, model: "" }));
});
