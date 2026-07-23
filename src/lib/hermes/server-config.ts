import { assessHermesLiveReadiness, type HermesReadinessSourceState } from "./live-readonly-readiness";
import { validateHermesUpstreamUrl } from "./upstream-url";
import path from "node:path";

export type HermesServerConfig = {
  apiBaseUrl: string;
  apiKey: string;
  managementBaseUrl: string;
  managementToken: string | null;
  gatewayBaseUrl: string;
  gatewayToken: string;
  profile: string;
  timeoutMs: number;
};

export type HermesReadOnlyServerConfig = {
  apiBaseUrl: string | null;
  apiKey: string | null;
  managementBaseUrl: string | null;
  managementToken: string | null;
  gatewayBaseUrl: string | null;
  gatewayToken: string | null;
  profile: string | null;
  timeoutMs: number;
  sourceStates: Record<"agent_api" | "management" | "gateway", HermesReadinessSourceState>;
};

export type HermesRunServerConfig = Pick<
  HermesServerConfig,
  "apiBaseUrl" | "apiKey" | "profile" | "timeoutMs"
>;

export type HermesSkillsServerConfig = {
  profile: string | null;
};

export type HermesExecutionServerConfig = {
  cliPath: string;
  profile: string;
  timeoutMs: number;
  noTools: true;
};

/** Consequential Hermes runtime interventions are opt-in and server-only. */
export function hermesInterventionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.CABINET_HERMES_INTERVENTIONS_ENABLED?.trim().toLowerCase() === "true";
}

export function hermesGatewayWebSocketUrl(config: HermesServerConfig): string {
  const url = new URL(config.gatewayBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  url.search = "";
  url.hash = "";
  // Hermes loopback gateways authenticate WebSocket upgrades with the same
  // server credential in a query parameter. This URL must never cross the
  // server/browser boundary or be logged.
  url.searchParams.set("token", config.gatewayToken);
  return url.toString();
}

export class HermesConfigurationError extends Error {
  readonly code = "HERMES_MISCONFIGURED";

  constructor(message: string) {
    super(message);
    this.name = "HermesConfigurationError";
  }
}

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new HermesConfigurationError(`Missing server configuration: ${name}`);
  }
  return normalized;
}

function optional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function requiredLiteralTrue(name: string, value: string | undefined): true {
  if (value === "true") return true;
  throw new HermesConfigurationError(
    `Invalid server configuration: ${name} must be exactly true`,
  );
}

function baseUrl(name: string, value: string | undefined): string {
  const raw = required(name, value);
  try {
    return validateHermesUpstreamUrl(name, raw).baseUrl;
  } catch (error) {
    throw new HermesConfigurationError(
      error instanceof Error ? error.message : `Invalid server configuration: ${name} is not an approved loopback URL.`
    );
  }
}

function timeout(value: string | undefined): number {
  if (!value?.trim()) return 3_000;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 250 || parsed > 30_000) {
    throw new HermesConfigurationError(
      "Invalid server configuration: CABINET_HERMES_TIMEOUT_MS must be an integer from 250 to 30000"
    );
  }
  return parsed;
}

export function readHermesServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): HermesServerConfig {
  return {
    apiBaseUrl: baseUrl("CABINET_HERMES_API_URL", env.CABINET_HERMES_API_URL),
    apiKey: required("CABINET_HERMES_API_KEY", env.CABINET_HERMES_API_KEY),
    managementBaseUrl: baseUrl(
      "CABINET_HERMES_MANAGEMENT_URL",
      env.CABINET_HERMES_MANAGEMENT_URL
    ),
    managementToken: optional(env.CABINET_HERMES_MANAGEMENT_TOKEN ?? env.HERMES_DASHBOARD_SESSION_TOKEN),
    gatewayBaseUrl: baseUrl(
      "CABINET_HERMES_GATEWAY_URL",
      env.CABINET_HERMES_GATEWAY_URL
    ),
    gatewayToken: required(
      "CABINET_HERMES_GATEWAY_TOKEN",
      env.CABINET_HERMES_GATEWAY_TOKEN
    ),
    profile: required("CABINET_HERMES_PROFILE", env.CABINET_HERMES_PROFILE),
    timeoutMs: timeout(env.CABINET_HERMES_TIMEOUT_MS),
  };
}

/**
 * Builds only complete, valid read-only source groups. Missing or invalid
 * groups stay null and cannot borrow credentials or endpoints from another
 * source. The strict mutation configuration above remains all-or-nothing.
 */
export function readHermesReadOnlyServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HermesReadOnlyServerConfig {
  const readiness = assessHermesLiveReadiness(env);
  const state = (id: "agent_api" | "management" | "gateway") =>
    readiness.sources.find((source) => source.id === id)?.state ?? "unavailable";
  const apiReady = state("agent_api") === "ready_to_probe";
  const managementReady = state("management") === "ready_to_probe";
  const gatewayReady = state("gateway") === "ready_to_probe";
  return {
    apiBaseUrl: apiReady ? validateHermesUpstreamUrl("CABINET_HERMES_API_URL", env.CABINET_HERMES_API_URL!).baseUrl : null,
    apiKey: apiReady ? env.CABINET_HERMES_API_KEY!.trim() : null,
    managementBaseUrl: managementReady
      ? validateHermesUpstreamUrl("CABINET_HERMES_MANAGEMENT_URL", env.CABINET_HERMES_MANAGEMENT_URL!).baseUrl
      : null,
    managementToken: managementReady
      ? (env.CABINET_HERMES_MANAGEMENT_TOKEN ?? env.HERMES_DASHBOARD_SESSION_TOKEN)!.trim()
      : null,
    gatewayBaseUrl: gatewayReady
      ? validateHermesUpstreamUrl("CABINET_HERMES_GATEWAY_URL", env.CABINET_HERMES_GATEWAY_URL!).baseUrl
      : null,
    gatewayToken: gatewayReady ? env.CABINET_HERMES_GATEWAY_TOKEN!.trim() : null,
    profile: optional(env.CABINET_HERMES_PROFILE),
    timeoutMs: timeout(env.CABINET_HERMES_TIMEOUT_MS),
    sourceStates: {
      agent_api: state("agent_api"),
      management: state("management"),
      gateway: state("gateway"),
    },
  };
}

/** Governed Skills use only the approved CLI and need no HTTP credentials. */
export function readHermesSkillsServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HermesSkillsServerConfig {
  return { profile: optional(env.CABINET_HERMES_PROFILE) };
}

/** Native ACP execution uses only an approved absolute CLI path and profile. */
export function readHermesExecutionServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HermesExecutionServerConfig {
  const cliPath = required(
    "CABINET_HERMES_EXECUTION_CLI_PATH",
    env.CABINET_HERMES_EXECUTION_CLI_PATH,
  );
  if (!path.isAbsolute(cliPath)) {
    throw new HermesConfigurationError(
      "Invalid server configuration: CABINET_HERMES_EXECUTION_CLI_PATH must be absolute",
    );
  }
  const profile = required("CABINET_HERMES_PROFILE", env.CABINET_HERMES_PROFILE);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(profile)) {
    throw new HermesConfigurationError(
      "Invalid server configuration: CABINET_HERMES_PROFILE is not a valid profile name",
    );
  }
  return {
    cliPath,
    profile,
    timeoutMs: timeout(env.CABINET_HERMES_TIMEOUT_MS),
    noTools: requiredLiteralTrue(
      "CABINET_HERMES_EXECUTION_NO_TOOLS",
      env.CABINET_HERMES_EXECUTION_NO_TOOLS,
    ),
  };
}

/**
 * The run API is an Agent API surface. It must not inherit the stricter
 * Management and Gateway credential requirements used by consequential
 * cross-surface management operations.
 */
export function readHermesRunServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HermesRunServerConfig {
  const config = readHermesReadOnlyServerConfig(env);
  if (!config.apiBaseUrl || !config.apiKey || !config.profile) {
    throw new HermesConfigurationError("Hermes Agent API run service is not configured.");
  }
  return {
    apiBaseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    profile: config.profile,
    timeoutMs: config.timeoutMs,
  };
}
