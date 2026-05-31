import type { ConversationMeta } from "@/types/conversations";

type ConversationIdentity = Pick<ConversationMeta, "id" | "cabinetPath">;

export function buildConversationInstanceKey(
  conversation: ConversationIdentity
): string {
  return `${conversation.cabinetPath || "__ops__"}::${conversation.id}`;
}

export function appendConversationCabinetPath(
  url: string,
  cabinetPath?: string
): string {
  if (!cabinetPath) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}cabinetPath=${encodeURIComponent(cabinetPath)}`;
}
