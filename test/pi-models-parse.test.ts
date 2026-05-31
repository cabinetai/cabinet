import test from "node:test";
import assert from "node:assert/strict";
import { parsePiModels } from "../src/lib/agents/providers/pi";

test("parses one model id per line with thinking effort levels", () => {
  const models = parsePiModels(
    ["xai/grok-4.3", "anthropic/claude-opus-4-7", "openai/gpt-5.4"].join("\n")
  );
  assert.deepEqual(
    models.map((m) => m.id),
    ["xai/grok-4.3", "anthropic/claude-opus-4-7", "openai/gpt-5.4"]
  );
  assert.equal(models[0].name, "xai/grok-4.3");
  assert.ok((models[0].effortLevels || []).some((e) => e.id === "xhigh"));
});

test("drops blank lines and # comment/banner lines", () => {
  const models = parsePiModels(
    ["# Available models", "", "xai/grok-4.3", "  ", "# end"].join("\n")
  );
  assert.deepEqual(
    models.map((m) => m.id),
    ["xai/grok-4.3"]
  );
});

test("output that is ONLY a banner falls back instead of going blank", () => {
  // Regression: pre-fix this returned [] → empty picker. Same bug class as
  // the OpenCode hardening (§11 #22).
  const models = parsePiModels("# No models configured — set XAI_API_KEY\n");
  assert.ok(models.length > 0);
  assert.ok(models.some((m) => m.id === "anthropic/claude-opus-4-7"));
});

test("empty / nullish output falls back to the offline list", () => {
  for (const input of ["", "   \n ", null, undefined]) {
    const models = parsePiModels(input);
    assert.ok(models.length > 0, "fallback must not be empty");
    assert.ok(models.some((m) => m.id === "xai/grok-4.3"));
  }
});
