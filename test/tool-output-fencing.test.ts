import test from "node:test";
import assert from "node:assert/strict";
import {
  wrapToolOutput,
  stripToolOutput,
  TOOL_OUTPUT_OPEN,
  TOOL_OUTPUT_CLOSE,
} from "@/lib/agents/tool-output-markers";
import { parseTranscript } from "@/lib/agents/transcript-parser";
import {
  consumeCodexJsonStream,
  createCodexStreamAccumulator,
  flushCodexJsonStream,
} from "@/lib/agents/adapters/codex-stream";

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

test("Codex command events stream into one collapsible tool block", () => {
  const accumulator = createCodexStreamAccumulator();
  const prose = consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"msg_1","type":"agent_message","text":"I will inspect the folder."}}\n'
  );
  const started = consumeCodexJsonStream(
    accumulator,
    '{"type":"item.started","item":{"id":"cmd_1","type":"command_execution","command":"/bin/zsh -lc ls"}}\n'
  );

  assert.equal(prose, "I will inspect the folder.\n");
  assert.ok(started.startsWith(TOOL_OUTPUT_OPEN));
  assert.ok(!started.includes(TOOL_OUTPUT_CLOSE));

  const liveBlocks = parseTranscript(accumulator.display);
  assert.deepEqual(
    liveBlocks.map((block) => block.type),
    ["text", "tool"]
  );

  const completed = consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"cmd_1","type":"command_execution","command":"/bin/zsh -lc ls","aggregated_output":"index.md\\nnotes.md\\n","exit_code":0,"status":"completed"}}\n'
  );
  const answer = consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"msg_2","type":"agent_message","text":"I found both files."}}\n'
  );

  assert.ok(completed.endsWith(TOOL_OUTPUT_CLOSE));
  assert.equal(answer, "I found both files.\n");
  const blocks = parseTranscript(accumulator.display);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["text", "tool", "text"]
  );
  const tool = blocks.find((block) => block.type === "tool");
  assert.ok(tool?.type === "tool");
  assert.equal(tool.steps, 1);
  assert.match(tool.content, /^\$ \/bin\/zsh -lc ls/m);
  assert.match(tool.content, /index\.md/);
  const text = blocks.filter((block) => block.type === "text");
  assert.ok(
    text.every(
      (block) => block.type === "text" && !block.content.includes("index.md")
    )
  );
});

test("Codex completed commands are fenced even when the start event was missed", () => {
  const accumulator = createCodexStreamAccumulator();
  const display = consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"cmd_late","type":"command_execution","command":"pwd","aggregated_output":"/tmp/project\\n","exit_code":0,"status":"completed"}}\n'
  );

  assert.ok(display.startsWith(TOOL_OUTPUT_OPEN));
  assert.ok(display.endsWith(TOOL_OUTPUT_CLOSE));
  const [block] = parseTranscript(display);
  assert.ok(block?.type === "tool");
  assert.match(block.content, /^\$ pwd/m);
  assert.match(block.content, /\/tmp\/project/);
});

test("Codex terminal errors close active tool output before visible error prose", () => {
  const terminalEvents = [
    '{"type":"error","message":"usage limit reached"}\n',
    '{"type":"turn.failed","error":{"message":"usage limit reached"}}\n',
  ];

  for (const terminalEvent of terminalEvents) {
    const accumulator = createCodexStreamAccumulator();
    consumeCodexJsonStream(
      accumulator,
      '{"type":"item.started","item":{"id":"cmd_1","type":"command_execution","command":"long-running-command"}}\n'
    );
    consumeCodexJsonStream(accumulator, terminalEvent);
    consumeCodexJsonStream(
      accumulator,
      '{"type":"item.completed","item":{"id":"msg_final","type":"agent_message","text":"Try again after the limit resets."}}\n'
    );

    assert.equal(accumulator.startedCommands.size, 0);
    assert.equal(accumulator.display.split(TOOL_OUTPUT_OPEN).length - 1, 1);
    assert.equal(accumulator.display.split(TOOL_OUTPUT_CLOSE).length - 1, 1);
    assert.deepEqual(
      parseTranscript(accumulator.display).map((block) => block.type),
      ["tool", "text"]
    );
    const visible = stripToolOutput(accumulator.display);
    assert.match(visible, /usage limit reached/);
    assert.match(visible, /Try again after the limit resets/);
    assert.doesNotMatch(visible, /long-running-command/);
  }
});

test("Codex flush closes a command left active by an abnormal process exit", () => {
  const accumulator = createCodexStreamAccumulator();
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.started","item":{"id":"cmd_1","type":"command_execution","command":"pwd"}}\n'
  );

  const flushed = flushCodexJsonStream(accumulator);
  assert.equal(flushed, TOOL_OUTPUT_CLOSE);
  assert.equal(accumulator.startedCommands.size, 0);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_OPEN).length - 1, 1);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_CLOSE).length - 1, 1);
  assert.equal(stripToolOutput(accumulator.display), "");
  assert.equal(flushCodexJsonStream(accumulator), "");
});

test("overlapping Codex commands share one balanced outer tool fence", () => {
  const accumulator = createCodexStreamAccumulator();
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.started","item":{"id":"cmd_a","type":"command_execution","command":"command-a"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.started","item":{"id":"cmd_b","type":"command_execution","command":"command-b"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"cmd_a","type":"command_execution","command":"command-a","aggregated_output":"out-a\\n","exit_code":0,"status":"completed"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"cmd_b","type":"command_execution","command":"command-b","aggregated_output":"out-b\\n","exit_code":0,"status":"completed"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"msg_1","type":"agent_message","text":"Both commands finished."}}\n'
  );

  assert.equal(accumulator.startedCommands.size, 0);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_OPEN).length - 1, 1);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_CLOSE).length - 1, 1);
  const blocks = parseTranscript(accumulator.display);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["tool", "text"]
  );
  const tool = blocks.find((block) => block.type === "tool");
  assert.ok(tool?.type === "tool");
  assert.match(tool.content, /command-a/);
  assert.match(tool.content, /command-b/);
  assert.match(tool.content, /out-a/);
  assert.match(tool.content, /out-b/);
  assert.equal(stripToolOutput(accumulator.display), "Both commands finished.");
});

test("Codex agent prose remains visible while a command is in flight", () => {
  const accumulator = createCodexStreamAccumulator();
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.started","item":{"id":"cmd_1","type":"command_execution","command":"npm test"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"msg_progress","type":"agent_message","text":"Tests are running, this may take a while."}}\n'
  );

  assert.equal(accumulator.startedCommands.size, 1);

  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"cmd_1","type":"command_execution","command":"npm test","aggregated_output":"ok\\n","exit_code":0,"status":"completed"}}\n'
  );
  consumeCodexJsonStream(
    accumulator,
    '{"type":"item.completed","item":{"id":"msg_final","type":"agent_message","text":"All green."}}\n'
  );

  assert.equal(accumulator.startedCommands.size, 0);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_OPEN).length - 1, 2);
  assert.equal(accumulator.display.split(TOOL_OUTPUT_CLOSE).length - 1, 2);
  assert.deepEqual(
    parseTranscript(accumulator.display).map((block) => block.type),
    ["tool", "text", "tool", "text"]
  );
  const visible = stripToolOutput(accumulator.display);
  assert.match(visible, /Tests are running, this may take a while\./);
  assert.match(visible, /All green\./);
  assert.doesNotMatch(visible, /npm test|ok/);
});
