import fs from "fs";
import path from "path";
import util from "util";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";

/**
 * Cabinet's diagnostic logger (docs/LOGGING_AND_FILE_HISTORY_PRD.md §3).
 *
 * One JSONL file per process under $DATA_DIR/.cabinet-state/logs/, rotated
 * at 5 MB with a single prior generation — a hard ceiling of ~10 MB per
 * stream, no rotation daemon. Logging must never take the app down: every
 * disk touch is wrapped, and failures degrade to console-only.
 *
 * Never log secret values, full prompts, page contents, or message bodies
 * at any level. Local file paths are fine here (unlike telemetry).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogProcess = "next" | "daemon" | "electron" | "renderer";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_FILE_BYTES = 5 * 1024 * 1024; // rotate at 5 MB
const MAX_LINE_CHARS = 8 * 1024; // one runaway line can't eat the budget

export const LOGS_DIR = path.join(CABINET_INTERNAL_DIR, "logs");
const CONFIG_FILE = path.join(LOGS_DIR, "config.json");
const CRASH_MARKER_FILE = path.join(LOGS_DIR, "last-crash.json");

let procName: LogProcess = "next";
let minLevel: LogLevel = "info";
let consoleWrapped = false;
let crashHandlersInstalled = false;

// The wrapped console must never feed itself; everything the logger prints
// goes through the originals captured at wrap time.
const original: Pick<Console, "log" | "info" | "warn" | "error" | "debug"> = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

function isLevel(v: unknown): v is LogLevel {
  return v === "debug" || v === "info" || v === "warn" || v === "error";
}

function readConfiguredLevel(): LogLevel {
  const env = process.env.CABINET_LOG_LEVEL;
  if (isLevel(env)) return env;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { level?: string };
    if (isLevel(parsed.level)) return parsed.level;
  } catch {
    // no config yet — default
  }
  return "info";
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

/** Persist + apply a new minimum level for this process. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ level }, null, 2));
  } catch {
    // config persistence is best-effort
  }
}

function logFile(proc: LogProcess): string {
  return path.join(LOGS_DIR, `${proc}.log`);
}

function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_FILE_BYTES) return;
    const prev = file.replace(/\.log$/, ".1.log");
    fs.rmSync(prev, { force: true });
    fs.renameSync(file, prev);
  } catch {
    // missing file or fs error — append will create / fail silently
  }
}

interface LogLine {
  ts: string;
  lvl: LogLevel;
  proc: LogProcess;
  scope: string;
  msg: string;
  data?: Record<string, unknown>;
  err?: { name: string; message: string; stack?: string };
}

function serializeError(err: unknown): LogLine["err"] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "NonError", message: util.inspect(err, { depth: 3 }) };
}

function appendLine(proc: LogProcess, line: LogLine): void {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const file = logFile(proc);
    rotateIfNeeded(file);
    let payload = JSON.stringify(line);
    if (payload.length > MAX_LINE_CHARS) {
      payload = JSON.stringify({
        ...line,
        msg: line.msg.slice(0, 2000) + "…[truncated]",
        data: undefined,
        err: line.err
          ? { ...line.err, stack: line.err.stack?.slice(0, 4000) }
          : undefined,
      });
    }
    fs.appendFileSync(file, payload + "\n", "utf-8");
  } catch {
    // never throw from the logger
  }
}

function write(
  level: LogLevel,
  scope: string,
  msg: string,
  data?: Record<string, unknown>,
  err?: unknown
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  appendLine(procName, {
    ts: new Date().toISOString(),
    lvl: level,
    proc: procName,
    scope,
    msg,
    ...(data && Object.keys(data).length ? { data } : {}),
    ...(err !== undefined ? { err: serializeError(err) } : {}),
  });
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, data?: Record<string, unknown>): void;
}

/**
 * Scoped logger. Writes to the process log file AND echoes to the real
 * console (tee — the dev terminal experience stays intact). The echo uses
 * the pre-wrap console so captured-console and logger lines can't recurse.
 */
export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  return {
    debug(msg, data) {
      write("debug", scope, msg, data);
      if (LEVEL_RANK[minLevel] <= LEVEL_RANK.debug) original.debug(prefix, msg);
    },
    info(msg, data) {
      write("info", scope, msg, data);
      original.info(prefix, msg);
    },
    warn(msg, data) {
      write("warn", scope, msg, data);
      original.warn(prefix, msg);
    },
    error(msg, err, data) {
      write("error", scope, msg, data, err);
      if (err !== undefined) original.error(prefix, msg, err);
      else original.error(prefix, msg);
    },
  };
}

/** "[board] something happened" → { scope: "board", rest: "something happened" } */
function splitBracketScope(msg: string): { scope: string; rest: string } {
  const m = /^\[([a-zA-Z0-9_:-]{1,40})\]\s?([^]*)$/.exec(msg);
  if (m) return { scope: m[1], rest: m[2] };
  return { scope: "console", rest: msg };
}

function formatConsoleArgs(args: unknown[]): {
  msg: string;
  err?: unknown;
} {
  let err: unknown;
  const parts = args.map((a) => {
    if (a instanceof Error) {
      if (err === undefined) err = a;
      return a.message;
    }
    return typeof a === "string" ? a : util.inspect(a, { depth: 4, maxStringLength: 2000 });
  });
  return { msg: parts.join(" "), err };
}

/**
 * Capture-first strategy (PRD §3.2): wrap the global console so the ~150
 * existing call sites land in the log file without a migration. Originals
 * still print, so terminals see exactly what they always did.
 */
function wrapConsole(): void {
  if (consoleWrapped) return;
  consoleWrapped = true;

  const capture = (level: LogLevel) => {
    const orig = level === "warn" ? original.warn : level === "error" ? original.error : original.log;
    return (...args: unknown[]) => {
      orig(...args);
      try {
        const { msg, err } = formatConsoleArgs(args);
        const { scope, rest } = splitBracketScope(msg);
        write(level, scope, rest, undefined, err);
      } catch {
        // capture must never break console
      }
    };
  };

  console.log = capture("info");
  console.info = capture("info");
  console.debug = capture("debug");
  console.warn = capture("warn");
  console.error = capture("error");
}

export interface CrashMarker {
  ts: string;
  proc: LogProcess;
  message: string;
}

function writeCrashMarker(message: string): void {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    const marker: CrashMarker = {
      ts: new Date().toISOString(),
      proc: procName,
      message: message.slice(0, 500),
    };
    fs.writeFileSync(CRASH_MARKER_FILE, JSON.stringify(marker, null, 2));
  } catch {
    // best-effort
  }
}

export function readCrashMarker(): CrashMarker | null {
  try {
    return JSON.parse(fs.readFileSync(CRASH_MARKER_FILE, "utf-8")) as CrashMarker;
  } catch {
    return null;
  }
}

export function clearCrashMarker(): void {
  try {
    fs.rmSync(CRASH_MARKER_FILE, { force: true });
  } catch {
    // best-effort
  }
}

function installCrashHandlers(): void {
  if (crashHandlersInstalled) return;
  crashHandlersInstalled = true;

  // Monitor-only: observes the exception WITHOUT changing crash semantics
  // (the daemon's own keep-alive handler, where present, still decides).
  process.on("uncaughtExceptionMonitor", (err) => {
    write("error", "crash", "uncaught exception", undefined, err);
    writeCrashMarker(err instanceof Error ? err.message : String(err));
    void emitCrashTelemetry();
  });

  process.on("unhandledRejection", (reason) => {
    write("error", "crash", "unhandled rejection", undefined, reason);
  });
}

async function emitCrashTelemetry(): Promise<void> {
  try {
    const { emit } = await import("@/lib/telemetry");
    emit("crash.detected", { proc: procName });
  } catch {
    // telemetry is optional
  }
}

/**
 * One-time per-process init: sets the stream name, resolves the level,
 * wraps the console, installs crash capture. Idempotent.
 */
export function initProcessLogging(proc: LogProcess): Logger {
  procName = proc;
  minLevel = readConfiguredLevel();
  wrapConsole();
  installCrashHandlers();
  const log = createLogger("boot");
  write("info", "boot", `${proc} logging initialized`, { level: minLevel });
  return log;
}

/** Renderer entries arrive over HTTP and are written by the Next process. */
export function appendRendererEntries(
  entries: Array<{
    ts?: string;
    lvl?: string;
    scope?: string;
    msg?: string;
    stack?: string;
    url?: string;
  }>
): void {
  for (const e of entries) {
    const lvl: LogLevel = isLevel(e.lvl) ? e.lvl : "error";
    appendLine("renderer", {
      ts: typeof e.ts === "string" ? e.ts : new Date().toISOString(),
      lvl,
      proc: "renderer",
      scope: typeof e.scope === "string" ? e.scope.slice(0, 40) : "renderer",
      msg: typeof e.msg === "string" ? e.msg.slice(0, 4000) : "",
      ...(e.stack || e.url
        ? {
            data: {
              ...(e.url ? { url: String(e.url).slice(0, 500) } : {}),
              ...(e.stack ? { stack: String(e.stack).slice(0, 4000) } : {}),
            },
          }
        : {}),
    });
  }
}

/** Last `lines` lines of a process log (current + previous generation). */
export function getLogTail(proc: LogProcess, lines: number): string {
  const chunks: string[] = [];
  for (const file of [logFile(proc).replace(/\.log$/, ".1.log"), logFile(proc)]) {
    try {
      chunks.push(fs.readFileSync(file, "utf-8"));
    } catch {
      // stream may not exist yet
    }
  }
  const all = chunks.join("");
  if (!all) return "";
  const split = all.split("\n").filter(Boolean);
  return split.slice(-lines).join("\n");
}

export function listLogFiles(): string[] {
  try {
    return fs
      .readdirSync(LOGS_DIR)
      .filter((f) => f.endsWith(".log"))
      .map((f) => path.join(LOGS_DIR, f));
  } catch {
    return [];
  }
}
