/**
 * A single inbound WhatsApp message, normalized to a flat, transport-agnostic
 * shape. This is the unit that flows over the in-process bus.
 */
export interface NormalizedMessage {
  /** Which logged-in account received this message. */
  account_id: string;
  /** WhatsApp message id (`key.id`). */
  id: string;
  /** Chat JID — group chats end in `@g.us`, DMs in `@s.whatsapp.net`/`@lid`. */
  chat_jid: string;
  /** True when `chat_jid` is a group. */
  is_group: boolean;
  /** Sender JID (the participant in groups, otherwise the chat). */
  sender: string;
  /** Display name (`pushName`) or the sender's number as a fallback. */
  sender_name: string;
  /** Best-effort text: conversation / extended text / media caption. */
  text: string;
  /** Coarse message kind, for cheap filtering by subscribers. */
  type: "text" | "image" | "video" | "audio" | "document" | "other";
  /** ISO-8601 timestamp derived from `messageTimestamp`. */
  timestamp: string;
  /** True when the logged-in account itself sent the message. */
  from_me: boolean;
}

/** An account the gateway manages. Auth state lives under `<store>/<id>`. */
export interface AccountConfig {
  id: string;
  label?: string;
}

/** Live connection state for an account. */
export type ConnectionStatus = "connecting" | "open" | "close" | "pairing";
