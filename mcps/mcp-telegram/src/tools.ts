/**
 * Tool surface — agent-shaped, safe-by-default. Destructive admin tools are
 * registered ONLY when TELEGRAM_ALLOW_ADMIN is enabled.
 *
 * Bot API note: bots cannot read arbitrary chat history. `read_recent` returns
 * updates Telegram has queued for the bot (messages sent after it joined), not a
 * backfill. For full history you'd need MTProto (user-account) — out of scope by
 * design.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type TelegramContext,
  type TgChat,
  type TgMessage,
  type TgUpdate,
  callApi,
  resolveChat,
  explainError,
} from "./telegram.js";
import { formatChat, formatUpdates } from "./format.js";

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}
function fail(err: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${explainError(err)}` }], isError: true };
}

export function registerTools(server: McpServer, ctx: TelegramContext): void {
  // ---- Read ---------------------------------------------------------------

  server.registerTool(
    "get_chat",
    {
      title: "Get chat info",
      description: "Look up a chat (group/channel) the bot is in: title, type, id, description.",
      inputSchema: {
        chat: z.string().optional().describe("Chat id or @username. Omit to use the configured chat."),
      },
    },
    async ({ chat }) => {
      try {
        const c = await callApi<TgChat>(ctx, "getChat", { chat_id: resolveChat(ctx, chat) });
        return ok(formatChat(c));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "read_recent",
    {
      title: "Read recent messages",
      description:
        "Return recent messages Telegram has delivered to the bot. NOTE: the Bot API can't read older history — only messages sent after the bot joined.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("How many recent updates (max 100)."),
      },
    },
    async ({ limit }) => {
      try {
        const updates = await callApi<TgUpdate[]>(ctx, "getUpdates", {
          limit,
          timeout: 0,
          allowed_updates: ["message", "channel_post"],
        });
        return ok(formatUpdates(updates));
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ---- Post ---------------------------------------------------------------

  server.registerTool(
    "send_message",
    {
      title: "Send message",
      description: "Send a text message to a chat, optionally as a reply or into a forum topic/thread.",
      inputSchema: {
        chat: z.string().optional().describe("Chat id or @username. Omit to use the configured chat."),
        text: z.string().min(1).max(4096).describe("Message text (max 4096 chars)."),
        replyToMessageId: z.number().int().optional().describe("Reply to this message id."),
        messageThreadId: z.number().int().optional().describe("Forum topic / thread id to post into."),
      },
    },
    async ({ chat, text, replyToMessageId, messageThreadId }) => {
      try {
        const sent = await callApi<TgMessage>(ctx, "sendMessage", {
          chat_id: resolveChat(ctx, chat),
          text,
          ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {}),
          ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
        });
        return ok(`Sent message ${sent.message_id} to chat ${sent.chat?.id}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "edit_message",
    {
      title: "Edit message",
      description: "Edit the text of a message the bot sent.",
      inputSchema: {
        chat: z.string().optional(),
        messageId: z.number().int().describe("Message id to edit."),
        text: z.string().min(1).max(4096).describe("New message text."),
      },
    },
    async ({ chat, messageId, text }) => {
      try {
        await callApi(ctx, "editMessageText", { chat_id: resolveChat(ctx, chat), message_id: messageId, text });
        return ok(`Edited message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "delete_message",
    {
      title: "Delete message",
      description:
        "Delete a message. Bots can always delete their own messages, and others only with admin rights (Telegram enforces this).",
      inputSchema: {
        chat: z.string().optional(),
        messageId: z.number().int().describe("Message id to delete."),
      },
    },
    async ({ chat, messageId }) => {
      try {
        await callApi(ctx, "deleteMessage", { chat_id: resolveChat(ctx, chat), message_id: messageId });
        return ok(`Deleted message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "add_reaction",
    {
      title: "Add reaction",
      description: "React to a message with an emoji (Telegram allows a fixed set of reaction emoji).",
      inputSchema: {
        chat: z.string().optional(),
        messageId: z.number().int().describe("Target message id."),
        emoji: z.string().describe("Reaction emoji, e.g. 👍 ❤️ 🔥."),
      },
    },
    async ({ chat, messageId, emoji }) => {
      try {
        await callApi(ctx, "setMessageReaction", {
          chat_id: resolveChat(ctx, chat),
          message_id: messageId,
          reaction: [{ type: "emoji", emoji }],
        });
        return ok(`Reacted ${emoji} to message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ---- Admin (gated) ------------------------------------------------------

  if (!ctx.adminEnabled) return;

  server.registerTool(
    "pin_message",
    {
      title: "Pin message",
      description: "[admin] Pin a message in the chat.",
      inputSchema: {
        chat: z.string().optional(),
        messageId: z.number().int().describe("Message id to pin."),
      },
    },
    async ({ chat, messageId }) => {
      try {
        await callApi(ctx, "pinChatMessage", { chat_id: resolveChat(ctx, chat), message_id: messageId });
        return ok(`Pinned message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "ban_member",
    {
      title: "Ban member",
      description: "[admin] Ban a user from the chat.",
      inputSchema: {
        chat: z.string().optional(),
        userId: z.number().int().describe("User id to ban."),
      },
    },
    async ({ chat, userId }) => {
      try {
        await callApi(ctx, "banChatMember", { chat_id: resolveChat(ctx, chat), user_id: userId });
        return ok(`Banned user ${userId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
