import fs from "fs";
import { spawn } from "child_process";
import type { AgentProvider } from "./provider-interface";
import {
  ADAPTER_RUNTIME_PATH,
  resolveCommandFromCandidates,
  withAdapterRuntimeEnv,
} from "./adapters/utils";

export const RUNTIME_PATH = ADAPTER_RUNTIME_PATH;

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

    const proc = spawn(command, ["--version"], {
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

// Async replacement for execSync-based CLI probes. Keeps the event loop free
// so Promise.all over N providers actually runs in parallel.
export async function execCli(
  command: string,
  args: string[],
  options: { timeout?: number; captureStderr?: boolean } = {}
): Promise<string> {
  const timeoutMs = options.timeout ?? 5000;
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      env: withAdapterRuntimeEnv(process.env),
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
      proc.kill();
      settle(new Error(`${command} timed out`), "");
    }, timeoutMs);
  });
}
