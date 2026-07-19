import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRuntimeOverride } from "./runtime-overrides";

test("Hermes runtime mode routes native work through the isolated Hermes adapter", () => {
  const previous = process.env.CABINET_RUNTIME_MODE;
  process.env.CABINET_RUNTIME_MODE = "hermes";

  try {
    assert.deepEqual(
      normalizeRuntimeOverride(
        { providerId: "codex-cli", model: "requested-model" },
        {
          providerId: "claude-code",
          adapterType: "claude_local",
          adapterConfig: { effort: "high" },
        }
      ),
      {
        providerId: "hermes",
        adapterType: "hermes_runtime",
        adapterConfig: undefined,
        isTerminal: false,
      }
    );
  } finally {
    if (previous === undefined) delete process.env.CABINET_RUNTIME_MODE;
    else process.env.CABINET_RUNTIME_MODE = previous;
  }
});

test("explicit terminal work cannot escape the Hermes route in Hermes runtime mode", () => {
  const previous = process.env.CABINET_RUNTIME_MODE;
  process.env.CABINET_RUNTIME_MODE = "hermes";

  try {
    assert.deepEqual(
      normalizeRuntimeOverride(
        { providerId: "codex-cli", runtimeMode: "terminal" },
        {
          providerId: "claude-code",
          adapterType: "claude_local",
          adapterConfig: { model: "stale-model", effort: "high" },
        }
      ),
      {
        providerId: "hermes",
        adapterType: "hermes_runtime",
        adapterConfig: undefined,
        isTerminal: false,
      }
    );
  } finally {
    if (previous === undefined) delete process.env.CABINET_RUNTIME_MODE;
    else process.env.CABINET_RUNTIME_MODE = previous;
  }
});
