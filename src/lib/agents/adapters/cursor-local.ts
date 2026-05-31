import { cursorCliProvider } from "../providers/cursor-cli";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  consumeCursorJsonStream,
  createCursorStreamAccumulator,
  flushCursorJsonStream,
  isCursorUnknownSessionError,
} from "./cursor-stream";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import type {
  AdapterExecutionContext,
  AdapterSessionCodec,
  AgentExecutionAdapter,
} from "./types";
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

function buildCursorArgs(
  config: Record<string, unknown>,
  cwd: string,
  resumeSessionId: string | null
): string[] {
  const args = ["-p", "--output-format", "stream-json", "--workspace", cwd, "--yolo"];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const mode = readStringConfig(config, "mode");
  if (mode === "plan" || mode === "ask") {
    args.push("--mode", mode);
  }

  return args;
}

const cursorSessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const sessionId =
      typeof record.sessionId === "string" && record.sessionId.trim()
        ? record.sessionId.trim()
        : null;
    if (!sessionId) return null;
    return {
      sessionId,
      ...(typeof record.cwd === "string" && record.cwd.trim()
        ? { cwd: record.cwd.trim() }
        : {}),
    };
  },
  serialize(params) {
    if (!params || typeof params.sessionId !== "string" || !params.sessionId.trim()) {
      return null;
    }
    return {
      sessionId: params.sessionId,
      ...(typeof params.cwd === "string" && params.cwd.trim() ? { cwd: params.cwd } : {}),
    };
  },
  getDisplayId(params) {
    return typeof params.sessionId === "string" ? params.sessionId : null;
  },
};

async function runCursorOnce(
  ctx: AdapterExecutionContext,
  command: string,
  args: string[]
) {
  const accumulator = createCursorStreamAccumulator();

  await ctx.onMeta?.({
    adapterType: ctx.adapterType,
    command,
    commandArgs: args,
    cwd: ctx.cwd,
    env: { PATH: ADAPTER_RUNTIME_PATH },
  });

  const result = await runChildProcess(command, args, {
    cwd: ctx.cwd,
    stdin: ctx.prompt,
    timeoutMs: ctx.timeoutMs,
    onSpawn: ctx.onSpawn,
    onStdout: (chunk) => {
      const display = consumeCursorJsonStream(accumulator, chunk);
      if (!display) return;
      void ctx.onLog("stdout", display);
    },
    onStderr: (chunk) => {
      if (!chunk) return;
      void ctx.onLog("stderr", chunk);
    },
  });

  const trailing = flushCursorJsonStream(accumulator);
  if (trailing) {
    await ctx.onLog("stdout", trailing);
  }

  return { result, accumulator };
}

export const cursorLocalAdapter: AgentExecutionAdapter = {
  type: "cursor_local",
  name: "Cursor Local",
  description:
    "Structured Cursor Agent CLI execution using stream-json output for live transcript updates. Supports chat resume via --resume.",
  providerId: cursorCliProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: true,
  models: cursorCliProvider.models,
  effortLevels: cursorCliProvider.effortLevels,
  sessionCodec: cursorSessionCodec,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Cursor CLI",
          cliCommand: "cursor-agent",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "cursor_local",
      await cursorCliProvider.healthCheck(),
      cursorCliProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(cursorCliProvider);

    const storedSessionId =
      ctx.sessionParams && typeof ctx.sessionParams === "object"
        ? typeof (ctx.sessionParams as Record<string, unknown>).sessionId === "string"
          ? ((ctx.sessionParams as Record<string, unknown>).sessionId as string)
          : null
        : null;
    const resumeId = storedSessionId || ctx.sessionId || null;

    const firstArgs = buildCursorArgs(ctx.config, ctx.cwd, resumeId);
    const first = await runCursorOnce(ctx, command, firstArgs);

    let { result, accumulator } = first;
    let clearSession = false;

    if (
      resumeId &&
      !result.timedOut &&
      (result.exitCode ?? 0) !== 0 &&
      isCursorUnknownSessionError(result.stdout, result.stderr)
    ) {
      await ctx.onLog(
        "stdout",
        `[cabinet] Cursor resume session "${resumeId}" is unavailable; retrying with a fresh session.\n`
      );
      const retryArgs = buildCursorArgs(ctx.config, ctx.cwd, null);
      const retry = await runCursorOnce(ctx, command, retryArgs);
      result = retry.result;
      accumulator = retry.accumulator;
      clearSession = true;
    }

    const output = accumulator.display.trim() || null;
    const summaryLine =
      firstNonEmptyLine(accumulator.lastAssistantMessage || output || "")?.slice(0, 300) ||
      null;

    const sessionParams = accumulator.sessionId
      ? { sessionId: accumulator.sessionId, cwd: ctx.cwd }
      : null;

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : accumulator.errorMessage ||
            result.stderr.trim() ||
            output ||
            "Cursor Agent execution failed.",
      usage: accumulator.usage,
      sessionId: accumulator.sessionId,
      sessionParams,
      sessionDisplayId: accumulator.sessionId,
      provider: cursorCliProvider.id,
      model: readStringConfig(ctx.config, "model") || accumulator.model || null,
      billingType: accumulator.billingType || "subscription",
      summary: summaryLine,
      output,
      clearSession: clearSession && !accumulator.sessionId ? true : undefined,
    };
  },
};
