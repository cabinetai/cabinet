import test from "node:test";
import assert from "node:assert/strict";
import { normalizeJobConfig } from "./job-normalization";

test("normalizeJobConfig derives the current default adapter type from the selected provider", () => {
  const normalized = normalizeJobConfig({
    name: "Daily Digest",
    provider: "claude-code",
    prompt: "Summarize yesterday.",
  });

  assert.equal(normalized.provider, "claude-code");
  assert.equal(normalized.adapterType, "claude_local");
  assert.equal(normalized.prompt, "Summarize yesterday.");
});

test("normalizeJobConfig uses the structured codex adapter by default", () => {
  const normalized = normalizeJobConfig({
    name: "Daily Digest",
    provider: "codex-cli",
    prompt: "Summarize yesterday.",
  });

  assert.equal(normalized.provider, "codex-cli");
  assert.equal(normalized.adapterType, "codex_local");
});

test("normalizeJobConfig preserves explicit adapter settings", () => {
  const normalized = normalizeJobConfig({
    name: "Review Queue",
    provider: "claude-code",
    adapterType: "claude_local",
    adapterConfig: {
      model: "claude-sonnet-4-6",
      timeoutSec: 120,
    },
    prompt: "Review the queue.",
  });

  assert.equal(normalized.adapterType, "claude_local");
  assert.deepEqual(normalized.adapterConfig, {
    model: "claude-sonnet-4-6",
    timeoutSec: 120,
  });
});
