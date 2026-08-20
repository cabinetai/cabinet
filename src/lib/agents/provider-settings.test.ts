import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderSettings, resolveEnabledProviderId } from "./provider-settings";
import { providerRegistry } from "./provider-registry";
import type { AgentProvider } from "./provider-interface";

function withRegisteredProvider(provider: AgentProvider, fn: () => void): void {
  providerRegistry.register(provider);
  try {
    fn();
  } finally {
    providerRegistry.providers.delete(provider.id);
  }
}

test("normalizeProviderSettings keeps a valid enabled default provider", () => {
  const settings = normalizeProviderSettings({
    defaultProvider: "claude-code",
    disabledProviderIds: [],
  });

  assert.equal(settings.defaultProvider, "claude-code");
  assert.deepEqual(settings.disabledProviderIds, []);
});

test("normalizeProviderSettings falls back when the requested default is disabled", () => {
  const settings = normalizeProviderSettings({
    defaultProvider: "codex-cli",
    disabledProviderIds: ["codex-cli"],
  });

  assert.equal(settings.defaultProvider, "claude-code");
  assert.deepEqual(settings.disabledProviderIds, ["codex-cli"]);
});

test("normalizeProviderSettings falls back to the first enabled provider when needed", () => {
  const previousDefault = providerRegistry.defaultProvider;
  providerRegistry.defaultProvider = "missing-provider";

  withRegisteredProvider(
    {
      id: "test-only-provider",
      name: "Test Only Provider",
      type: "cli",
      icon: "bot",
      command: "test-only-provider",
      async isAvailable() {
        return true;
      },
      async healthCheck() {
        return {
          available: true,
          authenticated: true,
          version: "test",
        };
      },
    },
    () => {
      // Disable every OTHER registered provider so the only enabled one is our
      // injected test provider. Deterministic regardless of which built-ins
      // ship in the registry (e.g. gemini-cli) — the prior hard-coded
      // [claude-code, codex-cli] list broke once more built-ins were added.
      const others = [...providerRegistry.providers.keys()].filter(
        (id) => id !== "test-only-provider"
      );
      const settings = normalizeProviderSettings({
        defaultProvider: "missing-provider",
        disabledProviderIds: others,
      });

      assert.equal(settings.defaultProvider, "test-only-provider");
      assert.deepEqual(settings.disabledProviderIds, others);
    }
  );

  providerRegistry.defaultProvider = previousDefault;
});

test("resolveEnabledProviderId falls back to the configured default when the requested provider is disabled", () => {
  const providerId = resolveEnabledProviderId("claude-code", {
    defaultProvider: "codex-cli",
    disabledProviderIds: ["claude-code"],
  });

  assert.equal(providerId, "codex-cli");
});

test("normalizeProviderSettings normalizes customConfigs cleanly", () => {
  const settings = normalizeProviderSettings({
    defaultProvider: "opencode",
    disabledProviderIds: [],
    customConfigs: {
      opencode: {
        baseURL: "  http://192.168.0.204:8317/v1  ",
        apiKeyEnvVar: "OPENAI_API_KEY",
      },
      invalid: {
        baseURL: "",
      },
    },
  });

  assert.deepEqual(settings.customConfigs, {
    opencode: {
      baseURL: "http://192.168.0.204:8317/v1",
      apiKeyEnvVar: "OPENAI_API_KEY",
    },
  });
});
