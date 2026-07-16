/**
 * A fake agent CLI: a real executable that stands in for `claude`, `codex`,
 * `gemini`, … so agent tests are deterministic.
 *
 * Adapters resolve their binary from PATH (`buildRuntimePath` +
 * `lookupCommandOnPath`, provider-cli.ts) or from an explicit `config.command`.
 * Both are genuine product code paths, so pointing either at a fake exercises
 * the real adapter — real argv construction, real stream parsing, real exit-code
 * handling — without a network call, an API key, or a model's opinion.
 *
 * The fake is SCRIPTED and RECORDING, which is what makes it a test seam rather
 * than a stub:
 *
 *   scripted   Each invocation consumes the next step of a program the test
 *              supplies. Cabinet spawns the CLI more than once per conversation
 *              (a cabinet-block retry, a follow-up turn, a resume that fails and
 *              is replayed), so a fake that replays one canned stream forever
 *              cannot tell turn 1 from turn 3 — and forces tests into `.first()`
 *              races. A program can also fail, hang, or write files.
 *
 *   recording  Every invocation appends its argv, stdin and cwd to a JSONL log.
 *              That is the only way to assert on the half of the contract that
 *              never reaches the DOM: that `--resume <id>` carried the captured
 *              session, that `--plugin-dir` mounted the skills, that the prompt
 *              on stdin carried the epilogue.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** One invocation of the fake, as recorded at spawn time. */
export interface FakeInvocation {
  /** 0-based; the order Cabinet spawned the CLI. */
  index: number;
  /** argv the adapter built, minus the binary itself. */
  args: string[];
  /** The full prompt the adapter wrote to stdin. */
  stdin: string;
  /** Working directory — for Cabinet this is always inside the KB. */
  cwd: string;
  /**
   * For every argv value that is an existing directory, the files inside it
   * (relative paths, depth-limited), captured AT SPAWN TIME.
   *
   * This exists because the interesting directories are ephemeral. A skills mount
   * is a per-session tmpdir that Cabinet cleans up when the run ends, so a test
   * that looks at `--plugin-dir` after the fact finds nothing and cannot tell
   * "cleaned up correctly" from "never mounted". Snapshotting here answers the
   * question that actually matters: what would the real CLI have been able to
   * load at the moment it was launched?
   */
  dirs: Record<string, string[]>;
  /** Value of a flag, e.g. `flag("--model")`. Undefined when absent. */
  flag(name: string): string | undefined;
  /** Whether a bare flag was passed, e.g. `has("--resume")`. */
  has(name: string): boolean;
  /** The captured file list of the directory passed to `flag`. Empty if none. */
  filesIn(flagName: string): string[];
}

/** What the fake does for a single invocation. */
export interface FakeStep {
  /** Lines printed to stdout, verbatim, one per line. Usually stream-JSON. */
  stdout?: string[];
  /** Printed to stderr. Cabinet feeds this to classifyError() on failure. */
  stderr?: string;
  /** Process exit code. Non-zero is a failed run. Defaults to 0. */
  exitCode?: number;
  /** Wait before emitting anything — simulates a slow model. */
  delayMs?: number;
  /** Wait between stdout lines — makes SSE streaming observable. */
  lineDelayMs?: number;
  /**
   * Files to write, relative to cwd, before exiting. Real agents write to the KB
   * themselves (cwd is inside DATA_DIR, and claude runs with
   * --dangerously-skip-permissions); Cabinet only *records* the paths it finds
   * in the cabinet block. Pair this with `cabinetBlock({artifacts})` to exercise
   * that path honestly.
   */
  files?: Record<string, string>;
  /**
   * Never exit. Use this to test Stop — a fake that exits immediately can finish
   * before the stop request even lands. The harness kills it on close.
   */
  hang?: boolean;
}

export interface FakeAgentCli {
  /** The command name, e.g. "claude". */
  name: string;
  /** Directory holding the executable. Prepend to PATH to shadow the real CLI. */
  dir: string;
  /** Absolute path to the executable — pass as an adapter's `config.command`. */
  command: string;
  /**
   * Replace the program. Steps are consumed in order, one per invocation; once
   * they run out, `fallback` answers every further invocation. Callable at any
   * time, including mid-test, to stage the next turn.
   */
  program(steps: FakeStep[], fallback?: FakeStep): Promise<void>;
  /**
   * Reprogram AND clear the invocation log, so step indices start from 0 again.
   *
   * Tests in a file share one booted Cabinet, so without this the log is
   * cumulative: the second test's `steps[0]` would never be reached (its first
   * invocation is index 3, say), and "exactly N invocations" assertions would
   * count the previous test's spawns. Call it in `beforeEach`.
   */
  reset(steps: FakeStep[], fallback?: FakeStep): Promise<void>;
  /** Every invocation so far, in spawn order. */
  invocations(): Promise<FakeInvocation[]>;
  /** Resolves once at least `count` invocations have been recorded. */
  waitForInvocations(count: number, timeoutMs?: number): Promise<FakeInvocation[]>;
  cleanup(): Promise<void>;
}

/**
 * The fake, as a Node program.
 *
 * Node rather than /bin/sh deliberately. A shell script's `sleep` runs in a
 * child process, and Cabinet's stop path (SIGTERM to the process group, then the
 * pid — signalStructuredProcess in cabinet-daemon.ts) does not reliably reap it,
 * so a hanging sh fake outlives the test. A Node process dies on SIGTERM by
 * default.
 *
 * It is written to a file rather than passed via `node -e` because the adapter
 * spawns `command` directly, with no shell.
 */
const RUNNER = String.raw`#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const STATE = __STATE__;
const LOG = path.join(STATE, "invocations.jsonl");
const PROGRAM = path.join(STATE, "program.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The adapter writes the prompt to stdin and ends it. Drain it — a child that
// exits without reading gives the adapter EPIPE, which would surface as a
// spurious failed run rather than the behaviour under test.
function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(buf));
  });
}

// Shallow-ish recursive listing. Depth-limited because a mounted skill can
// symlink to an arbitrarily deep tree and the log is not the place for it.
function walk(dir, prefix, depth, out) {
  if (depth > 3) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    // Skills are mounted as symlinks, so follow them rather than reporting a
    // bare link name — an unresolvable link is the bug we would want to see.
    const full = path.join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) walk(full, rel, depth + 1, out);
    else out.push(rel);
  }
  return out;
}

async function main() {
  const stdin = await readStdin();
  const args = process.argv.slice(2);

  const dirs = {};
  for (const arg of args) {
    if (!path.isAbsolute(arg) || dirs[arg]) continue;
    try {
      if (fs.statSync(arg).isDirectory()) dirs[arg] = walk(arg, "", 0, []);
    } catch {
      // Not a path we can see. Fine — the absence is itself informative.
    }
  }

  // Record BEFORE acting, so a hanging or failing step is still observable.
  // Append-only, with the existing line count as the index, keeps concurrent
  // invocations from clobbering each other's slot.
  const index = fs.existsSync(LOG)
    ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).length
    : 0;
  fs.appendFileSync(
    LOG,
    JSON.stringify({ index, args, stdin, cwd: process.cwd(), dirs }) + "\n"
  );

  const program = JSON.parse(fs.readFileSync(PROGRAM, "utf8"));
  const step = program.steps[index] ?? program.fallback ?? {};

  if (step.delayMs) await sleep(step.delayMs);

  for (const [rel, content] of Object.entries(step.files ?? {})) {
    const dest = path.resolve(process.cwd(), rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }

  for (const line of step.stdout ?? []) {
    process.stdout.write(line + "\n");
    if (step.lineDelayMs) await sleep(step.lineDelayMs);
  }

  if (step.stderr) process.stderr.write(step.stderr);

  if (step.hang) {
    // Hold the event loop open until signalled. SIGTERM's default action ends us.
    await new Promise(() => {});
  }

  process.exit(step.exitCode ?? 0);
}

main();
`;

/**
 * `name` must match what the adapter looks for on PATH ("claude" for the
 * claude-code provider, "codex", "cursor-agent", "gemini", "opencode", "pi").
 *
 * `intoDir` writes the executable into a caller-owned directory. The harness
 * uses this to place fakes in a temp $HOME/.local/bin, which buildRuntimePath
 * ranks ahead of every real install — merely prepending to $PATH is NOT enough,
 * because that function puts ~/.local/bin, /usr/local/bin and /opt/homebrew/bin
 * in front of $PATH. A real Claude install would win, and the "fake" test would
 * quietly bill a real model.
 */
export async function createFakeAgentCli(
  name: string,
  steps: FakeStep[] = [],
  intoDir?: string,
  fallback?: FakeStep
): Promise<FakeAgentCli> {
  const owned = !intoDir;
  const dir =
    intoDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), `cabinet-fake-${name}-`)));
  const state = await fs.mkdtemp(path.join(os.tmpdir(), `cabinet-fake-${name}-state-`));
  const command = path.join(dir, name);

  await fs.writeFile(command, RUNNER.replace("__STATE__", JSON.stringify(state)), "utf8");
  await fs.chmod(command, 0o755);

  const logPath = path.join(state, "invocations.jsonl");
  const programPath = path.join(state, "program.json");

  const program = async (next: FakeStep[], nextFallback?: FakeStep) => {
    await fs.writeFile(
      programPath,
      JSON.stringify({ steps: next, fallback: nextFallback ?? null }),
      "utf8"
    );
  };
  await program(steps, fallback);

  const invocations = async (): Promise<FakeInvocation[]> => {
    let raw: string;
    try {
      raw = await fs.readFile(logPath, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const record = JSON.parse(line) as Omit<
          FakeInvocation,
          "flag" | "has" | "filesIn"
        >;
        const flag = (needle: string) => {
          const at = record.args.indexOf(needle);
          return at === -1 ? undefined : record.args[at + 1];
        };
        return {
          ...record,
          flag,
          has: (needle: string) => record.args.includes(needle),
          filesIn: (needle: string) => {
            const dir = flag(needle);
            return dir ? (record.dirs[dir] ?? []) : [];
          },
        };
      });
  };

  const waitForInvocations = async (count: number, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const seen = await invocations();
      if (seen.length >= count) return seen;
      if (Date.now() > deadline) {
        throw new Error(
          `${name}: timed out after ${timeoutMs}ms waiting for ${count} invocation(s); saw ${seen.length}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const reset = async (next: FakeStep[], nextFallback?: FakeStep) => {
    await fs.rm(logPath, { force: true });
    await program(next, nextFallback);
  };

  return {
    name,
    dir,
    command,
    program,
    reset,
    invocations,
    waitForInvocations,
    cleanup: async () => {
      await fs.rm(state, { recursive: true, force: true });
      await (owned
        ? fs.rm(dir, { recursive: true, force: true })
        : fs.rm(command, { force: true }));
    },
  };
}

// ---------------------------------------------------------------------------
// Stream builders
//
// Only the event shapes claude-stream.ts actually reads are modelled here. It
// ignores every other line, so emitting more would be theatre — and omitting one
// of these silently drops the field it feeds (a `usage` missing either token
// count, for instance, is discarded rather than half-recorded).
// ---------------------------------------------------------------------------

const json = (value: unknown) => JSON.stringify(value);

export interface CabinetBlock {
  summary?: string;
  context?: string;
  /** Recorded as ARTIFACT: lines — paths the agent claims it wrote. */
  artifacts?: string[];
  /** Raw extra lines, e.g. `LAUNCH_TASK: editor | do the thing`. */
  lines?: string[];
}

/**
 * The trailing ```cabinet fence the epilogue REQUIRES of every run.
 *
 * This matters beyond tidiness. When a completed Claude run omits it, the runner
 * spends a second CLI invocation asking for it (the CABINET_BLOCK_RETRY_PROMPT
 * path in conversation-runner.ts). A fake that never emits one therefore makes
 * every test a two-invocation test, with two agent turns carrying identical text
 * — the exact race the original spec worked around with `.first()`.
 */
export function cabinetBlock(block: CabinetBlock = {}): string {
  const lines = [
    `SUMMARY: ${block.summary ?? "done"}`,
    ...(block.context ? [`CONTEXT: ${block.context}`] : []),
    ...(block.artifacts ?? []).map((artifact) => `ARTIFACT: ${artifact}`),
    ...(block.lines ?? []),
  ];
  return ["```cabinet", ...lines, "```"].join("\n");
}

export interface ClaudeStreamOptions {
  /** The assistant's reply text, streamed as a text_delta. */
  text: string;
  /** Captured by the adapter and replayed as `--resume <id>` on the next turn. */
  sessionId?: string;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
  /**
   * Appended to `text` as a ```cabinet fence. Pass `null` to omit it and
   * deliberately provoke the runner's cabinet-block retry.
   */
  cabinet?: CabinetBlock | null;
  /** Tool results, surfaced in the transcript wrapped in output sentinels. */
  toolResults?: Array<{ stdout?: string; stderr?: string }>;
  /** "none" => a subscription run; anything else => an API-key run. */
  apiKeySource?: string;
}

/** A successful Claude Code print-mode stream. Mirrors claude-local.test.ts. */
export function claudeStream(options: ClaudeStreamOptions): string[] {
  const {
    text,
    sessionId = "e2e-session",
    model = "claude-sonnet-4-6",
    usage = { input_tokens: 4, output_tokens: 2 },
    cabinet = {},
    toolResults = [],
    apiKeySource = "none",
  } = options;

  const body = cabinet === null ? text : `${text}\n\n${cabinetBlock(cabinet)}`;

  return [
    json({ type: "system", subtype: "init", apiKeySource, session_id: sessionId }),
    json({
      type: "stream_event",
      event: { type: "message_start", message: { model, usage } },
      session_id: sessionId,
    }),
    ...toolResults.map((result) =>
      json({ type: "user", tool_use_result: result, session_id: sessionId })
    ),
    json({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: body } },
      session_id: sessionId,
    }),
    json({ type: "result", result: body, usage, session_id: sessionId }),
  ];
}

/**
 * Sugar: one successful step that replies with `text`.
 *
 * Accepts step-level fields (`files`, `delayMs`, …) alongside the stream options
 * and routes each to the right place — they are separated here rather than at the
 * call site because forwarding `files` into the stream builder silently drops it:
 * the builder ignores unknown keys, so the step would emit the right text and
 * write nothing, and the test would fail far from the cause.
 */
export function claudeReply(
  text: string,
  options: Partial<ClaudeStreamOptions> &
    Pick<FakeStep, "files" | "delayMs" | "lineDelayMs"> = {}
): FakeStep {
  const { files, delayMs, lineDelayMs, ...stream } = options;
  return {
    stdout: claudeStream({ text, ...stream }),
    ...(files ? { files } : {}),
    ...(delayMs ? { delayMs } : {}),
    ...(lineDelayMs ? { lineDelayMs } : {}),
  };
}

/**
 * A failed run. Cabinet never shows stderr to the user; it feeds it to
 * classifyError (error-classification.ts), so the message chooses the errorKind:
 *   "command not found" → cli_not_found    "401 / not logged in" → auth_expired
 *   "429 / rate limit"  → rate_limited     "session expired"     → session_expired
 */
export function claudeFailure(stderr: string, exitCode = 1): FakeStep {
  return { stderr, exitCode };
}
