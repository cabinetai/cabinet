import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { codexLocalAdapter } from "./codex-local";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-codex-local-test-"));
  const scriptPath = path.join(dir, "fake-codex.sh");
  await fs.writeFile(scriptPath, source, "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("codexLocalAdapter executes a structured json event stream", async () => {
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"thread.started","thread_id":"thread-123"}' \
  '{"type":"turn.started"}' \
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Running pwd now."}}' \
  '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc pwd"}}' \
  '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc pwd","aggregated_output":"/Users/mybiblepath/Development/cabinet\\n","exit_code":0,"status":"completed"}}' \
  '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"OK"}}' \
  '{"type":"turn.completed","usage":{"input_tokens":50,"cached_input_tokens":10,"output_tokens":5}}'
printf '%s\n' \
  'Reading prompt from stdin...' \
  '2026-04-15T08:14:41.494565Z  WARN codex_state::runtime: failed to open state db at /Users/test/.codex/state_5.sqlite: migration 23 was previously applied but is missing in the resolved migrations' \
  'Meaningful stderr line' >&2
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await codexLocalAdapter.execute?.({
    runId: "run-1",
    adapterType: "codex_local",
    config: { command: scriptPath, model: "gpt-5.4" },
    prompt: "Say hello",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "Running pwd now.\n\n$ /bin/zsh -lc pwd\n/Users/mybiblepath/Development/cabinet\nOK");
  assert.equal(result.summary, "OK");
  assert.equal(result.provider, "codex-cli");
  assert.equal(result.model, "gpt-5.4");
  assert.equal(result.billingType, "unknown");
  assert.equal(result.sessionId, "thread-123");
  assert.deepEqual(result.usage, {
    inputTokens: 50,
    outputTokens: 5,
    cachedInputTokens: 10,
  });
  assert.deepEqual(chunks, [
    { stream: "stdout", chunk: "Running pwd now.\n\n$ /bin/zsh -lc pwd\n/Users/mybiblepath/Development/cabinet\nOK\n" },
    { stream: "stderr", chunk: "Meaningful stderr line\n" },
  ]);
});

test("codexLocalAdapter surfaces in-stream {type:error} events as errorMessage and classifies model_unavailable", async () => {
  // Mirror the real-world shape codex emits when the backend rejects a
  // plan-gated model: the outer event carries a JSON-stringified wrapper in
  // .message with the human-readable text nested under .error.message.
  const innerJson = JSON.stringify({
    type: "error",
    status: 400,
    error: {
      type: "invalid_request_error",
      message: "The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account.",
    },
  });
  // Escape for embedding inside an /bin/sh single-quoted string: wrap the
  // JSON with double quotes and rely on the shell heredoc below, which is
  // simpler than escaping.
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
cat <<'JSONLOG'
{"type":"thread.started","thread_id":"thread-err"}
{"type":"turn.started"}
{"type":"error","message":${JSON.stringify(innerJson)}}
{"type":"turn.failed","error":{"message":${JSON.stringify(innerJson)}}}
JSONLOG
exit 1
`);

  const result = await codexLocalAdapter.execute?.({
    runId: "run-2",
    adapterType: "codex_local",
    config: { command: scriptPath, model: "gpt-5.2-codex" },
    prompt: "hi",
    cwd: process.cwd(),
    onLog: async () => {},
  });

  assert.ok(result);
  assert.equal(result.exitCode, 1);
  assert.equal(
    result.errorMessage,
    "The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account."
  );

  // Classifier should now short-circuit to model_unavailable when the
  // stream-captured message is threaded in (mirrors what the runner does
  // when stderr is empty).
  const classified = codexLocalAdapter.classifyError?.(result.errorMessage ?? "", result.exitCode);
  assert.equal(classified?.kind, "model_unavailable");
  assert.match(classified?.hint ?? "", /available on this account's plan/i);
});

test("codexLocalAdapter suppresses codex tracing diagnostics (skill-load errors) from stderr", async () => {
  // Repro for the first-run report: a malformed host skill (invalid
  // SKILL.md YAML) makes codex log `<ts> ERROR codex_core::session: failed
  // to load skill …` on stderr at session startup — before the turn. These
  // are pure tracing diagnostics and must not surface as a stderr chunk
  // (which the daemon would otherwise fold into the visible turn) nor reach
  // the model output.
  const scriptPath = await createExecutableScript(`#!/bin/sh
cat >/dev/null
printf '%s\n' \
  '{"type":"thread.started","thread_id":"thread-skill"}' \
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"CEO online."}}' \
  '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
printf '%s\n' \
  '2026-05-15T11:30:17.532244Z ERROR codex_core::session: failed to load skill /tmp/skills/short-form-video/SKILL.md: invalid YAML: mapping values are not allowed in this context at line 2 column 385' \
  '2026-05-15T11:30:17.532649Z ERROR codex_core::session: failed to load skill /tmp/.agents/skills/short-form-video/SKILL.md: invalid YAML: mapping values are not allowed in this context at line 2 column 385' >&2
`);

  const chunks: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
  const result = await codexLocalAdapter.execute?.({
    runId: "run-skill",
    adapterType: "codex_local",
    config: { command: scriptPath, model: "gpt-5.4" },
    prompt: "hi",
    cwd: process.cwd(),
    onLog: async (stream, chunk) => {
      chunks.push({ stream, chunk });
    },
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "CEO online.");
  // The skill-load ERROR lines are the only stderr; all of it is filtered,
  // so no stderr chunk is emitted and the visible output is clean.
  assert.deepEqual(chunks, [
    { stream: "stdout", chunk: "CEO online.\n" },
  ]);
  assert.ok(!JSON.stringify(chunks).includes("short-form-video"));
});
