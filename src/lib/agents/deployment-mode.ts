/**
 * Cabinet ships open-source and local-first (`npx cabinetai install`); a
 * managed cloud build is planned. The two builds resolve OAuth differently:
 *
 *   - local: a confidential client_secret cannot be secret in a public repo
 *     running on the user's machine, so official servers use CLI-driven PKCE
 *     (public client) or a user-registered app. NO secret ships here.
 *   - cloud: Cabinet runs a managed OAuth broker with its own registered apps;
 *     the secret stays server-side, enabling one-click "Sign in".
 *
 * Everything else (catalog, guides, visuals) is identical — only the connect
 * mechanic differs. Keep this the single switch so the cloud build is a
 * backend swap, not a fork.
 */

import type { AuthBackend, CatalogEntry } from "./mcp-catalog";

export type DeploymentMode = "local" | "cloud";

export function getDeploymentMode(): DeploymentMode {
  // Reserved flag for the future cloud build; defaults to local everywhere
  // today. Never trust this to silently enable a broker that doesn't exist.
  return process.env.CABINET_DEPLOYMENT_MODE === "cloud" ? "cloud" : "local";
}

/**
 * The auth backend actually used for an entry given the deployment mode.
 * Local can never use `cabinet-broker`; it degrades to the entry's declared
 * backend (or its fallback for confidential-only servers).
 */
export function resolveAuthBackend(
  entry: CatalogEntry,
  mode: DeploymentMode = getDeploymentMode(),
): AuthBackend {
  if (mode === "cloud") {
    // Cloud prefers the managed broker for any OAuth server; token servers
    // still use a pasted token.
    return entry.transport === "http" ? "cabinet-broker" : entry.authBackend;
  }
  if (entry.authBackend === "cabinet-broker") {
    return entry.fallbackAuthBackend ?? "user-app";
  }
  return entry.authBackend;
}
