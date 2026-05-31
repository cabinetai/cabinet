import test from "node:test";
import assert from "node:assert/strict";
import { resolveProviderModel } from "../src/lib/agents/runtime-options";
import type { ProviderInfo } from "../src/types/agents";

function provider(patch: Partial<ProviderInfo>): ProviderInfo {
  return {
    id: "opencode",
    name: "OpenCode",
    type: "cli",
    available: true,
    models: [
      { id: "openai/gpt-5.4", name: "openai/gpt-5.4" },
      { id: "anthropic/claude-opus-4-7", name: "anthropic/claude-opus-4-7" },
    ],
    ...patch,
  };
}

test("dynamic + not hydrated: an unknown saved id is preserved, not snapped to models[0]", () => {
  const p = provider({ dynamicModels: true, modelsHydrated: false });
  const resolved = resolveProviderModel(p, "opencode/minimax-m2.5-free");
  // Must NOT collapse to the fallback's first entry — that is exactly the bug
  // that silently rewrote saved OpenCode selections.
  assert.equal(resolved?.id, "opencode/minimax-m2.5-free");
  assert.equal(resolved?.name, "opencode/minimax-m2.5-free");
});

test("dynamic + not hydrated: fallbackModel is preserved when no requestedModel", () => {
  const p = provider({ dynamicModels: true, modelsHydrated: false });
  const resolved = resolveProviderModel(p, undefined, "opencode/glm-5.1");
  assert.equal(resolved?.id, "opencode/glm-5.1");
});

test("dynamic + not hydrated: a direct match still wins over the preserve guard", () => {
  const p = provider({ dynamicModels: true, modelsHydrated: false });
  const resolved = resolveProviderModel(p, "anthropic/claude-opus-4-7");
  assert.equal(resolved?.id, "anthropic/claude-opus-4-7");
  assert.equal(resolved?.name, "anthropic/claude-opus-4-7");
});

test("dynamic + hydrated: unknown id snaps to models[0] (real list is authoritative)", () => {
  const p = provider({
    dynamicModels: true,
    modelsHydrated: true,
    models: [
      { id: "opencode/minimax-m2.5-free", name: "MiniMax M2.5" },
      { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
    ],
  });
  const resolved = resolveProviderModel(p, "vendor/since-removed");
  assert.equal(resolved?.id, "opencode/minimax-m2.5-free");
});

test("non-dynamic provider: unchanged legacy behavior (unknown id → models[0])", () => {
  const p = provider({ dynamicModels: false });
  const resolved = resolveProviderModel(p, "something/not-here");
  assert.equal(resolved?.id, "openai/gpt-5.4");
});

test("no models → undefined regardless of dynamic flag", () => {
  const p = provider({ dynamicModels: true, modelsHydrated: false, models: [] });
  assert.equal(resolveProviderModel(p, "opencode/minimax-m2.5-free"), undefined);
});
