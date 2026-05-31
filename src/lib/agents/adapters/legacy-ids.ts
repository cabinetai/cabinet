/**
 * Client-safe helpers for identifying legacy PTY adapters.
 *
 * The full `@/lib/agents/adapters` barrel pulls in server-only code
 * (`child_process`, filesystem, etc.). Components that just need to know
 * whether an adapter type is a legacy/terminal one should import from here
 * instead.
 *
 * Kept in sync with `LEGACY_ADAPTER_BY_PROVIDER_ID` in `./registry.ts`.
 */
export const LEGACY_ADAPTER_TYPES = [
  "claude_code_legacy",
  "codex_cli_legacy",
  "gemini_cli_legacy",
  "cursor_cli_legacy",
  "opencode_legacy",
  "pi_legacy",
  "grok_cli_legacy",
  "copilot_cli_legacy",
] as const;

const LEGACY_SET = new Set<string>(LEGACY_ADAPTER_TYPES);

export function isLegacyAdapterType(adapterType?: string | null): boolean {
  return typeof adapterType === "string" && LEGACY_SET.has(adapterType);
}

/**
 * Provider ids whose CLIs support resuming a prior terminal-mode session
 * via their own flag (mirrors `provider.supportsTerminalResume` on the
 * server). Claude `--resume`, Cursor `--resume`, OpenCode `--session`.
 * Kept client-safe so task-viewer UI can decide whether to show a
 * "new session" advisory without an extra providers fetch.
 */
export const PROVIDERS_WITH_TERMINAL_RESUME = new Set<string>([
  "claude-code",
  "cursor-cli",
  "opencode",
]);

export function supportsTerminalResume(providerId?: string | null): boolean {
  return typeof providerId === "string" && PROVIDERS_WITH_TERMINAL_RESUME.has(providerId);
}
