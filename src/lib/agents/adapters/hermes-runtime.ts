import type { ConversationErrorClassification } from "@/types/conversations";
import { HermesAcpError, runHermesAcpTurn, validateHermesAcpExecutable } from "@/lib/hermes/acp-client";
import { readHermesExecutionServerConfig } from "@/lib/hermes/server-config";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AgentExecutionAdapter,
} from "./types";

function classifyAcpFailure(error: unknown): ConversationErrorClassification {
  if (error instanceof HermesAcpError) {
    if (error.kind === "timeout") {
      return { kind: "timeout", hint: "Hermes did not respond in time. Retry the turn." };
    }
    if (error.kind === "session_expired") {
      return { kind: "session_expired", hint: "The Hermes session must be reopened." };
    }
    if (error.kind === "transport") {
      return { kind: "transport", hint: "The Hermes execution process disconnected." };
    }
  }
  return { kind: "unknown", hint: "Hermes could not complete this turn." };
}

async function executeHermes(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  let sessionId = ctx.sessionId || "";
  try {
    const config = readHermesExecutionServerConfig();
    let child: import("node:child_process").ChildProcessWithoutNullStreams | null = null;
    ctx.registerInterrupt?.(async () => {
      child?.kill("SIGTERM");
    });
    const result = await runHermesAcpTurn({
      config,
      cwd: ctx.cwd,
      prompt: ctx.prompt,
      sessionId,
      timeoutMs: ctx.timeoutMs ?? 15 * 60 * 1000,
      onSpawn(spawned) {
        child = spawned;
        void ctx.onSpawn?.({
          pid: spawned.pid ?? 0,
          processGroupId: null,
          startedAt: new Date().toISOString(),
        });
      },
      async onDelta(text) {
        await ctx.onLog("stdout", text);
      },
    });
    sessionId = result.sessionId;
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      output: result.output,
      sessionId,
      sessionParams: {
        profile: config.profile,
        sessionId,
        protocol: "acp-stdio-v1",
        noTools: config.noTools,
      },
      sessionDisplayId: sessionId,
      provider: "hermes",
      billingType: "unknown",
    };
  } catch (error) {
    const classification = classifyAcpFailure(error);
    return {
      exitCode: classification.kind === "timeout" ? 124 : 1,
      signal: null,
      timedOut: classification.kind === "timeout",
      errorMessage: error instanceof HermesAcpError ? error.message : "Hermes execution failed.",
      errorCode: classification.kind,
      sessionId: sessionId || null,
    };
  }
}

export const hermesRuntimeAdapter: AgentExecutionAdapter = {
  type: "hermes_runtime",
  name: "Hermes",
  description: "Run Cabinet conversations through the native Hermes ACP CLI contract.",
  providerId: "hermes",
  executionEngine: "process",
  supportsSessionResume: true,
  supportsDetachedRuns: true,
  sessionCodec: {
    deserialize(raw) {
      if (!raw || typeof raw !== "object") return null;
      const params = raw as Record<string, unknown>;
      return params.protocol === "acp-stdio-v1" && params.noTools === true
        ? params
        : null;
    },
    serialize(params) {
      if (params.noTools !== true) return null;
      return {
        profile: params.profile,
        sessionId: params.sessionId,
        protocol: "acp-stdio-v1",
        noTools: params.noTools,
      };
    },
    getDisplayId(params) {
      return typeof params.sessionId === "string" ? params.sessionId : null;
    },
  },
  async testEnvironment() {
    const config = readHermesExecutionServerConfig();
    await validateHermesAcpExecutable(config);
    return {
      adapterType: "hermes_runtime",
      status: "pass",
      checks: [{
        code: "hermes_acp_ready",
        level: "info",
        message: "Hermes native ACP execution is configured.",
        detail: `Profile ${config.profile}, no-tools mode enforced`,
      }],
      testedAt: new Date().toISOString(),
    };
  },
  execute: executeHermes,
  classifyError(stderr, exitCode) {
    if (exitCode === 124 || /timed out/i.test(stderr)) {
      return { kind: "timeout", hint: "Hermes did not respond in time. Retry the turn." };
    }
    if (/session.*(not available|expired)/i.test(stderr)) {
      return { kind: "session_expired", hint: "The Hermes session must be reopened." };
    }
    if (/disconnect/i.test(stderr)) {
      return { kind: "transport", hint: "The Hermes execution process disconnected." };
    }
    return { kind: "unknown", hint: "Hermes could not complete this turn." };
  },
};
