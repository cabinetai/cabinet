import test from "node:test";
import assert from "node:assert/strict";
import { parsePiModels, normalizePiModelId, piProvider } from "../src/lib/agents/providers/pi";

test("parses legacy bare `vendor/model` ids with thinking effort levels", () => {
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

test("empty / banner-only / nullish output falls back to the offline list", () => {
  // Regression: pre-fix a banner-only or empty stdout returned [] → empty
  // picker. Same bug class as the OpenCode hardening (§11 #22).
  for (const input of ["", "   \n ", null, undefined, "# No models — set XAI_API_KEY\n"]) {
    const models = parsePiModels(input);
    assert.ok(models.length > 0, "fallback must not be empty");
    assert.ok(models.some((m) => m.id === "xai/grok-4.3"));
  }
});

test("parses a live `pi --list-models` table (mixed slash / slash-less columns)", () => {
  // Captured verbatim from `pi --list-models` (trailing spaces preserved): the
  // real output is a whitespace-columned table with a header row, `openai` rows
  // whose model column has NO `/`, and `tfm` rows whose model column DOES. All
  // must reconstruct as <provider>/<model>; the header, stat columns and
  // trailing whitespace must never leak into an id. Before the fix every
  // slash-less row was silently dropped → offline fallback.
  const LIVE_SAMPLE = [
    "provider  model                                       context  max-out  thinking  images",
    "openai    gpt-4                                       8.2K     8.2K     no        no    ",
    "openai    gpt-5.4                                     272K     128K     yes       yes   ",
    "tfm       exa/search-fast                             128K     16.4K    no        no    ",
    "tfm       glm/glm-5.2                                 128K     16.4K    no        no    ",
    "tfm       kai/nvidia/nemotron-3-super-120b-a12b:free  128K     16.4K    no        no    ",
  ].join("\n");
  const models = parsePiModels(LIVE_SAMPLE);
  assert.deepEqual(
    models.map((m) => m.id),
    [
      "openai/gpt-4",
      "openai/gpt-5.4",
      "tfm/exa/search-fast",
      "tfm/glm/glm-5.2",
      "tfm/kai/nvidia/nemotron-3-super-120b-a12b:free",
    ]
  );
  // Name mirrors the id; thinking levels still attached.
  assert.equal(models[3].name, "tfm/glm/glm-5.2");
  assert.ok((models[3].effortLevels || []).some((e) => e.id === "xhigh"));
  // No stat column or trailing whitespace ever survives in an id.
  for (const m of models) {
    assert.equal(m.id, m.id.trim(), `id has stray whitespace: ${JSON.stringify(m.id)}`);
    assert.ok(
      !/\b128K\b|\b16\.4K\b|\b8\.2K\b|\bimages\b/.test(m.id),
      `id leaked a stat column: ${m.id}`
    );
  }
});

// ---- normalizePiModelId: heal stale persisted Pi model values on read -----
// Healing shares modelIdFromLine with parsePiModels, so these lock the healer's
// contract for the stored-value cases the parser tests don't cover directly.

test("normalizePiModelId heals a stale whole table row into <provider>/<model>", () => {
  // slash-in-model row, and a row whose model column has no slash.
  assert.equal(
    normalizePiModelId(
      "tfm       glm/glm-5.2                                 128K     16.4K    no        no"
    ),
    "tfm/glm/glm-5.2"
  );
  assert.equal(
    normalizePiModelId("xai       grok-4.3   256K     16.4K    no        no"),
    "xai/grok-4.3"
  );
});

test("normalizePiModelId does not weld stat columns onto a col0 that is already a full id", () => {
  // Must drop the stats, not become `glm/glm-5.2/128K` (which `pi` rejects).
  assert.equal(normalizePiModelId("glm/glm-5.2   128K   no"), "glm/glm-5.2");
  assert.equal(normalizePiModelId("tfm/glm/glm-5.2   128K   16.4K   no"), "tfm/glm/glm-5.2");
});

test("normalizePiModelId leaves a clean id untouched and returns undefined for header/empty", () => {
  assert.equal(normalizePiModelId("tfm/glm/glm-5.2"), "tfm/glm/glm-5.2");
  assert.equal(normalizePiModelId("xai/grok-4.3"), "xai/grok-4.3");
  // A clean provider-less bare id (used with a separate `provider`) must round
  // trip untouched, not collapse to undefined.
  assert.equal(normalizePiModelId("grok-4.3"), "grok-4.3");
  assert.equal(
    normalizePiModelId("provider  model  context  max-out  thinking  images"),
    undefined
  );
  for (const empty of ["", "   ", "  \t  ", null, undefined]) {
    assert.equal(normalizePiModelId(empty), undefined);
  }
});

// ---- heal at a consumption site (pi.ts internal) --------------------------

test("buildVerifyCommand heals a stale table-row model and omits --model when absent", () => {
  const cmd = piProvider.buildVerifyCommand!(
    "tfm       glm/glm-5.2                                 128K     16.4K    no        no"
  );
  assert.ok(cmd.includes("--model 'tfm/glm/glm-5.2'"), `unexpected verify cmd: ${cmd}`);
  assert.ok(!/128K|16\.4K/.test(cmd), `table stat columns leaked into verify cmd: ${cmd}`);
  assert.ok(!piProvider.buildVerifyCommand!(undefined).includes("--model"));
});
