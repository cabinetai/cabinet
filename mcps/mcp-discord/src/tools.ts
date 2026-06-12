/**
 * Tool surface. Designed for autonomous agents, not human-driven chat clients:
 * a small, predictable set of read/post/thread tools, with destructive admin
 * actions registered ONLY when DISCORD_ALLOW_ADMIN is enabled.
 *
 * Every handler funnels failures through `fail()` so the agent gets actionable
 * guidance instead of a raw stack trace, and never sees the bot token.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type DiscordContext,
  type WritableTextChannel,
  ToolError,
  resolveGuild,
  resolveTextChannel,
  explainDiscordError,
} from "./discord.js";
import {
  formatTranscript,
  formatChannelList,
  formatGuildInfo,
  formatMessage,
  messageLink,
} from "./format.js";

function ok(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(err: unknown): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${explainDiscordError(err)}` }], isError: true };
}

async function fetchMessage(
  ctx: DiscordContext,
  channelRef: string,
  messageId: string,
  guildId?: string,
) {
  const channel = await resolveTextChannel(ctx, channelRef, guildId);
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) throw new ToolError(`No message ${messageId} in #${channel.name}.`);
  return { channel, message };
}

export function registerTools(server: McpServer, ctx: DiscordContext): void {
  const botId = () => ctx.client.user?.id;

  // ---- Read ---------------------------------------------------------------

  server.registerTool(
    "list_channels",
    {
      title: "List channels",
      description:
        "List the text, announcement, forum and voice channels in a Discord server, with their ids.",
      inputSchema: {
        guildId: z.string().optional().describe("Server id. Omit to use the configured/only server."),
      },
    },
    async ({ guildId }) => {
      try {
        const guild = await resolveGuild(ctx, guildId);
        await guild.channels.fetch().catch(() => null);
        return ok(formatChannelList([...guild.channels.cache.values()]));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "read_messages",
    {
      title: "Read messages",
      description: "Read recent messages from a channel as a chronological transcript.",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        limit: z.number().int().min(1).max(100).default(20).describe("How many recent messages (max 100)."),
        before: z.string().optional().describe("Only messages before this message id."),
        after: z.string().optional().describe("Only messages after this message id."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, limit, before, after, guildId }) => {
      try {
        const ch = await resolveTextChannel(ctx, channel, guildId);
        const messages = await ch.messages.fetch({ limit, before, after });
        return ok(`#${ch.name} — ${messages.size} message(s):\n${formatTranscript(messages)}`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "find_messages",
    {
      title: "Find messages",
      description:
        "Scan a channel's recent messages and return those matching a text query and/or author. " +
        "Note: Discord exposes no bot-accessible search, so this filters a recent window (not the full history).",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        query: z.string().optional().describe("Case-insensitive substring to match in message content."),
        author: z.string().optional().describe("Case-insensitive substring to match against the author's username."),
        limit: z.number().int().min(1).max(100).default(50).describe("Size of the recent window to scan (max 100)."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, query, author, limit, guildId }) => {
      try {
        const ch = await resolveTextChannel(ctx, channel, guildId);
        const messages = await ch.messages.fetch({ limit });
        const q = query?.toLowerCase();
        const a = author?.toLowerCase();
        const hits = [...messages.values()].filter((m) => {
          const matchesQ = !q || m.content.toLowerCase().includes(q);
          const matchesA = !a || (m.author?.username ?? "").toLowerCase().includes(a);
          return matchesQ && matchesA;
        });
        hits.sort((x, y) => x.createdTimestamp - y.createdTimestamp);
        const body = hits.length ? hits.map(formatMessage).join("\n") : "(no matches in the scanned window)";
        return ok(`#${ch.name} — ${hits.length} match(es) in last ${messages.size}:\n${body}`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_server_info",
    {
      title: "Get server info",
      description: "Summarize a server: name, member count, channel breakdown, role count.",
      inputSchema: { guildId: z.string().optional() },
    },
    async ({ guildId }) => {
      try {
        const guild = await resolveGuild(ctx, guildId);
        await guild.channels.fetch().catch(() => null);
        return ok(formatGuildInfo(guild));
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
      description: "Post a message to a channel, optionally as a reply to an existing message.",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        content: z.string().min(1).max(2000).describe("Message text (max 2000 chars)."),
        replyToMessageId: z.string().optional().describe("Reply to this message id."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, content, replyToMessageId, guildId }) => {
      try {
        const ch = await resolveTextChannel(ctx, channel, guildId);
        const sent = await ch.send({
          content,
          reply: replyToMessageId
            ? { messageReference: replyToMessageId, failIfNotExists: false }
            : undefined,
        });
        return ok(`Sent to #${ch.name}: ${messageLink(ch.guildId, ch.id, sent.id)}`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_thread",
    {
      title: "Create thread",
      description:
        "Start a thread in a channel (optionally branching off an existing message) and optionally post a first message into it.",
      inputSchema: {
        channel: z.string().describe("Parent channel id, #name, or name."),
        name: z.string().min(1).max(100).describe("Thread name."),
        message: z.string().max(2000).optional().describe("Optional first message to post in the new thread."),
        fromMessageId: z.string().optional().describe("Branch the thread off this existing message id."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, name, message, fromMessageId, guildId }) => {
      try {
        const ch = await resolveTextChannel(ctx, channel, guildId);
        let thread;
        if (fromMessageId) {
          const parent = await ch.messages.fetch(fromMessageId).catch(() => null);
          if (!parent) throw new ToolError(`No message ${fromMessageId} in #${ch.name}.`);
          thread = await parent.startThread({ name });
        } else {
          if (!("threads" in ch)) throw new ToolError(`#${ch.name} can't host threads.`);
          thread = await (ch as WritableTextChannel & { threads: { create: Function } }).threads.create({
            name,
          });
        }
        if (message) await thread.send(message);
        return ok(`Created thread "${name}" (id: ${thread.id}) in #${ch.name}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "add_reaction",
    {
      title: "Add reaction",
      description: "React to a message with an emoji (unicode like 👍 or a custom emoji as name:id).",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        messageId: z.string().describe("Target message id."),
        emoji: z.string().describe("Unicode emoji, or custom emoji as name:id."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, messageId, emoji, guildId }) => {
      try {
        const { message } = await fetchMessage(ctx, channel, messageId, guildId);
        await message.react(emoji);
        return ok(`Reacted ${emoji} to message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "edit_message",
    {
      title: "Edit message",
      description: "Edit a message. Discord only permits editing the bot's own messages.",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        messageId: z.string().describe("Message id to edit."),
        content: z.string().min(1).max(2000).describe("New message text."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, messageId, content, guildId }) => {
      try {
        const { message } = await fetchMessage(ctx, channel, messageId, guildId);
        if (message.author?.id !== botId()) {
          throw new ToolError("Can only edit the bot's own messages.");
        }
        await message.edit(content);
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
        "Delete a message authored by the bot. Deleting other users' messages requires admin mode (DISCORD_ALLOW_ADMIN).",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        messageId: z.string().describe("Message id to delete."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, messageId, guildId }) => {
      try {
        const { message } = await fetchMessage(ctx, channel, messageId, guildId);
        if (message.author?.id !== botId() && !ctx.adminEnabled) {
          throw new ToolError(
            "Refusing to delete another user's message. Enable admin mode (DISCORD_ALLOW_ADMIN=1) to allow this.",
          );
        }
        await message.delete();
        return ok(`Deleted message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ---- Admin (gated) ------------------------------------------------------

  if (!ctx.adminEnabled) return;

  server.registerTool(
    "delete_any_message",
    {
      title: "Delete any message",
      description: "[admin] Delete any message in a channel, regardless of author.",
      inputSchema: {
        channel: z.string().describe("Channel id, #name, or name."),
        messageId: z.string().describe("Message id to delete."),
        guildId: z.string().optional(),
      },
    },
    async ({ channel, messageId, guildId }) => {
      try {
        const { message } = await fetchMessage(ctx, channel, messageId, guildId);
        await message.delete();
        return ok(`Deleted message ${messageId}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "kick_member",
    {
      title: "Kick member",
      description: "[admin] Remove a member from the server.",
      inputSchema: {
        userId: z.string().describe("User id to kick."),
        reason: z.string().optional().describe("Audit-log reason."),
        guildId: z.string().optional(),
      },
    },
    async ({ userId, reason, guildId }) => {
      try {
        const guild = await resolveGuild(ctx, guildId);
        await guild.members.kick(userId, reason);
        return ok(`Kicked ${userId} from ${guild.name}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "ban_member",
    {
      title: "Ban member",
      description: "[admin] Ban a user from the server, optionally purging their recent messages.",
      inputSchema: {
        userId: z.string().describe("User id to ban."),
        reason: z.string().optional().describe("Audit-log reason."),
        deleteMessageSeconds: z
          .number()
          .int()
          .min(0)
          .max(604800)
          .optional()
          .describe("Purge messages from the last N seconds (0–604800)."),
        guildId: z.string().optional(),
      },
    },
    async ({ userId, reason, deleteMessageSeconds, guildId }) => {
      try {
        const guild = await resolveGuild(ctx, guildId);
        await guild.bans.create(userId, { reason, deleteMessageSeconds });
        return ok(`Banned ${userId} from ${guild.name}.`);
      } catch (err) {
        return fail(err);
      }
    },
  );
}
