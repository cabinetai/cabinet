import path from "path";
import { randomBytes } from "crypto";
import matter from "gray-matter";
import type { ConversationTurn, TurnRole } from "@/types/conversations";

/**
 * Multi-turn file helpers for conversations.
 *
 * Layout (only created when turnCount > 1):
 *   data/{cabinetPath?}/.agents/.conversations/{id}/
 *     turns/002-user.md
 *     turns/002-agent.md
 *     turns/003-user.md
 *     turns/003-agent.md
 *     session.json
 *     events.log
 *
 * Turn 1 is NEVER stored under turns/. It's composed from the existing
 * prompt.md (user) + transcript.txt (agent) pair. Readers synthesize it.
 */

export function turnsDir(conversationDir: string): string {
  return path.join(conversationDir, "turns");
}

export function sessionPath(conversationDir: string): string {
  return path.join(conversationDir, "session.json");
}

export function eventsLogPath(conversationDir: string): string {
  return path.join(conversationDir, "events.log");
}

export function turnFileName(turn: number, role: TurnRole): string {
  return `${String(turn).padStart(3, "0")}-${role}.md`;
}

export function turnFilePath(
  conversationDir: string,
  turn: number,
  role: TurnRole
): string {
  return path.join(turnsDir(conversationDir), turnFileName(turn, role));
}

export function parseTurnFilename(
  name: string
): { turn: number; role: TurnRole } | null {
  const match = name.match(/^(\d{3})-(user|agent)\.md$/);
  if (!match) return null;
  return {
    turn: Number.parseInt(match[1], 10),
    role: match[2] as TurnRole,
  };
}

export function shortId(): string {
  return randomBytes(6).toString("base64url");
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? stripUndefined(v as Record<string, unknown>)
          : v
      );
    } else if (value && typeof value === "object") {
      out[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Normalize falsy boolean flags so they don't persist as `false` in YAML.
 */
function normalizeTurnMeta(meta: Omit<ConversationTurn, "content">): Omit<ConversationTurn, "content"> {
  return {
    ...meta,
    pending: meta.pending ? true : undefined,
    awaitingInput: meta.awaitingInput ? true : undefined,
  };
}

export function serializeTurn(turn: ConversationTurn): string {
  const { content, ...meta } = turn;
  return matter.stringify(
    content,
    stripUndefined(normalizeTurnMeta(meta) as unknown as Record<string, unknown>)
  );
}

export function deserializeTurn(
  raw: string,
  fallback: { turn: number; role: TurnRole }
): ConversationTurn {
  const parsed = matter(raw);
  const data = parsed.data as Partial<ConversationTurn>;
  return {
    id: data.id || shortId(),
    turn: data.turn ?? fallback.turn,
    role: (data.role as TurnRole) || fallback.role,
    ts: data.ts || new Date().toISOString(),
    content: parsed.content.trim(),
    sessionId: data.sessionId,
    tokens: data.tokens,
    awaitingInput: data.awaitingInput,
    pending: data.pending,
    exitCode: data.exitCode,
    error: data.error,
    mentionedPaths: data.mentionedPaths,
    attachmentPaths: data.attachmentPaths,
    artifacts: data.artifacts,
  };
}
