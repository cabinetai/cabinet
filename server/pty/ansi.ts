/**
 * ANSI escape + control-char stripping. Used by both the PTY lifecycle (to
 * turn raw TUI output into something plain-text-searchable for cabinet-block
 * extraction, summaries, transcript syncing) and by structured-session
 * finalizers in the daemon (for the same reason — adapter stderr can contain
 * colored diagnostic output).
 */
export function stripAnsi(str: string): string {
  return str
    // OSC (Operating System Command): ESC ] ... BEL | ESC \
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "")
    // DCS / PM / APC: ESC P|^|_ ... ST
    .replace(/\x1B[P^_][\s\S]*?\x1B\\/g, "")
    // Charset designate two-byte sequences: ESC ( B | ESC ) 0 | etc.
    .replace(/\x1B[()*+\-./][\x20-\x7E]/g, "")
    // CSI: ESC [ params intermediate final
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    // Single-char ESC sequences with final byte in @-_ (0x40-0x5F)
    .replace(/\x1B[@-_]/g, "")
    // Remaining single-char ESC sequences: DECSC/DECRC (ESC 7 / ESC 8),
    // RIS (ESC c), keypad mode (ESC = / ESC >), etc. Final byte in
    // 0x30-0x3F or 0x60-0x7E. Without this, \x1B7 / \x1B8 leak into
    // transcripts as garbage (surfaced as "78─────" in
    // meta.summary for TUI-heavy agents like claude-code).
    .replace(/\x1B[\x30-\x3F\x60-\x7E]/g, "")
    // Control chars (excludes \t \n \r and ESC itself)
    .replace(/[\x00-\x08\x0B-\x1A\x1C-\x1F\x7F]/g, "");
}
