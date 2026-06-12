/** LLM-friendly rendering of Telegram objects. */

import type { TgChat, TgMessage, TgUpdate } from "./telegram.js";

export function formatChat(chat: TgChat): string {
  const name = chat.title || chat.username || chat.first_name || String(chat.id);
  const lines = [`Chat: ${name} (id: ${chat.id}, type: ${chat.type})`];
  if (chat.description) lines.push(`About: ${chat.description.replace(/\s+/g, " ").slice(0, 200)}`);
  return lines.join("\n");
}

function hhmm(unixSeconds: number): string {
  const d = new Date((unixSeconds ?? 0) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function formatMessage(m: TgMessage): string {
  const who = m.from?.username || m.from?.first_name || m.sender_chat?.title || "unknown";
  const text = (m.text || m.caption || "[non-text message]").replace(/\s+/g, " ").slice(0, 500);
  return `[${hhmm(m.date)} UTC] ${who}: ${text}  (msg ${m.message_id} · chat ${m.chat?.id})`;
}

export function formatUpdates(updates: TgUpdate[]): string {
  const msgs = updates.map((u) => u.message ?? u.channel_post).filter((m): m is TgMessage => !!m);
  if (msgs.length === 0) {
    return "(no recent messages delivered to the bot — the Bot API only sees messages sent after the bot joined; it can't read older history)";
  }
  return msgs.map(formatMessage).join("\n");
}
