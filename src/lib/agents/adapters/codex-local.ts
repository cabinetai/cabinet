import { codexCliProvider } from "../providers/codex-cli";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  consumeCodexJsonStream,
  consumeCodexStderr,
  createCodexStderrAccumulator,
  createCodexStreamAccumulator,
  flushCodexJsonStream,
  flushCodexStderr,
} from "./codex-stream";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import { readStringConfig, readEffortConfig } from "./_shared/cli-args";
import type { AdapterSessionCodec, AgentExecutionAdapter } from "./types";
import type { ConversationErrorClassification } from "@/types/conversations";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";

/**
 * Match codex's backend-rejection events for "this model isn't available on
 * your plan / account". Codex emits these on stdout as `{"type":"error",...}`
 * events carrying the raw OpenAI 400 envelope; the codex-stream accumulator
 * unwraps the inner `.error.message` into `result.errorMessage`, which the
 * runner then threads into this classifier as the `stderr` argument when
 * stderr is empty (see `conversation-runner.ts:946`).
 *
 * Returns `null` when the text doesn't look like a plan/account gate so the
 * chain falls through to the unknown fallback.
 */
function classifyCodexModelUnavailable(
  stderr: string,
  _exitCode: number | null
): ConversationErrorClassification | null {
  const text = (stderr || "").toLowerCase();
  if (!text.trim()) return null;

  // Plan-gated: "The 'gpt-5.2-codex' model is not supported when using
  // Codex with a ChatGPT account."
  // API-key gated: "does not have access to model …" / "model_not_found".
  const looksPlanGated =
    /not supported when using codex with a chatgpt account/.test(text) ||
    /does not have access to model/.test(text) ||
    /\bmodel_not_found\b/.test(text) ||
    /model .* (?:not available|unavailable) on your/.test(text);
  if (!looksPlanGated) return null;

  return {
    kind: "model_unavailable",
    hint:
      "The selected Codex model isn't available on this account's plan. " +
      "Pick a different model in the composer, or authenticate Codex with " +
      "an API key that has access to the model you need.",
  };
}

const codexSessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const threadId =
      typeof record.threadId === "string" && record.threadId.trim()
        ? record.threadId.trim()
        : null;
    if (!threadId) return null;
    return { threadId };
  },
  serialize(params) {
    if (!params || typeof params.threadId !== "string" || !params.threadId.trim()) {
      return null;
    }
    return { threadId: params.threadId };
  },
  getDisplayId(params) {
    const id = params?.threadId;
    return typeof id === "string" ? `Codex · ${id.slice(0, 8)}` : null;
  },
};

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

function buildCodexArgs(config: Record<string, unknown>): string[] {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
  ];

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const profile = readStringConfig(config, "profile");
  if (profile) {
    args.push("--profile", profile);
  }

  const effort = readEffortConfig(config);
  if (effort) {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  return args;
}

function filterCodexStderr(stderr: string): string {
  const accumulator = createCodexStderrAccumulator();
  const display = consumeCodexStderr(accumulator, stderr);
  const trailing = flushCodexStderr(accumulator);
  return `${display}${trailing}`.trim();
}

export const codexLocalAdapter: AgentExecutionAdapter = {
  type: "codex_local",
  name: "Codex Local",
  description:
    "Structured Codex CLI execution using JSON event streaming. Intended to replace the legacy detached launch path while keeping it available as an escape hatch.",
  providerId: codexCliProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: false,
  models: codexCliProvider.models,
  sessionCodec: codexSessionCodec,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      // Codex-specific: plan-gated model rejections arrive via stdout
      // `{"type":"error",...}` events that codex-stream unwraps into
      // `result.errorMessage`. The runner threads that message into the
      // stderr slot when stderr itself is empty, so this matcher can run
      // first and short-circuit before the generic classifier.
      classifyCodexModelUnavailable,
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Codex CLI",
          cliCommand: "codex",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "codex_local",
      await codexCliProvider.healthCheck(),
      codexCliProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(codexCliProvider);
    const args = buildCodexArgs(ctx.config);
    const stdoutAccumulator = createCodexStreamAccumulator();
    const stderrAccumulator = createCodexStderrAccumulator();

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
        const display = consumeCodexJsonStream(stdoutAccumulator, chunk);
        if (!display) return;
        void ctx.onLog("stdout", display);
      },
      onStderr: (chunk) => {
        const display = consumeCodexStderr(stderrAccumulator, chunk);
        if (!display) return;
        void ctx.onLog("stderr", display);
      },
    });

    const trailingStdout = flushCodexJsonStream(stdoutAccumulator);
    if (trailingStdout) {
      await ctx.onLog("stdout", trailingStdout);
    }

    const trailingStderr = flushCodexStderr(stderrAccumulator);
    if (trailingStderr) {
      await ctx.onLog("stderr", trailingStderr);
    }

    const filteredStderr = filterCodexStderr(result.stderr);
    const output = stdoutAccumulator.display.trim() || null;
    const summaryLine =
      firstNonEmptyLine(stdoutAccumulator.lastAgentMessage || output || "")?.slice(0, 300) || null;
    const streamError = stdoutAccumulator.errorMessage?.trim() || null;
    const synthesizedExitCode =
      streamError && (result.exitCode ?? 0) === 0 && !result.timedOut
        ? 1
        : result.exitCode;

    return {
      exitCode: synthesizedExitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        (synthesizedExitCode ?? 0) === 0
          ? null
          : streamError
            || filteredStderr
            || result.stderr.trim()
            || output
            || "Codex local execution failed.",
      usage: stdoutAccumulator.usage,
      sessionId: stdoutAccumulator.threadId,
      sessionParams: stdoutAccumulator.threadId
        ? { threadId: stdoutAccumulator.threadId }
        : null,
      sessionDisplayId: stdoutAccumulator.threadId
        ? `Codex · ${stdoutAccumulator.threadId.slice(0, 8)}`
        : null,
      provider: codexCliProvider.id,
      model: readStringConfig(ctx.config, "model") || null,
      billingType: "unknown",
      summary: summaryLine,
      output,
    };
  },
};
