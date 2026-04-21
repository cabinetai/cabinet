import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";
import type { AgentProvider } from "./provider-interface";
import {
  ADAPTER_RUNTIME_PATH,
  resolveCommandFromCandidates,
  withAdapterRuntimeEnv,
} from "./adapters/utils";
import { terminateChildProcess } from "./process-utils";

type ResolveCliCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandLookup?: (command: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform) => string | null;
};

export const RUNTIME_PATH = ADAPTER_RUNTIME_PATH;

export type CliInvocation = {
  command: string;
  args: string[];
};

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE || env.HOME || process.cwd();
}

function isExplicitPath(candidate: string): boolean {
  return candidate.includes("/") || candidate.includes("\\") || /^[A-Za-z]:/.test(candidate);
}

function isSafeCommandName(candidate: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(candidate);
}

function getPlatformPathTools(platform: NodeJS.Platform) {
  return {
    api: platform === "win32" ? path.win32 : path.posix,
    delimiter: platform === "win32" ? ";" : ":",
  };
}

export function buildRuntimePath(options?: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nvmBin?: string | null;
}): string {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const runtimeNvmBin = options?.nvmBin === undefined ? null : options.nvmBin;
  const { api: pathApi, delimiter } = getPlatformPathTools(platform);

  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? pathApi.join(env.APPDATA, "npm") : "",
      pathApi.join(homeDir, ".local", "bin"),
      ...(runtimeNvmBin ? [pathApi.normalize(runtimeNvmBin)] : []),
      env.PATH || "",
    ].filter(Boolean).join(delimiter);
  }

  return [
    `${env.HOME || ""}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    ...(runtimeNvmBin ? [pathApi.normalize(runtimeNvmBin)] : []),
    env.PATH || "",
  ].filter(Boolean).join(delimiter);
}

function quoteWindowsCmdArg(value: string): string {
  const escaped = value.replace(/"/g, '""').replace(/%/g, "%%");
  return /[\s"&()^|<>]/.test(value) ? `"${escaped}"` : escaped;
}

export function buildWindowsShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteWindowsCmdArg).join(" ");
}

export function buildPtyCliInvocation(
  command: string,
  args: string[],
  options?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
  }
): CliInvocation {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;

  if (platform !== "win32") {
    return { command, args };
  }

  return {
    command: env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsCmdArg).join(" ")],
  };
}

export function buildCommandCandidates(
  command: string,
  options?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    nvmBin?: string | null;
  }
): string[] {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const runtimeNvmBin = options?.nvmBin ?? null;
  const { api: pathApi } = getPlatformPathTools(platform);

  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? pathApi.join(env.APPDATA, "npm", `${command}.cmd`) : "",
      pathApi.join(homeDir, ".local", "bin", `${command}.cmd`),
      ...(runtimeNvmBin ? [pathApi.join(runtimeNvmBin, `${command}.cmd`)] : []),
      command,
    ].filter(Boolean);
  }

  return [
    `${env.HOME || ""}/.local/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/opt/homebrew/bin/${command}`,
    ...(runtimeNvmBin ? [pathApi.join(runtimeNvmBin, command)] : []),
    command,
  ].filter(Boolean);
}

function lookupCommandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string | null {
  if (!isSafeCommandName(command)) return null;
  try {
    if (platform === "win32") {
      const output = execFileSync("where.exe", [command], {
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return output.split(/\r?\n/).find(Boolean) || null;
    }

    const output = execFileSync("/bin/sh", ["-lc", `command -v ${command}`], {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function resolveCliCommand(provider: AgentProvider, options?: ResolveCliCommandOptions): string {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const commandLookup = options?.commandLookup || lookupCommandOnPath;

  const candidates = [
    ...(provider.commandCandidates || []),
    provider.command,
  ].filter((candidate): candidate is string => !!candidate);

  if (!options) {
    const resolved = resolveCommandFromCandidates(candidates, env);
    if (resolved) return resolved;
  }

  for (const candidate of candidates) {
    if (isExplicitPath(candidate) && fs.existsSync(candidate)) return candidate;
  }

  for (const candidate of candidates) {
    if (isExplicitPath(candidate)) continue;
    if (!isSafeCommandName(candidate)) continue;
    const found = commandLookup(candidate, { ...env, PATH: ADAPTER_RUNTIME_PATH }, platform);
    if (found) {
      // On Windows, return the bare candidate name so cmd.exe can resolve .cmd/.ps1 shims.
      // On Unix, return the full resolved path.
      return platform === "win32" ? candidate : found;
    }
  }

  if (!provider.command) {
    throw new Error(`Provider ${provider.id} does not define a command`);
  }

  return provider.command;
}

export async function checkCliProviderAvailable(provider: AgentProvider): Promise<boolean> {
  return new Promise((resolve) => {
    let command: string;
    try {
      command = resolveCliCommand(provider);
    } catch {
      resolve(false);
      return;
    }

    const proc =
      process.platform === "win32"
        ? spawn(buildWindowsShellCommand(command, ["--version"]), {
            env: withAdapterRuntimeEnv(process.env),
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn(command, ["--version"], {
            env: withAdapterRuntimeEnv(process.env),
            stdio: ["ignore", "pipe", "pipe"],
          });

    const settle = (value: boolean) => {
      clearTimeout(timeout);
      resolve(value);
    };

    proc.on("close", (code) => {
      settle(code === 0);
    });

    proc.on("error", () => {
      settle(false);
    });

    const timeout = setTimeout(() => {
      void terminateChildProcess(proc).finally(() => {
        settle(false);
      });
    }, 5000);
  });
}
