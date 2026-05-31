/**
 * The set of CLI "environments" an integration can be installed into.
 *
 * Cabinet agents run by spawning one of these CLIs; that CLI is the MCP client
 * that actually connects an integration's server. So "supported environments"
 * = which CLI configs Cabinet writes the server entry into. The user picks
 * this set at install and can edit it later; per integration they can further
 * choose which of those environments to install/remove.
 *
 * Every known provider is listed so the UI can show the full lineup. Only
 * those with `mcpConfig` can actually be written; `transports` says which
 * server kinds that CLI can run (so a remote-OAuth integration isn't claimed
 * as supported on a CLI that only does stdio).
 */

import os from "os";
import path from "path";

export type ConfigFormat = "json" | "toml";
export type Transport = "stdio" | "http";

export interface ProviderMcpConfig {
  /** Absolute path to the CLI's config file. */
  absPath: string;
  /** ~-tildified for display. */
  displayPath: string;
  format: ConfigFormat;
  /** Server kinds this CLI can actually run. */
  transports: Transport[];
}

export interface McpProvider {
  id: string;
  name: string;
  /** Asset under /public, or undefined → UI falls back to a glyph. */
  iconAsset?: string;
  /** Present → Cabinet can register integrations here. Absent → shown but not selectable. */
  mcpConfig?: ProviderMcpConfig;
}

const HOME = os.homedir();

function tildify(p: string): string {
  return p.startsWith(HOME) ? "~" + p.slice(HOME.length) : p;
}

function cfg(absPath: string, format: ConfigFormat, transports: Transport[]): ProviderMcpConfig {
  return { absPath, displayPath: tildify(absPath), format, transports };
}

/**
 * Config locations are the same ones the read-only discovery route already
 * parses (`api/agents/config/cli-mcp-servers`) plus Cursor's well-known
 * `~/.cursor/mcp.json`. Codex uses TOML; the rest are JSON `mcpServers`.
 */
export const MCP_PROVIDERS: McpProvider[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    iconAsset: "/providers/claude.svg",
    mcpConfig: cfg(path.join(HOME, ".claude.json"), "json", ["stdio", "http"]),
  },
  {
    id: "codex-cli",
    name: "Codex CLI",
    iconAsset: "/providers/openai.png",
    mcpConfig: cfg(path.join(HOME, ".codex", "config.toml"), "toml", ["stdio", "http"]),
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    iconAsset: "/providers/gemini.svg",
    mcpConfig: cfg(path.join(HOME, ".gemini", "settings.json"), "json", ["stdio", "http"]),
  },
  {
    id: "cursor-cli",
    name: "Cursor",
    iconAsset: "/providers/cursor.svg",
    mcpConfig: cfg(path.join(HOME, ".cursor", "mcp.json"), "json", ["stdio", "http"]),
  },
  // Known but no first-class MCP config Cabinet writes — shown for context,
  // not selectable. (If/when these gain a stable MCP config, add mcpConfig.)
  { id: "copilot-cli", name: "GitHub Copilot CLI", iconAsset: "/providers/copilot.svg" },
  { id: "grok-cli", name: "Grok CLI", iconAsset: "/providers/grok.svg" },
  { id: "opencode", name: "OpenCode", iconAsset: "/providers/opencode.svg" },
  { id: "pi", name: "Pi", iconAsset: "/providers/pi.svg" },
];

export function getMcpProvider(id: string): McpProvider | undefined {
  return MCP_PROVIDERS.find((p) => p.id === id);
}

export function isProviderCapable(id: string): boolean {
  return !!getMcpProvider(id)?.mcpConfig;
}

/** Capable providers whose config supports the given transport. */
export function providersSupportingTransport(transport: Transport): McpProvider[] {
  return MCP_PROVIDERS.filter((p) => p.mcpConfig?.transports.includes(transport));
}

/** Default selected environments = every capable provider. */
export function defaultSelectedEnvironments(): string[] {
  return MCP_PROVIDERS.filter((p) => p.mcpConfig).map((p) => p.id);
}
