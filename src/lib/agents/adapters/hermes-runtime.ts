import type { ConversationErrorClassification } from "@/types/conversations";
import { HermesGatewayClient, HermesGatewayError } from "@/lib/hermes/gateway-client";
import { HermesManagementClient } from "@/lib/hermes/management-client";
import { readHermesServerConfig } from "@/lib/hermes/server-config";
import type { HermesGatewayEvent } from "@/lib/hermes/types";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterRuntimeEvent,
  AgentExecutionAdapter,
} from "./types";

function eventPayload(event: HermesGatewayEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" ? event.payload : {};
}

function requestId(event: HermesGatewayEvent): string | null {
  const value = eventPayload(event).request_id;
  return typeof value === "string" ? value : null;
}

function redactSensitiveFlow(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveFlow);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).map((key) => [key, "[REDACTED]"])
    );
  }
  return typeof value === "string" ? "[REDACTED]" : value;
}

function classifyGatewayFailure(error: unknown): ConversationErrorClassification {
  if (error instanceof HermesGatewayError) {
    if (error.kind === "timeout") {
      return { kind: "timeout", hint: "Hermes did not respond in time. Retry the turn." };
    }
    if (error.kind === "stale_session") {
      return {
        kind: "session_expired",
        hint: "The Hermes session is no longer available. Reopen it from Hermes history.",
      };
    }
    if (error.kind === "authentication") {
      return { kind: "auth_expired", hint: "Hermes rejected the configured credential." };
    }
    if (error.kind === "disconnect") {
      return { kind: "transport", hint: "The Hermes gateway disconnected. Reconnect and retry." };
    }
  }
  return { kind: "unknown", hint: "Hermes could not complete this turn." };
}

async function executeHermes(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = readHermesServerConfig();
  const client = new HermesGatewayClient(config);
  const events: AdapterRuntimeEvent[] = [];
  let liveSessionId = "";
  let durableSessionId = ctx.sessionId || "";
  let completed = false;
  let sensitiveFlowActive = false;

  try {
    await client.connect();
    const session = durableSessionId
      ? await client.resumeSession(durableSessionId)
      : await client.createSession({ cwd: ctx.cwd });
    liveSessionId = session.liveSessionId;
    durableSessionId = session.sessionId;

    ctx.registerInterrupt?.(async () => {
      if (liveSessionId) await client.interrupt(liveSessionId);
    });

    const terminal = new Promise<AdapterExecutionResult>((resolve) => {
      const unsubscribe = client.onEvent((event) => {
        if (event.session_id && event.session_id !== liveSessionId) return;
        const rawPayload = eventPayload(event);
        const payload = sensitiveFlowActive
          ? (redactSensitiveFlow(rawPayload) as Record<string, unknown>)
          : rawPayload;
        const normalized: AdapterRuntimeEvent = {
          type: event.type,
          sessionId: durableSessionId,
          liveSessionId,
          runId: ctx.runId,
          requestId: requestId(event),
          payload,
          occurredAt: new Date().toISOString(),
        };
        events.push(normalized);
        void ctx.onEvent?.(normalized);

        if (event.type === "secret.request" || event.type === "sudo.request") {
          sensitiveFlowActive = true;
        }

        if (event.type === "message.delta") {
          if (sensitiveFlowActive) return;
          const text = normalized.payload?.text;
          if (typeof text === "string" && text) void ctx.onLog("stdout", text);
          return;
        }
        if (event.type === "message.complete") {
          completed = true;
          unsubscribe();
          const text =
            sensitiveFlowActive
              ? "Sensitive Hermes response omitted from Cabinet persistence."
              : typeof normalized.payload?.text === "string"
                ? normalized.payload.text
                : "";
          const status = rawPayload.status;
          const interrupted = status === "interrupted";
          resolve({
            exitCode: interrupted ? 130 : status === "error" ? 1 : 0,
            signal: interrupted ? "SIGINT" : null,
            timedOut: false,
            interrupted,
            errorMessage: status === "error" ? text || "Hermes turn failed." : null,
            output: text,
            sessionId: durableSessionId,
            sessionParams: {
              profile: config.profile,
              sessionId: durableSessionId,
              liveSessionId,
            },
            sessionDisplayId: durableSessionId,
            provider:
              typeof normalized.payload?.provider === "string"
                ? normalized.payload.provider
                : "hermes",
            model:
              typeof normalized.payload?.model === "string" ? normalized.payload.model : null,
            billingType: "unknown",
            events,
          });
        }
        if (event.type === "error") {
          completed = true;
          unsubscribe();
          const message =
            typeof normalized.payload?.message === "string"
              ? normalized.payload.message
              : "Hermes turn failed.";
          resolve({
            exitCode: 1,
            signal: null,
            timedOut: false,
            errorMessage: message,
            output: message,
            sessionId: durableSessionId,
            events,
          });
        }
      });
    });

    await client.submitPrompt(liveSessionId, ctx.prompt);
    const timeoutMs = ctx.timeoutMs ?? 15 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutResult = new Promise<AdapterExecutionResult>((resolve) => {
      timeoutId = setTimeout(() => {
          if (completed) return;
          void client.interrupt(liveSessionId).catch(() => undefined);
          resolve({
            exitCode: 124,
            signal: null,
            timedOut: true,
            errorMessage: "Hermes turn timed out.",
            sessionId: durableSessionId,
            events,
          });
        }, timeoutMs);
    });
    const result = await Promise.race([terminal, timeoutResult]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    const classification = classifyGatewayFailure(error);
    return {
      exitCode: 1,
      signal: null,
      timedOut: classification.kind === "timeout",
      errorMessage: error instanceof Error ? error.message : "Hermes gateway failed.",
      errorCode: classification.kind,
      sessionId: durableSessionId || null,
      events,
    };
  } finally {
    client.close();
  }
}

export const hermesRuntimeAdapter: AgentExecutionAdapter = {
  type: "hermes_runtime",
  name: "Hermes",
  description: "Run Cabinet conversations through the Hermes TUI Gateway.",
  providerId: "hermes",
  executionEngine: "api",
  supportsSessionResume: true,
  supportsDetachedRuns: true,
  sessionCodec: {
    deserialize(raw) {
      return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    },
    serialize(params) {
      return {
        profile: params.profile,
        sessionId: params.sessionId,
      };
    },
    getDisplayId(params) {
      return typeof params.sessionId === "string" ? params.sessionId : null;
    },
  },
  async testEnvironment() {
    const health = await new HermesManagementClient(readHermesServerConfig()).health();
    return {
      adapterType: "hermes_runtime",
      status: health.status === "online" ? "pass" : "fail",
      checks: [
        {
          code: `hermes_${health.status}`,
          level: health.status === "online" ? "info" : "error",
          message: health.message,
          detail: health.version ? `Hermes ${health.version}, profile ${health.profile}` : undefined,
        },
      ],
      testedAt: health.checkedAt,
    };
  },
  execute: executeHermes,
  classifyError(stderr, exitCode) {
    if (exitCode === 124 || /timed out/i.test(stderr)) {
      return { kind: "timeout", hint: "Hermes did not respond in time. Retry the turn." };
    }
    if (/session.*(not found|expired|stale)/i.test(stderr)) {
      return { kind: "session_expired", hint: "The Hermes session must be reopened." };
    }
    if (/401|403|unauthor|credential/i.test(stderr)) {
      return { kind: "auth_expired", hint: "Hermes rejected the configured credential." };
    }
    if (/disconnect|socket|ECONN|gateway/i.test(stderr)) {
      return { kind: "transport", hint: "The Hermes gateway disconnected. Reconnect and retry." };
    }
    return { kind: "unknown", hint: "Hermes could not complete this turn." };
  },
};
