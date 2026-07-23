import { spawn } from "node:child_process";
import type { HermesExecutionServerConfig } from "./server-config";
import {
  buildHermesAcpLaunchEnvironment,
  assertHermesAcpExecutable,
} from "./acp-launch";

const READINESS_CONTRACT = "hermes.conversation.readiness";
const READINESS_SCHEMA_VERSION = 1;
const MAX_READINESS_BYTES = 16_384;

export type HermesModelReadiness = {
  contract: typeof READINESS_CONTRACT;
  schema_version: typeof READINESS_SCHEMA_VERSION;
  profile: string;
  provider: string;
  model: string;
  model_source: "profile" | "session" | "default" | "fallback";
  credential_state: "present" | "absent" | "not_required" | "unknown";
  endpoint_class: "local" | "provider" | "proxy" | "unknown";
  ready: boolean;
  blocked_reason: string | null;
  attempts: {
    model_requests_attempted: number;
    provider_retries: number;
    fallback_attempts: number;
    last_provider_http_status: number | null;
  };
};

export type HermesProviderAttemptAccounting = {
  contract: "hermes.provider.attempts";
  schemaVersion: 1;
  modelRequestsAttempted: number;
  providerRetries: number;
  fallbackAttempts: number;
  lastProviderHttpStatus: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function counter(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export class HermesModelReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HermesModelReadinessError";
  }
}

function blocked(message: string): HermesModelReadinessError {
  return new HermesModelReadinessError(message);
}

export function parseHermesModelReadiness(
  value: unknown,
  expectedProfile: string,
): HermesModelReadiness {
  const raw = record(value);
  const attempts = record(raw?.attempts);
  if (
    !raw ||
    raw.contract !== READINESS_CONTRACT ||
    raw.schema_version !== READINESS_SCHEMA_VERSION ||
    !attempts
  ) {
    throw blocked("Hermes returned an unsupported model-readiness contract.");
  }

  const profile = boundedString(raw.profile, 64);
  const provider = boundedString(raw.provider, 96);
  const model = boundedString(raw.model, 160);
  const modelSource = raw.model_source;
  const credentialState = raw.credential_state;
  const endpointClass = raw.endpoint_class;
  const blockedReason = raw.blocked_reason === null
    ? null
    : boundedString(raw.blocked_reason, 240);
  const modelRequests = counter(attempts.model_requests_attempted);
  const providerRetries = counter(attempts.provider_retries);
  const fallbackAttempts = counter(attempts.fallback_attempts);
  const lastStatus = attempts.last_provider_http_status === null
    ? null
    : counter(attempts.last_provider_http_status);

  if (
    profile !== expectedProfile ||
    typeof raw.provider !== "string" ||
    raw.provider.length > 96 ||
    typeof raw.model !== "string" ||
    raw.model.length > 160 ||
    !["profile", "session", "default", "fallback"].includes(String(modelSource)) ||
    !["present", "absent", "not_required", "unknown"].includes(String(credentialState)) ||
    !["local", "provider", "proxy", "unknown"].includes(String(endpointClass)) ||
    typeof raw.ready !== "boolean" ||
    (raw.blocked_reason !== null && !blockedReason) ||
    modelRequests === null ||
    providerRetries === null ||
    fallbackAttempts === null ||
    (lastStatus !== null && (lastStatus < 100 || lastStatus > 599))
  ) {
    throw blocked("Hermes returned malformed model-readiness data.");
  }
  if (!raw.ready) {
    throw blocked(
      blockedReason || `No effective Hermes model is configured for ${expectedProfile}.`,
    );
  }
  if (!provider || !model) {
    throw blocked(`No effective Hermes model is configured for ${expectedProfile}.`);
  }
  if (
    blockedReason !== null ||
    credentialState === "absent" ||
    credentialState === "unknown" ||
    endpointClass === "unknown"
  ) {
    throw blocked("Hermes model readiness is ambiguous or incomplete.");
  }

  const parsed: HermesModelReadiness = {
    contract: READINESS_CONTRACT,
    schema_version: READINESS_SCHEMA_VERSION,
    profile,
    provider,
    model,
    model_source: modelSource as HermesModelReadiness["model_source"],
    credential_state: credentialState as HermesModelReadiness["credential_state"],
    endpoint_class: endpointClass as HermesModelReadiness["endpoint_class"],
    ready: raw.ready,
    blocked_reason: blockedReason,
    attempts: {
      model_requests_attempted: modelRequests,
      provider_retries: providerRetries,
      fallback_attempts: fallbackAttempts,
      last_provider_http_status: lastStatus,
    },
  };

  if (
    parsed.attempts.model_requests_attempted !== 0 ||
    parsed.attempts.provider_retries !== 0 ||
    parsed.attempts.fallback_attempts !== 0 ||
    parsed.attempts.last_provider_http_status !== null
  ) {
    throw blocked("Hermes model readiness unexpectedly attempted provider work.");
  }
  return parsed;
}

export function parseHermesProviderAttempts(
  value: unknown,
): HermesProviderAttemptAccounting {
  const raw = record(value);
  const modelRequestsAttempted = counter(raw?.modelRequestsAttempted);
  const providerRetries = counter(raw?.providerRetries);
  const fallbackAttempts = counter(raw?.fallbackAttempts);
  const lastProviderHttpStatus = raw?.lastProviderHttpStatus === null
    ? null
    : counter(raw?.lastProviderHttpStatus);
  if (
    !raw ||
    raw.contract !== "hermes.provider.attempts" ||
    raw.schemaVersion !== 1 ||
    modelRequestsAttempted === null ||
    providerRetries === null ||
    fallbackAttempts === null ||
    (lastProviderHttpStatus !== null &&
      (lastProviderHttpStatus < 100 || lastProviderHttpStatus > 599))
  ) {
    throw new HermesModelReadinessError(
      "Hermes returned malformed provider-attempt accounting.",
    );
  }
  return {
    contract: "hermes.provider.attempts",
    schemaVersion: 1,
    modelRequestsAttempted,
    providerRetries,
    fallbackAttempts,
    lastProviderHttpStatus,
  };
}

export async function resolveHermesModelReadiness(input: {
  config: HermesExecutionServerConfig;
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<HermesModelReadiness> {
  try {
    await assertHermesAcpExecutable(input.config);
  } catch {
    throw blocked("Hermes model readiness is unavailable.");
  }
  const child = spawn(input.config.cliPath, ["--model-readiness-json"], {
    cwd: input.cwd,
    env: buildHermesAcpLaunchEnvironment(input.config, input.env),
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
  });
  let stdout = "";
  let oversized = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (oversized) return;
    stdout += chunk;
    if (Buffer.byteLength(stdout, "utf8") > MAX_READINESS_BYTES) {
      oversized = true;
      child.kill("SIGTERM");
    }
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(blocked("Hermes model readiness timed out."));
    }, input.config.timeoutMs);
    timer.unref();
    child.once("error", () => {
      clearTimeout(timer);
      reject(blocked("Hermes model readiness is unavailable."));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (oversized || exitCode !== 0) {
    throw blocked("Hermes model readiness is unavailable.");
  }

  let value: unknown;
  try {
    const text = stdout.trim();
    if (!text || text.includes("\n")) throw new Error("not one JSON object");
    value = JSON.parse(text);
  } catch {
    throw blocked("Hermes returned malformed model-readiness data.");
  }
  return parseHermesModelReadiness(value, input.config.profile);
}
