/**
 * Gateway configuration, read from `.cabinet.env` (0600) via the mtime-cached
 * reader in cabinet-env.ts. Shell env wins over the file (same precedence as
 * loadCabinetEnv) so operators can debug-override without editing the file.
 *
 * isEnabled() is allowlist-fail-closed: a bot token alone does NOT start the
 * gateway — TELEGRAM_ALLOWED_USERS must name at least one numeric user id.
 */

import { readCabinetEnvFile } from "../../src/lib/runtime/cabinet-env";

export interface TelegramGatewayConfig {
  botToken: string | null;
  /** Numeric Telegram user ids allowed to drive Cabinet. Empty = gateway off. */
  allowedUserIds: number[];
  /** Orchestrator slug override (resolution chain in router.ts). */
  defaultAgent: string | null;
  /** Optional extra scoping: only answer in this chat id. */
  allowedChatId: number | null;
}

function envValue(key: string): string | null {
  const shell = process.env[key];
  if (typeof shell === "string" && shell.trim() !== "") return shell.trim();
  const file = readCabinetEnvFile().values[key];
  return typeof file === "string" && file.trim() !== "" ? file.trim() : null;
}

/** Parse "123, 456 789" → [123, 456, 789]; non-numeric entries are dropped. */
export function parseAllowedUsers(raw: string | null): number[] {
  if (!raw) return [];
  const ids = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return Array.from(new Set(ids));
}

export function readTelegramGatewayConfig(): TelegramGatewayConfig {
  const chatIdRaw = envValue("TELEGRAM_CHAT_ID");
  const chatId = chatIdRaw && /^-?\d{5,}$/.test(chatIdRaw) ? Number(chatIdRaw) : null;
  return {
    botToken: envValue("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: parseAllowedUsers(envValue("TELEGRAM_ALLOWED_USERS")),
    defaultAgent: envValue("TELEGRAM_DEFAULT_AGENT"),
    allowedChatId: chatId,
  };
}

export function isGatewayEnabled(cfg: TelegramGatewayConfig): boolean {
  return !!cfg.botToken && cfg.allowedUserIds.length > 0;
}

/** Stable fingerprint so the env watcher can tell "changed" from "touched". */
export function configFingerprint(cfg: TelegramGatewayConfig): string {
  return [
    cfg.botToken ?? "",
    cfg.allowedUserIds.join(","),
    cfg.defaultAgent ?? "",
    cfg.allowedChatId ?? "",
  ].join("|");
}
