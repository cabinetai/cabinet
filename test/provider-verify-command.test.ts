import test from "node:test";
import assert from "node:assert/strict";
import { openCodeProvider } from "../src/lib/agents/providers/opencode";
import { piProvider } from "../src/lib/agents/providers/pi";

test("OpenCode verify command: model-less mirrors the install step", () => {
  assert.equal(
    openCodeProvider.buildVerifyCommand?.(),
    "opencode run 'Reply with exactly OK'"
  );
  assert.equal(
    openCodeProvider.buildVerifyCommand?.(null),
    "opencode run 'Reply with exactly OK'"
  );
});

test("OpenCode verify command: pins the resolved default model", () => {
  assert.equal(
    openCodeProvider.buildVerifyCommand?.("opencode/minimax-m2.5-free"),
    "opencode run --model 'opencode/minimax-m2.5-free' 'Reply with exactly OK'"
  );
});

test("Pi verify command: model-less mirrors the install step", () => {
  assert.equal(
    piProvider.buildVerifyCommand?.(),
    "pi --mode json -p 'Reply with exactly OK'"
  );
});

test("Pi verify command: pins the resolved default model", () => {
  assert.equal(
    piProvider.buildVerifyCommand?.("xai/grok-4.3"),
    "pi --mode json --model 'xai/grok-4.3' -p 'Reply with exactly OK'"
  );
});

test("verify command keeps the exact 'Reply with exactly OK' probe (classifier contract)", () => {
  for (const cmd of [
    openCodeProvider.buildVerifyCommand?.("openai/gpt-4o"),
    piProvider.buildVerifyCommand?.("openai/gpt-4o"),
  ]) {
    assert.ok(cmd?.includes("'Reply with exactly OK'"));
  }
});
