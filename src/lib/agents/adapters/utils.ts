import fs from "fs";
import { execFileSync, spawn } from "child_process";
import { getNvmNodeBin } from "../nvm-path";

const nvmBin = process.platform !== "win32" ? getNvmNodeBin() : null;

function buildAdapterRuntimePath(): string {
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    return [
      process.env.APPDATA ? `${process.env.APPDATA}\\npm` : "",
      `${home}\\AppData\\Local\\Microsoft\\WinGet\\Links`,
      process.env.PATH || "",
    ].filter(Boolean).join(";");
  }

  return [
    `${process.env.HOME || ""}/.local/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    ...(nvmBin ? [nvmBin] : []),
    process.env.PATH || "",
  ].filter(Boolean).join(":");
}

export const ADAPTER_RUNTIME_PATH = buildAdapterRuntimePath();

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
  return {
    ...env,
    PATH: ADAPTER_RUNTIME_PATH,
  };
}

const SAFE_COMMAND_NAME_RE = /^[\w.+/-]+$/;

export function resolveCommandFromCandidates(
  candidates: string[],
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const resolvedEnv = withAdapterRuntimeEnv(env);

  for (const candidate of candidates) {
    if (!candidate) continue;

    const isAbsolute = candidate.includes("/") || candidate.includes("\\") || /^[A-Za-z]:/.test(candidate);

    if (isAbsolute) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // not executable — keep trying
      }
      continue;
    }

    if (!SAFE_COMMAND_NAME_RE.test(candidate)) continue;

    if (process.platform === "win32") {
      try {
        const output = execFileSync("where.exe", [candidate], {
          encoding: "utf8",
          env: resolvedEnv,
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const first = output.split(/\r?\n/).find(Boolean);
        if (first) return first;
      } catch {
        // keep trying
      }
      continue;
    }

    try {
      const output = execFileSync("/bin/sh", ["-c", "command -v \"$C\""], {
        encoding: "utf8",
        env: { ...resolvedEnv, C: candidate },
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (output) return output;
    } catch {
      // keep trying
    }
  }

  return null;
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
  const isWindows = process.platform === "win32";
  const useShell = isWindows && !command.includes("/") && !command.includes("\\");

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: withAdapterRuntimeEnv({
      ...process.env,
      ...(options.env || {}),
    }),
    stdio: ["pipe", "pipe", "pipe"],
    ...(isWindows ? { windowsHide: true, detached: false } : {}),
    ...(useShell ? { shell: true } : {}),
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
    if (!isWindows && processGroupId && processGroupId > 0) {
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
