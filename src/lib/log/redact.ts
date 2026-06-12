import os from "os";

/**
 * Defense-in-depth redaction for anything that leaves the machine
 * (diagnostics bundle, feedback log attachments — PRD §3.4/§3.5). The
 * first line of defense is "never log secret values"; this pass catches
 * what discipline misses.
 */

const SECRET_PATTERNS: RegExp[] = [
  // Anthropic / OpenAI style keys
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  // Slack tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  // Telegram bot tokens (digits:secret)
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g,
  // AWS access key ids
  /\bAKIA[0-9A-Z]{16}\b/g,
  // JWTs
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  // generic `token=...` / `key: ...` / `secret=...` assignments with a long value
  /\b(token|secret|password|passwd|api[-_]?key|access[-_]?key|auth)\b(["']?\s*[:=]\s*["']?)([A-Za-z0-9+/_-]{12,})/gi,
  // long hex/base64 blobs after Bearer
  /\bBearer\s+[A-Za-z0-9+/._-]{16,}/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match, ...groups) => {
      // keep the key name in the generic assignment pattern, redact the value
      if (typeof groups[0] === "string" && typeof groups[1] === "string" && groups.length >= 3) {
        return `${groups[0]}${groups[1]}[redacted]`;
      }
      return "[redacted]";
    });
  }
  // home-relativize paths last, so patterns above see the original text
  const home = os.homedir();
  if (home && home !== "/") {
    out = out.split(home).join("~");
  }
  return out;
}
