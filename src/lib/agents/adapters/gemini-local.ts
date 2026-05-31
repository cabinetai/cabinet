import { geminiCliProvider } from "../providers/gemini-cli";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  consumeGeminiJsonStream,
  consumeGeminiStderr,
  filterGeminiStderr,
  createGeminiStderrAccumulator,
  createGeminiStreamAccumulator,
  flushGeminiJsonStream,
  flushGeminiStderr,
} from "./gemini-stream";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type { AgentExecutionAdapter } from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";
import { readStringConfig } from "./_shared/cli-args";

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

function buildGeminiArgs(config: Record<string, unknown>, prompt: string): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--yolo",
    "--sandbox",
    "false",
  ];

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("-m", model);
  }

  return args;
}

export const geminiLocalAdapter: AgentExecutionAdapter = {
  type: "gemini_local",
  name: "Gemini Local",
  description:
    "Structured Gemini CLI execution using stream-json output for live transcript updates and detached runs.",
  providerId: geminiCliProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: geminiCliProvider.models,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Gemini CLI",
          cliCommand: "gemini",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "gemini_local",
      await geminiCliProvider.healthCheck(),
      geminiCliProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(geminiCliProvider);
    const args = buildGeminiArgs(ctx.config, ctx.prompt);
    const stdoutAccumulator = createGeminiStreamAccumulator();
    const stderrAccumulator = createGeminiStderrAccumulator();

    await ctx.onMeta?.({
      adapterType: ctx.adapterType,
      command,
      commandArgs: args,
      cwd: ctx.cwd,
      env: {
        PATH: ADAPTER_RUNTIME_PATH,
      },
    });

    const result = await runChildProcess(command, args, {
      cwd: ctx.cwd,
      timeoutMs: ctx.timeoutMs,
      onSpawn: ctx.onSpawn,
      onStdout: (chunk) => {
        const display = consumeGeminiJsonStream(stdoutAccumulator, chunk);
        if (!display) return;
        void ctx.onLog("stdout", display);
      },
      onStderr: (chunk) => {
        const display = consumeGeminiStderr(stderrAccumulator, chunk);
        if (!display) return;
        void ctx.onLog("stderr", display);
      },
    });

    const trailingStdout = flushGeminiJsonStream(stdoutAccumulator);
    if (trailingStdout) {
      await ctx.onLog("stdout", trailingStdout);
    }

    const trailingStderr = flushGeminiStderr(stderrAccumulator);
    if (trailingStderr) {
      await ctx.onLog("stderr", trailingStderr);
    }

    const output = stdoutAccumulator.display.trim() || null;
    const filteredStderr = filterGeminiStderr(result.stderr);
    const summaryLine =
      firstNonEmptyLine(stdoutAccumulator.lastAssistantMessage || output || "")?.slice(0, 300) ||
      null;

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : filteredStderr || result.stdout.trim() || output || "Gemini local execution failed.",
      usage: stdoutAccumulator.usage,
      sessionId: stdoutAccumulator.sessionId,
      provider: geminiCliProvider.id,
      model:
        readStringConfig(ctx.config, "model") || stdoutAccumulator.model || null,
      billingType: "unknown",
      summary: summaryLine,
      output,
    };
  },
};
