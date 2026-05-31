import { stripToolOutput } from "./tool-output-markers";

const FENCE_RE = /```[\s\S]*?```/g;
const ASK_USER_RE = /<ask_user>([\s\S]*?)<\/ask_user>/i;

/**
 * Does this agent reply want a user answer?
 *
 * Two signals, in order of authority:
 *
 * 1. Explicit: the agent wraps a question in `<ask_user>…</ask_user>`.
 *    This is the documented convention the cabinet epilogue instructs the
 *    agent to use; it's the canonical awaiting-input marker.
 *
 * 2. Heuristic fallback: the last non-empty, non-fenced line ends with `?`
 *    and the content isn't mostly code. Keeps existing agents that don't
 *    know about the marker flowing.
 */
export function looksLikeAwaitingInput(content: string): boolean {
  if (!content) return false;
  if (ASK_USER_RE.test(content)) return true;

  const stripped = stripToolOutput(content).replace(FENCE_RE, "").trim();
  if (!stripped) return false;
  const fenceLen = (content.match(FENCE_RE) || []).reduce((a, b) => a + b.length, 0);
  if (fenceLen / Math.max(content.length, 1) > 0.7) return false;

  const lines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || "";
  return last.endsWith("?");
}

/**
 * Strip the `<ask_user>…</ask_user>` wrapper from the agent's display content
 * while keeping the question text intact inside. The wrapper is machine-
 * facing; the user sees "What do you want?" rather than
 * "<ask_user>What do you want?</ask_user>".
 */
export function stripAskUserMarkers(content: string): string {
  return content.replace(
    /<ask_user>([\s\S]*?)<\/ask_user>/gi,
    (_, inner: string) => inner.trim()
  );
}

/**
 * Derive a short rolling summary for a task. v1 is a heuristic:
 * - If the latest settled agent turn has content, use its first sentence (≤160 chars).
 * - Otherwise, fall back to the first user turn's first sentence.
 *
 * Keep this pure + synchronous so we can swap in an LLM-backed version later without
 * changing call sites.
 */
export function deriveSummary(input: {
  turns: { role: "user" | "agent"; content: string; pending?: boolean }[];
  existingSummary?: string;
}): string | undefined {
  const settled = input.turns.filter((t) => !t.pending);
  const lastAgent = [...settled].reverse().find((t) => t.role === "agent");
  const firstUser = settled.find((t) => t.role === "user");

  const source =
    stripToolOutput(lastAgent?.content?.trim() || "") ||
    firstUser?.content?.trim();
  if (!source) return input.existingSummary;

  const firstSentence = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  if (!firstSentence) return input.existingSummary;
  if (firstSentence.length <= 180) return firstSentence;
  return `${firstSentence.slice(0, 160).trim()}…`;
}
