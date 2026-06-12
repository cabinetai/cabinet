/**
 * Telegram rendering for the gateway: agent markdown → MarkdownV2, plus
 * entity-safe chunking at the 4096-char message cap.
 *
 * Strategy (per PRD §8): streamed partial edits are sent as PLAIN text (no
 * parse_mode — partial markdown has unbalanced entities by definition); only
 * final messages are rendered as MarkdownV2, and the caller falls back to
 * plain text when Telegram rejects the entities.
 */

export const TELEGRAM_MESSAGE_LIMIT = 4096;

// Every char MarkdownV2 treats as syntax outside an entity.
const MDV2_SPECIALS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MDV2_SPECIALS, (c) => `\\${c}`);
}

/** Inside code entities only backslash and backtick are special. */
export function escapeMarkdownV2Code(text: string): string {
  return text.replace(/[\\`]/g, (c) => `\\${c}`);
}

/**
 * Convert agent markdown to MarkdownV2. Handles the entities agents actually
 * emit — fenced code blocks, inline code, **bold**, [links](url) — and
 * escapes everything else. Italic via single *…* / _…_ is deliberately left
 * as escaped literal text: agents use asterisks for emphasis inconsistently
 * enough that guessing produces broken entities more often than styling.
 */
export function renderMarkdownV2(text: string): string {
  const out: string[] = [];
  // Split out fenced code blocks first; they win over everything inside.
  const fenceParts = text.split(/(```[\s\S]*?(?:```|$))/);
  for (const part of fenceParts) {
    if (part.startsWith("```")) {
      const inner = part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      out.push("```\n" + escapeMarkdownV2Code(inner.replace(/\n?$/, "\n")) + "```");
      continue;
    }
    // Inline code next.
    const codeParts = part.split(/(`[^`\n]+`)/);
    for (const seg of codeParts) {
      if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
        out.push("`" + escapeMarkdownV2Code(seg.slice(1, -1)) + "`");
        continue;
      }
      out.push(renderInline(seg));
    }
  }
  return out.join("");
}

function renderInline(seg: string): string {
  const out: string[] = [];
  // [label](url) and **bold**, processed left to right.
  const pattern = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(seg)) !== null) {
    out.push(escapeMarkdownV2(seg.slice(last, m.index)));
    if (m[1] !== undefined && m[2] !== undefined) {
      // Link: label is escaped like text; URL escapes only ) and \.
      out.push(`[${escapeMarkdownV2(m[1])}](${m[2].replace(/[)\\]/g, (c) => `\\${c}`)})`);
    } else if (m[3] !== undefined) {
      out.push(`*${escapeMarkdownV2(m[3])}*`);
    }
    last = m.index + m[0].length;
  }
  out.push(escapeMarkdownV2(seg.slice(last)));
  return out.join("");
}

/**
 * Split text into ≤limit chunks at entity-safe boundaries: paragraph break,
 * then newline, then space. Fenced code blocks are tracked — when a split
 * lands inside one, the fence is closed at the chunk end and reopened at the
 * start of the next chunk so each chunk renders standalone.
 */
export function chunkText(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let rest = text;
  let openFence = false;

  // Reserve room for a closing/reopening fence line on either side.
  const budget = limit - 8;

  while (rest.length > budget) {
    const window = rest.slice(0, budget);
    let cut = window.lastIndexOf("\n\n");
    if (cut < budget / 2) cut = window.lastIndexOf("\n");
    if (cut < budget / 2) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = budget;

    let piece = rest.slice(0, cut);
    rest = rest.slice(cut).replace(/^\s+/, "");

    // Count fences to know whether this cut is inside a code block.
    const fences = (piece.match(/```/g) || []).length;
    const inFenceAfter: boolean = openFence ? fences % 2 === 0 : fences % 2 === 1;
    if (openFence) piece = "```\n" + piece;
    if (inFenceAfter) piece = piece + "\n```";
    openFence = inFenceAfter;

    chunks.push(piece);
  }
  if (rest.length > 0) {
    chunks.push(openFence ? "```\n" + rest : rest);
  }
  return chunks;
}

/** One-line preview used in /status and queue acks. */
export function previewText(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
