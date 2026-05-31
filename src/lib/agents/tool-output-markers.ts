/**
 * Sentinel markers that fence raw tool/command output (bash stdout, `ls`
 * dumps, shell-init noise like "running .zshenv") so it stays distinct from
 * the assistant's prose all the way from the stream adapter to the renderer.
 *
 * Why Private Use Area codepoints: the conversation transcript is run through
 * aggressive normalization before display — ANSI/CSI stripping, C0 control
 * removal (U+0000–U+001F), whitespace collapsing, `.trim()`, prompt-echo
 * line matching, structured-field regexes. U+E000/U+E001 survive every one
 * of those passes (not control chars, not whitespace, never emitted by the
 * regexes) and never occur in real model output, so they're a safe fence
 * that outlives the newline-flattening that mangles the rest of the text.
 *
 * Built from char codes (ASCII source) on purpose — the literal codepoints
 * render as nothing in an editor and must not be typed by hand.
 */
export const TOOL_OUTPUT_OPEN = String.fromCharCode(0xe000);
export const TOOL_OUTPUT_CLOSE = String.fromCharCode(0xe001);

/** Wrap a chunk of tool output so downstream layers can segment it out. */
export function wrapToolOutput(text: string): string {
  return `${TOOL_OUTPUT_OPEN}${text}${TOOL_OUTPUT_CLOSE}`;
}

/** A complete open…close region (non-greedy). Build fresh per call: /g state. */
export function toolRegionRe(): RegExp {
  return new RegExp(`${TOOL_OUTPUT_OPEN}([\\s\\S]*?)${TOOL_OUTPUT_CLOSE}`, "g");
}

/**
 * An unterminated region: an open marker with no matching close (the stream
 * is still mid-tool-call). Everything after it is treated as tool output.
 */
export function toolUnterminatedRe(): RegExp {
  return new RegExp(`${TOOL_OUTPUT_OPEN}([\\s\\S]*)$`);
}

/**
 * Strip fenced tool output entirely, for plain-text surfaces (terminal
 * transcript, task-title heuristics, summaries) where there is no collapse
 * affordance and the noise has no business appearing.
 */
export function stripToolOutput(text: string): string {
  if (!text || text.indexOf(TOOL_OUTPUT_OPEN) === -1) return text;
  return text
    .replace(toolRegionRe(), " ")
    .replace(toolUnterminatedRe(), " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
