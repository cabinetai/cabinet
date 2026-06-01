import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeCodexJsonStream,
  createCodexStreamAccumulator,
  extractCodexJsonlDisplay,
  recoverCodexStdoutOutput,
} from "./codex-stream";

test("extractCodexJsonlDisplay prefers agent_message over reasoning", () => {
  const transcript = [
    '{"type":"item.completed","item":{"id":"i0","type":"reasoning","text":"**Thinking**"}}',
    '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"Hello there."}}',
  ].join("\n");
  assert.equal(extractCodexJsonlDisplay(transcript), "Hello there.");
});

test("extractCodexJsonlDisplay falls back to last reasoning line", () => {
  const transcript = [
    '{"type":"item.completed","item":{"id":"i0","type":"reasoning","text":"**Step one**"}}',
    '{"type":"item.completed","item":{"id":"i1","type":"reasoning","text":"**Step two done**"}}',
  ].join("\n");
  assert.equal(extractCodexJsonlDisplay(transcript), "Step two done");
});

test("extractCodexJsonlDisplay falls back to command output when no agent_message", () => {
  const transcript = [
    '{"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"Checking time."}}',
    '{"type":"item.completed","item":{"id":"i1","type":"command_execution","aggregated_output":"Sat May 31 09:20:47 EDT 2026"}}',
  ].join("\n");
  assert.match(extractCodexJsonlDisplay(transcript), /Checking time/);
});

test("recoverCodexStdoutOutput reads plain text after JSONL", () => {
  const stdout = [
    '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    "The answer is 3:45 PM in New York.",
  ].join("\n");
  const acc = createCodexStreamAccumulator();
  consumeCodexJsonStream(acc, stdout);
  assert.equal(
    recoverCodexStdoutOutput(stdout, acc),
    "The answer is 3:45 PM in New York."
  );
});

test("consumeCodexJsonStream treats non-JSON lines as agent text", () => {
  const acc = createCodexStreamAccumulator();
  const display = consumeCodexJsonStream(acc, "Plain final line.\n");
  assert.equal(display, "Plain final line.\n");
});
