#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ITERATIONS = 100;

export function validateBurnInReadiness(value) {
  if (
    !value ||
    value.contract !== "hermes.conversation.readiness" ||
    value.schema_version !== 1 ||
    value.profile !== "operator-os" ||
    value.provider !== "ollama-cloud" ||
    value.model !== "glm-5.2" ||
    value.model_source !== "profile" ||
    value.credential_state !== "present" ||
    value.endpoint_class !== "provider" ||
    value.ready !== true ||
    value.blocked_reason !== null ||
    !value.attempts ||
    value.attempts.model_requests_attempted !== 0 ||
    value.attempts.provider_retries !== 0 ||
    value.attempts.fallback_attempts !== 0 ||
    value.attempts.last_provider_http_status !== null
  ) {
    throw new Error("Hermes readiness burn-in returned an unexpected safe contract.");
  }
  return {
    profile: value.profile,
    provider: value.provider,
    model: value.model,
    modelSource: value.model_source,
    credentialState: value.credential_state,
    endpointClass: value.endpoint_class,
    ready: value.ready,
  };
}

export function runReadinessBurnIn(executable) {
  if (!executable || !path.isAbsolute(executable)) {
    throw new Error("HERMES_ACP_EXECUTABLE must be an absolute path.");
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-readiness-burnin-"));
  const home = path.join(root, "home");
  const hermesHome = path.join(home, ".hermes-cabinet-acp");
  fs.mkdirSync(hermesHome, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(hermesHome, "config.yaml"),
    "model:\n  default: glm-5.2\n  provider: ollama-cloud\n",
    { mode: 0o600 },
  );

  let identity = null;
  let boundedStderrInvocations = 0;
  try {
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      const completed = spawnSync(executable, ["--model-readiness-json"], {
        cwd: root,
        env: {
          HOME: home,
          HERMES_HOME: hermesHome,
          HERMES_PROFILE: "operator-os",
          HERMES_ACP_NO_TOOLS: "1",
          OLLAMA_API_KEY: "readiness-presence-marker",
          PATH: process.env.PATH,
          LANG: process.env.LANG,
        },
        encoding: "utf8",
        timeout: 30_000,
      });
      if (completed.status !== 0) {
        throw new Error(
          `Hermes readiness burn-in invocation failed (status=${completed.status}, stderr=${completed.stderr.trim() ? "present" : "empty"}).`,
        );
      }
      const stderr = completed.stderr.trim();
      if (Buffer.byteLength(stderr, "utf8") > 16_384) {
        throw new Error("Hermes readiness burn-in stderr exceeded its safe bound.");
      }
      if (
        /readiness-presence-marker|authorization|bearer|api[_-]?key\s*[:=]/i.test(
          `${completed.stdout}\n${stderr}`,
        )
      ) {
        throw new Error("Hermes readiness burn-in detected secret-shaped output.");
      }
      if (stderr) boundedStderrInvocations += 1;
      const lines = completed.stdout.trim().split("\n");
      if (lines.length !== 1) {
        throw new Error("Hermes readiness burn-in must return exactly one JSON object.");
      }
      const current = validateBurnInReadiness(JSON.parse(lines[0]));
      if (identity && JSON.stringify(current) !== JSON.stringify(identity)) {
        throw new Error("Hermes readiness identity changed during burn-in.");
      }
      identity = current;
    }
    return {
      contract: "cabinet.acp.readiness-burnin",
      schemaVersion: 1,
      iterations: ITERATIONS,
      passed: ITERATIONS,
      failed: 0,
      boundedStderrInvocations,
      identity,
      safety: {
        promptDispatches: 0,
        modelRequestsAttempted: 0,
        providerRetries: 0,
        fallbackAttempts: 0,
        providerCompletions: 0,
        secretEgress: 0,
      },
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(
    `${JSON.stringify(runReadinessBurnIn(process.env.HERMES_ACP_EXECUTABLE), null, 2)}\n`,
  );
}
