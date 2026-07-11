/**
 * A fake agent CLI: an executable that ignores stdin and prints a fixed
 * sequence of stream-JSON lines on stdout.
 *
 * This is the seam that makes agent tests deterministic. Adapters resolve
 * their binary from PATH (`buildRuntimePath` + `lookupCommandOnPath`, see
 * provider-cli.ts) or from an explicit `config.command`. Both are real
 * product code paths, so pointing either at a fake binary exercises the
 * genuine adapter without a network call, an API key, or a model's opinion.
 *
 * Extracted from the six copies of `createExecutableScript` that were
 * duplicated across the *-local.test.ts adapter tests.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface FakeAgentCli {
  /** Directory holding the executable. Prepend to PATH to shadow the real CLI. */
  dir: string;
  /** Absolute path to the executable — pass as an adapter's `config.command`. */
  command: string;
  cleanup(): Promise<void>;
}

/**
 * `name` must match what the adapter looks for on PATH (e.g. "claude" for the
 * claude-code provider, "codex", "cursor-agent", "gemini", "opencode", "pi").
 *
 * `lines` are emitted verbatim, one per line, in order. Each should be a line
 * of the provider's stream-JSON format.
 *
 * `intoDir` writes the executable into a caller-owned directory (the harness
 * uses this to place fakes in a temp $HOME/.local/bin, which buildRuntimePath
 * ranks ahead of every real install). When omitted, a temp dir is created and
 * owned by the returned handle.
 */
export async function createFakeAgentCli(
  name: string,
  lines: string[],
  intoDir?: string
): Promise<FakeAgentCli> {
  const owned = !intoDir;
  const dir =
    intoDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), `cabinet-fake-${name}-`)));
  const command = path.join(dir, name);

  // `cat >/dev/null` drains stdin: adapters write the prompt to the child and
  // would get EPIPE if the fake exited without reading it.
  const script = [
    "#!/bin/sh",
    "cat >/dev/null",
    ...lines.map((line) => `printf '%s\\n' ${shellQuote(line)}`),
  ].join("\n");

  await fs.writeFile(command, `${script}\n`, "utf8");
  await fs.chmod(command, 0o755);

  return {
    dir,
    command,
    cleanup: () =>
      owned
        ? fs.rm(dir, { recursive: true, force: true })
        : fs.rm(command, { force: true }),
  };
}

/** Single-quote for /bin/sh: close, escape, reopen around embedded quotes. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A minimal successful Claude Code print-mode stream that replies with `reply`.
 * Mirrors the shape asserted in claude-local.test.ts.
 */
export function claudeReplyStream(reply: string, sessionId = "e2e-session"): string[] {
  const json = (value: unknown) => JSON.stringify(value);
  return [
    json({ type: "system", subtype: "init", apiKeySource: "none", session_id: sessionId }),
    json({
      type: "stream_event",
      event: {
        type: "message_start",
        message: { model: "claude-sonnet-4-6", usage: { input_tokens: 4, output_tokens: 1 } },
      },
      session_id: sessionId,
    }),
    json({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: reply } },
      session_id: sessionId,
    }),
    json({
      type: "result",
      result: reply,
      usage: { input_tokens: 4, output_tokens: 2 },
      session_id: sessionId,
    }),
  ];
}
