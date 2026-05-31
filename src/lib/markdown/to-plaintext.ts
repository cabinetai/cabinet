const LIST_MARKER = /^[\s]*(?:[-*+]|\d+\.)\s+/;
const TASK_MARKER = /^\[[ xX]\]\s+/;
const ATX_HEADING = /^#{1,6}\s+/;
const SETEXT_UNDERLINE = /^[=-]+\s*$/;
const BLOCKQUOTE = /^>\s?/;
const BOLD = /\*\*(.+?)\*\*|__(.+?)__/g;
const ITALIC = /(?<![*_])\*(?!\s)(.+?)(?<!\s)\*(?!\*)|(?<![*_])_(?!\s)(.+?)(?<!\s)_(?!_)/g;
const INLINE_CODE = /`([^`]+)`/g;
const MD_LINK = /!?\[([^\]]*)\]\(([^)]+)\)/g;
const WIKI_LINK = /\[\[([^\]]+?)(?:\|([^\]]+))?\]\]/g;
const HTML_TAG = /<[^>]+>/g;

export interface PlaintextResult {
  text: string;
  lines: string[];
}

export function markdownToPlaintext(markdown: string): PlaintextResult {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");

  let inCodeFence = false;
  const out: string[] = [];

  for (const raw of rawLines) {
    if (/^\s*```/.test(raw)) {
      inCodeFence = !inCodeFence;
      out.push("");
      continue;
    }
    if (inCodeFence) {
      out.push(raw);
      continue;
    }

    if (SETEXT_UNDERLINE.test(raw) && out.length > 0 && out[out.length - 1].trim()) {
      out.push("");
      continue;
    }

    let line = raw;
    line = line.replace(ATX_HEADING, "");
    line = line.replace(BLOCKQUOTE, "");
    line = line.replace(LIST_MARKER, "");
    line = line.replace(TASK_MARKER, "");
    line = line.replace(MD_LINK, (_m, text) => text || "");
    line = line.replace(WIKI_LINK, (_m, name, alias) => alias || name);
    line = line.replace(BOLD, (_m, a, b) => a || b || "");
    line = line.replace(ITALIC, (_m, a, b, c, d) => a || b || c || d || "");
    line = line.replace(INLINE_CODE, (_m, text) => text);
    line = line.replace(HTML_TAG, "");

    out.push(line);
  }

  return {
    text: out.join("\n"),
    lines: out,
  };
}

export function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  const normalized = markdown.replace(/\r\n/g, "\n");
  for (const line of normalized.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}
