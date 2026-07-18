/**
 * Slack app manifest, derived from the catalog entry.
 *
 * Slack's MCP server has no Dynamic Client Registration, so the user must bring
 * their own app. Doing that by hand is the worst part of the setup: the MCP
 * toggle hides under Features → Agents (next to a decoy "MCP Servers" page that
 * does the opposite thing), the redirect URL needs Add *and* Save URLs, and
 * flipping the toggle by hand silently auto-adds ~26 user scopes — including
 * `users:read.email`, which locked-down workspaces block.
 *
 * A manifest sidesteps all of it. `?new_app=1&manifest_json=…` creates the app
 * with the MCP toggle already on, the redirect URL registered, and EXACTLY the
 * scopes below — 6, not 26. So the one-click path is also the private one.
 *
 * Everything here is derived from the caller's values (which come from the
 * catalog's `oauthClient`), so the deep link, the copy-paste fallback, and the
 * CLI's OAuth config cannot drift apart.
 */

export interface SlackManifestOptions {
  /** App name shown in Slack. */
  appName: string;
  /** Space-separated scope string, straight from `oauthClient.scopes`. */
  scopes: string;
  /** Loopback port the CLI listens on; becomes the redirect URL. */
  callbackPort: number;
}

export interface SlackManifest {
  display_information: { name: string };
  oauth_config: {
    redirect_urls: string[];
    scopes: { user: string[] };
  };
  settings: { is_mcp_enabled: true };
}

export function buildSlackManifest({
  appName,
  scopes,
  callbackPort,
}: SlackManifestOptions): SlackManifest {
  return {
    display_information: { name: appName },
    oauth_config: {
      redirect_urls: [`http://localhost:${callbackPort}/callback`],
      scopes: { user: scopes.split(/\s+/).filter(Boolean) },
    },
    settings: { is_mcp_enabled: true },
  };
}

/** Indented JSON for the "paste it manually instead" fallback. */
export function buildSlackManifestJson(options: SlackManifestOptions): string {
  return JSON.stringify(buildSlackManifest(options), null, 2);
}

/**
 * Deep link that opens Slack's create-app flow prefilled from the manifest. The
 * user picks a workspace, reviews Slack's read-only summary, and clicks Create.
 * ~500 chars with the current scope set — well inside URL limits.
 */
export function buildSlackCreateUrl(options: SlackManifestOptions): string {
  const json = JSON.stringify(buildSlackManifest(options));
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(json)}`;
}
