import test from "node:test";
import assert from "node:assert/strict";
import {
  agentAdapterRegistry,
  defaultAdapterTypeForProvider,
  resolveExecutionProviderId,
  resolveLegacyExecutionProviderId,
  resolveLegacyProviderIdForAdapterType,
} from "./registry";

test("legacy adapter registry exposes the current compatibility adapters", () => {
  const adapterTypes = agentAdapterRegistry.listAll().map((adapter) => adapter.type).sort();
  assert.deepEqual(adapterTypes, [
    "claude_code_legacy",
    "claude_local",
    "codex_cli_legacy",
    "codex_local",
    "copilot_cli_legacy",
    "copilot_local",
    "cursor_cli_legacy",
    "cursor_local",
    "gemini_cli_legacy",
    "gemini_local",
    "grok_cli_legacy",
    "grok_local",
    "opencode_legacy",
    "opencode_local",
    "pi_legacy",
    "pi_local",
  ]);

  // Every provider has a matching legacy PTY adapter for terminal mode.
  const legacyTypes = agentAdapterRegistry
    .listAll()
    .filter((a) => a.executionEngine === "legacy_pty_cli")
    .map((a) => a.providerId)
    .sort();
  assert.deepEqual(legacyTypes, [
    "claude-code",
    "codex-cli",
    "copilot-cli",
    "cursor-cli",
    "gemini-cli",
    "grok-cli",
    "opencode",
    "pi",
  ]);

  const claudeAdapter = agentAdapterRegistry.get("claude_code_legacy");
  assert.ok(claudeAdapter);
  assert.equal(claudeAdapter.experimental, true);
  assert.equal(claudeAdapter.providerId, "claude-code");
  assert.equal(claudeAdapter.executionEngine, "legacy_pty_cli");

  const claudeLocal = agentAdapterRegistry.get("claude_local");
  assert.ok(claudeLocal);
  assert.equal(claudeLocal.executionEngine, "structured_cli");
  assert.equal(claudeLocal.providerId, "claude-code");

  const codexLocal = agentAdapterRegistry.get("codex_local");
  assert.ok(codexLocal);
  assert.equal(codexLocal.executionEngine, "structured_cli");
  assert.equal(codexLocal.providerId, "codex-cli");

  const geminiLocal = agentAdapterRegistry.get("gemini_local");
  assert.ok(geminiLocal);
  assert.equal(geminiLocal.executionEngine, "structured_cli");
  assert.equal(geminiLocal.providerId, "gemini-cli");

  const cursorLocal = agentAdapterRegistry.get("cursor_local");
  assert.ok(cursorLocal);
  assert.equal(cursorLocal.executionEngine, "structured_cli");
  assert.equal(cursorLocal.providerId, "cursor-cli");
  assert.equal(cursorLocal.supportsSessionResume, true);
  assert.ok(cursorLocal.sessionCodec);

  const openCodeLocal = agentAdapterRegistry.get("opencode_local");
  assert.ok(openCodeLocal);
  assert.equal(openCodeLocal.executionEngine, "structured_cli");
  assert.equal(openCodeLocal.providerId, "opencode");
  assert.equal(openCodeLocal.supportsSessionResume, true);
  assert.ok(openCodeLocal.sessionCodec);

  const piLocal = agentAdapterRegistry.get("pi_local");
  assert.ok(piLocal);
  assert.equal(piLocal.executionEngine, "structured_cli");
  assert.equal(piLocal.providerId, "pi");
  assert.equal(piLocal.supportsSessionResume, true);
  assert.ok(piLocal.sessionCodec);
});

test("provider-to-adapter defaults map current providers onto structured adapters when available", () => {
  assert.equal(defaultAdapterTypeForProvider("claude-code"), "claude_local");
  assert.equal(defaultAdapterTypeForProvider("codex-cli"), "codex_local");
  assert.equal(defaultAdapterTypeForProvider("gemini-cli"), "gemini_local");
  assert.equal(defaultAdapterTypeForProvider("cursor-cli"), "cursor_local");
  assert.equal(defaultAdapterTypeForProvider("opencode"), "opencode_local");
  assert.equal(defaultAdapterTypeForProvider("pi"), "pi_local");
  assert.equal(defaultAdapterTypeForProvider("grok-cli"), "grok_local");
  assert.equal(defaultAdapterTypeForProvider("copilot-cli"), "copilot_local");
});

test("execution provider resolution prefers explicit legacy adapter mappings", () => {
  assert.equal(resolveLegacyProviderIdForAdapterType("claude_code_legacy"), "claude-code");
  assert.equal(resolveLegacyProviderIdForAdapterType("codex_cli_legacy"), "codex-cli");
  assert.equal(resolveLegacyProviderIdForAdapterType("unknown_adapter"), undefined);

  assert.equal(
    resolveExecutionProviderId({
      adapterType: "codex_cli_legacy",
      providerId: "claude-code",
      defaultProviderId: "claude-code",
    }),
    "codex-cli"
  );

  assert.equal(
    resolveExecutionProviderId({
      adapterType: "unknown_adapter",
      providerId: "claude-code",
      defaultProviderId: "codex-cli",
    }),
    "claude-code"
  );
});

test("legacy execution resolution rejects unsupported adapter types", () => {
  assert.equal(
    resolveLegacyExecutionProviderId({
      adapterType: "claude_code_legacy",
      providerId: "codex-cli",
      defaultProviderId: "codex-cli",
    }),
    "claude-code"
  );

  assert.throws(
    () => resolveLegacyExecutionProviderId({ adapterType: "claude_local" }),
    /legacy PTY runtime/
  );

  assert.throws(
    () =>
      resolveLegacyExecutionProviderId({
        adapterType: "claude_local",
        providerId: "claude-code",
      }),
    /legacy PTY runtime/
  );
});
