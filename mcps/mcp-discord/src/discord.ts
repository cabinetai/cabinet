/**
 * Discord client setup + safe resolution helpers.
 *
 * Two safety levers live here:
 *   1. Guild scoping — when DISCORD_GUILD_ID is set, every resolver refuses to
 *      act on any other guild the bot happens to share. Defense-in-depth: even
 *      if an agent is confused or prompt-injected, it can't reach servers the
 *      operator didn't intend.
 *   2. Minimal intents — Guilds + GuildMessages + MessageContent only. We do
 *      NOT request the GuildMembers privileged intent, so there is no member
 *      enumeration surface at all.
 */

import {
  Client,
  Events,
  GatewayIntentBits,
  ChannelType,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
  type ThreadChannel,
  type NewsChannel,
} from "discord.js";

/** A channel we can both read history from and post into. */
export type WritableTextChannel = TextChannel | NewsChannel | ThreadChannel;

/** Thrown by resolvers/handlers; surfaced to the agent as a clean tool error. */
export class ToolError extends Error {}

export interface DiscordContext {
  client: Client;
  /** When set, all operations are pinned to this guild. */
  allowedGuildId?: string;
  /** Destructive admin tools are only registered when this is true. */
  adminEnabled: boolean;
}

/** Log in and resolve once the gateway is ready. */
export async function createClient(token: string): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const ready = new Promise<void>((resolve, reject) => {
    client.once(Events.ClientReady, () => resolve());
    client.once(Events.Error, reject);
  });

  try {
    await client.login(token);
  } catch (err) {
    throw new ToolError(
      "Discord login failed. Check that DISCORD_TOKEN is a valid bot token " +
        "(Developer Portal → Bot → Reset Token).",
    );
  }
  await ready;
  return client;
}

/**
 * Resolve the guild a tool should act on:
 *   explicit arg → DISCORD_GUILD_ID → the sole guild the bot is in → error.
 * Enforces guild scoping when DISCORD_GUILD_ID is configured.
 */
export async function resolveGuild(ctx: DiscordContext, guildId?: string): Promise<Guild> {
  const wanted = guildId ?? ctx.allowedGuildId;

  if (ctx.allowedGuildId && wanted !== ctx.allowedGuildId) {
    throw new ToolError(
      `This server is scoped to guild ${ctx.allowedGuildId}; refusing to act on ${wanted}.`,
    );
  }

  if (wanted) {
    try {
      return await ctx.client.guilds.fetch(wanted);
    } catch {
      throw new ToolError(`Guild ${wanted} not found, or the bot is not a member of it.`);
    }
  }

  const guilds = ctx.client.guilds.cache;
  if (guilds.size === 1) return guilds.first()!;
  if (guilds.size === 0) {
    throw new ToolError("The bot is not in any server yet. Invite it first, then retry.");
  }
  throw new ToolError(
    `The bot is in ${guilds.size} servers — pass guildId to choose one ` +
      "(or set DISCORD_GUILD_ID to pin this server to a single guild).",
  );
}

function isWritableText(ch: GuildBasedChannel | null | undefined): boolean {
  return (
    !!ch &&
    (ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement ||
      ch.type === ChannelType.PublicThread ||
      ch.type === ChannelType.PrivateThread ||
      ch.type === ChannelType.AnnouncementThread)
  );
}

/**
 * Resolve a channel reference (id, `#name`, or bare `name`) to a readable +
 * writable text channel within the allowed guild.
 */
export async function resolveTextChannel(
  ctx: DiscordContext,
  ref: string,
  guildId?: string,
): Promise<WritableTextChannel> {
  const guild = await resolveGuild(ctx, guildId);
  const cleaned = ref.trim().replace(/^#/, "").replace(/^<#(\d+)>$/, "$1");

  // By id first.
  if (/^\d{15,21}$/.test(cleaned)) {
    const byId = await guild.channels.fetch(cleaned).catch(() => null);
    if (isWritableText(byId)) return byId as WritableTextChannel;
    if (byId) throw new ToolError(`Channel "${ref}" is not a text channel I can post in.`);
    throw new ToolError(`No channel with id ${cleaned} in ${guild.name}.`);
  }

  // By name (ensure cache is warm).
  if (guild.channels.cache.size === 0) await guild.channels.fetch().catch(() => null);
  const lower = cleaned.toLowerCase();
  const match = guild.channels.cache.find(
    (c) => isWritableText(c) && c.name.toLowerCase() === lower,
  );
  if (match) return match as WritableTextChannel;

  throw new ToolError(
    `No text channel named "${cleaned}" in ${guild.name}. Use list_channels to see options.`,
  );
}

/** Map common Discord API failures to actionable guidance. */
export function explainDiscordError(err: unknown): string {
  if (err instanceof ToolError) return err.message;
  const code = (err as { code?: number })?.code;
  switch (code) {
    case 50001:
      return "Missing Access — the bot can't see that channel. Check its role/channel permissions.";
    case 50013:
      return "Missing Permissions — grant the bot the permission this action needs (e.g. Send Messages, Manage Messages).";
    case 10003:
      return "Unknown Channel — it may have been deleted or the id is wrong.";
    case 10008:
      return "Unknown Message — wrong message id, or it was deleted.";
    case 50035:
      return "Invalid form body — a field (e.g. message content) was empty or too long.";
    default:
      return err instanceof Error ? err.message : "Unexpected Discord error.";
  }
}
