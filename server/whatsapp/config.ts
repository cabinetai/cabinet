/**
 * WhatsApp gateway configuration, read from `.cabinet.env` (0600) via the
 * mtime-cached reader in cabinet-env.ts. Shell env wins over the file (same
 * precedence as loadCabinetEnv) so operators can debug-override without
 * editing the file.
 *
 * The gateway is off unless WHATSAPP_ACCOUNTS names at least one account.
 * The connection is read-only by construction (no send path), so there is no
 * allowlist to configure — nothing inbound can drive Cabinet.
 */

import { readCabinetEnvFile } from "../../src/lib/runtime/cabinet-env";
import type { AccountConfig } from "./types";

export interface WhatsAppGatewayConfig {
  /** Accounts to log in, parsed from WHATSAPP_ACCOUNTS. Empty = gateway off. */
  accounts: AccountConfig[];
  /** Channel board messages are posted to (WHATSAPP_CHANNEL, default "whatsapp"). */
  channel: string;
  /** Include the account's own outgoing messages (WHATSAPP_INCLUDE_FROM_ME=1). */
  includeFromMe: boolean;
}

function envValue(key: string): string | null {
  const shell = process.env[key];
  if (typeof shell === "string" && shell.trim() !== "") return shell.trim();
  const file = readCabinetEnvFile().values[key];
  return typeof file === "string" && file.trim() !== "" ? file.trim() : null;
}

/**
 * Parse `WHATSAPP_ACCOUNTS`: comma-separated `id` or `id:Label` entries, e.g.
 * `personal, biz:Store front`. Ids are slugified defensively (they become
 * directory names under the auth store); duplicates keep the first entry.
 */
export function parseAccounts(raw: string | null): AccountConfig[] {
  if (!raw) return [];
  const out: AccountConfig[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const sep = entry.indexOf(":");
    const idRaw = sep === -1 ? entry : entry.slice(0, sep);
    const label = sep === -1 ? undefined : entry.slice(sep + 1).trim() || undefined;
    const id = idRaw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(label ? { id, label } : { id });
  }
  return out;
}

export function readWhatsAppGatewayConfig(): WhatsAppGatewayConfig {
  return {
    accounts: parseAccounts(envValue("WHATSAPP_ACCOUNTS")),
    channel: envValue("WHATSAPP_CHANNEL") ?? "whatsapp",
    includeFromMe: envValue("WHATSAPP_INCLUDE_FROM_ME") === "1",
  };
}

export function isGatewayEnabled(cfg: WhatsAppGatewayConfig): boolean {
  return cfg.accounts.length > 0;
}

/** Stable fingerprint so the env watcher can tell "changed" from "touched". */
export function configFingerprint(cfg: WhatsAppGatewayConfig): string {
  return [
    cfg.accounts.map((a) => `${a.id}:${a.label ?? ""}`).join(","),
    cfg.channel,
    cfg.includeFromMe ? "1" : "0",
  ].join("|");
}
