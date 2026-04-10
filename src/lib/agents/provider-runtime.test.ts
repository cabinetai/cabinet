import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentProvider } from "./provider-interface";
import { providerRegistry } from "./provider-registry";
import { writeProviderSettings } from "./provider-settings";
import {
  getOneShotLaunchSpec,
  getSessionLaunchSpec,
  resolveProviderId,
  runOneShotProviderPrompt,
} from "./provider-runtime";
import { claudeCodeProvider } from "./providers/claude-code";
import { codexCliProvider } from "./providers/codex-cli";

async function createExecutableScript(source: string, windowsSource?: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-provider-test-"));
  const scriptPath = path.join(
    dir,
    process.platform === "win32" ? "fake-provider.cmd" : "fake-provider.sh"
  );
  await fs.writeFile(
    scriptPath,
    process.platform === "win32" ? (windowsSource || "@echo off\r\nexit /b 0\r\n") : source,
    "utf8"
  );
  if (process.platform !== "win32") {
    await fs.chmod(scriptPath, 0o755);
  }
  return scriptPath;
}

function registerTestProvider(
  provider: AgentProvider,
  t: test.TestContext,
  previousDefaultProvider: string
): void {
  providerRegistry.register(provider);
  t.after(() => {
    providerRegistry.providers.delete(provider.id);
    providerRegistry.defaultProvider = previousDefaultProvider;
  });
}

test("Codex provider builds the expected launch arguments", () => {
  const oneShot = codexCliProvider.buildOneShotInvocation?.("Say OK", process.cwd());
  assert.ok(oneShot);
  assert.deepEqual(oneShot.args, [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "Say OK",
  ]);

  const session = codexCliProvider.buildSessionInvocation?.("Say OK", process.cwd());
  assert.ok(session);
  assert.deepEqual(session.args, [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "Say OK",
  ]);
  assert.equal(session.initialPrompt, undefined);

  const interactiveSession = codexCliProvider.buildSessionInvocation?.(undefined, process.cwd());
  assert.ok(interactiveSession);
  assert.deepEqual(interactiveSession.args, ["--ephemeral"]);
  assert.equal(interactiveSession.initialPrompt, undefined);
});

test("Claude provider keeps the prompt injection session contract", () => {
  const session = claudeCodeProvider.buildSessionInvocation?.("Review this", process.cwd());
  assert.ok(session);
  assert.deepEqual(session.args, ["--dangerously-skip-permissions"]);
  assert.equal(session.initialPrompt, "Review this");
  assert.equal(session.readyStrategy, "claude");
});

test("provider runtime resolves launch specs through registered providers", async (t) => {
  const previousDefaultProvider = providerRegistry.defaultProvider;
  const originalSettings = await fs.readFile(
    path.join(process.cwd(), "data", ".agents", ".config", "providers.json"),
    "utf8"
  ).catch(() => null);
  const scriptPath = await createExecutableScript(
    "#!/bin/sh\nprintf '%s' \"$1\"\n",
    "@echo off\r\n<nul set /p =%~1\r\nexit /b 0\r\n"
  );
  const provider: AgentProvider = {
    id: "test-session-provider",
    name: "Test Session Provider",
    type: "cli",
    icon: "bot",
    command: "test-session-provider",
    commandCandidates: [scriptPath],
    buildOneShotInvocation(prompt: string) {
      return {
        command: this.command || "test-session-provider",
        args: [prompt],
      };
    },
    buildSessionInvocation(prompt: string | undefined) {
      return {
        command: this.command || "test-session-provider",
        args: prompt ? ["session-mode"] : [],
        initialPrompt: prompt?.trim() || undefined,
        readyStrategy: prompt ? "claude" : undefined,
      };
    },
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
  };

  registerTestProvider(provider, t, previousDefaultProvider);
  providerRegistry.defaultProvider = provider.id;
  await writeProviderSettings({
    defaultProvider: provider.id,
    disabledProviderIds: [],
  });
  t.after(async () => {
    const providersPath = path.join(process.cwd(), "data", ".agents", ".config", "providers.json");
    if (originalSettings === null) {
      await fs.rm(providersPath, { force: true });
      return;
    }
    await fs.writeFile(providersPath, originalSettings, "utf8");
  });

  const oneShot = getOneShotLaunchSpec({
    providerId: provider.id,
    prompt: "hello",
    workdir: process.cwd(),
  });
  assert.equal(oneShot.command, scriptPath);
  assert.deepEqual(oneShot.args, ["hello"]);

  const session = getSessionLaunchSpec({
    providerId: provider.id,
    prompt: "hello",
    workdir: process.cwd(),
  });
  assert.equal(session.command, scriptPath);
  assert.deepEqual(session.args, ["session-mode"]);
  assert.equal(session.initialPrompt, "hello");
  assert.equal(session.readyStrategy, "claude");
  assert.equal(resolveProviderId(), provider.id);
});

test("provider runtime falls back to the enabled default when the requested provider is disabled", async (t) => {
  const providersPath = path.join(process.cwd(), "data", ".agents", ".config", "providers.json");
  const originalSettings = await fs.readFile(providersPath, "utf8").catch(() => null);

  await writeProviderSettings({
    defaultProvider: "codex-cli",
    disabledProviderIds: ["claude-code"],
  });

  t.after(async () => {
    if (originalSettings === null) {
      await fs.rm(providersPath, { force: true });
      return;
    }
    await fs.writeFile(providersPath, originalSettings, "utf8");
  });

  assert.equal(resolveProviderId("claude-code"), "codex-cli");
});

test("runOneShotProviderPrompt closes stdin for CLI providers", async (t) => {
  const previousDefaultProvider = providerRegistry.defaultProvider;
  const scriptPath = await createExecutableScript(
    "#!/bin/sh\ncat >/dev/null\nprintf '%s' \"$1\"\n",
    "@echo off\r\n<nul set /p =%~1\r\nexit /b 0\r\n"
  );
  const provider: AgentProvider = {
    id: "test-run-provider",
    name: "Test Run Provider",
    type: "cli",
    icon: "bot",
    command: "test-run-provider",
    commandCandidates: [scriptPath],
    buildOneShotInvocation(prompt: string) {
      return {
        command: this.command || "test-run-provider",
        args: [prompt],
      };
    },
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
  };

  registerTestProvider(provider, t, previousDefaultProvider);

  const output = await runOneShotProviderPrompt({
    providerId: provider.id,
    prompt: "OK",
    cwd: process.cwd(),
    timeoutMs: 1_000,
  });

  assert.equal(output, "OK");
});
