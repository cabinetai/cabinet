import test from "node:test";
import assert from "node:assert/strict";
import { resolveDispatchRuntime } from "./action-dispatcher";
import type { ConversationMeta } from "@/types/conversations";
import type { AgentPersona } from "./persona-manager";

function makeParent(overrides: Partial<ConversationMeta> = {}): ConversationMeta {
  return {
    id: "parent-convo",
    agentSlug: "ceo",
    cabinetPath: ".",
    title: "parent",
    trigger: "manual",
    status: "completed",
    startedAt: new Date().toISOString(),
    providerId: "codex-cli",
    adapterType: "codex_local",
    adapterConfig: { model: "gpt-5.4", effort: "high" },
    promptPath: "",
    transcriptPath: "",
    mentionedPaths: [],
    artifactPaths: [],
    ...overrides,
  } as ConversationMeta;
}

function makePersona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    slug: "copywriter",
    name: "Copywriter",
    provider: "codex-cli",
    adapterType: "codex_local",
    adapterConfig: {},
    cabinetPath: ".",
    ...overrides,
  } as AgentPersona;
}

test("resolveDispatchRuntime — same-provider parent pushes model + effort to child", () => {
  const parent = makeParent();
  const target = makePersona({ provider: "codex-cli" });

  const runtime = resolveDispatchRuntime(parent, target, {});

  assert.equal(runtime.providerId, "codex-cli");
  assert.equal(runtime.adapterType, "codex_local");
  assert.deepEqual(runtime.adapterConfig, { model: "gpt-5.4", effort: "high" });
});

test("resolveDispatchRuntime — parent provider overrides target persona's default provider", () => {
  // The core Gap-2 fix: a user who started the parent on claude-code/opus/
  // medium expects sub-tasks to also run on claude-code/opus/medium, even
  // when the target persona's declared provider is codex-cli. Since the
  // resolved provider matches the parent's, the parent's model + effort
  // both travel — no cross-provider dropping inside this branch.
  const parent = makeParent({
    providerId: "claude-code",
    adapterType: "claude_local",
    adapterConfig: { model: "opus", effort: "medium" },
  });
  const target = makePersona({ provider: "codex-cli" });

  const runtime = resolveDispatchRuntime(parent, target, {});

  assert.equal(runtime.providerId, "claude-code");
  assert.equal(runtime.adapterType, "claude_local");
  assert.equal(runtime.adapterConfig?.model, "opus");
  assert.equal(runtime.adapterConfig?.effort, "medium");
});

test("resolveDispatchRuntime — action providerId override wins over parent", () => {
  const parent = makeParent({
    providerId: "codex-cli",
    adapterType: "codex_local",
    adapterConfig: { model: "gpt-5.4", effort: "high" },
  });
  const target = makePersona({ provider: "codex-cli" });

  const runtime = resolveDispatchRuntime(parent, target, {
    providerId: "claude-code",
  });

  assert.equal(runtime.providerId, "claude-code");
  // Crossing providers via action override drops parent's model too.
  assert.equal(runtime.adapterConfig?.model, undefined);
  // Effort "high" is portable (both providers advertise it).
  assert.equal(runtime.adapterConfig?.effort, "high");
});

test("resolveDispatchRuntime — action model + effort override both parent + persona", () => {
  const parent = makeParent();
  const target = makePersona();

  const runtime = resolveDispatchRuntime(parent, target, {
    model: "gpt-5.1-codex-max",
    effort: "xhigh",
  });

  assert.equal(runtime.providerId, "codex-cli");
  assert.deepEqual(runtime.adapterConfig, {
    model: "gpt-5.1-codex-max",
    effort: "xhigh",
  });
});

test("resolveDispatchRuntime — effort is dropped when resolved provider doesn't advertise it", () => {
  // Parent uses codex-cli/gpt-5.1-codex-max with effort=none (a Codex-only
  // level). Dispatch to a claude-code target (via action override). Claude
  // advertises low/medium/high/xhigh/max — no `none` — so effort should be
  // dropped rather than passed through and rejected by the CLI.
  const parent = makeParent({
    providerId: "codex-cli",
    adapterConfig: { model: "gpt-5.1-codex-max", effort: "none" },
  });
  const target = makePersona({ provider: "codex-cli" });

  const runtime = resolveDispatchRuntime(parent, target, {
    providerId: "claude-code",
  });

  assert.equal(runtime.providerId, "claude-code");
  assert.equal(runtime.adapterConfig?.effort, undefined);
});

test("resolveDispatchRuntime — falls back to target persona when parent has no provider", () => {
  const parent = makeParent({
    providerId: undefined,
    adapterType: undefined,
    adapterConfig: undefined,
  });
  const target = makePersona({
    provider: "codex-cli",
    adapterType: "codex_local",
    adapterConfig: { model: "default-model" },
  });

  const runtime = resolveDispatchRuntime(parent, target, {});

  assert.equal(runtime.providerId, "codex-cli");
  assert.equal(runtime.adapterType, "codex_local");
  assert.deepEqual(runtime.adapterConfig, { model: "default-model" });
});
