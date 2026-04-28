/**
 * Cabinet Daemon — unified background server
 *
 * Combines:
 * - Terminal Server (PTY/WebSocket for AI panel agent sessions)
 * - Job Scheduler (node-cron for agent jobs)
 * - WebSocket Event Bus (real-time updates to frontend)
 * - SQLite database initialization
 *
 * Usage: npx tsx server/cabinet-daemon.ts
 */

// Boot-time native-binary check: rebuild better-sqlite3 if it was prebuilt
// against a different NODE_MODULE_VERSION, otherwise the daemon would crash
// silently on first DB access while Next.js stays up.
import { ensureBetterSqlite3 } from "../src/lib/system/preflight-sqlite";
ensureBetterSqlite3();

// Load `.cabinet.env` into process.env on daemon boot. Adapter spawns also
// re-merge from the file directly (mtime-cached), but loading here keeps the
// daemon's own behavior consistent with Next.js.
import { loadCabinetEnv } from "../src/lib/runtime/cabinet-env";
loadCabinetEnv();

import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import http from "http";
import fs from "fs";
import cron from "node-cron";
import yaml from "js-yaml";
import chokidar from "chokidar";
import matter from "gray-matter";
import { getDb, closeDb } from "./db";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { discoverCabinetPathsSync } from "../src/lib/cabinets/discovery";
import { resolveCabinetDir } from "../src/lib/cabinets/server-paths";
import {
  getAppOrigin,
  getDaemonPort,
} from "../src/lib/runtime/runtime-config";
import {
  getDetachedPromptLaunchMode,
  resolveProviderId,
} from "../src/lib/agents/provider-runtime";
import {
  agentAdapterRegistry,
  resolveLegacyExecutionProviderId,
} from "../src/lib/agents/adapters";
import { getNvmNodeBin } from "../src/lib/agents/nvm-path";
import {
  appendConversationTranscript,
  cleanupStaleStagingAttachments,
  finalizeConversation,
  listConversationMetas,
  readConversationMeta,
  readConversationTranscript,
  transcriptShowsCompletedRun,
  writeSession,
} from "../src/lib/agents/conversation-store";
import {
  getTokenFromAuthorizationHeader,
  isDaemonTokenValid,
} from "../src/lib/agents/daemon-auth";
import {
  normalizeJobConfig,
  normalizeJobId,
} from "../src/lib/jobs/job-normalization";
import { stripAnsi } from "./pty/ansi";
import {
  completeClaudeSession,
  distillPtyOutput,
  scheduleStreamCabinetExtraction,
} from "./pty/claude-lifecycle";
import {
  createPtyManager,
  type PtyManager,
} from "./pty/manager";
import type { BaseSession, CompletedOutputEntry, PtySession } from "./pty/types";
import { SearchIndex, buildPageRecord, walkDataDir } from "./search/index-builder";
import { runSearch } from "./search/search-service";
import { startWatcher } from "./search/watcher";
import { loadAgentDocs, loadTaskDocs } from "./search/index-agents-tasks";
import type { SearchScope } from "./search/types";
import {
  clearSessionId,
  emit as emitTelemetry,
  getOrCreateSessionId,
  printStartupBannerIfNeeded,
  startTelemetryFlusher,
} from "../src/lib/telemetry";

const PORT = getDaemonPort();
const CABINET_MANIFEST_FILE = ".cabinet";

// ===== Search index =====

const searchIndex = new SearchIndex();
let searchIndexReady = false;

async function bootstrapSearchIndex(): Promise<void> {
  const t0 = Date.now();
  broadcast("search", { type: "search:indexing", total: 0, done: 0 });
  try {
    const files = await walkDataDir();
    for (const { fsPath, virtualPath } of files) {
      const record = await buildPageRecord(fsPath, virtualPath);
      if (record) searchIndex.add(record);
    }
    searchIndexReady = true;
    const tookMs = Date.now() - t0;
    console.log(`  Search index: ${searchIndex.size()} pages in ${tookMs}ms`);
    broadcast("search", {
      type: "search:ready",
      pages: searchIndex.size(),
      tookMs,
    });
  } catch (err) {
    console.error("[cabinet-daemon] search index bootstrap failed:", err);
    broadcast("search", {
      type: "search:error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function startSearchWatcher(): void {
  startWatcher(searchIndex, {
    onIndexed: ({ path: p, kind }) => {
      broadcast("search", {
        type: "search:indexed",
        path: p,
        kind,
        pages: searchIndex.size(),
      });
    },
  });
}

interface CabinetEntry {
  /** Relative path from DATA_DIR, empty string for root */
  relPath: string;
  /** Absolute directory path */
  absDir: string;
}

function discoverAllCabinets(): CabinetEntry[] {
  return discoverCabinetPathsSync().map((relPath) => ({
    relPath,
    absDir: resolveCabinetDir(relPath),
  }));
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function getAllowedBrowserOrigins(): Set<string> {
  return new Set(
    [
      getAppOrigin(),
      ...(process.env.CABINET_APP_ORIGIN
        ? process.env.CABINET_APP_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean)
        : []),
    ]
  );
}

function browserOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (getAllowedBrowserOrigins().has(origin)) {
    return true;
  }

  return isLoopbackOrigin(origin);
}

// ----- Database Initialization -----

console.log("Initializing Cabinet database...");
getDb();
console.log("Database ready.");

const nvmBin = getNvmNodeBin();
const enrichedPath = [
  `${process.env.HOME}/.local/bin`,
  "/usr/local/bin",
  "/opt/homebrew/bin",
  ...(nvmBin ? [nvmBin] : []),
  process.env.PATH,
].join(":");

// ===== Session orchestration =====
// PTY-specific types + lifecycle helpers live in server/pty/*. The daemon
// owns the unified `sessions` map (PTY + structured), routes HTTP/WS, and
// drives the scheduler + event bus.

interface StructuredSession extends BaseSession {
  kind: "structured";
  timeoutHandle?: NodeJS.Timeout;
  pid?: number;
  processGroupId?: number | null;
  startedAt?: string;
  /** Claude-side (or adapter-side) resume session id extracted from result. */
  adapterSessionId?: string | null;
  /**
   * Adapter-specific session params (raw, pre-codec). The client-side runner
   * runs `adapter.sessionCodec.serialize` against these to produce the
   * `codecBlob` that lands in `session.json`.
   */
  adapterSessionParams?: Record<string, unknown> | null;
  /** Token usage reported by the adapter. */
  adapterUsage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  } | null;
  /**
   * Classified error from the last failed run, written by the daemon so both
   * the poll path and `finalizeSessionConversation` can attach it to
   * `ConversationMeta`.
   */
  adapterErrorKind?:
    | "cli_not_found"
    | "auth_expired"
    | "rate_limited"
    | "session_expired"
    | "context_exceeded"
    | "transport"
    | "timeout"
    | "model_unavailable"
    | "unknown"
    | null;
  adapterErrorHint?: string | null;
  adapterErrorRetryAfterSec?: number | null;
  /** Buffered stderr, used by classifyError on completion. */
  stderrBuffer?: string;
}

type ActiveSession = PtySession | StructuredSession;

const sessions = new Map<string, ActiveSession>();
const completedOutput = new Map<string, CompletedOutputEntry>();

function resolveSessionCwd(input?: string): string {
  if (!input) return DATA_DIR;

  const asAbsolute = path.resolve(input);
  if (asAbsolute.startsWith(DATA_DIR)) return asAbsolute;

  // Also accept DATA_DIR-relative paths (e.g. passed from the frontend
  // which doesn't know the absolute DATA_DIR prefix).
  const relative = path.join(DATA_DIR, input);
  if (relative.startsWith(DATA_DIR)) return relative;

  return DATA_DIR;
}

function applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (browserOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
}

function requestToken(req: http.IncomingMessage, url: URL): string | null {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  return getTokenFromAuthorizationHeader(authHeader) || url.searchParams.get("token");
}

function rejectUnauthorized(res: http.ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized" }));
}




function clearSessionStopFallbackTimer(session: ActiveSession): void {
  if (!session.stopFallbackTimer) return;
  clearTimeout(session.stopFallbackTimer);
  delete session.stopFallbackTimer;
}





async function syncConversationChunk(sessionId: string, chunk: string): Promise<void> {
  const meta = await readConversationMeta(sessionId);
  if (!meta) return;
  const plainChunk = stripAnsi(chunk);
  if (!plainChunk) return;
  await appendConversationTranscript(sessionId, plainChunk, meta.cabinetPath);
}

function emitSessionOutput(
  session: ActiveSession,
  chunk: string,
  onData?: (chunk: string) => void
): void {
  if (!chunk) return;

  session.output.push(chunk);
  void syncConversationChunk(session.id, chunk).catch(() => {});
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(chunk);
  }
  onData?.(chunk);

  if (session.kind === "pty") {
    scheduleStreamCabinetExtraction(session);
  }
}

async function finalizeSessionConversation(session: ActiveSession): Promise<void> {
  const meta = await readConversationMeta(session.id);
  if (!meta) return;

  const plain = stripAnsi(session.output.join(""));
  if (meta.status !== "running") {
    completedOutput.set(session.id, { output: plain, completedAt: Date.now() });
    return;
  }
  const adapterUsage =
    session.kind === "structured" ? session.adapterUsage ?? null : null;
  const adapterErrorKind =
    session.kind === "structured" ? session.adapterErrorKind ?? null : null;
  const adapterErrorHint =
    session.kind === "structured" ? session.adapterErrorHint ?? null : null;
  const adapterErrorRetryAfterSec =
    session.kind === "structured" ? session.adapterErrorRetryAfterSec ?? null : null;

  // For legacy PTY sessions, substitute a distilled 1-liner for summary
  // extraction so the task detail doesn't render random box-drawing chars as
  // the task summary. The raw transcript is already on disk (appended chunk
  // by chunk), so nothing is lost — this only affects meta.summary.
  const summaryOutput =
    session.kind === "pty"
      ? distillPtyOutput(plain, session.exitCode, session.providerId)
      : plain;

  await finalizeConversation(session.id, {
    status: session.resolvedStatus || (session.exitCode === 0 ? "completed" : "failed"),
    exitCode: session.resolvedStatus === "completed" ? 0 : session.exitCode,
    output: summaryOutput,
    tokens: adapterUsage
      ? {
          input: adapterUsage.inputTokens,
          output: adapterUsage.outputTokens,
          cache: adapterUsage.cachedInputTokens,
          total: adapterUsage.inputTokens + adapterUsage.outputTokens,
        }
      : undefined,
    errorKind: adapterErrorKind ?? undefined,
    errorHint: adapterErrorHint ?? undefined,
    errorRetryAfterSec: adapterErrorRetryAfterSec ?? undefined,
  }, meta.cabinetPath);

  // Legacy PTY terminal-mode resume: if the provider's stream parser caught
  // a session id during the run, persist it via writeSession so the next
  // continue turn can pass it back to the CLI as `--resume` / `--session`.
  // Currently only Claude's `claude-stream-json` accumulator runs in the
  // PTY path (one-shot mode) — Cursor/OpenCode capture their session ids
  // only when routed through the structured adapter, so this block is a
  // no-op for them until we wire stream-parsing for their PTY modes too.
  if (session.kind === "pty" && session.structuredOutput) {
    const resumeId = session.structuredOutput.sessionId ?? null;
    if (resumeId) {
      try {
        await writeSession(
          session.id,
          {
            kind: session.adapterType || "legacy_pty_cli",
            resumeId,
            alive: false,
            lastUsedAt: new Date().toISOString(),
            codecBlob: { resumeId },
          },
          meta.cabinetPath
        );
      } catch (err) {
        console.warn(`Session ${session.id}: failed to persist PTY resume id`, err);
      }
    }
  }
}

function sessionStatus(session: ActiveSession): "running" | "completed" | "failed" {
  if (session.resolvedStatus) {
    return session.resolvedStatus;
  }

  if (!session.exited) {
    return "running";
  }

  return session.exitCode === 0 ? "completed" : "failed";
}

function signalStructuredProcess(
  pid: number | undefined,
  processGroupId: number | null | undefined,
  signal: NodeJS.Signals
): void {
  if (process.platform !== "win32" && processGroupId && processGroupId > 0) {
    try {
      process.kill(-processGroupId, signal);
      return;
    } catch {
      // Fall back to the direct child signal below.
    }
  }

  if (typeof pid === "number" && pid > 0) {
    process.kill(pid, signal);
  }
}

function attachSessionInput(session: ActiveSession, msg: string): void {
  if (session.kind !== "pty") {
    return;
  }

  try {
    const parsed = JSON.parse(msg);
    if (parsed.type === "resize" && parsed.cols && parsed.rows) {
      session.pty.resize(parsed.cols, parsed.rows);
      return;
    }
  } catch {
    // Not JSON, treat as terminal input.
  }

  session.pty.write(msg);
}

function attachSessionSocket(session: ActiveSession, ws: WebSocket): void {
  session.ws = ws;

  const replay = session.output.join("");
  if (replay && ws.readyState === WebSocket.OPEN) {
    ws.send(replay);
  }

  if (session.exited) {
    ws.send(`\r\n\x1b[90m[Process exited with code ${session.exitCode}]\x1b[0m\r\n`);
    const raw = session.output.join("");
    const plain = stripAnsi(raw);
    completedOutput.set(session.id, { output: plain, completedAt: Date.now() });
    sessions.delete(session.id);
    ws.close();
    return;
  }

  ws.on("message", (data: Buffer) => {
    attachSessionInput(session, data.toString());
  });

  ws.on("close", () => {
    console.log(`Session ${session.id} detached (WebSocket closed, session kept alive)`);
    session.ws = null;
  });
}

// Cleanup old completed output every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, data] of completedOutput) {
    if (data.completedAt < cutoff) {
      completedOutput.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Cleanup detached sessions that have exited and been idle for 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.exited && !session.ws && session.createdAt.getTime() < cutoff) {
      const raw = session.output.join("");
      const plain = stripAnsi(raw);
      completedOutput.set(id, { output: plain, completedAt: Date.now() });
      sessions.delete(id);
      console.log(`Cleaned up exited detached session ${id}`);
    }
  }
}, 60 * 1000);

function handlePtyConnection(ws: WebSocket, req: http.IncomingMessage): void {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("id") || `session-${Date.now()}`;
  const prompt = url.searchParams.get("prompt");
  const providerId = url.searchParams.get("providerId") || undefined;
  const adapterType = url.searchParams.get("adapterType") || undefined;
  const cwd = url.searchParams.get("cwd") || undefined;
  const reconnectOnly = url.searchParams.get("reconnect") === "1";

  // Check if this is a reconnection to an existing session
  const existing = sessions.get(sessionId);
  if (existing) {
    console.log(`Session ${sessionId} reconnected (exited=${existing.exited})`);
    attachSessionSocket(existing, ws);
    return;
  }

  // Reconnect-only mode: the client is loading a finished terminal task and
  // just wants to see the historical transcript. Serve it from the completed-
  // output cache first (recent runs), then fall back to the persisted
  // transcript on disk for older ones. If neither has content, send a small
  // "no stored output" marker. Never spawn a fresh PTY in this mode — that
  // was the bug where refreshing an old task silently started a new CLI.
  if (reconnectOnly) {
    void (async () => {
      const cached = completedOutput.get(sessionId);
      let replay = cached?.output || null;
      let source: "cache" | "disk" | null = cached ? "cache" : null;
      let replayMeta: Awaited<ReturnType<typeof readConversationMeta>> = null;
      try {
        replayMeta = await readConversationMeta(sessionId);
      } catch {
        replayMeta = null;
      }

      if (!replay) {
        try {
          const meta = replayMeta;
          if (meta) {
            const transcript = await readConversationTranscript(
              sessionId,
              meta.cabinetPath
            );
            if (transcript && transcript.trim()) {
              replay = transcript;
              source = "disk";
            }
          }
        } catch (err) {
          console.warn(
            `Session ${sessionId} reconnect: failed to read transcript`,
            err
          );
        }
      }

      if (ws.readyState !== WebSocket.OPEN) return;

      // Prefix the replay with a provenance banner so the user can always
      // verify which CLI actually ran (transcripts can accumulate stale
      // tails from earlier buggy spawn paths — see T21 history). Also emit
      // a clear-screen + cursor-home so xterm renders the replay from the
      // top instead of auto-scrolling to whatever was last written.
      const banner = replayMeta
        ? [
            "\x1b[2J\x1b[H", // clear screen + home cursor
            `\x1b[90m[cabinet] \x1b[36m${replayMeta.providerId ?? "unknown"}\x1b[90m · ` +
              `${replayMeta.adapterType ?? "?"}\x1b[0m\r\n` +
              `\x1b[90mstarted ${replayMeta.startedAt ?? "?"}` +
              (replayMeta.completedAt
                ? ` · finished ${replayMeta.completedAt}`
                : "") +
              `\x1b[0m\r\n` +
              `\x1b[90m─────────────────────────────────────────\x1b[0m\r\n`,
          ].join("")
        : "\x1b[2J\x1b[H";
      ws.send(banner);

      if (replay) {
        ws.send(replay);
        const note =
          source === "disk"
            ? "\r\n\x1b[90m[Replayed from saved transcript. Session has ended.]\x1b[0m\r\n"
            : "\r\n\x1b[90m[Session has ended. Showing cached output.]\x1b[0m\r\n";
        ws.send(note);
      } else {
        ws.send(
          "\r\n\x1b[90m[This session has ended and no stored output is available.]\x1b[0m\r\n"
        );
      }
      ws.close();
    })();
    return;
  }

  // New session — spawn PTY or structured adapter execution. Read the
  // conversation meta first so we can pick up `trigger`; the composer
  // always writes meta before the client opens the WS, so this is a
  // reliable signal (and falls back to undefined on miss, which keeps
  // the legacy auto-exit behavior — a safe default for unknown spawns).
  void (async () => {
    let trigger: import("../src/types/tasks").TaskTrigger | undefined;
    try {
      const meta = await readConversationMeta(sessionId);
      trigger = meta?.trigger;
    } catch {
      trigger = undefined;
    }
    try {
      createSession({
        sessionId,
        providerId,
        adapterType,
        prompt: prompt || undefined,
        cwd,
        trigger,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to spawn PTY for session ${sessionId}:`, errMsg);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[31mError: Failed to start agent CLI\x1b[0m\r\n`);
        ws.send(`\x1b[90m${errMsg}\x1b[0m\r\n`);
        ws.close();
      }
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) return;
    console.log(`Session ${sessionId} started (${prompt ? "agent" : "interactive"} mode, trigger=${trigger ?? "unknown"})`);
    attachSessionSocket(session, ws);
  })();
}


function createStructuredSession(input: {
  sessionId: string;
  providerId?: string;
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
  prompt?: string;
  cwd?: string;
  timeoutSeconds?: number;
  onData?: (chunk: string) => void;
  adapterSessionId?: string | null;
  /**
   * Pre-rehydrated adapter session params (codec-deserialized blob). Passed
   * straight through as `ctx.sessionParams` so the adapter can resume in its
   * native shape (e.g. Cursor sessionId + cwd, Codex threadId).
   */
  adapterSessionParams?: Record<string, unknown> | null;
}): StructuredSession {
  const adapter = agentAdapterRegistry.get(input.adapterType);
  if (!adapter) {
    throw new Error(`Unknown adapter type: ${input.adapterType}`);
  }
  if (!adapter.execute) {
    throw new Error(`Adapter ${input.adapterType} does not implement detached execution.`);
  }
  const prompt = input.prompt;
  if (!prompt?.trim()) {
    throw new Error(
      `Adapter ${input.adapterType} requires a prompt. Interactive structured sessions are not supported yet.`
    );
  }
  const execute = adapter.execute;

  const cwd = resolveSessionCwd(input.cwd);
  const session: StructuredSession = {
    id: input.sessionId,
    kind: "structured",
    providerId: adapter.providerId || input.providerId || "unknown",
    adapterType: input.adapterType,
    ws: null,
    createdAt: new Date(),
    output: [],
    exited: false,
    exitCode: null,
    stop: (signal = "SIGTERM") => {
      try {
        signalStructuredProcess(session.pid, session.processGroupId, signal);
      } catch {}
    },
  };
  sessions.set(input.sessionId, session);

  void (async () => {
    try {
      const result = await execute({
        runId: input.sessionId,
        adapterType: input.adapterType,
        config: input.adapterConfig || {},
        prompt,
        cwd,
        timeoutMs:
          typeof input.timeoutSeconds === "number" && input.timeoutSeconds > 0
            ? input.timeoutSeconds * 1000
            : undefined,
        sessionId: input.adapterSessionId ?? null,
        sessionParams: input.adapterSessionParams ?? null,
        onLog: async (stream, chunk) => {
          if (stream === "stderr") {
            session.stderrBuffer = (session.stderrBuffer ?? "") + chunk;
            // Cap stderr buffer at 64 KB so a chatty adapter doesn't OOM us.
            if (session.stderrBuffer.length > 65_536) {
              session.stderrBuffer = session.stderrBuffer.slice(-65_536);
            }
          }
          emitSessionOutput(session, chunk, input.onData);
        },
        onSpawn: async (meta) => {
          session.pid = meta.pid;
          session.processGroupId = meta.processGroupId;
          session.startedAt = meta.startedAt;
        },
      });

      session.exited = true;
      session.exitCode = result.exitCode;
      session.resolvedStatus =
        result.exitCode === 0 && !result.timedOut ? "completed" : "failed";
      session.adapterSessionId = result.sessionId ?? null;
      session.adapterSessionParams = result.sessionParams ?? null;
      session.adapterUsage = result.usage ?? null;

      // Classify failures so the UI can surface an actionable hint.
      // Prefer stderrBuffer, but fall back to the adapter-reported
      // `errorMessage` (used by structured CLIs like codex that emit error
      // events on STDOUT, e.g. plan-gated model rejections). Without the
      // fallback, model_unavailable and other stdout-reported failures
      // would classify as unknown despite the adapter having the real
      // reason ready to hand off.
      if (session.resolvedStatus === "failed" && adapter.classifyError) {
        try {
          const classifierInput =
            (session.stderrBuffer && session.stderrBuffer.trim())
              ? session.stderrBuffer
              : result.errorMessage ?? "";
          const classified = adapter.classifyError(
            classifierInput,
            result.exitCode
          );
          session.adapterErrorKind = classified.kind;
          session.adapterErrorHint = classified.hint ?? null;
          session.adapterErrorRetryAfterSec = classified.retryAfterSec ?? null;
        } catch {
          session.adapterErrorKind = "unknown";
        }
      } else if (session.resolvedStatus === "completed") {
        session.adapterErrorKind = null;
        session.adapterErrorHint = null;
        session.adapterErrorRetryAfterSec = null;
      }
      clearSessionStopFallbackTimer(session);

      if (!session.output.length && result.output) {
        emitSessionOutput(session, result.output, input.onData);
      }

      const plain = stripAnsi(session.output.join(""));
      completedOutput.set(input.sessionId, { output: plain, completedAt: Date.now() });
      await finalizeSessionConversation(session).catch(() => {});

      // Persist the adapter's resume handle + codec blob to the conversation
      // directory so future continues can resume. This only works when the
      // daemon session id IS the conversation id (startConversationRun's
      // path). Continue-via-daemon uses a synthetic runId and handles codec
      // serialization client-side from the /session/:id/output response.
      const hasResumeSignal =
        (result.sessionId || result.sessionParams) &&
        result.exitCode === 0 &&
        !result.timedOut;
      if (hasResumeSignal) {
        let codecBlob: Record<string, unknown> | null = null;
        let displayId: string | undefined;
        try {
          codecBlob =
            adapter.sessionCodec && result.sessionParams
              ? adapter.sessionCodec.serialize(result.sessionParams)
              : null;
          displayId =
            adapter.sessionCodec?.getDisplayId?.(result.sessionParams ?? {}) ||
            (result.sessionDisplayId ?? undefined);
        } catch {
          codecBlob = null;
        }
        await writeSession(
          input.sessionId,
          {
            kind: input.adapterType,
            resumeId: result.sessionId ?? undefined,
            alive: !result.clearSession,
            lastUsedAt: new Date().toISOString(),
            codecBlob,
            displayId,
          }
        ).catch(() => {});
      }

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        sessions.delete(input.sessionId);
        session.ws.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitSessionOutput(session, `${message}\n`, input.onData);
      session.stderrBuffer = (session.stderrBuffer ?? "") + message;
      session.exited = true;
      session.exitCode = 1;
      session.resolvedStatus = "failed";
      // Run classifyError on the spawn-time failure too — ENOENT etc. should
      // surface as `cli_not_found` so the UI can offer an Install CTA.
      if (adapter.classifyError) {
        try {
          const classified = adapter.classifyError(session.stderrBuffer, 1);
          session.adapterErrorKind = classified.kind;
          session.adapterErrorHint = classified.hint ?? null;
          session.adapterErrorRetryAfterSec = classified.retryAfterSec ?? null;
        } catch {
          session.adapterErrorKind = "unknown";
        }
      }
      clearSessionStopFallbackTimer(session);
      const plain = stripAnsi(session.output.join(""));
      completedOutput.set(input.sessionId, { output: plain, completedAt: Date.now() });
      await finalizeSessionConversation(session).catch(() => {});

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        sessions.delete(input.sessionId);
        session.ws.close();
      }
    }
  })();

  return session;
}

// Shared PTY manager — owns the PTY-spawn factory + stdin injection path.
// The `sessions` map and `completedOutput` map stay in the daemon so the
// HTTP/WS routes can look up either PTY or structured sessions by id.
const ptyManager: PtyManager = createPtyManager({
  // Map<string, ActiveSession> is invariant in TS; the manager reads it as
  // Map<string, BaseSession> and narrows on kind, so cast through BaseSession
  // rather than duplicating the map across modules.
  sessions: sessions as unknown as Map<string, BaseSession>,
  completedOutput,
  finalizeSessionConversation,
  emitSessionOutput,
  clearSessionStopFallbackTimer,
  resolveSessionCwd,
  enrichedPath,
});

function createSession(input: {
  sessionId: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  prompt?: string;
  cwd?: string;
  timeoutSeconds?: number;
  onData?: (chunk: string) => void;
  launchMode?: "session" | "one-shot";
  adapterSessionId?: string | null;
  adapterSessionParams?: Record<string, unknown> | null;
  /**
   * Meta trigger (manual/job/heartbeat/agent). Manual PTY sessions opt
   * out of the 1.2s claude idle auto-exit and instead stay alive as
   * "awaiting-input" until the user closes them.
   */
  trigger?: import("../src/types/tasks").TaskTrigger;
}): ActiveSession {
  // Plain shell sessions bypass the adapter/provider system entirely.
  if (input.adapterType === "shell") {
    return ptyManager.spawn({ ...input });
  }

  const adapter = input.adapterType
    ? agentAdapterRegistry.get(input.adapterType)
    : undefined;

  if (input.adapterType && !adapter) {
    throw new Error(`Unknown adapter type: ${input.adapterType}`);
  }

  if (adapter && adapter.executionEngine !== "legacy_pty_cli") {
    return createStructuredSession({
      sessionId: input.sessionId,
      providerId: input.providerId,
      adapterType: input.adapterType!,
      adapterConfig: input.adapterConfig,
      prompt: input.prompt,
      cwd: input.cwd,
      timeoutSeconds: input.timeoutSeconds,
      onData: input.onData,
      adapterSessionId: input.adapterSessionId ?? null,
      adapterSessionParams: input.adapterSessionParams ?? null,
    });
  }

  // Legacy PTY path: forward the adapter session id as `adapterResumeId` so
  // the launch spec can append `--resume` / `--session` for providers that
  // support terminal-mode resume (Claude, Cursor, OpenCode). Also forward
  // `trigger` so the manager can stash it on the session — claude-lifecycle
  // uses it to skip auto-exit on manual runs.
  return ptyManager.spawn({
    ...input,
    adapterResumeId: input.adapterSessionId ?? null,
    trigger: input.trigger,
  });
}

// ===== WebSocket Event Bus =====

interface EventSubscriber {
  ws: WebSocket;
  channels: Set<string>;
}

const subscribers: EventSubscriber[] = [];

function broadcast(channel: string, data: Record<string, unknown>): void {
  const message = JSON.stringify({ channel, ...data });
  for (const sub of subscribers) {
    if (sub.channels.has(channel) || sub.channels.has("*")) {
      if (sub.ws.readyState === WebSocket.OPEN) {
        sub.ws.send(message);
      }
    }
  }
}

function handleEventBusConnection(ws: WebSocket): void {
  const subscriber: EventSubscriber = { ws, channels: new Set(["*"]) };
  subscribers.push(subscriber);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.subscribe) {
        subscriber.channels.add(msg.subscribe);
      }
      if (msg.unsubscribe) {
        subscriber.channels.delete(msg.unsubscribe);
      }
    } catch {
      // ignore
    }
  });

  ws.on("close", () => {
    const idx = subscribers.indexOf(subscriber);
    if (idx >= 0) subscribers.splice(idx, 1);
  });
}

// ===== Job Scheduler =====

interface JobConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  prompt: string;
  timeout?: number;
  agentSlug: string;
  cabinetPath: string;
  oneShot?: boolean;
  runAfter?: string;
  ownerTaskId?: string;
}

const scheduledJobs = new Map<string, ReturnType<typeof cron.schedule>>();
const scheduledHeartbeats = new Map<string, ReturnType<typeof cron.schedule>>();
let scheduleReloadTimer: NodeJS.Timeout | null = null;

async function putJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

function stopScheduledTasks(): void {
  for (const [, task] of scheduledJobs) task.stop();
  for (const [, task] of scheduledHeartbeats) task.stop();
  scheduledJobs.clear();
  scheduledHeartbeats.clear();
}

function scheduleJob(job: JobConfig): void {
  const key = `${job.cabinetPath}::job::${job.agentSlug}/${job.id}`;
  const existingTask = scheduledJobs.get(key);
  if (existingTask) existingTask.stop();

  if (!cron.validate(job.schedule)) {
    console.warn(`Invalid cron schedule for job ${key}: ${job.schedule}`);
    return;
  }

  const task = cron.schedule(job.schedule, () => {
    const scheduledAt = new Date(Math.round(Date.now() / 60000) * 60000).toISOString();
    console.log(`Triggering scheduled job ${key} @ ${scheduledAt}`);
    void putJson(`${getAppOrigin()}/api/agents/${job.agentSlug}/jobs/${job.id}`, {
      action: "run",
      source: "scheduler",
      cabinetPath: job.cabinetPath,
      scheduledAt,
    })
      .then(async () => {
        if (job.oneShot) {
          try {
            await putJson(
              `${getAppOrigin()}/api/agents/${job.agentSlug}/jobs/${job.id}`,
              {
                action: "update",
                cabinetPath: job.cabinetPath,
                enabled: false,
              }
            );
          } catch (error) {
            console.error(`Failed to disable one-shot job ${key}:`, error);
          }
          const existing = scheduledJobs.get(key);
          if (existing) existing.stop();
          scheduledJobs.delete(key);
          console.log(`  One-shot job fired and disabled: ${key}`);
        }
      })
      .catch((error) => {
        console.error(`Failed to trigger scheduled job ${key}:`, error);
      });
  });

  scheduledJobs.set(key, task);
  console.log(
    `  Scheduled job: ${key} (${job.schedule})${job.oneShot ? " [one-shot]" : ""}`
  );
}

function scheduleHeartbeat(slug: string, cronExpr: string, cabinetPath: string): void {
  const key = `${cabinetPath}::heartbeat::${slug}`;

  if (!cron.validate(cronExpr)) {
    console.warn(`Invalid heartbeat schedule for ${key}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    const scheduledAt = new Date(Math.round(Date.now() / 60000) * 60000).toISOString();
    console.log(`Triggering heartbeat ${key} @ ${scheduledAt}`);
    void putJson(`${getAppOrigin()}/api/agents/personas/${slug}`, {
      action: "run",
      source: "scheduler",
      cabinetPath,
      scheduledAt,
    }).catch((error) => {
      console.error(`Failed to trigger heartbeat ${key}:`, error);
    });
  });

  scheduledHeartbeats.set(key, task);
  console.log(`  Scheduled heartbeat: ${key} (${cronExpr})`);
}

async function reloadSchedules(): Promise<void> {
  stopScheduledTasks();

  const cabinets = discoverAllCabinets();
  let jobCount = 0;
  let heartbeatCount = 0;

  for (const cabinet of cabinets) {
    const agentsDir = path.join(cabinet.absDir, ".agents");

    // --- Heartbeats from .agents/*/persona.md ---
    if (fs.existsSync(agentsDir)) {
      let agentEntries: fs.Dirent[];
      try {
        agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
      } catch {
        agentEntries = [];
      }

      for (const entry of agentEntries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

        const personaPath = path.join(agentsDir, entry.name, "persona.md");
        if (fs.existsSync(personaPath)) {
          try {
            const rawPersona = fs.readFileSync(personaPath, "utf-8");
            const { data } = matter(rawPersona);
            const active = data.active !== false;
            const heartbeat = typeof data.heartbeat === "string" ? data.heartbeat : "";
            if (active && heartbeat) {
              scheduleHeartbeat(entry.name, heartbeat, cabinet.relPath);
              heartbeatCount++;
            }
          } catch {
            // Skip malformed personas.
          }
        }
      }
    }

    // --- Cabinet-level jobs: .jobs/*.yaml ---
    const cabinetJobsDir = path.join(cabinet.absDir, ".jobs");
    if (fs.existsSync(cabinetJobsDir)) {
      let jobFiles: string[];
      try {
        jobFiles = fs.readdirSync(cabinetJobsDir);
      } catch {
        jobFiles = [];
      }
      for (const jf of jobFiles) {
        if (!jf.endsWith(".yaml") && !jf.endsWith(".yml")) continue;
        try {
          const raw = fs.readFileSync(path.join(cabinetJobsDir, jf), "utf-8");
          const parsed = yaml.load(raw) as Record<string, unknown>;
          const ownerAgent = (parsed.ownerAgent as string) || (parsed.agentSlug as string) || "";
          const config: JobConfig = {
            ...normalizeJobConfig(
              parsed as Partial<JobConfig>,
              ownerAgent,
              normalizeJobId(path.basename(jf, path.extname(jf)))
            ),
            agentSlug: ownerAgent,
            cabinetPath: cabinet.relPath,
          };
          if (config.id && config.enabled && config.schedule && ownerAgent) {
            scheduleJob(config);
            jobCount++;
          }
        } catch {
          // Skip malformed jobs.
        }
      }
    }
  }

  console.log(`Discovered ${cabinets.length} cabinet(s). Scheduled ${jobCount} jobs and ${heartbeatCount} heartbeats.`);
}

/**
 * On startup: find any conversations still marked "running" from a previous
 * daemon session and finalize them as failed. This prevents permanently-stuck
 * spinners when the daemon crashes or is force-killed.
 */
async function cleanupStaleRunningConversations(): Promise<void> {
  const cabinets = discoverAllCabinets();
  let cleaned = 0;
  for (const cabinet of cabinets) {
    const cabinetPath = cabinet.relPath || undefined;
    try {
      const metas = await listConversationMetas({ status: "running", cabinetPath, limit: 1000 });
      for (const meta of metas) {
        // Only finalize if there is no live PTY session managing it
        if (sessions.has(meta.id)) continue;
        await finalizeConversation(
          meta.id,
          { status: "failed", exitCode: 1 },
          cabinetPath
        ).catch(() => {});
        cleaned++;
      }
    } catch {
      // Skip cabinets that fail to read
    }
  }
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} stale running conversation(s) from previous session.`);
  }
}

function queueScheduleReload(): void {
  if (scheduleReloadTimer) {
    clearTimeout(scheduleReloadTimer);
  }

  scheduleReloadTimer = setTimeout(() => {
    scheduleReloadTimer = null;
    void reloadSchedules().catch((error) => {
      console.error("Failed to reload daemon schedules:", error);
    });
  }, 200);
}

// ===== HTTP Server =====

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  if (url.pathname !== "/health" && !isDaemonTokenValid(requestToken(req, url))) {
    rejectUnauthorized(res);
    return;
  }

  // GET /session/:id/output — retrieve captured output for a completed session
  const outputMatch = url.pathname.match(/^\/session\/([^/]+)\/output$/);
  if (outputMatch && req.method === "GET") {
    const sessionId = outputMatch[1];

    const active = sessions.get(sessionId);
    if (active) {
      const raw = active.output.join("");
      const plain = stripAnsi(raw);
      if (
        active.kind === "pty" &&
        active.readyStrategy === "claude" &&
        active.initialPrompt &&
        active.initialPromptSent &&
        !active.exited &&
        !active.autoExitRequested &&
        !active.resolvedStatus &&
        active.trigger !== "manual" &&
        transcriptShowsCompletedRun(plain, active.initialPrompt)
      ) {
        completeClaudeSession(active, plain, { completedOutput });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sessionId,
            status: "completed",
            output: plain,
          })
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sessionId,
          status: sessionStatus(active),
          output: plain,
          adapterSessionId:
            active.kind === "structured" ? active.adapterSessionId ?? null : null,
          adapterSessionParams:
            active.kind === "structured"
              ? active.adapterSessionParams ?? null
              : null,
          adapterUsage:
            active.kind === "structured" ? active.adapterUsage ?? null : null,
          adapterErrorKind:
            active.kind === "structured" ? active.adapterErrorKind ?? null : null,
          adapterErrorHint:
            active.kind === "structured" ? active.adapterErrorHint ?? null : null,
          adapterErrorRetryAfterSec:
            active.kind === "structured"
              ? active.adapterErrorRetryAfterSec ?? null
              : null,
        })
      );
      return;
    }

    const conversationMeta = await readConversationMeta(sessionId).catch(() => null);
    if (conversationMeta) {
      const transcript = await readConversationTranscript(sessionId).catch(() => "");
      const plainTranscript = stripAnsi(transcript);
      let prompt = "";
      if (conversationMeta.promptPath) {
        const promptPath = path.join(DATA_DIR, conversationMeta.promptPath);
        if (fs.existsSync(promptPath)) {
          prompt = fs.readFileSync(promptPath, "utf8");
        }
      }
      if (
        conversationMeta.status === "running" &&
        transcriptShowsCompletedRun(plainTranscript, prompt)
      ) {
        // Same rationale as completeClaudeSession: feed finalizeConversation
        // a distilled one-liner instead of the full TUI-noise transcript
        // so parseCabinetBlock's fallback regex can't scrape garbage
        // SUMMARY/ARTIFACT lines out of prompt echoes.
        const summaryOutput = distillPtyOutput(
          plainTranscript,
          0,
          conversationMeta.providerId
        );
        await finalizeConversation(sessionId, {
          status: "completed",
          exitCode: 0,
          output: summaryOutput,
        }).catch(() => null);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sessionId,
            status: "completed",
            output: plainTranscript,
          })
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sessionId,
          status: conversationMeta.status,
          output: plainTranscript,
        })
      );
      return;
    }

    const completed = completedOutput.get(sessionId);
    if (completed) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId, status: "completed", output: completed.output }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Session not found" }));
    return;
  }

  // POST /sessions — create a detached session without a WebSocket (for agent heartbeats)
  if (url.pathname === "/sessions" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const {
          id,
          providerId,
          adapterType,
          adapterConfig,
          prompt,
          cwd,
          timeoutSeconds,
          adapterSessionId,
          adapterSessionParams,
        } = JSON.parse(body) as {
          id: string;
          providerId?: string;
          adapterType?: string;
          adapterConfig?: Record<string, unknown>;
          prompt?: string;
          cwd?: string;
          timeoutSeconds?: number;
          adapterSessionId?: string | null;
          adapterSessionParams?: Record<string, unknown> | null;
        };
        const sessionId = id || `session-${Date.now()}`;

        if (sessions.has(sessionId)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sessionId, existing: true }));
          return;
        }

        let trigger: import("../src/types/tasks").TaskTrigger | undefined;
        try {
          const meta = await readConversationMeta(sessionId);
          trigger = meta?.trigger;
        } catch {
          trigger = undefined;
        }

        try {
          const legacyProviderId = !adapterType
            ? providerId
            : agentAdapterRegistry.get(adapterType)?.executionEngine === "legacy_pty_cli"
              ? resolveLegacyExecutionProviderId({
                  adapterType,
                  providerId,
                })
              : undefined;
          const launchMode =
            legacyProviderId || (!adapterType && providerId)
              ? getDetachedPromptLaunchMode({
                  providerId: legacyProviderId || providerId,
                  prompt,
                })
              : undefined;
          createSession({
            sessionId,
            providerId,
            adapterType,
            adapterConfig,
            prompt,
            cwd,
            timeoutSeconds,
            launchMode,
            adapterSessionId: adapterSessionId ?? null,
            adapterSessionParams: adapterSessionParams ?? null,
            trigger,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: errMsg }));
          return;
        }

        console.log(`Session ${sessionId} started via HTTP (agent mode)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessionId }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // POST /session/:id/input — write stdin to a live PTY session
  // Used by same-process terminal-mode continuations: if the CLI is still in
  // its REPL waiting for input, we write the next prompt directly into the
  // existing process instead of spawning a new PTY.
  const inputMatch = url.pathname.match(/^\/session\/([^/]+)\/input$/);
  if (inputMatch && req.method === "POST") {
    const sessionId = inputMatch[1];
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { input: rawInput, appendEnter } = JSON.parse(body || "{}") as {
          input?: string;
          appendEnter?: boolean;
        };
        if (typeof rawInput !== "string" || !rawInput) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "input (string) is required" }));
          return;
        }
        const result = ptyManager.writeInput(sessionId, rawInput, {
          appendEnter: appendEnter !== false,
        });
        if (!result.ok) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Session not found, exited, or not a PTY" })
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sessionId }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    return;
  }

  // POST /session/:id/close — gracefully end a live PTY by writing `/exit`
  // to its stdin (so the CLI shuts itself down cleanly and the PTY exits
  // with code 0 → finalizeConversation runs with status="completed"). A
  // 2s SIGTERM fallback covers CLIs that don't recognize /exit. Distinct
  // from /stop which SIGTERMs immediately and finalizes as "failed".
  const closeMatch = url.pathname.match(/^\/session\/([^/]+)\/close$/);
  if (closeMatch && req.method === "POST") {
    const sessionId = closeMatch[1];
    const session = sessions.get(sessionId);
    if (!session || session.exited) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found or already exited" }));
      return;
    }
    if (session.kind !== "pty") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only PTY sessions can be closed gracefully" }));
      return;
    }
    try {
      const result = ptyManager.writeInput(sessionId, "/exit", { appendEnter: true });
      if (!result.ok) {
        // Fall through to SIGTERM — writeInput refused (already exited, etc.)
        session.stop("SIGTERM");
      }
      session.stopFallbackTimer = setTimeout(() => {
        if (!session.exited) {
          try {
            session.stop("SIGTERM");
          } catch {}
        }
      }, 2000);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, sessionId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // POST /session/:id/stop — stop a running session
  const stopMatch = url.pathname.match(/^\/session\/([^/]+)\/stop$/);
  if (stopMatch && req.method === "POST") {
    const sessionId = stopMatch[1];
    const session = sessions.get(sessionId);
    if (!session || session.exited) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found or already exited" }));
      return;
    }
    try {
      // SIGTERM first, then SIGKILL after 2s if still alive
      session.stop("SIGTERM");
      session.stopFallbackTimer = setTimeout(() => {
        if (!session.exited) {
          try {
            session.stop("SIGKILL");
          } catch {}
        }
      }, 2000);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, sessionId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // GET /sessions — list all active sessions
  if (url.pathname === "/sessions" && req.method === "GET") {
    const activeSessions = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      connected: s.ws !== null,
      exited: s.exited,
      exitCode: s.exitCode,
      providerId: s.providerId,
      adapterType: s.adapterType,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(activeSessions));
    return;
  }

  if (url.pathname === "/reload-schedules" && req.method === "POST") {
    try {
      await reloadSchedules();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          jobs: scheduledJobs.size,
          heartbeats: scheduledHeartbeats.size,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        ptySessions: sessions.size,
        scheduledJobs: scheduledJobs.size,
        scheduledHeartbeats: scheduledHeartbeats.size,
        subscribers: subscribers.length,
      })
    );
    return;
  }

  // Trigger job manually
  if (url.pathname === "/trigger" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { agentSlug, jobId, prompt, providerId, timeoutSeconds } = JSON.parse(body);
        if (prompt) {
          const sessionId = jobId || `manual-${Date.now()}`;
          const launchMode = getDetachedPromptLaunchMode({
            providerId,
            prompt,
          });
          createSession({
            sessionId,
            providerId,
            prompt,
            timeoutSeconds,
            launchMode,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, sessionId, agentSlug: agentSlug || "manual" }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "prompt is required" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // Search endpoint — daemon-backed live index
  if (url.pathname === "/search" && req.method === "GET") {
    try {
      const q = (url.searchParams.get("q") ?? "").trim();
      const scopeParam = (url.searchParams.get("scope") ?? "all") as SearchScope;
      const scope: SearchScope = ["all", "pages", "agents", "tasks"].includes(scopeParam)
        ? scopeParam
        : "all";
      const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

      const needsAgents = scope === "all" || scope === "agents";
      const needsTasks = scope === "all" || scope === "tasks";

      const [agents, tasks] = await Promise.all([
        needsAgents ? loadAgentDocs() : Promise.resolve([]),
        needsTasks ? loadTaskDocs() : Promise.resolve([]),
      ]);

      const response = runSearch(
        {
          pages: searchIndex,
          agents: () => agents,
          tasks: () => tasks,
          indexReady: () => searchIndexReady,
        },
        q,
        scope,
        limit
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

// ===== WebSocket Servers =====

// PTY terminal WebSocket — root path (what AI panel and web terminal connect to)
const wssPty = new WebSocketServer({ noServer: true });

// Event bus WebSocket — /events path
const wssEvents = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades based on path
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  if (!isDaemonTokenValid(requestToken(req, url))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  if (url.pathname === "/events" || url.pathname === "/api/daemon/events") {
    wssEvents.handleUpgrade(req, socket, head, (ws) => {
      wssEvents.emit("connection", ws, req);
    });
  } else if (url.pathname === "/" || url.pathname === "/api/daemon/pty") {
    wssPty.handleUpgrade(req, socket, head, (ws) => {
      wssPty.emit("connection", ws, req);
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});

wssPty.on("connection", (ws, req) => {
  handlePtyConnection(ws, req as http.IncomingMessage);
});

wssEvents.on("connection", (ws) => {
  handleEventBusConnection(ws);
});

// ===== Startup =====

const scheduleWatcher = chokidar.watch(
  [
    path.join(DATA_DIR, "**", ".agents", "*", "persona.md"),
    path.join(DATA_DIR, "**", ".jobs", "*.yaml"),
    path.join(DATA_DIR, "**", ".agents", "*", "jobs", "*.yaml"),
    path.join(DATA_DIR, "**", CABINET_MANIFEST_FILE),
  ],
  {
    ignoreInitial: true,
  }
);

scheduleWatcher.on("all", () => {
  queueScheduleReload();
});

server.listen(PORT, () => {
  console.log(`Cabinet Daemon running on port ${PORT}`);
  console.log(`  Terminal WebSocket: ws://localhost:${PORT}/api/daemon/pty`);
  console.log(`  Events WebSocket: ws://localhost:${PORT}/api/daemon/events`);
  console.log(`  Session API: http://localhost:${PORT}/sessions`);
  console.log(`  Reload schedules: POST http://localhost:${PORT}/reload-schedules`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  Trigger endpoint: POST http://localhost:${PORT}/trigger`);
  console.log(`  Search endpoint: GET http://localhost:${PORT}/search`);
  console.log(`  Default provider: ${resolveProviderId()}`);
  console.log(`  Working directory: ${DATA_DIR}`);

  getOrCreateSessionId();
  printStartupBannerIfNeeded();
  startTelemetryFlusher();
  emitTelemetry("app.launched", {});

  void reloadSchedules();
  void cleanupStaleRunningConversations();
  // Sweep composer-attachment staging dirs that were abandoned (paste
  // without send). Runs once on boot, then daily.
  void cleanupStaleStagingAttachments().then((r) => {
    if (r.removed > 0) {
      console.log(
        `[staging-attachments] cleaned ${r.removed}/${r.scanned} stale dirs on boot`
      );
    }
  });
  cron.schedule("17 3 * * *", () => {
    void cleanupStaleStagingAttachments().then((r) => {
      if (r.removed > 0) {
        console.log(
          `[staging-attachments] daily sweep: removed ${r.removed}/${r.scanned}`
        );
      }
    });
  });
  void bootstrapSearchIndex().then(() => startSearchWatcher());
  void (async () => {
    try {
      const { loadExternalAdapters } = await import(
        "../src/lib/agents/adapters/plugin-loader"
      );
      await loadExternalAdapters();
    } catch (err) {
      console.warn(
        "[cabinet-daemon] adapter plugin loader failed:",
        err instanceof Error ? err.message : err
      );
    }
  })();
});

// ===== Graceful Shutdown =====

function shutdown(): void {
  console.log("\nShutting down...");
  emitTelemetry("app.exited", {});
  clearSessionId();
  for (const [, task] of scheduledJobs) {
    task.stop();
  }
  for (const [, task] of scheduledHeartbeats) {
    task.stop();
  }
  for (const [, session] of sessions) {
    try {
      session.stop("SIGTERM");
    } catch {}
  }
  void scheduleWatcher.close();
  closeDb();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

wssPty.on("error", (err) => {
  console.error("PTY WebSocket error:", err.message);
});

wssEvents.on("error", (err) => {
  console.error("Events WebSocket error:", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
  emitTelemetry("error.unhandled", { where: "uncaughtException", errorCode: err.name });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  const name = reason instanceof Error ? reason.name : "UnknownRejection";
  emitTelemetry("error.unhandled", { where: "unhandledRejection", errorCode: name });
});
