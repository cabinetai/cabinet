import test from "node:test";
import assert from "node:assert/strict";
import {
  wrapToolOutput,
  stripToolOutput,
  TOOL_OUTPUT_OPEN,
  TOOL_OUTPUT_CLOSE,
} from "@/lib/agents/tool-output-markers";
import { parseTranscript } from "@/lib/agents/transcript-parser";

test("markers are non-control, non-whitespace PUA codepoints", () => {
  assert.equal(TOOL_OUTPUT_OPEN.charCodeAt(0), 0xe000);
  assert.equal(TOOL_OUTPUT_CLOSE.charCodeAt(0), 0xe001);
  // Survives .trim() (not whitespace) so the fence outlives transcript cleanup.
  assert.equal(`${TOOL_OUTPUT_OPEN}x${TOOL_OUTPUT_CLOSE}`.trim().length, 3);
});

test("stripToolOutput removes a fenced region entirely", () => {
  const text = `Prose before.${wrapToolOutput(
    "running .zshenv 🌸\ntotal 496 drwxr-xr-x 28 staff"
  )}Prose after.`;
  const out = stripToolOutput(text);
  assert.ok(!out.includes("drwxr-xr-x"));
  assert.ok(!out.includes(TOOL_OUTPUT_OPEN));
  assert.ok(out.includes("Prose before."));
  assert.ok(out.includes("Prose after."));
});

test("stripToolOutput drops an unterminated (still-streaming) region", () => {
  const text = `Answer text.${TOOL_OUTPUT_OPEN}ls -la output still streaming`;
  const out = stripToolOutput(text);
  assert.equal(out.trim(), "Answer text.");
});

test("stripToolOutput is a no-op when there are no markers", () => {
  assert.equal(stripToolOutput("plain prose"), "plain prose");
});

test("parseTranscript keeps fenced output as a separate tool block", () => {
  const raw = `${wrapToolOutput(
    "running .zshenv 🌸\ntotal 8 drwxr-xr-x@ 4 staff"
  )}I'll create a New Zealand trip plan.`;
  const blocks = parseTranscript(raw);

  const tool = blocks.find((b) => b.type === "tool");
  const textBlock = blocks.find((b) => b.type === "text");
  assert.ok(tool, "expected a tool block");
  assert.equal(tool!.type === "tool" && tool!.steps, 1);
  assert.ok(tool!.type === "tool" && tool!.content.includes("drwxr-xr-x"));
  assert.ok(
    textBlock && textBlock.type === "text" &&
      textBlock.content.includes("New Zealand")
  );
  // Prose must NOT carry the ls noise or the sentinels.
  assert.ok(
    textBlock!.type === "text" && !textBlock!.content.includes("drwxr-xr-x")
  );
  assert.ok(
    textBlock!.type === "text" &&
      !textBlock!.content.includes(TOOL_OUTPUT_OPEN)
  );
});

test("consecutive tool regions separated by whitespace merge with a step count", () => {
  const raw =
    wrapToolOutput("step one out") +
    "\n\n" +
    wrapToolOutput("step two out") +
    wrapToolOutput("step three out") +
    "Done.";
  const blocks = parseTranscript(raw);
  const tools = blocks.filter((b) => b.type === "tool");
  assert.equal(tools.length, 1, "adjacent tool runs collapse into one block");
  assert.equal(tools[0].type === "tool" && tools[0].steps, 3);
});

test("prose between tool regions keeps them as distinct blocks", () => {
  const raw =
    wrapToolOutput("first") +
    "Some real prose in the middle." +
    wrapToolOutput("second");
  const blocks = parseTranscript(raw);
  assert.equal(blocks.filter((b) => b.type === "tool").length, 2);
  assert.equal(blocks.filter((b) => b.type === "text").length, 1);
});

test("unterminated tool region (mid-stream) still collapses, not leaks", () => {
  const raw = `Working on it.${TOOL_OUTPUT_OPEN}partial ls output, no close yet`;
  const blocks = parseTranscript(raw);
  const tool = blocks.find((b) => b.type === "tool");
  assert.ok(tool, "expected the open-ended region to become a tool block");
  assert.ok(tool!.type === "tool" && tool!.content.includes("partial ls"));
  const text = blocks.find((b) => b.type === "text");
  assert.ok(text && text.type === "text" && text.content === "Working on it.");
});

test("transcript with no markers parses exactly as before", () => {
  const blocks = parseTranscript("Just a normal answer.\n\nWith two paragraphs.");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
});
