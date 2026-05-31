import type { ConversationStatus, ConversationTrigger } from "@/types/conversations";

export interface ConversationNotificationIdentityLike {
  id: string;
  cabinetPath?: string;
  status: ConversationStatus;
}

export function isTerminalConversationStatus(status: ConversationStatus): boolean {
  return status === "completed" || status === "failed";
}

export function shouldEnqueueConversationNotification(
  previousStatus: ConversationStatus,
  nextStatus: ConversationStatus
): boolean {
  return !isTerminalConversationStatus(previousStatus) && isTerminalConversationStatus(nextStatus);
}

// Only scheduled/background starts toast. Manual runs already render the
// transcript in the foreground, so an extra toast would be noise.
export function shouldEnqueueConversationStart(trigger: ConversationTrigger): boolean {
  return trigger !== "manual";
}

export function buildConversationNotificationIdentity(
  notification: ConversationNotificationIdentityLike
): string {
  return `${notification.cabinetPath || "__ops__"}::${notification.id}::${notification.status}`;
}

export function dedupeConversationNotifications<T extends ConversationNotificationIdentityLike>(
  notifications: T[]
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const notification of notifications) {
    const key = buildConversationNotificationIdentity(notification);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(notification);
  }

  return deduped;
}
