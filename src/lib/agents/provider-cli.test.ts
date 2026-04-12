import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentProvider } from "./provider-interface";
import {
  buildCommandCandidates,
  buildRuntimePath,
  checkCliProviderAvailable,
  resolveCliCommand,
} from "./provider-cli";

async function createExecutableScript(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-provider-cli-test-"));
  const scriptPath = path.join(
    dir,
    process.platform === "win32" ? "fake-provider.cmd" : "fake-provider.sh"
  );
  const scriptSource =
    process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : source;
  await fs.writeFile(scriptPath, scriptSource, "utf8");
  if (process.platform !== "win32") {
    await fs.chmod(scriptPath, 0o755);
  }
  return scriptPath;
}

test("resolveCliCommand prefers an existing command candidate path", async () => {
  const scriptPath = await createExecutableScript("#!/bin/sh\nexit 0\n");
  const provider: AgentProvider = {
    id: "test-cli-provider",
    name: "Test CLI Provider",
    type: "cli",
    icon: "bot",
    command: "missing-cli-provider",
    commandCandidates: [scriptPath, "missing-cli-provider"],
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

  assert.equal(resolveCliCommand(provider), scriptPath);
});

test("checkCliProviderAvailable uses resolved command candidates", async () => {
  const scriptPath = await createExecutableScript("#!/bin/sh\nexit 0\n");
  const provider: AgentProvider = {
    id: "test-cli-provider",
    name: "Test CLI Provider",
    type: "cli",
    icon: "bot",
    command: "missing-cli-provider",
    commandCandidates: [scriptPath, "missing-cli-provider"],
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

  assert.equal(await checkCliProviderAvailable(provider), true);
});

test("buildRuntimePath uses Windows delimiters and npm global bin paths", () => {
  const runtimePath = buildRuntimePath({
    platform: "win32",
    env: {
      USERPROFILE: "C:\\Users\\TestUser",
      APPDATA: "C:\\Users\\TestUser\\AppData\\Roaming",
      PATH: "C:\\Windows\\System32",
    },
    nvmBin: null,
  });

  assert.equal(
    runtimePath,
    [
      "C:\\Users\\TestUser\\AppData\\Roaming\\npm",
      "C:\\Users\\TestUser\\.local\\bin",
      "C:\\Windows\\System32",
    ].join(";")
  );
});

test("buildRuntimePath uses requested platform path semantics even on a different host OS", () => {
  const runtimePath = buildRuntimePath({
    platform: "win32",
    env: {
      USERPROFILE: "C:/Users/TestUser",
      APPDATA: "C:/Users/TestUser/AppData/Roaming",
      PATH: "C:/Windows/System32",
    },
    nvmBin: "C:/Users/TestUser/.nvm/bin",
  });

  assert.equal(
    runtimePath,
    [
      "C:\\Users\\TestUser\\AppData\\Roaming\\npm",
      "C:\\Users\\TestUser\\.local\\bin",
      "C:\\Users\\TestUser\\.nvm\\bin",
      "C:/Windows/System32",
    ].join(";")
  );
});

test("buildRuntimePath uses POSIX separators when a POSIX platform is requested", () => {
  const runtimePath = buildRuntimePath({
    platform: "linux",
    env: {
      HOME: "/home/test-user",
      PATH: "/usr/bin",
    },
    nvmBin: "/home/test-user/.nvm/versions/node/v22/bin",
  });

  assert.equal(
    runtimePath,
    [
      "/home/test-user/.local/bin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/home/test-user/.nvm/versions/node/v22/bin",
      "/usr/bin",
    ].join(":")
  );
});

test("buildCommandCandidates only returns Windows cmd paths plus bare command", () => {
  const candidates = buildCommandCandidates("codex", {
    platform: "win32",
    env: {
      USERPROFILE: "C:/Users/TestUser",
      APPDATA: "C:/Users/TestUser/AppData/Roaming",
      PATH: "C:/Windows/System32",
    },
    nvmBin: "C:/Users/TestUser/.nvm/bin",
  });

  assert.deepEqual(candidates, [
    "C:\\Users\\TestUser\\AppData\\Roaming\\npm\\codex.cmd",
    "C:\\Users\\TestUser\\.local\\bin\\codex.cmd",
    "C:\\Users\\TestUser\\.nvm\\bin\\codex.cmd",
    "codex",
  ]);
});

test("resolveCliCommand prefers a bare Windows command when it is on PATH", () => {
  const provider: AgentProvider = {
    id: "windows-provider",
    name: "Windows Provider",
    type: "cli",
    icon: "bot",
    command: "codex",
    commandCandidates: ["codex"],
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

  const resolved = resolveCliCommand(provider, {
    platform: "win32",
    env: {
      USERPROFILE: "C:\\Users\\TestUser",
      APPDATA: "C:\\Users\\TestUser\\AppData\\Roaming",
      PATH: "C:\\Windows\\System32",
    },
    commandLookup(command) {
      assert.equal(command, "codex");
      return "C:\\Users\\TestUser\\AppData\\Roaming\\npm\\codex.cmd";
    },
  });

  assert.equal(resolved, "codex");
});

test("resolveCliCommand skips unsafe non-path command candidates during lookup", () => {
  const provider: AgentProvider = {
    id: "unsafe-provider",
    name: "Unsafe Provider",
    type: "cli",
    icon: "bot",
    command: "safe-provider",
    commandCandidates: ["bad;command", "safe-provider"],
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

  const lookupCalls: string[] = [];
  const resolved = resolveCliCommand(provider, {
    platform: "linux",
    env: {
      HOME: "/tmp/test-user",
      PATH: "/usr/bin",
    },
    commandLookup(command) {
      lookupCalls.push(command);
      return command === "safe-provider" ? "/usr/bin/safe-provider" : null;
    },
  });

  assert.equal(resolved, "/usr/bin/safe-provider");
  assert.deepEqual(lookupCalls, ["safe-provider"]);
});
