import test from "node:test";
import assert from "node:assert/strict";
import { minimaxApiProvider } from "../src/lib/agents/providers/minimax-api";

test("MiniMax provider has correct id and name", () => {
  assert.equal(minimaxApiProvider.id, "minimax-api");
  assert.equal(minimaxApiProvider.name, "MiniMax");
  assert.equal(minimaxApiProvider.type, "api");
  assert.equal(minimaxApiProvider.icon, "minimax");
});

test("MiniMax provider exposes the correct models", () => {
  const models = minimaxApiProvider.models ?? [];
  const modelIds = models.map((m) => m.id);
  assert.ok(modelIds.includes("MiniMax-M3"), "should include MiniMax-M3");
  assert.ok(modelIds.includes("MiniMax-M2.7"), "should include MiniMax-M2.7");
  assert.ok(
    modelIds.includes("MiniMax-M2.7-highspeed"),
    "should include MiniMax-M2.7-highspeed"
  );
  assert.equal(models.length, 3, "should expose exactly three models");
  assert.equal(
    models[0].id,
    "MiniMax-M3",
    "MiniMax-M3 should be the first (default) model"
  );
});

test("MiniMax provider sets apiKeyEnvVar to MINIMAX_API_KEY", () => {
  assert.equal(minimaxApiProvider.apiKeyEnvVar, "MINIMAX_API_KEY");
});

test("MiniMax provider isAvailable returns false when MINIMAX_API_KEY is not set", async () => {
  const original = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  try {
    const result = await minimaxApiProvider.isAvailable();
    assert.equal(result, false);
  } finally {
    if (original !== undefined) {
      process.env.MINIMAX_API_KEY = original;
    }
  }
});

test("MiniMax provider isAvailable returns true when MINIMAX_API_KEY is set", async () => {
  const original = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "test-api-key";
  try {
    const result = await minimaxApiProvider.isAvailable();
    assert.equal(result, true);
  } finally {
    if (original !== undefined) {
      process.env.MINIMAX_API_KEY = original;
    } else {
      delete process.env.MINIMAX_API_KEY;
    }
  }
});

test("MiniMax provider isAvailable returns false when MINIMAX_API_KEY is empty string", async () => {
  const original = process.env.MINIMAX_API_KEY;
  process.env.MINIMAX_API_KEY = "   ";
  try {
    const result = await minimaxApiProvider.isAvailable();
    assert.equal(result, false);
  } finally {
    if (original !== undefined) {
      process.env.MINIMAX_API_KEY = original;
    } else {
      delete process.env.MINIMAX_API_KEY;
    }
  }
});

test("MiniMax provider healthCheck returns unavailable when API key is missing", async () => {
  const original = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  try {
    const status = await minimaxApiProvider.healthCheck();
    assert.equal(status.available, false);
    assert.equal(status.authenticated, false);
    assert.ok(status.error, "should provide an error message");
  } finally {
    if (original !== undefined) {
      process.env.MINIMAX_API_KEY = original;
    }
  }
});

test("MiniMax provider runPrompt throws when API key is missing", async () => {
  const original = process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_API_KEY;
  try {
    await assert.rejects(
      () => minimaxApiProvider.runPrompt!("Hello", ""),
      /MINIMAX_API_KEY is not set/
    );
  } finally {
    if (original !== undefined) {
      process.env.MINIMAX_API_KEY = original;
    }
  }
});

test("MiniMax provider has installSteps defined", () => {
  assert.ok(Array.isArray(minimaxApiProvider.installSteps));
  assert.ok((minimaxApiProvider.installSteps?.length ?? 0) > 0);
});
