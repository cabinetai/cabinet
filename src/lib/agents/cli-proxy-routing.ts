import {
  cliProxyRuntime,
  type CLIProxyConnection,
} from "./cli-proxy-runtime";

export const CLI_PROXY_CONNECTOR_ID = "cli-proxy";
export const CLI_PROXY_CODEX_PROVIDER_ID = "cabinet-cliproxy";
export const CLI_PROXY_CODEX_API_KEY_ENV = "CABINET_CLIPROXY_API_KEY";

export function wantsCLIProxy(config: Record<string, unknown>): boolean {
  return config.connector === CLI_PROXY_CONNECTOR_ID;
}

export function resolveCLIProxyConnection(
  config: Record<string, unknown>,
  provider: "claude" | "codex"
): CLIProxyConnection | null {
  if (config.connector === "direct") return null;
  const explicit = wantsCLIProxy(config);
  const intended = explicit || cliProxyRuntime.shouldRoute(provider);
  if (!intended) return null;
  const connection = cliProxyRuntime.connection(provider, explicit);
  if (!connection) {
    throw new Error(
      "A connected CLIProxyAPI account is selected, but the Cabinet connector is not running."
    );
  }
  return connection;
}

export function buildClaudeCLIProxyEnv(
  connection: CLIProxyConnection
): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: connection.baseUrl,
    ANTHROPIC_AUTH_TOKEN: connection.apiKey,
    // A shell-level API key can otherwise win over the connector token in
    // some Claude Code versions. Scope the override to this one child.
    ANTHROPIC_API_KEY: "",
  };
}

export function buildCodexCLIProxyArgs(
  connection: CLIProxyConnection
): string[] {
  const baseUrl = `${connection.baseUrl.replace(/\/+$/, "")}/v1`;
  return [
    "-c", `model_provider="${CLI_PROXY_CODEX_PROVIDER_ID}"`,
    "-c", `model_providers.${CLI_PROXY_CODEX_PROVIDER_ID}.name="Cabinet CLIProxyAPI"`,
    "-c", `model_providers.${CLI_PROXY_CODEX_PROVIDER_ID}.base_url="${baseUrl}"`,
    "-c", `model_providers.${CLI_PROXY_CODEX_PROVIDER_ID}.wire_api="responses"`,
    "-c", `model_providers.${CLI_PROXY_CODEX_PROVIDER_ID}.env_key="${CLI_PROXY_CODEX_API_KEY_ENV}"`,
  ];
}

export function buildCodexCLIProxyEnv(
  connection: CLIProxyConnection
): Record<string, string> {
  return { [CLI_PROXY_CODEX_API_KEY_ENV]: connection.apiKey };
}
