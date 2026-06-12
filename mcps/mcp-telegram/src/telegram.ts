/**
 * Telegram Bot API client + safe resolution helpers.
 *
 * We deliberately use the **Bot API** (a bot token from @BotFather), not MTProto
 * (full user-account). A bot only ever sees chats it was explicitly added to —
 * the safe model that mirrors our Discord server. No user-account impersonation.
 *
 * Two safety levers:
 *   1. Chat scoping — when TELEGRAM_CHAT_ID is set, every call refuses any other
 *      chat (defense-in-depth for autonomous agents).
 *   2. Destructive admin (ban/pin) is only registered when TELEGRAM_ALLOW_ADMIN
 *      is enabled.
 */

const BASE = "https://api.telegram.org";

export class ToolError extends Error {}

export interface TelegramContext {
  token: string;
  /** When set, all operations are pinned to this chat (id or @username). */
  allowedChatId?: string;
  adminEnabled: boolean;
  botUsername?: string;
}

export interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  description?: string;
}
export interface TgUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
}
export interface TgMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: TgChat;
  from?: TgUser;
  sender_chat?: TgChat;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** POST a Bot API method; throws a clean ToolError on failure. Never logs the token. */
export async function callApi<T>(
  ctx: TelegramContext,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/bot${ctx.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    });
  } catch {
    throw new ToolError("Couldn't reach Telegram — check your connection.");
  }
  let json: TgResponse<T>;
  try {
    json = (await res.json()) as TgResponse<T>;
  } catch {
    throw new ToolError(`Telegram ${method}: unreadable response (${res.status}).`);
  }
  if (!json.ok) {
    if (json.error_code === 401) throw new ToolError("Invalid bot token.");
    throw new ToolError(json.description || `Telegram ${method} failed (${json.error_code ?? res.status}).`);
  }
  return json.result as T;
}

/** Accept a numeric chat id (groups are negative) or an @username; else undefined. */
export function sanitizeChatId(v: string | undefined): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  if (/^-?\d{5,}$/.test(t) || /^@[A-Za-z0-9_]{4,}$/.test(t)) return t;
  return undefined;
}

/** Resolve the target chat, enforcing scoping when TELEGRAM_CHAT_ID is set. */
export function resolveChat(ctx: TelegramContext, ref?: string): string {
  const wanted = (ref && ref.trim()) || ctx.allowedChatId;
  if (!wanted) {
    throw new ToolError(
      "No chat specified — pass `chat` (numeric id or @username) or set TELEGRAM_CHAT_ID.",
    );
  }
  if (ctx.allowedChatId && wanted !== ctx.allowedChatId) {
    throw new ToolError(
      `This server is scoped to chat ${ctx.allowedChatId}; refusing to act on ${wanted}.`,
    );
  }
  return wanted;
}

export function explainError(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected Telegram error.";
}
