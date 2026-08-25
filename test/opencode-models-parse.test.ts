import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenCodeModels } from "../src/lib/agents/providers/opencode";

// Real shape of `opencode models` stdout on an entitlement-gated machine
// (OPENAI_API_KEY + GEMINI_API_KEY set, no Zen credential).
const REAL_OUTPUT = [
  "opencode/minimax-m2.5-free",
  "opencode/deepseek-v4-flash-free",
  "google/gemini-3.1-pro-preview",
  "openai/gpt-4o",
].join("\n");

test("parses vendor/model ids into model entries with variant effort levels", () => {
  const models = parseOpenCodeModels(REAL_OUTPUT);
  assert.equal(models.length, 4);
  assert.deepEqual(
    models.map((m) => m.id),
    [
      "opencode/minimax-m2.5-free",
      "opencode/deepseek-v4-flash-free",
      "google/gemini-3.1-pro-preview",
      "openai/gpt-4o",
    ]
  );
  // id mirrors name (CLI gives no display name) and every entry carries the
  // --variant effort levels so the picker's effort control renders.
  assert.equal(models[0].name, "opencode/minimax-m2.5-free");
  assert.ok((models[0].effortLevels || []).some((e) => e.id === "max"));
});

test("drops blank lines and non-id CLI chrome (lines without a slash)", () => {
  const noisy = [
    "",
    "  ",
    "Available models:", // header, no slash → dropped
    "opencode/minimax-m2.5-free",
    "   google/gemini-3.1-pro-preview   ", // padded → trimmed + kept
    "done", // no slash → dropped
  ].join("\n");
  const models = parseOpenCodeModels(noisy);
  assert.deepEqual(
    models.map((m) => m.id),
    ["opencode/minimax-m2.5-free", "google/gemini-3.1-pro-preview"]
  );
});

test("empty / whitespace / nullish output falls back to the offline list", () => {
  for (const input of ["", "   \n  \n", null, undefined]) {
    const models = parseOpenCodeModels(input);
    assert.ok(models.length > 0, "fallback must not be empty");
    // Fallback is the static openai/anthropic/google/xai/deepseek set — every
    // id is a vendor/model and the known anchors are present.
    assert.ok(models.every((m) => m.id.includes("/")));
    assert.ok(models.some((m) => m.id === "anthropic/claude-opus-4-7"));
  }
});

test("output that is only noise (no slash anywhere) falls back, never blank", () => {
  const models = parseOpenCodeModels("loading...\nno models configured\n");
  assert.ok(models.length > 0);
  assert.ok(models.some((m) => m.id === "openai/gpt-5.4"));
});

test("offline fallback list includes DeepSeek models for picker visibility", () => {
  // When opencode models discovery fails, the fallback list populates the
  // model picker. DeepSeek users should see real DeepSeek options instead
  // of misleading OpenAI/Anthropic defaults.
  const models = parseOpenCodeModels(null);
  const deepseekIds = models.filter((m) => m.id.startsWith("deepseek/"));
  assert.ok(deepseekIds.length >= 2, "fallback should include at least 2 DeepSeek models");
  assert.ok(
    deepseekIds.some((m) => m.id === "deepseek/deepseek-v4-pro"),
    "fallback must include deepseek-v4-pro"
  );
  assert.ok(
    deepseekIds.some((m) => m.id === "deepseek/deepseek-v4-flash"),
    "fallback must include deepseek-v4-flash"
  );
  // Every fallback entry must carry variant levels so the picker renders
  // the effort dropdown.
  deepseekIds.forEach((m) => {
    assert.ok(
      (m.effortLevels || []).some((e) => e.id === "max"),
      `DeepSeek model ${m.id} should have variant effort levels`
    );
  });
});
