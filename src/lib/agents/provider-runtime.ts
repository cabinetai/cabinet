import { spawn } from "child_process";
import type { AgentProvider, CliProviderInvocation } from "./provider-interface";
import { providerRegistry } from "./provider-registry";
import { buildWindowsShellCommand, resolveCliCommand, RUNTIME_PATH } from "./provider-cli";
import {
  resolveDetachedPromptLaunchMode,
  type DetachedLaunchMode,
} from "./detached-launch-mode";
import {
  getConfiguredDefaultProviderId,
  readProviderSettingsSync,
  resolveEnabledProviderId,
} from "./provider-settings";
import { terminateChildProcess } from "./process-utils";

export interface ProviderLaunchSpec extends CliProviderInvocation {
  providerId: string;
  providerName: string;
  installMessage?: string;
}

function resolveProviderOrThrow(providerId?: string): AgentProvider {
  const settings = readProviderSettingsSync();
  const resolvedProviderId = resolveEnabledProviderId(providerId, settings);
  const resolvedProvider = providerRegistry.get(resolvedProviderId);
  if (resolvedProvider) {
    return resolvedProvider;
  }

  throw new Error(
    providerId
      ? `No enabled provider is available for requested provider: ${providerId}`
      : "No enabled provider is configured"
  );
}

function buildLaunchSpec(
  providerId: string | undefined,
  prompt: string | undefined,
  workdir: string,
  mode: "one-shot" | "session"
): ProviderLaunchSpec {
  const provider = resolveProviderOrThrow(providerId);

  if (provider.type !== "cli") {
    throw new Error(`Provider ${provider.id} is not a CLI provider`);
  }

  let invocation: CliProviderInvocation | undefined;

  if (mode === "one-shot" && provider.buildOneShotInvocation && prompt) {
    invocation = provider.buildOneShotInvocation(prompt, workdir);
  }

  if (mode === "session" && provider.buildSessionInvocation) {
    invocation = provider.buildSessionInvocation(prompt, workdir);
  }

  if (!invocation && prompt && provider.buildArgs && provider.command) {
    invocation = {
      command: provider.command,
      args: provider.buildArgs(prompt, workdir),
    };
  }

  if (!invocation && provider.command) {
    invocation = {
      command: provider.command,
      args: [],
    };
  }

  if (!invocation) {
    throw new Error(`Provider ${provider.id} does not define a ${mode} launch contract`);
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    installMessage: provider.installMessage,
    command: resolveCliCommand(provider),
    args: invocation.args,
    initialPrompt: invocation.initialPrompt,
    readyStrategy: invocation.readyStrategy,
  };
}

export function getDefaultProviderId(): string {
  return getConfiguredDefaultProviderId();
}

export function resolveProviderId(providerId?: string): string {
  return resolveProviderOrThrow(providerId).id;
}

export function getDetachedPromptLaunchMode(input: {
  providerId?: string;
  prompt?: string;
}): DetachedLaunchMode {
  const provider = resolveProviderOrThrow(input.providerId);
  return resolveDetachedPromptLaunchMode(provider, input.prompt);
}

export function getSessionLaunchSpec(input: {
  providerId?: string;
  prompt?: string;
  workdir: string;
}): ProviderLaunchSpec {
  return buildLaunchSpec(input.providerId, input.prompt, input.workdir, "session");
}

export function getOneShotLaunchSpec(input: {
  providerId?: string;
  prompt: string;
  workdir: string;
}): ProviderLaunchSpec {
  return buildLaunchSpec(input.providerId, input.prompt, input.workdir, "one-shot");
}

export async function runOneShotProviderPrompt(input: {
  providerId?: string;
  prompt: string;
  cwd: string;
  timeoutMs?: number;
}): Promise<string> {
  const provider = resolveProviderOrThrow(input.providerId);

  if (provider.type === "api" && provider.runPrompt) {
    return provider.runPrompt(input.prompt, "");
  }

  const launch = getOneShotLaunchSpec({
    providerId: input.providerId,
    prompt: input.prompt,
    workdir: input.cwd,
  });

  return new Promise<string>((resolve, reject) => {
    const env = {
      ...process.env,
      PATH: RUNTIME_PATH,
    };
    const proc =
      process.platform === "win32"
        ? spawn(buildWindowsShellCommand(launch.command, launch.args), {
            cwd: input.cwd,
            env,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn(launch.command, launch.args, {
            cwd: input.cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
          });
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      void terminateChildProcess(proc).finally(() => {
        reject(new Error("Timed out after waiting for provider output"));
      });
    }, input.timeoutMs || 120_000);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Exited with code ${code}`));
      }
    });

    proc.on("error", (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(
        new Error(
          launch.installMessage
            ? `${launch.installMessage} (${error.message})`
            : `Failed to spawn ${launch.command}: ${error.message}`
        )
      );
    });
  });
}
