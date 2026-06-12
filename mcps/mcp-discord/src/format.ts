/**
 * LLM-friendly text rendering. The community Discord servers hand agents raw
 * Discord API JSON; we return compact transcripts an agent can reason over
 * directly, while still surfacing the ids needed for follow-up actions.
 */

import type { Collection, Message, Guild, GuildBasedChannel } from "discord.js";
import { ChannelType } from "discord.js";

function clip(text: string, max = 500): string {
  const oneLine = text.replace(/\s*\n\s*/g, " ⏎ ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

function hhmm(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** One message → `[HH:MM] author: text  (id: …)` with attachment/embed notes. */
export function formatMessage(msg: Message): string {
  const author = msg.author?.username ?? "unknown";
  const parts: string[] = [];
  if (msg.content) parts.push(clip(msg.content));
  if (msg.attachments.size > 0) parts.push(`[${msg.attachments.size} attachment(s)]`);
  if (msg.embeds.length > 0) parts.push(`[${msg.embeds.length} embed(s)]`);
  if (parts.length === 0) parts.push("[no text]");
  return `[${hhmm(msg.createdAt)} UTC] ${author}: ${parts.join(" ")}  (id: ${msg.id})`;
}

/** A fetched batch → oldest-first transcript. */
export function formatTranscript(messages: Collection<string, Message>): string {
  const ordered = [...messages.values()].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  );
  if (ordered.length === 0) return "(no messages)";
  return ordered.map(formatMessage).join("\n");
}

const CHANNEL_KIND: Partial<Record<ChannelType, string>> = {
  [ChannelType.GuildText]: "text",
  [ChannelType.GuildAnnouncement]: "announcement",
  [ChannelType.GuildVoice]: "voice",
  [ChannelType.GuildForum]: "forum",
  [ChannelType.GuildStageVoice]: "stage",
  [ChannelType.GuildCategory]: "category",
};

export function formatChannelList(channels: GuildBasedChannel[]): string {
  const rows = channels
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const kind = CHANNEL_KIND[c.type] ?? "other";
      const topic =
        "topic" in c && typeof c.topic === "string" && c.topic ? ` — ${clip(c.topic, 80)}` : "";
      return `#${c.name} (${kind}, id: ${c.id})${topic}`;
    });
  return rows.length ? rows.join("\n") : "(no channels)";
}

export function formatGuildInfo(guild: Guild): string {
  const channels = guild.channels.cache;
  const counts = new Map<string, number>();
  for (const c of channels.values()) {
    const kind = CHANNEL_KIND[c.type] ?? "other";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()].map(([k, n]) => `${n} ${k}`).join(", ");
  return [
    `Server: ${guild.name} (id: ${guild.id})`,
    `Members (approx): ${guild.memberCount}`,
    `Channels: ${breakdown || "none cached"}`,
    `Roles: ${guild.roles.cache.size}`,
  ].join("\n");
}

/** Stable, clickable link to a posted/edited message. */
export function messageLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}
