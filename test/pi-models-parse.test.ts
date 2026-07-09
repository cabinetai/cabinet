import test from "node:test";
import assert from "node:assert/strict";
import { parsePiModels, normalizePiModelId, piProvider } from "../src/lib/agents/providers/pi";

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

// Captured from real `pi --list-models` (v0.80.3): a whitespace-columned table.
// Columns: provider, model, context, max-out, thinking, images — separated by
// runs of 2+ spaces. The header row has no `/` and must be dropped.
const PI_LIST_MODELS_TABLE = [
  "provider  model                              context  max-out  thinking  images",
  "tfm       exa/search-fast                    128K     16.4K    no        no",
  "tfm       glm/glm-5.2                        128K     16.4K    no        no",
  "tfm       kai/nvidia/nemotron-3-super-120b-a12b:free  128K  16.4K    no        no",
].join("\n");

test("parses real `pi --list-models` table into provider/model ids", () => {
  const models = parsePiModels(PI_LIST_MODELS_TABLE);
  // Header row is dropped; each data row collapses to <provider>/<model>.
  assert.deepEqual(
    models.map((m) => m.id),
    [
      "tfm/exa/search-fast",
      "tfm/glm/glm-5.2",
      "tfm/kai/nvidia/nemotron-3-super-120b-a12b:free",
    ]
  );
  // Name mirrors the id; thinking levels still attached.
  assert.equal(models[1].name, "tfm/glm/glm-5.2");
  assert.ok((models[1].effortLevels || []).some((e) => e.id === "xhigh"));
});

test("a table row never becomes the whole-line id (regression)", () => {
  // Before the fix the entire row — including context/max-out/thinking/images
  // columns — was stored as the model id, which then broke splitProviderModel
  // and made `pi` reject the run with "Unknown provider".
  const models = parsePiModels(PI_LIST_MODELS_TABLE);
  for (const m of models) {
    assert.ok(
      !/\b128K\b|\b16\.4K\b|\bimages\b/.test(m.id),
      `model id leaked table columns: ${m.id}`
    );
    assert.ok(!m.id.includes("no        no"), `model id leaked flag columns: ${m.id}`);
  }
});

test("single-token line without a slash is dropped (header/label, not a model)", () => {
  const models = parsePiModels(["provider  model  context", "xai/grok-4.3"].join("\n"));
  // `provider  model  context` is the header row (identified by its column
  // labels) and dropped; only the bare id survives.
  assert.deepEqual(
    models.map((m) => m.id),
    ["xai/grok-4.3"]
  );
});

test("parses table rows whose model column has no internal slash", () => {
  // Not every provider's model slug carries a `/` (e.g. xai/grok-4.3). Such
  // rows must still reconstruct as <provider>/<model>, not fall back offline.
  const models = parsePiModels(
    [
      "provider  model     context  max-out  thinking  images",
      "xai       grok-4.3   256K     16.4K    no        no",
      "openai    gpt-5.4    128K     16.4K    no        no",
    ].join("\n")
  );
  assert.deepEqual(
    models.map((m) => m.id),
    ["xai/grok-4.3", "openai/gpt-5.4"]
  );
});

test("parses a live `pi --list-models` sample mixing slash-less and slashed model columns", () => {
  // Captured verbatim from `pi --list-models` (trailing spaces preserved): the
  // real output has `openai` rows whose model column has no `/` AND `tfm` rows
  // whose model column DOES contain `/`. Both must reconstruct correctly, and
  // the trailing whitespace must never leak into an id. Before the parser fix
  // every slash-less `openai` row was silently dropped → offline fallback.
  const LIVE_SAMPLE = [
    "provider  model                                       context  max-out  thinking  images",
    "openai    gpt-4                                       8.2K     8.2K     no        no    ",
    "openai    gpt-5.4                                     272K     128K     yes       yes   ",
    "tfm       exa/search-fast                             128K     16.4K    no        no    ",
    "tfm       glm/glm-5.2                                 128K     16.4K    no        no    ",
    "tfm       kai/nvidia/nemotron-3-super-120b-a12b:free  128K     16.4K    no        no    ",
  ].join("\n");
  const ids = parsePiModels(LIVE_SAMPLE).map((m) => m.id);
  assert.deepEqual(ids, [
    "openai/gpt-4",
    "openai/gpt-5.4",
    "tfm/exa/search-fast",
    "tfm/glm/glm-5.2",
    "tfm/kai/nvidia/nemotron-3-super-120b-a12b:free",
  ]);
  // No stat column or trailing whitespace ever survives in an id.
  for (const id of ids) {
    assert.equal(id, id.trim(), `id has stray whitespace: ${JSON.stringify(id)}`);
    assert.ok(
      !/\b128K\b|\b16\.4K\b|\b8\.2K\b|\bimages\b/.test(id),
      `id leaked a stat column: ${id}`
    );
  }
});

// ---- normalizePiModelId: heal stale persisted Pi model values on read -----

test("normalizePiModelId heals a whole table row into <pi-provider>/<model>", () => {
  assert.equal(
    normalizePiModelId(
      "tfm       glm/glm-5.2                                 128K     16.4K    no        no"
    ),
    "tfm/glm/glm-5.2"
  );
});

test("normalizePiModelId drops the multi-space header row", () => {
  assert.equal(
    normalizePiModelId(
      "provider  model                                       context  max-out  thinking  images"
    ),
    undefined
  );
});

test("normalizePiModelId leaves an already-clean Pi id untouched", () => {
  for (const clean of [
    "tfm/glm/glm-5.2",
    "tfm/kai/nvidia/nemotron-3-super-120b-a12b:free",
    "xai/grok-4.3",
  ]) {
    assert.equal(normalizePiModelId(clean), clean);
  }
});

test("normalizePiModelId does not weld stat columns onto a col0 that is already a full id", () => {
  // Regression: a full id followed by whitespace-columned stats must drop the
  // stats, not become `glm/glm-5.2/128K` (which `pi` would reject).
  assert.equal(normalizePiModelId("glm/glm-5.2   128K   no"), "glm/glm-5.2");
  assert.equal(normalizePiModelId("tfm/glm/glm-5.2   128K   16.4K   no"), "tfm/glm/glm-5.2");
});

test("normalizePiModelId heals a table row whose model column has no slash", () => {
  assert.equal(
    normalizePiModelId("xai       grok-4.3   256K     16.4K    no        no"),
    "xai/grok-4.3"
  );
});

test("normalizePiModelId returns undefined for empty/whitespace input", () => {
  for (const empty of ["", "   ", "  \t  "]) {
    assert.equal(normalizePiModelId(empty), undefined);
  }
});

// ---- heal at one-shot / verify consumption sites (pi.ts internal) ---------

test("buildOneShotInvocation heals a stale table-row model id", () => {
  const inv = piProvider.buildOneShotInvocation!("Reply OK", "/tmp", {
    model:
      "tfm       glm/glm-5.2                                 128K     16.4K    no        no",
    effort: "medium",
  });
  const modelIdx = inv.args.indexOf("--model");
  assert.ok(modelIdx !== -1, "expected --model in one-shot args");
  assert.equal(inv.args[modelIdx + 1], "tfm/glm/glm-5.2");
  const leaked = inv.args.some((a) => /128K|16\.4K|images/.test(a));
  assert.ok(!leaked, `table stat columns leaked into one-shot args: ${JSON.stringify(inv.args)}`);
});

test("buildVerifyCommand heals a stale table-row defaultModel", () => {
  const cmd = piProvider.buildVerifyCommand!(
    "tfm       glm/glm-5.2                                 128K     16.4K    no        no"
  );
  assert.ok(cmd.includes("--model 'tfm/glm/glm-5.2'"), `unexpected verify cmd: ${cmd}`);
  assert.ok(!/128K|16\.4K/.test(cmd), `table stat columns leaked into verify cmd: ${cmd}`);
});

test("buildVerifyCommand omits --model when defaultModel is undefined", () => {
  const cmd = piProvider.buildVerifyCommand!(undefined);
  assert.ok(!cmd.includes("--model"), `unexpected --model in cmd: ${cmd}`);
});
