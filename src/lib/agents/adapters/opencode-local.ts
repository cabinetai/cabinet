import { openCodeProvider } from "../providers/opencode";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import {
  consumeOpenCodeJsonStream,
  createOpenCodeStreamAccumulator,
  flushOpenCodeJsonStream,
  getOpenCodeUsage,
  isOpenCodeUnknownSessionError,
} from "./opencode-stream";
import type {
  AdapterExecutionContext,
  AdapterSessionCodec,
  AgentExecutionAdapter,
} from "./types";
import { ADAPTER_RUNTIME_PATH, runChildProcess } from "./utils";
import { readStringConfig, readEffortConfig } from "./_shared/cli-args";

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || null
  );
}

function resolveProviderFromModel(model: string | null): string | null {
  if (!model) return null;
  const idx = model.indexOf("/");
  if (idx <= 0) return null;
  const provider = model.slice(0, idx).trim();
  return provider || null;
}

function buildOpenCodeArgs(
  config: Record<string, unknown>,
  resumeSessionId: string | null
): string[] {
  const args = ["run", "--format", "json"];

  if (resumeSessionId) {
    args.push("--session", resumeSessionId);
  }

  const model = readStringConfig(config, "model");
  if (model) {
    args.push("--model", model);
  }

  const variant = readStringConfig(config, "variant") || readEffortConfig(config);
  if (variant) {
    args.push("--variant", variant);
  }

  return args;
}

const OPENCODE_STDERR_NOISE_PATTERNS = [
  /^Performing one time database migration/i,
  /^sqlite-migration:/i,
  /^Database migration complete/i,
];

function filterOpenCodeStderr(chunk: string): string {
  return chunk
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !OPENCODE_STDERR_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
    })
    .map((line) => `${line}\n`)
    .join("");
}

const openCodeSessionCodec: AdapterSessionCodec = {
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

async function runOpenCodeOnce(
  ctx: AdapterExecutionContext,
  command: string,
  args: string[]
) {
  const accumulator = createOpenCodeStreamAccumulator();

  await ctx.onMeta?.({
    adapterType: ctx.adapterType,
    command,
    commandArgs: args,
    cwd: ctx.cwd,
    env: {
      PATH: ADAPTER_RUNTIME_PATH,
      OPENCODE_DISABLE_PROJECT_CONFIG: "true",
    },
  });

  const result = await runChildProcess(command, args, {
    cwd: ctx.cwd,
    env: { OPENCODE_DISABLE_PROJECT_CONFIG: "true" },
    stdin: ctx.prompt,
    timeoutMs: ctx.timeoutMs,
    onSpawn: ctx.onSpawn,
    onStdout: (chunk) => {
      const display = consumeOpenCodeJsonStream(accumulator, chunk);
      if (!display) return;
      void ctx.onLog("stdout", display);
    },
    onStderr: (chunk) => {
      const filtered = filterOpenCodeStderr(chunk);
      if (!filtered) return;
      void ctx.onLog("stderr", filtered);
    },
  });

  const trailing = flushOpenCodeJsonStream(accumulator);
  if (trailing) {
    await ctx.onLog("stdout", trailing);
  }

  return { result, accumulator };
}

export const openCodeLocalAdapter: AgentExecutionAdapter = {
  type: "opencode_local",
  name: "OpenCode Local",
  description:
    "Structured OpenCode execution using `opencode run --format json`. Routes to any configured provider via provider/model identifiers and supports session resume.",
  providerId: openCodeProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: true,
  models: openCodeProvider.models,
  effortLevels: openCodeProvider.effortLevels,
  sessionCodec: openCodeSessionCodec,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "OpenCode",
          cliCommand: "opencode",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "opencode_local",
      await openCodeProvider.healthCheck(),
      openCodeProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(openCodeProvider);

    const storedSessionId =
      ctx.sessionParams && typeof ctx.sessionParams === "object"
        ? typeof (ctx.sessionParams as Record<string, unknown>).sessionId === "string"
          ? ((ctx.sessionParams as Record<string, unknown>).sessionId as string)
          : null
        : null;
    const resumeId = storedSessionId || ctx.sessionId || null;

    const firstArgs = buildOpenCodeArgs(ctx.config, resumeId);
    const first = await runOpenCodeOnce(ctx, command, firstArgs);

    let { result, accumulator } = first;
    let clearSession = false;

    const firstFailed =
      !result.timedOut &&
      ((result.exitCode ?? 0) !== 0 || accumulator.errors.length > 0);

    if (
      resumeId &&
      firstFailed &&
      isOpenCodeUnknownSessionError(result.stdout, result.stderr)
    ) {
      await ctx.onLog(
        "stdout",
        `[cabinet] OpenCode session "${resumeId}" is unavailable; retrying with a fresh session.\n`
      );
      const retryArgs = buildOpenCodeArgs(ctx.config, null);
      const retry = await runOpenCodeOnce(ctx, command, retryArgs);
      result = retry.result;
      accumulator = retry.accumulator;
      clearSession = true;
    }

    const output = accumulator.display.trim() || null;
    const summaryLine =
      firstNonEmptyLine(accumulator.lastAssistantMessage || output || "")?.slice(0, 300) ||
      null;
    const model = readStringConfig(ctx.config, "model") || null;
    const sessionParams = accumulator.sessionId
      ? { sessionId: accumulator.sessionId, cwd: ctx.cwd }
      : null;

    const parsedError = accumulator.errors.join("\n").trim();
    const rawExitCode = result.exitCode;
    const emptyResponse =
      accumulator.messages.length === 0 && !accumulator.sessionId;
    const emptyResponseHint =
      emptyResponse && (rawExitCode ?? 0) === 0
        ? "OpenCode exited without producing a response. The most common cause is a missing provider API key for the requested model (e.g. GOOGLE_GENERATIVE_AI_API_KEY for google/* models, ANTHROPIC_API_KEY for anthropic/* models, OPENAI_API_KEY for openai/* models). Run `opencode auth` or set the env var and retry."
        : null;
    const synthesizedExitCode =
      (parsedError || emptyResponseHint) && (rawExitCode ?? 0) === 0
        ? 1
        : rawExitCode;

    return {
      exitCode: synthesizedExitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        (synthesizedExitCode ?? 0) === 0
          ? null
          : parsedError ||
            emptyResponseHint ||
            filterOpenCodeStderr(result.stderr).trim() ||
            output ||
            "OpenCode execution failed.",
      usage: getOpenCodeUsage(accumulator),
      sessionId: accumulator.sessionId,
      sessionParams,
      sessionDisplayId: accumulator.sessionId,
      provider: resolveProviderFromModel(model) || openCodeProvider.id,
      model,
      billingType: "unknown",
      summary: summaryLine,
      output,
      clearSession: clearSession && !accumulator.sessionId ? true : undefined,
    };
  },
};
