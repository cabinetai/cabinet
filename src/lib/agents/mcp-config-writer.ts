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
import { getCabinetEnvSnapshot } from "@/lib/runtime/cabinet-env";
import {
  MCP_PROVIDERS,
  getMcpProvider,
  type McpProvider,
  type ProviderMcpConfig,
} from "./mcp-providers";
import type { CatalogEntry } from "./mcp-catalog";

/** The server entry written into a CLI config (never contains secrets). */
function buildServerEntry(entry: CatalogEntry): Record<string, unknown> {
  if (entry.transport === "http") {
    if (!entry.url) throw new Error(`Catalog entry ${entry.id} is http but has no url`);
    return { type: "http", url: entry.url };
  }
  const out: Record<string, unknown> = { command: entry.command };
  if (entry.args) out.args = entry.args;
  if (entry.serverEnv) out.env = { ...entry.serverEnv }; // ${ENVKEY} placeholders only
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
      `Could not parse ${cfg.displayPath}. Fix or remove it, then retry — Cabinet won't overwrite a config it can't read.`,
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
