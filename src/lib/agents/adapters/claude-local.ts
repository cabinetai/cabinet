import { claudeCodeProvider } from "../providers/claude-code";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  createClaudeStreamAccumulator,
  consumeClaudeStreamJson,
  flushClaudeStreamJson,
} from "./claude-stream";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type { AdapterSessionCodec, AgentExecutionAdapter } from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";
import { readStringConfig, readEffortConfig } from "./_shared/cli-args";

const claudeSessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const resumeId =
      typeof record.resumeId === "string" && record.resumeId.trim()
        ? record.resumeId.trim()
        : null;
    if (!resumeId) return null;
    return { resumeId };
  },
  serialize(params) {
    if (!params || typeof params.resumeId !== "string" || !params.resumeId.trim()) {
      return null;
    }
    return { resumeId: params.resumeId };
  },
  getDisplayId(params) {
    const id = params?.resumeId;
    return typeof id === "string" ? `Claude · ${id.slice(0, 8)}` : null;
  },
};

function buildClaudeArgs(
  config: Record<string, unknown>,
  resumeSessionId?: string | null
): string[] {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }
  // No --no-session-persistence: we want Claude to create a session on
  // fresh runs too, so we can capture its id (emitted on the stream) and
  // resume later. The persisted session is cheap and auto-expires.

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const effort = readEffortConfig(config);
  if (effort) {
    args.push("--effort", effort);
  }

  const systemPrompt = readStringConfig(config, "systemPrompt");
  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }

  const appendSystemPrompt = readStringConfig(config, "appendSystemPrompt");
  if (appendSystemPrompt) {
    args.push("--append-system-prompt", appendSystemPrompt);
  }

  // Skills injection — the runner materializes the agent's selected skills
  // into a managed plugin-shaped tmpdir (manifest + skills/<key>/ symlinks)
  // and sticks the path here. Claude registers the skills via --plugin-dir
  // so they're discoverable as /<skill-name> and auto-invoked when the
  // model decides one matches. (Plain --add-dir only grants file-read
  // access — it doesn't make skills available as commands.) We also pass
  // --add-dir for read access to bundle assets that live alongside SKILL.md.
  // Absent when the persona has no `skills:` field or the catalog is empty;
  // harmless to omit.
  const skillsDir = readStringConfig(config, "skillsDir");
  if (skillsDir) {
    args.push("--plugin-dir", skillsDir);
    args.push("--add-dir", skillsDir);
  }

  return args;
}

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

export const claudeLocalAdapter: AgentExecutionAdapter = {
  type: "claude_local",
  name: "Claude Local",
  description:
    "Structured Claude Code execution using print mode and streaming JSON. Intended to replace the PTY prompt-injection path for detached Cabinet runs.",
  providerId: claudeCodeProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: true,
  models: claudeCodeProvider.models,
  effortLevels: claudeCodeProvider.effortLevels,
  sessionCodec: claudeSessionCodec,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Claude Code",
          cliCommand: "claude",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "claude_local",
      await claudeCodeProvider.healthCheck(),
      claudeCodeProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(claudeCodeProvider);
    const args = buildClaudeArgs(ctx.config, ctx.sessionId ?? null);
    const accumulator = createClaudeStreamAccumulator();

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
      stdin: ctx.prompt,
      timeoutMs: ctx.timeoutMs,
      onSpawn: ctx.onSpawn,
      onStdout: (chunk) => {
        const display = consumeClaudeStreamJson(accumulator, chunk);
        if (!display) return;
        void ctx.onLog("stdout", display);
      },
      onStderr: (chunk) => {
        if (!chunk) return;
        void ctx.onLog("stderr", chunk);
      },
    });

    const trailingDisplay = flushClaudeStreamJson(accumulator);
    if (trailingDisplay) {
      await ctx.onLog("stdout", trailingDisplay);
    }

    const output = accumulator.streamedText || accumulator.finalText || null;
    const summaryLine = output ? firstNonEmptyLine(output)?.slice(0, 300) || null : null;

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : result.stderr.trim() || output || "Claude local execution failed.",
      usage: accumulator.usage,
      sessionId: accumulator.sessionId,
      sessionParams: accumulator.sessionId
        ? { resumeId: accumulator.sessionId }
        : null,
      sessionDisplayId: accumulator.sessionId
        ? `Claude · ${accumulator.sessionId.slice(0, 8)}`
        : null,
      provider: claudeCodeProvider.id,
      model: accumulator.model,
      billingType: accumulator.billingType || "subscription",
      summary: summaryLine,
      output,
    };
  },
};
