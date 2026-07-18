/**
 * Registers / removes an integration's MCP server entry across the user's
 * selected CLI environments — because the CLI (not Cabinet) is the MCP client
 * that connects the server when an agent runs.
 *
 * Safety contract (per provider):
 *   - Only ever touch the single `cabinet-<id>` server key. All other content
 *     is preserved by round-tripping the whole document.
 *   - A parse error THROWS — never clobber a config we couldn't read. A
 *     missing file is created fresh with just our key.
 *   - Atomic temp-write + rename.
 *   - Secrets are NEVER written here. stdio entries carry `${ENVKEY}`
 *     placeholders; the real value lives only in `.cabinet.env` (0600) and is
 *     injected into the CLI subprocess env at spawn.
 *
 * JSON providers (Claude Code, Gemini, Cursor) use `mcpServers`. Codex uses
 * TOML `[mcp_servers.<name>]`; we round-trip via smol-toml. Caveat: TOML
 * comments / exotic formatting are not preserved by parse→stringify — an
 * accepted tradeoff for safe programmatic writes (the alternative, a regex
 * mutator, is far riskier).
 */

import fs from "fs";
import path from "path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { getCabinetEnvSnapshot, readCabinetEnvFile } from "@/lib/runtime/cabinet-env";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { DATA_DIR } from "@/lib/storage/path-utils";
import {
  MCP_PROVIDERS,
  getMcpProvider,
  type McpProvider,
  type ProviderMcpConfig,
} from "./mcp-providers";
import type { CatalogEntry } from "./mcp-catalog";

/**
 * Resolve an entry's `serverEnv` for writing into a CLI config. Values are
 * `${ENVKEY}` placeholders resolved at spawn from .cabinet.env (the real secret
 * never lands here). We DROP any placeholder whose referenced key has no value
 * in .cabinet.env — otherwise an unset *optional* credential would be written
 * as a blank/literal value and could override a server's built-in default. The
 * concrete case: Microsoft 365 on a personal account leaves the Entra creds
 * empty and relies on ms-365-mcp-server's built-in app + device-code login;
 * writing `MS365_MCP_CLIENT_ID=${...}` with no value would break that. Static
 * (non-placeholder) values are always kept.
 */
function resolveServerEnv(
  serverEnv: Record<string, string>,
): Record<string, string> | undefined {
  const values = readCabinetEnvFile().values;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(serverEnv)) {
    const placeholder = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(val);
    if (placeholder) {
      const ref = values[placeholder[1]];
      if (ref === undefined || ref === "") continue; // unset → let the server default
    }
    out[key] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Materialize an entry's auxiliary config file (e.g. Snowflake's
 * `--service-config-file`) to a stable, Cabinet-owned absolute path and return
 * it. Contents are static, secret-free policy. Written only if absent so a user
 * who hand-edits it (e.g. to allow writes) keeps their edits across reconnects.
 */
function materializeConfigFile(cfg: { name: string; contents: string }): string {
  const dir = path.join(DATA_DIR, ".agents", ".config");
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, cfg.name);
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, cfg.contents, "utf8");
  return abs;
}

/**
 * An entry's stdio args plus any `argsWhenCredentialSet` extras whose gating
 * credential currently has a value in `.cabinet.env` (e.g. M365 `--org-mode`,
 * appended only once the user supplies their Entra Client ID).
 */
function resolveArgs(entry: CatalogEntry): string[] | undefined {
  const base = entry.args ? [...entry.args] : undefined;
  const cond = entry.argsWhenCredentialSet;
  if (!cond) return base;
  const val = readCabinetEnvFile().values[cond.credentialKey];
  if (val === undefined || val === "") return base;
  return [...(base ?? []), ...cond.args];
}

/** The server entry written into a CLI config (never contains secrets). */
function buildServerEntry(entry: CatalogEntry): Record<string, unknown> {
  if (entry.transport === "http") {
    // Per-account / bring-your-own remotes (Zapier, Make, ServiceNow, community
    // endpoints) supply the URL as a credential the user pastes; it lands in
    // .cabinet.env and becomes the server URL here.
    let url = entry.url;
    if (!url && entry.urlCredentialKey) {
      url = readCabinetEnvFile().values[entry.urlCredentialKey];
    }
    if (!url) throw new Error(`Catalog entry ${entry.id} is http but has no url`);
    const server: Record<string, unknown> = { type: "http", url };
    // Servers whose auth server lacks Dynamic Client Registration (e.g. Slack)
    // need a pre-registered confidential client. The client id + fixed callback
    // port go into the config's `oauth` block; the secret is registered with the
    // CLI separately (keychain), never written here. Require both the id and
    // secret before writing — the connect route only calls
    // registerConfidentialOAuthClient() (which registers the secret) when both
    // are present, so writing the block on id-alone would persist an `oauth`
    // config whose secret was never registered with the CLI.
    if (entry.oauthClient) {
      const values = readCabinetEnvFile().values;
      const clientId = values[entry.oauthClient.clientIdEnvKey];
      const clientSecret = values[entry.oauthClient.clientSecretEnvKey];
      if (clientId && clientSecret) {
        const oauth: Record<string, unknown> = {
          clientId,
          callbackPort: entry.oauthClient.callbackPort,
        };
        if (entry.oauthClient.scopes) oauth.scopes = entry.oauthClient.scopes;
        server.oauth = oauth;
      }
    }
    return server;
  }
  // Dev bootstrap: a first-party server whose local build exists in the source
  // tree runs directly via `node`, instead of an npm package that may not be
  // published yet. In a packaged build the path is absent → fall through to npx.
  if (entry.localBuild) {
    const local = path.join(PROJECT_ROOT, entry.localBuild);
    if (fs.existsSync(local)) {
      const out: Record<string, unknown> = { command: "node", args: [local] };
      if (entry.serverEnv) {
        const env = resolveServerEnv(entry.serverEnv); // ${ENVKEY} placeholders, unset ones dropped
        if (env) out.env = env;
      }
      return out;
    }
  }
  const out: Record<string, unknown> = { command: entry.command };
  let args = resolveArgs(entry);
  if (args && entry.configFile) {
    // Materialize the aux config file and swap its absolute path in for the token.
    const configPath = materializeConfigFile(entry.configFile);
    args = args.map((a) => a.replaceAll("${CONFIG_FILE}", configPath));
  }
  if (args) out.args = args;
  if (entry.serverEnv) {
    const env = resolveServerEnv(entry.serverEnv); // ${ENVKEY} placeholders, unset ones dropped
    if (env) out.env = env;
  }
  return out;
}

function readDocument(cfg: ProviderMcpConfig): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(cfg.absPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = cfg.format === "toml" ? parseToml(trimmed) : JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    throw new Error(
      `Could not parse ${cfg.displayPath}. Fix or remove it, then retry. Cabinet won't overwrite a config it can't read.`,
    );
  }
}

function writeDocumentAtomic(cfg: ProviderMcpConfig, doc: Record<string, unknown>): void {
  const dir = path.dirname(cfg.absPath);
  fs.mkdirSync(dir, { recursive: true });
  const body =
    cfg.format === "toml" ? stringifyToml(doc) : JSON.stringify(doc, null, 2) + "\n";
  const tmp = path.join(dir, `.cabinet-mcp.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, body, "utf8");
  fs.renameSync(tmp, cfg.absPath);
}

/** `mcpServers` (JSON) vs `mcp_servers` (Codex TOML). */
function serversKey(cfg: ProviderMcpConfig): "mcpServers" | "mcp_servers" {
  return cfg.format === "toml" ? "mcp_servers" : "mcpServers";
}

function getServers(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const cur = doc[key];
  if (cur && typeof cur === "object" && !Array.isArray(cur)) {
    return cur as Record<string, unknown>;
  }
  const fresh: Record<string, unknown> = {};
  doc[key] = fresh;
  return fresh;
}

export interface ProviderWriteResult {
  providerId: string;
  providerName: string;
  ok: boolean;
  /** Set when ok=false. */
  error?: string;
  /** false → this provider can't run this integration's transport. */
  supported: boolean;
}

function capable(provider: McpProvider | undefined): provider is McpProvider & {
  mcpConfig: ProviderMcpConfig;
} {
  return !!provider?.mcpConfig;
}

function transportOk(provider: McpProvider & { mcpConfig: ProviderMcpConfig }, entry: CatalogEntry): boolean {
  return provider.mcpConfig.transports.includes(entry.transport);
}

export function writeEntry(providerId: string, entry: CatalogEntry): ProviderWriteResult {
  const provider = getMcpProvider(providerId);
  const base = { providerId, providerName: provider?.name ?? providerId };
  if (!capable(provider)) {
    return { ...base, ok: false, supported: false, error: "This environment can't host MCP integrations." };
  }
  if (!transportOk(provider, entry)) {
    return {
      ...base,
      ok: false,
      supported: false,
      error: `${provider.name} can't run a ${entry.transport === "http" ? "remote (OAuth)" : "local"} server.`,
    };
  }
  try {
    const doc = readDocument(provider.mcpConfig);
    const key = serversKey(provider.mcpConfig);
    const servers = getServers(doc, key);
    servers[entry.mcpServerName] = buildServerEntry(entry);
    writeDocumentAtomic(provider.mcpConfig, doc);
    return { ...base, ok: true, supported: true };
  } catch (err) {
    return { ...base, ok: false, supported: true, error: err instanceof Error ? err.message : "Write failed" };
  }
}

export function removeEntry(providerId: string, entry: CatalogEntry): ProviderWriteResult {
  const provider = getMcpProvider(providerId);
  const base = { providerId, providerName: provider?.name ?? providerId };
  if (!capable(provider)) return { ...base, ok: true, supported: false };
  try {
    const doc = readDocument(provider.mcpConfig);
    const key = serversKey(provider.mcpConfig);
    const cur = doc[key];
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      const servers = cur as Record<string, unknown>;
      if (entry.mcpServerName in servers) {
        delete servers[entry.mcpServerName];
        writeDocumentAtomic(provider.mcpConfig, doc);
      }
    }
    return { ...base, ok: true, supported: true };
  } catch (err) {
    return { ...base, ok: false, supported: true, error: err instanceof Error ? err.message : "Remove failed" };
  }
}

/** Provider ids whose config currently contains this entry's server. */
export function connectedProvidersForEntry(entry: CatalogEntry): string[] {
  const out: string[] = [];
  for (const provider of MCP_PROVIDERS) {
    if (!capable(provider)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = readDocument(provider.mcpConfig);
    } catch {
      continue; // unreadable → report not-connected rather than throw
    }
    const servers = doc[serversKey(provider.mcpConfig)];
    if (servers && typeof servers === "object" && entry.mcpServerName in (servers as object)) {
      out.push(provider.id);
    }
  }
  return out;
}

/** Per-credential presence (key + masked last4) without leaking the value. */
export function credentialStatus(
  envKeys: string[],
): Record<string, { hasValue: boolean; lastFour: string }> {
  const byKey = new Map(getCabinetEnvSnapshot().map((s) => [s.key, s]));
  const out: Record<string, { hasValue: boolean; lastFour: string }> = {};
  for (const k of envKeys) {
    const s = byKey.get(k);
    out[k] = { hasValue: !!s?.hasValue, lastFour: s?.lastFour ?? "" };
  }
  return out;
}
