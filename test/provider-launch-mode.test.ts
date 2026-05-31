import test from "node:test";
import assert from "node:assert/strict";
import { resolveDetachedPromptLaunchMode } from "../src/lib/agents/detached-launch-mode";
import { claudeCodeProvider } from "../src/lib/agents/providers/claude-code";
import { codexCliProvider } from "../src/lib/agents/providers/codex-cli";

test("Claude keeps detached prompt runs in session mode", () => {
  assert.equal(resolveDetachedPromptLaunchMode(claudeCodeProvider, "Review this"), "session");
  assert.equal(resolveDetachedPromptLaunchMode(claudeCodeProvider), "session");
});

test("Codex keeps detached prompt runs in one-shot mode", () => {
  assert.equal(resolveDetachedPromptLaunchMode(codexCliProvider, "Review this"), "one-shot");
  assert.equal(resolveDetachedPromptLaunchMode(codexCliProvider), "session");
});
