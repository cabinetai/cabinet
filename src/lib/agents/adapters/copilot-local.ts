import { copilotCliProvider } from "../providers/copilot-cli";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type { AgentExecutionAdapter } from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";
import { readStringConfig } from "./_shared/cli-args";

function readStringArrayConfig(
  config: Record<string, unknown>,
  key: string
): string[] {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

function buildCopilotArgs(config: Record<string, unknown>, prompt: string): string[] {
  const args = ["-p", prompt, "--allow-all-tools"];

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const extra = readStringArrayConfig(config, "extraArgs");
  if (extra.length > 0) {
    args.push(...extra);
  }

  return args;
}

export const copilotLocalAdapter: AgentExecutionAdapter = {
  type: "copilot_local",
  name: "Copilot Local",
  description:
    "GitHub Copilot CLI execution via one-shot `-p` prompt mode with `--allow-all-tools` so headless runs don't stall on approval prompts.",
  providerId: copilotCliProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: copilotCliProvider.models,
  effortLevels: copilotCliProvider.effortLevels,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Copilot CLI",
          cliCommand: "copilot",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "copilot_local",
      await copilotCliProvider.healthCheck(),
      copilotCliProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(copilotCliProvider);
    const args = buildCopilotArgs(ctx.config, ctx.prompt);

    await ctx.onMeta?.({
      adapterType: ctx.adapterType,
      command,
      commandArgs: args,
      cwd: ctx.cwd,
      env: { PATH: ADAPTER_RUNTIME_PATH },
    });

    let forwardedStdout = "";
    const result = await runChildProcess(command, args, {
      cwd: ctx.cwd,
      timeoutMs: ctx.timeoutMs,
      onSpawn: ctx.onSpawn,
      onStdout: (chunk) => {
        if (!chunk) return;
        forwardedStdout += chunk;
        void ctx.onLog("stdout", chunk);
      },
      onStderr: (chunk) => {
        if (!chunk) return;
        void ctx.onLog("stderr", chunk);
      },
    });

    const output = forwardedStdout.trim() || null;
    const summaryLine = firstNonEmptyLine(output || "")?.slice(0, 300) || null;
    const model = readStringConfig(ctx.config, "model") || null;

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : result.stderr.trim() || output || "Copilot execution failed.",
      sessionId: null,
      provider: copilotCliProvider.id,
      model,
      billingType: "subscription",
      summary: summaryLine,
      output,
    };
  },
};
