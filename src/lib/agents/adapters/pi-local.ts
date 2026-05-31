import fs from "fs";
import os from "os";
import path from "path";
import { piProvider } from "../providers/pi";
import { resolveCliCommand } from "../provider-cli";
import { providerStatusToEnvironmentTest } from "./environment";
import {
  classifyChain,
  classifyCommonError,
} from "./error-classification";
import {
  consumePiJsonStream,
  createPiStreamAccumulator,
  flushPiJsonStream,
  getPiUsage,
} from "./pi-stream";
import type { AdapterSessionCodec, AgentExecutionAdapter } from "./types";
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

function splitProviderModel(input: string): { provider?: string; model: string } {
  const idx = input.indexOf("/");
  if (idx <= 0) return { model: input };
  return {
    provider: input.slice(0, idx).trim() || undefined,
    model: input.slice(idx + 1).trim() || input,
  };
}

function piSessionsDir(): string {
  const home = os.homedir() || process.env.HOME || "/tmp";
  const dir = path.join(home, ".cabinet", "pi-sessions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureSessionFile(runId: string, stored: string | null): {
  sessionFile: string;
  reused: boolean;
} {
  if (stored && fs.existsSync(stored)) {
    return { sessionFile: stored, reused: true };
  }
  const sessionFile = path.join(piSessionsDir(), `${runId}.json`);
  try {
    fs.writeFileSync(sessionFile, "", { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
  return { sessionFile, reused: false };
}

function buildPiArgs(
  config: Record<string, unknown>,
  prompt: string,
  sessionFile: string
): string[] {
  const args = ["--mode", "json", "-p"];

  const modelInput = readStringConfig(config, "model");
  if (modelInput) {
    const explicitProvider = readStringConfig(config, "provider");
    const { provider, model } = splitProviderModel(modelInput);
    const effectiveProvider = explicitProvider || provider;
    if (effectiveProvider) args.push("--provider", effectiveProvider);
    if (model) args.push("--model", model);
  } else {
    const explicitProvider = readStringConfig(config, "provider");
    if (explicitProvider) args.push("--provider", explicitProvider);
  }

  const thinking = readStringConfig(config, "thinking") || readEffortConfig(config);
  if (thinking) {
    args.push("--thinking", thinking);
  }

  args.push("--tools", "read,bash,edit,write,grep,find,ls");
  args.push("--session", sessionFile);
  args.push(prompt);
  return args;
}

const piSessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const sessionFile =
      typeof record.sessionFile === "string" && record.sessionFile.trim()
        ? record.sessionFile.trim()
        : null;
    if (!sessionFile) return null;
    return { sessionFile };
  },
  serialize(params) {
    if (!params || typeof params.sessionFile !== "string" || !params.sessionFile.trim()) {
      return null;
    }
    return { sessionFile: params.sessionFile };
  },
  getDisplayId(params) {
    if (typeof params.sessionFile !== "string") return null;
    return path.basename(params.sessionFile, path.extname(params.sessionFile));
  },
};

export const piLocalAdapter: AgentExecutionAdapter = {
  type: "pi_local",
  name: "Pi Local",
  description:
    "Structured Pi CLI execution with provider/model routing, thinking levels, and file-based session resume.",
  providerId: piProvider.id,
  executionEngine: "structured_cli",
  supportsDetachedRuns: true,
  supportsSessionResume: true,
  models: piProvider.models,
  effortLevels: piProvider.effortLevels,
  sessionCodec: piSessionCodec,
  classifyError(stderr, exitCode) {
    return classifyChain(stderr, exitCode, [
      (s, c) =>
        classifyCommonError(s, c, {
          providerDisplayName: "Pi (Inflection)",
          cliCommand: "pi",
        }),
    ]);
  },
  async testEnvironment() {
    return providerStatusToEnvironmentTest(
      "pi_local",
      await piProvider.healthCheck(),
      piProvider.installMessage
    );
  },
  async execute(ctx) {
    const command =
      readStringConfig(ctx.config, "command") || resolveCliCommand(piProvider);

    const storedSessionFile =
      ctx.sessionParams && typeof ctx.sessionParams === "object"
        ? typeof (ctx.sessionParams as Record<string, unknown>).sessionFile === "string"
          ? ((ctx.sessionParams as Record<string, unknown>).sessionFile as string)
          : null
        : null;
    const { sessionFile } = ensureSessionFile(ctx.runId, storedSessionFile);

    const args = buildPiArgs(ctx.config, ctx.prompt, sessionFile);
    const accumulator = createPiStreamAccumulator();

    await ctx.onMeta?.({
      adapterType: ctx.adapterType,
      command,
      commandArgs: args,
      cwd: ctx.cwd,
      env: { PATH: ADAPTER_RUNTIME_PATH },
    });

    const result = await runChildProcess(command, args, {
      cwd: ctx.cwd,
      timeoutMs: ctx.timeoutMs,
      onSpawn: ctx.onSpawn,
      onStdout: (chunk) => {
        const display = consumePiJsonStream(accumulator, chunk);
        if (!display) return;
        void ctx.onLog("stdout", display);
      },
      onStderr: (chunk) => {
        if (!chunk) return;
        void ctx.onLog("stderr", chunk);
      },
    });

    const trailing = flushPiJsonStream(accumulator);
    if (trailing) {
      await ctx.onLog("stdout", trailing);
    }

    const output = accumulator.display.trim() || null;
    const summaryLine =
      firstNonEmptyLine(accumulator.finalMessage || output || "")?.slice(0, 300) || null;
    const parsedError = accumulator.errors.join("\n").trim();

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      errorMessage:
        result.exitCode === 0
          ? null
          : parsedError ||
            result.stderr.trim() ||
            output ||
            "Pi execution failed.",
      usage: getPiUsage(accumulator),
      sessionId: null,
      sessionParams: { sessionFile },
      sessionDisplayId: path.basename(sessionFile, path.extname(sessionFile)),
      provider: piProvider.id,
      model: readStringConfig(ctx.config, "model") || null,
      billingType: "unknown",
      summary: summaryLine,
      output,
    };
  },
};
