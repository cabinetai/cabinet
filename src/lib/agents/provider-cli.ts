import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";
import type { AgentProvider } from "./provider-interface";
import {
  ADAPTER_RUNTIME_PATH,
  resolveCommandFromCandidates,
  withAdapterRuntimeEnv,
} from "./adapters/utils";

export const RUNTIME_PATH = ADAPTER_RUNTIME_PATH;

export type CliInvocation = {
  command: string;
  args: string[];
};

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE || env.HOME || process.cwd();
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

  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? path.join(env.APPDATA, "npm", `${command}.cmd`) : "",
      env.APPDATA ? path.join(env.APPDATA, "npm", `${command}.ps1`) : "",
      env.APPDATA ? path.join(env.APPDATA, "npm", command) : "",
      path.join(homeDir, ".local", "bin", `${command}.cmd`),
      path.join(homeDir, ".local", "bin", command),
      ...(runtimeNvmBin ? [path.join(runtimeNvmBin, `${command}.cmd`), path.join(runtimeNvmBin, command)] : []),
      command,
    ].filter(Boolean);
  }

  return [
    `${env.HOME || ""}/.local/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/opt/homebrew/bin/${command}`,
    ...(runtimeNvmBin ? [path.join(runtimeNvmBin, command)] : []),
    command,
  ].filter(Boolean);
}

function lookupCommandOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform
): string | null {
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

export function resolveCliCommand(provider: AgentProvider): string {
  const candidates = [
    ...(provider.commandCandidates || []),
    provider.command,
  ].filter((candidate): candidate is string => !!candidate);

  const resolved = resolveCommandFromCandidates(candidates, process.env);
  if (resolved) return resolved;

  for (const candidate of candidates) {
    if (candidate.includes("/") && fs.existsSync(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    const runtimePath = ADAPTER_RUNTIME_PATH;
    for (const candidate of candidates) {
      if (candidate.includes("/") || candidate.includes("\\") || /^[A-Za-z]:/.test(candidate)) continue;
      const found = lookupCommandOnPath(candidate, { ...process.env, PATH: runtimePath }, "win32");
      if (found) return found;
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
      proc.kill();
      settle(false);
    }, 5000);
  });
}
