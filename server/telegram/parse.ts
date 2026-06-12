/**
 * Pure parsing helpers for the Telegram gateway — kept dependency-free so
 * unit tests can import them without dragging in the conversation runner.
 */

import type { TgUpdate } from "./bot-api";

/** Updates older than this at boot are dropped, not executed (PRD §15). */
export const BOOT_BACKLOG_MAX_AGE_MS = 5 * 60 * 1000;

/** `@slug rest of message` → { slug, rest }; null when not an @-message. */
export function parseAtMention(text: string): { slug: string; rest: string } | null {
  const m = /^@([a-z0-9][a-z0-9_-]*)\s+(\S[\s\S]*)$/i.exec(text);
  return m ? { slug: m[1].toLowerCase(), rest: m[2].trim() } : null;
}

/**
 * Split a boot backlog into fresh updates (process) and a stale count (drop).
 * Telegram queues updates ~24h while the daemon is down; executing day-old
 * commands as agent runs on boot would be a nasty surprise.
 */
export function splitBootBacklog(
  updates: TgUpdate[],
  nowMs: number,
  maxAgeMs = BOOT_BACKLOG_MAX_AGE_MS
): { fresh: TgUpdate[]; staleCount: number } {
  const fresh: TgUpdate[] = [];
  let staleCount = 0;
  for (const u of updates) {
    const dateMs = (u.message?.date ?? 0) * 1000;
    if (nowMs - dateMs <= maxAgeMs) fresh.push(u);
    else staleCount++;
  }
  return { fresh, staleCount };
}
