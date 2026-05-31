import type {
  ConversationErrorClassification,
  ConversationErrorKind,
} from "@/types/conversations";

/**
 * Shared generic classifier. Each adapter's `classifyError` calls
 * `classifyCommonError` first for universal CLI failure shapes (binary
 * missing, auth, rate limit, context exceeded, transport), then layers any
 * provider-specific regexes on top before falling back to `"unknown"`.
 *
 * Returning `null` lets the caller run its provider-specific matchers next.
 */
export function classifyCommonError(
  stderr: string,
  exitCode: number | null,
  options: { providerDisplayName?: string; cliCommand?: string } = {}
): ConversationErrorClassification | null {
  const provider = options.providerDisplayName ?? "the provider";
  const cli = options.cliCommand ?? "the CLI";
  const text = (stderr || "").slice(-8000); // last ~8KB covers the failing line

  if (!text.trim() && exitCode === null) {
    return {
      kind: "transport",
      hint: `The run didn't produce any output. Daemon or child process may have crashed before ${cli} started.`,
    };
  }

  // ---- cli_not_found -----------------------------------------------------
  if (
    /(?:command not found|no such file or directory|ENOENT|spawn .+ ENOENT|executable file not found)/i.test(
      text
    )
  ) {
    return {
      kind: "cli_not_found",
      hint: `Cabinet couldn't find the ${cli} binary on your PATH. Run the install step for ${provider} in Settings → Providers.`,
    };
  }

  // ---- auth_expired ------------------------------------------------------
  if (
    /(?:not (?:logged in|authenticated)|unauthori[sz]ed|401(?!\d)|403\s*.*(?:auth|login)|missing api key|api[-_ ]?key\s*(?:not\s*(?:set|provided|found)|invalid|expired)|please (?:sign|log) ?in|run .{0,30}(?:login|auth)|session.{0,20}expired|token.{0,20}expired|invalid credentials|credentials (?:not found|missing))/i.test(
      text
    )
  ) {
    return {
      kind: "auth_expired",
      hint: `${provider} needs a fresh login. Finish the authentication step in Settings → Providers.`,
    };
  }

  // ---- rate_limited ------------------------------------------------------
  const rateLimitMatch =
    /(?:rate[- ]?limit|too many requests|429(?!\d)|resource.{0,10}exhausted|try again (?:later|in\s*\d))/i.exec(
      text
    );
  if (rateLimitMatch) {
    const retryMatch = /retry(?:-| )after[:\s]*(\d+)/i.exec(text);
    return {
      kind: "rate_limited",
      hint: `${provider} throttled this run. Wait and retry, or switch to a paid plan / different API key.`,
      retryAfterSec: retryMatch ? Number.parseInt(retryMatch[1] ?? "", 10) : undefined,
    };
  }

  // ---- session_expired ---------------------------------------------------
  if (
    /(?:no conversation found|session\s*(?:id|not\s*found|expired)|invalid session|resume.{0,30}(?:invalid|expired|unknown|failed))/i.test(
      text
    )
  ) {
    return {
      kind: "session_expired",
      hint: `The ${provider} resume handle is no longer valid. Cabinet will retry with the full conversation history on the next turn.`,
    };
  }

  // ---- context_exceeded --------------------------------------------------
  if (
    /(?:context.{0,10}(?:length|window|limit).{0,10}(?:exceeded|too\s*(?:large|long))|prompt.{0,10}too\s*long|input.{0,10}too\s*long|maximum context|tokens.{0,10}(?:exceed|limit))/i.test(
      text
    )
  ) {
    return {
      kind: "context_exceeded",
      hint: "This conversation is too long for the provider's context window. Try compacting — click the Compact button in the top bar.",
    };
  }

  // ---- payment / billing --------------------------------------------------
  // Fold into auth_expired — users resolve both through Settings → Providers.
  if (
    /(?:payment required|subscription required|upgrade.{0,20}plan|billing required|402(?!\d))/i.test(
      text
    )
  ) {
    return {
      kind: "auth_expired",
      hint: `${provider} needs an active paid plan before it will answer requests.`,
    };
  }

  // ---- timeout -----------------------------------------------------------
  if (/(?:timed? ?out|deadline exceeded)/i.test(text)) {
    return {
      kind: "timeout",
      hint: `${cli} exceeded the run timeout. Retry, or raise the job timeout if this is a long-running task.`,
    };
  }

  // ---- transport ---------------------------------------------------------
  if (
    /(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network error|fetch failed|unable to connect)/i.test(
      text
    )
  ) {
    return {
      kind: "transport",
      hint: "Transient network error. Retry, and check Cabinet's Daemon Status panel if it persists.",
    };
  }

  return null;
}

export function unknownClassification(
  hintFallback = "Run failed without a recognizable error pattern. Check the Logs tab for the raw stderr."
): ConversationErrorClassification {
  return { kind: "unknown", hint: hintFallback };
}

/**
 * Convenience so adapters can compose shared + provider-specific logic in a
 * single expression: `classifyChain(stderr, exitCode, [shared, specific])`.
 */
export function classifyChain(
  stderr: string,
  exitCode: number | null,
  classifiers: Array<
    (
      stderr: string,
      exitCode: number | null
    ) => ConversationErrorClassification | null
  >
): ConversationErrorClassification {
  for (const classifier of classifiers) {
    const result = classifier(stderr, exitCode);
    if (result) return result;
  }
  return unknownClassification();
}

export type { ConversationErrorKind };
