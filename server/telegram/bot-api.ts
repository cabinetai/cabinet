/**
 * Thin Telegram Bot API client for the inbound remote-control gateway.
 *
 * Mirrors the callApi pattern from mcps/mcp-telegram/src/telegram.ts (that
 * package ships standalone via npx, so a small copy beats a shared dep).
 * Bot API only — never MTProto. The token is never logged.
 */

import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

const BASE = "https://api.telegram.org";

export class BotApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly retryAfterSec?: number
  ) {
    super(message);
  }
}

/** 409 = another getUpdates consumer / webhook owns this bot. */
export function isConflictError(err: unknown): boolean {
  return err instanceof BotApiError && err.errorCode === 409;
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  username?: string;
  first_name?: string;
  title?: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TgDocument {
  file_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TgMessage {
  message_id: number;
  date: number; // unix seconds
  text?: string;
  caption?: string;
  chat: TgChat;
  from?: TgUser;
  document?: TgDocument;
  photo?: TgPhotoSize[];
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export interface TgFile {
  file_id: string;
  file_size?: number;
  /** Relative path on Telegram's file server, valid ~1 hour. */
  file_path?: string;
}

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export class BotApi {
  constructor(private readonly token: string) {}

  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
      });
    } catch {
      throw new BotApiError(`Telegram ${method}: network error.`);
    }
    let json: TgResponse<T>;
    try {
      json = (await res.json()) as TgResponse<T>;
    } catch {
      throw new BotApiError(`Telegram ${method}: unreadable response (${res.status}).`);
    }
    if (!json.ok) {
      throw new BotApiError(
        json.description || `Telegram ${method} failed (${json.error_code ?? res.status}).`,
        json.error_code ?? res.status,
        json.parameters?.retry_after
      );
    }
    return json.result as T;
  }

  getMe(): Promise<TgUser> {
    return this.call<TgUser>("getMe");
  }

  /**
   * Long-poll for updates. timeoutSec=0 makes it a non-blocking drain (used
   * for the boot fast-forward); the steady-state loop uses ~50s.
   */
  getUpdates(offset: number | undefined, timeoutSec: number): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>("getUpdates", {
      ...(offset !== undefined ? { offset } : {}),
      timeout: timeoutSec,
      limit: 100,
      allowed_updates: ["message"],
    });
  }

  async sendMessage(
    chatId: number,
    text: string,
    opts?: { parseMode?: "MarkdownV2"; disableNotification?: boolean }
  ): Promise<TgMessage> {
    return this.call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
      ...(opts?.disableNotification ? { disable_notification: true } : {}),
    });
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts?: { parseMode?: "MarkdownV2" }
  ): Promise<void> {
    await this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
    });
  }

  async sendChatAction(chatId: number, action: "typing" | "upload_document"): Promise<void> {
    await this.call("sendChatAction", { chat_id: chatId, action });
  }

  getFile(fileId: string): Promise<TgFile> {
    return this.call<TgFile>("getFile", { file_id: fileId });
  }

  /** Download a Bot-API file (≤20 MB per Telegram's getFile cap) to disk. */
  async downloadFile(filePath: string, destAbsPath: string): Promise<void> {
    const url = `${BASE}/file/bot${this.token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new BotApiError(`Telegram file download failed (${res.status}).`);
    }
    fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });
    await pipeline(
      // Node 18+ fetch returns a web stream; convert for fs pipeline.
      (await import("stream")).Readable.fromWeb(res.body as import("stream/web").ReadableStream),
      fs.createWriteStream(destAbsPath)
    );
  }
}
