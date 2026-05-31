import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAgentText } from "@/components/tasks/conversation/claude-transcript-view";

test("normalizeAgentText is a no-op for clean text", () => {
  const input = "All systems normal.";
  assert.equal(normalizeAgentText(input), input);
});

test("normalizeAgentText strips a leading `running .zshenv` line", () => {
  const input = "running .zshenv 🌸\nHello, world.";
  assert.equal(normalizeAgentText(input), "Hello, world.");
});

test("normalizeAgentText only strips shell-init noise from the top, not mid-text", () => {
  const input = "Hello\nrunning .zshenv 🌸\nbye";
  // The regex is anchored to the start, so a mid-stream line is left alone.
  assert.equal(normalizeAgentText(input), "Hello\nrunning .zshenv 🌸\nbye");
});

test("normalizeAgentText splits concatenated sub-agent status lines", () => {
  const input =
    "Agent 4 (Lana x Father John Misty) completed. Waiting on the remaining 9.Agent 1 (Lana x Taylor Swift) done. 8 still running.Agent 3 (Lana x Billie Eilish) done. 7 still running.";
  const out = normalizeAgentText(input);
  const lines = out.split("\n");
  assert.equal(lines.length, 3, `expected 3 lines, got ${lines.length}: ${out}`);
  assert.match(lines[0], /^Agent 4 /);
  assert.match(lines[1], /^Agent 1 /);
  assert.match(lines[2], /^Agent 3 /);
});

test("normalizeAgentText handles both pathologies together", () => {
  const input =
    "running .zshenv 🌸\nAgent 1 (foo) done.Agent 2 (bar) done.";
  const out = normalizeAgentText(input);
  assert.equal(out, "Agent 1 (foo) done.\nAgent 2 (bar) done.");
});

test("normalizeAgentText doesn't break on prose that mentions agents", () => {
  const input = "I gave Agent 7 a task and it finished.";
  // No preceding non-whitespace before "Agent 7 (" pattern -> no change.
  assert.equal(normalizeAgentText(input), input);
});
