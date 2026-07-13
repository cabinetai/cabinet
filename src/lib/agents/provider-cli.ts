import fs from "fs";
import path from "path";
import { execFileSync, spawn } from "child_process";
import type { AgentProvider } from "./provider-interface";
import { withAdapterRuntimeEnv } from "./adapters/utils";
import { getNvmNodeBin } from "./nvm-path";
import { terminateChildProcess } from "./process-utils";

const nvmBin = getNvmNodeBin();

type ResolveCliCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandLookup?: (
    command: string,
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform
  ) => string | null;
};

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

function candidateExistsAndIsRunnable(candidate: string, platform: NodeJS.Platform): boolean {
  if (platform === "win32") {
    return fs.existsSync(candidate);
  }

  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getPlatformPathTools(platform: NodeJS.Platform) {
  return {
    api: platform === "win32" ? path.win32 : path.posix,
    delimiter: platform === "win32" ? ";" : ":",
  };
}

/**
 * Well-known global-bin directories for package managers whose installers
 * write CLIs outside `/usr/local/bin` and outside `$PATH` when a shell profile
 * hasn't sourced them (Electron ships with an environment closer to launchd's
 * than a login shell's).
 *
 * `PNPM_HOME` is set by `pnpm setup` and is authoritative when present. Fall
 * back to platform defaults so a pnpm install that predates `setup` still
 * gets detected. Bun's `~/.bun/bin` follows the same pattern for symmetry so
 * a bun-installed CLI (#39-flavoured issue) is visible too.
 */
function packageManagerBinDirs(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  pathApi: typeof path.posix | typeof path.win32,
): string[] {
  const homeDir = resolveHomeDir(env);
  const dirs: string[] = [];

  const pnpmHome = env.PNPM_HOME?.trim();
  if (pnpmHome) dirs.push(pathApi.normalize(pnpmHome));

  if (platform === "win32") {
    if (env.LOCALAPPDATA) dirs.push(pathApi.join(env.LOCALAPPDATA, "pnpm"));
    dirs.push(pathApi.join(homeDir, ".bun", "bin"));
  } else if (platform === "darwin") {
    dirs.push(pathApi.join(homeDir, "Library", "pnpm"));
    dirs.push(pathApi.join(homeDir, ".local", "share", "pnpm")); // linux-style fallback
    dirs.push(pathApi.join(homeDir, ".bun", "bin"));
  } else {
    dirs.push(pathApi.join(homeDir, ".local", "share", "pnpm"));
    dirs.push(pathApi.join(homeDir, ".bun", "bin"));
  }

  // Dedupe so `PNPM_HOME` pointing at the platform default doesn't repeat.
  return Array.from(new Set(dirs.filter(Boolean)));
}

export function buildRuntimePath(options?: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  nvmBin?: string | null;
}): string {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const runtimeNvmBin = options?.nvmBin === undefined ? nvmBin : options.nvmBin;
  const { api: pathApi, delimiter } = getPlatformPathTools(platform);
  const pmDirs = packageManagerBinDirs(platform, env, pathApi);

  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? pathApi.join(env.APPDATA, "npm") : "",
      pathApi.join(homeDir, ".local", "bin"),
      ...pmDirs,
      ...(runtimeNvmBin ? [pathApi.normalize(runtimeNvmBin)] : []),
      env.PATH || "",
    ].filter(Boolean).join(delimiter);
  }

  return [
    `${env.HOME || ""}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    ...pmDirs,
    ...(runtimeNvmBin ? [pathApi.normalize(runtimeNvmBin)] : []),
    env.PATH || "",
  ].filter(Boolean).join(delimiter);
}

export function getRuntimePath(): string {
  return buildRuntimePath();
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
  const suffix = platform === "win32" ? ".cmd" : "";
  const pmDirs = packageManagerBinDirs(platform, env, pathApi);

  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? pathApi.join(env.APPDATA, "npm", `${command}${suffix}`) : "",
      pathApi.join(homeDir, ".local", "bin", `${command}${suffix}`),
      ...pmDirs.map((dir) => pathApi.join(dir, `${command}${suffix}`)),
      ...(runtimeNvmBin ? [pathApi.join(runtimeNvmBin, `${command}${suffix}`)] : []),
      command,
    ].filter(Boolean);
  }

  return [
    `${env.HOME || ""}/.local/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/opt/homebrew/bin/${command}`,
    ...pmDirs.map((dir) => pathApi.join(dir, command)),
    ...(runtimeNvmBin ? [pathApi.join(runtimeNvmBin, command)] : []),
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

export function resolveCliCommand(provider: AgentProvider, options?: ResolveCliCommandOptions): string {
  const platform = options?.platform || process.platform;
  const env = options?.env || process.env;
  const runtimePath = buildRuntimePath({ platform, env });
  const commandLookup = options?.commandLookup || lookupCommandOnPath;
  const candidates = [
    ...(provider.commandCandidates || []),
    provider.command,
  ].filter((candidate): candidate is string => !!candidate);

  if (platform === "win32") {
    for (const candidate of candidates) {
      if (isExplicitPath(candidate)) continue;
      if (!isSafeCommandName(candidate)) continue;
      const resolved = commandLookup(candidate, { ...env, PATH: runtimePath }, platform);
      if (resolved) {
        return candidate;
      }
    }
  }

  for (const candidate of candidates) {
    if (isExplicitPath(candidate) && candidateExistsAndIsRunnable(candidate, platform)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    if (isExplicitPath(candidate)) continue;
    if (!isSafeCommandName(candidate)) continue;
    const resolved = commandLookup(candidate, { ...env, PATH: runtimePath }, platform);
    if (resolved) return resolved;
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

    const env = withAdapterRuntimeEnv({ ...process.env, PATH: getRuntimePath() });
    const proc =
      process.platform === "win32"
        ? spawn(buildWindowsShellCommand(command, ["--version"]), {
            env,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn(command, ["--version"], {
            env,
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

// Async replacement for execSync-based CLI probes. Keeps the event loop free
// so Promise.all over N providers actually runs in parallel.
export async function execCli(
  command: string,
  args: string[],
  options: { timeout?: number; captureStderr?: boolean } = {}
): Promise<string> {
  const timeoutMs = options.timeout ?? 5000;
  return new Promise((resolve, reject) => {
    const env = withAdapterRuntimeEnv({ ...process.env, PATH: getRuntimePath() });
    const proc =
      process.platform === "win32"
        ? spawn(buildWindowsShellCommand(command, args), {
            env,
            shell: true,
            stdio: ["ignore", "pipe", options.captureStderr ? "pipe" : "ignore"],
          })
        : spawn(command, args, {
            env,
            stdio: ["ignore", "pipe", options.captureStderr ? "pipe" : "ignore"],
          });

    let stdout = "";
    let stderr = "";
    let settled = false;

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    if (options.captureStderr) {
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
    }

    const settle = (err: Error | null, output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(output);
    };

    proc.on("close", (code) => {
      if (code === 0) {
        const combined = options.captureStderr ? `${stdout}${stderr}` : stdout;
        settle(null, combined.trim());
      } else {
        settle(new Error(`${command} exited with code ${code}`), "");
      }
    });

    proc.on("error", (err) => settle(err, ""));

    const timer = setTimeout(() => {
      void terminateChildProcess(proc).finally(() => {
        settle(new Error(`${command} timed out`), "");
      });
    }, timeoutMs);
  });
}
