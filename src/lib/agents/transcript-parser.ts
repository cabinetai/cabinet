import type { AgentAction } from "@/types/actions";
import { parseAgentActions } from "./action-parser";
import {
  TOOL_OUTPUT_OPEN,
  toolRegionRe,
  toolUnterminatedRe,
} from "./tool-output-markers";

export type Block =
  | { type: "text"; content: string }
  | { type: "diff"; header: string; lines: DiffLine[] }
  | { type: "code"; lang: string; content: string }
  | { type: "cabinet"; fields: { label: string; value: string }[] }
  | { type: "actions"; actions: AgentAction[] }
  | { type: "structured"; label: string; value: string }
  | { type: "tokens"; value: string }
  | { type: "tool"; content: string; steps: number };

export type DiffLine = {
  kind: "add" | "remove" | "hunk" | "header" | "plain";
  text: string;
};

const DIFF_START = /^diff --git /;
const STRUCTURED_RE =
  /^(SUMMARY|CONTEXT|CONTEXT_UPDATE|ARTIFACT|DECISION|LEARNING|GOAL_UPDATE|MESSAGE_TO|LAUNCH_TASK|SCHEDULE_JOB|SCHEDULE_TASK|SEND_EMAIL)\s*(?:\[([^\]]*)\])?:\s*(.*)$/;
const TOKENS_RE = /^[\d,]+$/;

function preprocess(text: string): string {
  return text
    .split("\n")
    .flatMap((line) => {
      if (DIFF_START.test(line)) return [line];
      const idx = line.indexOf("diff --git a/");
      if (idx > 0) {
        return [line.substring(0, idx), line.substring(idx)];
      }
      return [line];
    })
    .join("\n");
}

function isDiffStart(line: string): boolean {
  return DIFF_START.test(line);
}

function isDiffContentLine(line: string): boolean {
  if (line.startsWith("+") || line.startsWith("-")) return true;
  if (line.startsWith("@@")) return true;
  if (
    /^(index |new file|deleted file|old mode|new mode|similarity|rename|copy)/.test(line)
  ) {
    return true;
  }
  if (line.startsWith("+++") || line.startsWith("---")) return true;
  return false;
}

function parseDiffBlock(lines: string[], startIdx: number): {
  block: Block;
  endIdx: number;
} {
  const header = lines[startIdx];
  const diffLines: DiffLine[] = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    const line = lines[i];
    if (isDiffStart(line)) break;

    if (line.startsWith("+++") || line.startsWith("---")) {
      diffLines.push({ kind: "header", text: line });
    } else if (line.startsWith("@@")) {
      diffLines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      diffLines.push({ kind: "add", text: line });
    } else if (line.startsWith("-")) {
      diffLines.push({ kind: "remove", text: line });
    } else if (
      /^(index |new file|deleted file|old mode|new mode|similarity|rename|copy)/.test(line)
    ) {
      diffLines.push({ kind: "header", text: line });
    } else if (line.startsWith(" ") || line === "") {
      const hasHunks = diffLines.some((diffLine) => diffLine.kind === "hunk");
      if (hasHunks) {
        diffLines.push({ kind: "plain", text: line });
      } else {
        diffLines.push({ kind: "header", text: line });
      }
    } else {
      break;
    }
    i += 1;
  }

  return { block: { type: "diff", header, lines: diffLines }, endIdx: i };
}

function parseCodeBlock(
  lines: string[],
  startIdx: number
): { block: Block; endIdx: number } | null {
  const match = lines[startIdx].match(/^```([\w-]*)$/);
  if (!match) return null;

  const lang = match[1] || "text";
  const codeLines: string[] = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    if (lines[i] === "```") {
      if (lang === "cabinet-actions") {
        const { actions } = parseAgentActions(
          "```cabinet-actions\n" + codeLines.join("\n") + "\n```"
        );
        return { block: { type: "actions", actions }, endIdx: i + 1 };
      }

      const nonEmpty = codeLines.filter((line) => line.trim());
      const allStructured =
        nonEmpty.length > 0 && nonEmpty.every((line) => STRUCTURED_RE.test(line));

      if (allStructured) {
        const fields = nonEmpty.flatMap((line) => {
          const structuredMatch = line.match(STRUCTURED_RE)!;
          const label = structuredMatch[2]
            ? `${structuredMatch[1]} [${structuredMatch[2]}]`
            : structuredMatch[1];
          return expandStructuredField(structuredMatch[1], label, structuredMatch[3]);
        });
        return { block: { type: "cabinet", fields }, endIdx: i + 1 };
      }

      return {
        block: { type: "code", lang, content: codeLines.join("\n") },
        endIdx: i + 1,
      };
    }
    codeLines.push(lines[i]);
    i += 1;
  }

  return null;
}

const STRUCTURED_LABELS =
  "SUMMARY|CONTEXT|CONTEXT_UPDATE|ARTIFACT|DECISION|LEARNING|GOAL_UPDATE|MESSAGE_TO|LAUNCH_TASK|SCHEDULE_JOB|SCHEDULE_TASK|SEND_EMAIL";
// A label token at line start or after whitespace. No `:\s+` requirement —
// agents (esp. with RTL/CJK values) emit `SUMMARY:value` with no space,
// which must still be recognized as a meta field instead of leaking into
// the markdown body. Mirrors STRUCTURED_RE's tolerant `:\s*`.
const STRUCTURED_SEGMENT_RE = new RegExp(
  `(?:^|\\s)(${STRUCTURED_LABELS})\\s*(?:\\[([^\\]]*)\\])?:\\s*`,
  "g"
);
const STRUCTURED_START_RE = new RegExp(
  `^\\s*(?:${STRUCTURED_LABELS})\\s*(?:\\[[^\\]]*\\])?:`
);

// A single line can carry one meta field, or several squashed together
// ("SUMMARY:… CONTEXT:… ARTIFACT:…"). Only treat the line as structured
// when it *starts* with a known label, so prose mentioning "context:" is
// left untouched. Returns one structured block per field.
function parseStructuredLine(line: string): Block[] | null {
  if (!STRUCTURED_START_RE.test(line)) return null;
  const trimmed = line.trim();
  const matches = [...trimmed.matchAll(STRUCTURED_SEGMENT_RE)];
  if (matches.length === 0) return null;
  const blocks: Block[] = [];
  for (let m = 0; m < matches.length; m += 1) {
    const cur = matches[m];
    const valueStart = (cur.index ?? 0) + cur[0].length;
    const valueEnd =
      m + 1 < matches.length
        ? matches[m + 1].index ?? trimmed.length
        : trimmed.length;
    const value = trimmed.slice(valueStart, valueEnd).trim();
    const label = cur[2] ? `${cur[1]} [${cur[2]}]` : cur[1];
    blocks.push({ type: "structured", label, value });
  }
  return blocks;
}

// Agents occasionally squash multiple files onto one `ARTIFACT:` line
// ("ARTIFACT: a.md, b.md"). Split those into one field per path so the
// UI renders a badge per file instead of one badge with a comma list.
function expandStructuredField(
  kind: string,
  label: string,
  value: string
): { label: string; value: string }[] {
  if (kind !== "ARTIFACT") return [{ label, value }];
  const parts = splitArtifactLineValue(value);
  if (parts.length <= 1) return [{ label, value }];
  return parts.map((part) => ({ label, value: part }));
}

function splitArtifactLineValue(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const hasSeparator = /[,;]|\s{2,}/.test(trimmed);
  const extensionCount = trimmed.match(/\.[A-Za-z0-9]+(?=[\s,;]|$)/g)?.length ?? 0;
  if (!hasSeparator && extensionCount <= 1) return [trimmed];
  return trimmed
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Split the transcript on tool-output fences before prose parsing. Each
 * fenced region becomes a `tool` block; consecutive regions separated by
 * only whitespace collapse into one block with a step count, so a burst of
 * `ls`/`cat`/`write` calls reads as a single "Ran N steps" disclosure
 * rather than N stacked ones. Prose between/around fences parses normally.
 */
export function parseTranscript(raw: string): Block[] {
  if (!raw || raw.indexOf(TOOL_OUTPUT_OPEN) === -1) {
    return parseProseBlocks(raw);
  }

  type Segment = { kind: "prose" | "tool"; text: string };
  const segments: Segment[] = [];
  const regionRe = toolRegionRe();
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regionRe.exec(raw)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: "prose", text: raw.slice(cursor, match.index) });
    }
    segments.push({ kind: "tool", text: match[1] ?? "" });
    cursor = regionRe.lastIndex;
  }

  // Tail after the last complete region: it may carry an unterminated open
  // marker (tool still streaming) — fence everything from it onward.
  const tail = raw.slice(cursor);
  const openTail = tail.match(toolUnterminatedRe());
  if (openTail) {
    const before = tail.slice(0, openTail.index);
    if (before) segments.push({ kind: "prose", text: before });
    segments.push({ kind: "tool", text: openTail[1] ?? "" });
  } else if (tail) {
    segments.push({ kind: "prose", text: tail });
  }

  const blocks: Block[] = [];
  for (const seg of segments) {
    if (seg.kind === "prose") {
      if (!seg.text.trim()) continue;
      blocks.push(...parseProseBlocks(seg.text));
      continue;
    }
    const prev = blocks[blocks.length - 1];
    // Merge into the previous tool block only when nothing but the (already
    // dropped) whitespace gap separated them — i.e. it's still the tail.
    if (prev && prev.type === "tool") {
      prev.content = `${prev.content}\n${seg.text}`.trim();
      prev.steps += 1;
    } else {
      blocks.push({ type: "tool", content: seg.text.trim(), steps: 1 });
    }
  }
  return blocks;
}

function parseProseBlocks(raw: string): Block[] {
  const text = preprocess(raw);
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let textBuf: string[] = [];

  function flushText() {
    if (textBuf.length === 0) return;

    const content = textBuf.join("\n").trim();
    if (!content) {
      textBuf = [];
      return;
    }

    const nonEmpty = textBuf.filter((line) => line.trim());
    const diffLikeCount = nonEmpty.filter((line) => isDiffContentLine(line)).length;
    // A header-less diff fragment still carries diff *structure* — a hunk
    // header (@@ … @@) or the +++/--- file markers. Without that, a high
    // +/- ratio is just a markdown bullet list ("- item") or prose with
    // dashes, which must render as text, not a red diff block.
    const hasDiffStructure = nonEmpty.some(
      (line) =>
        /^@@ /.test(line) ||
        /^@@@ /.test(line) ||
        /^\+\+\+ /.test(line) ||
        /^--- /.test(line)
    );
    if (
      hasDiffStructure &&
      nonEmpty.length > 0 &&
      diffLikeCount / nonEmpty.length >= 0.5
    ) {
      const diffLines: DiffLine[] = textBuf
        .filter((line) => line.trim())
        .map((line) => {
          if (line.startsWith("+")) return { kind: "add" as const, text: line };
          if (line.startsWith("-")) return { kind: "remove" as const, text: line };
          if (line.startsWith("@@")) return { kind: "hunk" as const, text: line };
          return { kind: "plain" as const, text: line };
        });
      blocks.push({ type: "diff", header: "", lines: diffLines });
    } else {
      blocks.push({ type: "text", content });
    }
    textBuf = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isDiffStart(line)) {
      flushText();
      const result = parseDiffBlock(lines, i);
      blocks.push(result.block);
      i = result.endIdx;
      continue;
    }

    if (/^```/.test(line)) {
      const result = parseCodeBlock(lines, i);
      if (result) {
        flushText();
        blocks.push(result.block);
        i = result.endIdx;
        continue;
      }
    }

    const structured = parseStructuredLine(line);
    if (structured) {
      flushText();
      blocks.push(...structured);
      i += 1;
      continue;
    }

    if (TOKENS_RE.test(line.trim()) && i >= lines.length - 3) {
      flushText();
      blocks.push({ type: "tokens", value: line.trim() });
      i += 1;
      continue;
    }

    textBuf.push(line);
    i += 1;
  }

  flushText();
  return blocks;
}
