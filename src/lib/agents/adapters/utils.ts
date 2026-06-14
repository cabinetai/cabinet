import { execFile, execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getNvmNodeBin } from "../nvm-path";
import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";

const nvmBin = getNvmNodeBin();

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  return env.USERPROFILE || env.HOME || process.cwd();
}

function buildAdapterRuntimePath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (platform === "win32") {
    const homeDir = resolveHomeDir(env);
    return [
      env.APPDATA ? path.win32.join(env.APPDATA, "npm") : "",
      path.win32.join(homeDir, ".local", "bin"),
      ...(nvmBin ? [path.win32.normalize(nvmBin)] : []),
      env.PATH || "",
    ].filter(Boolean).join(";");
  }

  return [
    `${env.HOME || ""}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    ...(nvmBin ? [path.posix.normalize(nvmBin)] : []),
    env.PATH || "",
  ].filter(Boolean).join(":");
}

export function getAdapterRuntimePath(): string {
  return buildAdapterRuntimePath();
}

export const ADAPTER_RUNTIME_PATH = getAdapterRuntimePath();

export interface RunChildProcessOptions {
  cwd: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  gracePeriodMs?: number;
  onStdout?: (chunk: string) => void | Promise<void>;
  onStderr?: (chunk: string) => void | Promise<void>;
  onSpawn?: (meta: {
    pid: number;
    processGroupId: number | null;
    startedAt: string;
  }) => void | Promise<void>;
}

export interface RunChildProcessResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export function withAdapterRuntimeEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  // Merge `.cabinet.env` values at spawn time. mtime-cached, so this is
  // cheap on repeat calls and always reflects the latest disk contents
  // without IPC between Next.js and the daemon. Caller-supplied env still
  // wins over file values (so options.env / process.env shell-overrides
  // take precedence — consistent with dotenv conventions).
  const fileValues = readCabinetEnvFile().values;
  return {
    ...fileValues,
    ...env,
    PATH: getAdapterRuntimePath(),
  };
}

export function resolveCommandFromCandidates(
  candidates: string[],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.includes("/") || candidate.includes("\\") || /^[A-Za-z]:/.test(candidate)) {
      if (process.platform === "win32") {
        if (fs.existsSync(candidate)) return candidate;
        continue;
      }
      try {
        const resolved = execFileSync("/bin/sh", ["-c", "test -x \"$1\" && printf '%s' \"$1\"", "sh", candidate], {
          encoding: "utf8",
          env: withAdapterRuntimeEnv(env),
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        if (resolved) return resolved;
      } catch {
        // Ignore and keep trying.
      }
      continue;
    }

    try {
      const resolved =
        process.platform === "win32"
          ? execFileSync("where.exe", [candidate], {
              encoding: "utf8",
              env: withAdapterRuntimeEnv(env),
              stdio: ["ignore", "pipe", "ignore"],
            }).trim().split(/\r?\n/).find(Boolean) || ""
          : execFileSync("/bin/sh", ["-c", "command -v \"$1\"", "sh", candidate], {
              encoding: "utf8",
              env: withAdapterRuntimeEnv(env),
              stdio: ["ignore", "pipe", "ignore"],
            }).trim();
      if (resolved) return resolved;
    } catch {
      // Ignore and keep trying.
    }
  }

  return null;
}

function quoteWindowsCmdArg(value: string): string {
  const escaped = value.replace(/"/g, '""').replace(/%/g, "%%");
  return /[\s"&()^|<>]/.test(value) ? `"${escaped}"` : escaped;
}

function resolveProcessGroupId(pid: number | undefined): number | null {
  if (process.platform === "win32") return null;
  return typeof pid === "number" && pid > 0 ? pid : null;
}

export async function runChildProcess(
  command: string,
  args: string[],
  options: RunChildProcessOptions
): Promise<RunChildProcessResult> {
  const startedAt = new Date().toISOString();
  const env = withAdapterRuntimeEnv({
    ...process.env,
    ...(options.env || {}),
  });
  const child =
    process.platform === "win32"
      ? spawn(env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [command, ...args].map(quoteWindowsCmdArg).join(" ")], {
          cwd: options.cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        })
      : spawn(command, args, {
          cwd: options.cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });

  const processGroupId = resolveProcessGroupId(child.pid);
  if (typeof child.pid === "number" && child.pid > 0) {
    await options.onSpawn?.({
      pid: child.pid,
      processGroupId,
      startedAt,
    });
  }

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let settled = false;
  let killTimer: NodeJS.Timeout | null = null;

  const clearTimers = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (killTimer) clearTimeout(killTimer);
  };

  const signalChild = (signal: NodeJS.Signals) => {
    if (process.platform === "win32" && typeof child.pid === "number" && child.pid > 0) {
      execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], () => {
        if (!child.killed) child.kill(signal);
      });
      return;
    }
    if (process.platform !== "win32" && processGroupId && processGroupId > 0) {
      try {
        process.kill(-processGroupId, signal);
        return;
      } catch {
        // Fall back to the direct child signal below.
      }
    }
    if (!child.killed) {
      child.kill(signal);
    }
  };

  child.stdout.on("data", (buffer: Buffer) => {
    const chunk = buffer.toString();
    stdout += chunk;
    void options.onStdout?.(chunk);
  });

  child.stderr.on("data", (buffer: Buffer) => {
    const chunk = buffer.toString();
    stderr += chunk;
    void options.onStderr?.(chunk);
  });

  child.stdin.on("error", () => {
    // Ignore EPIPE and similar shutdown races.
  });

  const timeoutHandle = options.timeoutMs
    ? setTimeout(() => {
        if (settled) return;
        timedOut = true;
        signalChild("SIGTERM");
        killTimer = setTimeout(() => {
          signalChild("SIGKILL");
        }, options.gracePeriodMs ?? 5_000);
      }, options.timeoutMs)
    : null;

  if (typeof options.stdin === "string") {
    child.stdin.write(options.stdin);
  }
  child.stdin.end();

  return await new Promise<RunChildProcessResult>((resolve, reject) => {
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr,
      });
    });
  });
}

