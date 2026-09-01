import type { NormalizedMessage } from "./types";

/**
 * Map a Baileys `messages.upsert` entry to a flat {@link NormalizedMessage},
 * or `null` if it carries no deliverable content (status broadcasts, receipts,
 * key-exchange / protocol envelopes, missing JID).
 *
 * Typed loosely (`any`) on purpose: Baileys' proto types are heavy and this is
 * the one boundary where we read a handful of optional fields off the wire.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMessage(accountId: string, msg: any): NormalizedMessage | null {
  if (!msg || !msg.message) return null;

  const rawJid: string | undefined = msg.key?.remoteJid ?? undefined;
  if (!rawJid || rawJid === "status@broadcast") return null;

  const is_group = rawJid.endsWith("@g.us");
  const { text, type } = extractContent(msg.message);

  // Drop text-less protocol messages (reactions, key distribution, receipts),
  // but keep media (audio/image/etc.) which legitimately have empty text.
  if (!text && type === "other") return null;

  const sender: string = msg.key?.participant || msg.key?.remoteJid || "";
  const sender_name: string = msg.pushName || (sender ? sender.split("@")[0] : "");

  const timestamp = new Date(Number(msg.messageTimestamp ?? 0) * 1000).toISOString();

  return {
    account_id: accountId,
    id: msg.key?.id || "",
    chat_jid: rawJid,
    is_group,
    sender,
    sender_name,
    text,
    type,
    timestamp,
    from_me: Boolean(msg.key?.fromMe),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContent(message: any): {
  text: string;
  type: NormalizedMessage["type"];
} {
  if (message.conversation) {
    return { text: message.conversation, type: "text" };
  }
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, type: "text" };
  }
  if (message.imageMessage) {
    return { text: message.imageMessage.caption || "", type: "image" };
  }
  if (message.videoMessage) {
    return { text: message.videoMessage.caption || "", type: "video" };
  }
  if (message.audioMessage) {
    return { text: "", type: "audio" };
  }
  if (message.documentMessage) {
    return { text: message.documentMessage.caption || "", type: "document" };
  }
  return { text: "", type: "other" };
}
