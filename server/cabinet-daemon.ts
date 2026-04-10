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

import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
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
  getOneShotLaunchSpec,
  getSessionLaunchSpec,
  resolveProviderId,
} from "../src/lib/agents/provider-runtime";
import {
  agentAdapterRegistry,
  resolveLegacyExecutionProviderId,
} from "../src/lib/agents/adapters";
import {
  consumeClaudeStreamJson,
  createClaudeStreamAccumulator,
  flushClaudeStreamJson,
  type ClaudeStreamAccumulator,
} from "../src/lib/agents/adapters/claude-stream";
import { buildPtyCliInvocation } from "../src/lib/agents/provider-cli";
import { ADAPTER_RUNTIME_PATH } from "../src/lib/agents/adapters/utils";
import {
  appendConversationTranscript,
  finalizeConversation,
  listConversationMetas,
  readConversationMeta,
  readConversationTranscript,
  transcriptShowsCompletedRun,
} from "../src/lib/agents/conversation-store";
import {
  getTokenFromAuthorizationHeader,
  isDaemonTokenValid,
} from "../src/lib/agents/daemon-auth";
import {
  normalizeJobConfig,
  normalizeJobId,
} from "../src/lib/jobs/job-normalization";

const PORT = getDaemonPort();
const CABINET_MANIFEST_FILE = ".cabinet";

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

const enrichedPath = ADAPTER_RUNTIME_PATH;

// ===== PTY Terminal Server =====

type SessionResolutionStatus = "completed" | "failed";

interface BaseSession {
  id: string;
  kind: "pty" | "structured";
  providerId: string;
  adapterType?: string;
  ws: WebSocket | null;
  createdAt: Date;
  output: string[];
  exited: boolean;
  exitCode: number | null;
  resolvedStatus?: SessionResolutionStatus;
  resolvingStatus?: boolean;
  stopFallbackTimer?: NodeJS.Timeout;
  stop: (signal?: NodeJS.Signals) => void;
}

interface PtySession extends BaseSession {
  kind: "pty";
  pty: pty.IPty;
  timeoutHandle?: NodeJS.Timeout;
  initialPrompt?: string;
  initialPromptSent?: boolean;
  initialPromptTimer?: NodeJS.Timeout;
  promptSubmittedOutputLength?: number;
  autoExitRequested?: boolean;
  autoExitFallbackTimer?: NodeJS.Timeout;
  claudeCompletionTimer?: NodeJS.Timeout;
  readyStrategy?: "claude";
  outputMode?: "plain" | "claude-stream-json";
  structuredOutput?: ClaudeStreamAccumulator;
}

interface StructuredSession extends BaseSession {
  kind: "structured";
  timeoutHandle?: NodeJS.Timeout;
  pid?: number;
  processGroupId?: number | null;
  startedAt?: string;
}

type ActiveSession = PtySession | StructuredSession;

const sessions = new Map<string, ActiveSession>();
const completedOutput = new Map<string, { output: string; completedAt: number }>();
const CLAUDE_AUTO_EXIT_GRACE_MS = 1200;

function resolveSessionCwd(input?: string): string {
  if (!input) return DATA_DIR;

  const resolved = path.resolve(input);
  if (resolved.startsWith(DATA_DIR)) {
    return resolved;
  }

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

function stripAnsi(str: string): string {
  return str
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B[P^_][\s\S]*?\u001B\\/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001B[@-_]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g, "");
}

function claudePromptReady(output: string): boolean {
  const plain = stripAnsi(output).replace(/\r/g, "\n");
  return (
    plain.includes("shift+tab to cycle") ||
    /(?:^|\n)[❯>]\s*$/.test(plain)
  );
}

function clearClaudeCompletionTimer(session: PtySession): void {
  if (!session.claudeCompletionTimer) return;
  clearTimeout(session.claudeCompletionTimer);
  delete session.claudeCompletionTimer;
}

function clearSessionStopFallbackTimer(session: ActiveSession): void {
  if (!session.stopFallbackTimer) return;
  clearTimeout(session.stopFallbackTimer);
  delete session.stopFallbackTimer;
}

function completeClaudeSession(session: PtySession, output: string): void {
  if (session.exited || session.autoExitRequested || session.resolvedStatus) {
    return;
  }

  clearClaudeCompletionTimer(session);
  session.resolvedStatus = "completed";
  session.resolvingStatus = true;
  session.autoExitRequested = true;
  const plain = stripAnsi(output);
  completedOutput.set(session.id, { output: plain, completedAt: Date.now() });
  void finalizeConversation(session.id, {
    status: "completed",
    exitCode: 0,
    output: plain,
  }).finally(() => {
    session.resolvingStatus = false;
  });
  session.pty.write("/exit\r");
  session.autoExitFallbackTimer = setTimeout(() => {
    if (session.exited) return;
    try {
      session.pty.kill();
    } catch {}
  }, 1500);
}

function consumeStructuredOutput(session: PtySession, chunk: string): string {
  if (session.outputMode !== "claude-stream-json") {
    return chunk;
  }

  if (!session.structuredOutput) {
    session.structuredOutput = createClaudeStreamAccumulator();
  }

  return consumeClaudeStreamJson(session.structuredOutput, chunk);
}

function flushStructuredOutput(session: PtySession): string {
  if (session.outputMode !== "claude-stream-json" || !session.structuredOutput) {
    return "";
  }

  return flushClaudeStreamJson(session.structuredOutput);
}

function submitInitialPrompt(session: PtySession): void {
  if (!session.initialPrompt || session.initialPromptSent || session.exited) {
    return;
  }

  session.initialPromptSent = true;
  session.promptSubmittedOutputLength = session.output.join("").length;
  if (session.initialPromptTimer) {
    clearTimeout(session.initialPromptTimer);
    delete session.initialPromptTimer;
  }

  session.pty.write(session.initialPrompt);
  // Small delay so the terminal processes the pasted text before Enter
  setTimeout(() => {
    if (!session.exited) {
      session.pty.write("\r");
    }
  }, 150);
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
}

function maybeAutoExitClaudeSession(session: PtySession): void {
  if (
    !session.initialPrompt ||
    !session.initialPromptSent ||
    session.exited ||
    session.autoExitRequested ||
    session.resolvedStatus
  ) {
    return;
  }

  const submittedLength = session.promptSubmittedOutputLength ?? 0;
  const currentOutput = session.output.join("");
  if (currentOutput.length <= submittedLength) {
    clearClaudeCompletionTimer(session);
    return;
  }

  const outputSincePrompt = currentOutput.slice(submittedLength);
  if (!transcriptShowsCompletedRun(outputSincePrompt, session.initialPrompt)) {
    clearClaudeCompletionTimer(session);
    return;
  }

  if (session.claudeCompletionTimer) {
    return;
  }

  session.claudeCompletionTimer = setTimeout(() => {
    delete session.claudeCompletionTimer;
    if (session.exited || session.autoExitRequested || session.resolvedStatus) {
      return;
    }

    const latestOutput = session.output.join("");
    const latestSubmittedLength = session.promptSubmittedOutputLength ?? 0;
    if (latestOutput.length <= latestSubmittedLength) {
      return;
    }

    const latestSincePrompt = latestOutput.slice(latestSubmittedLength);
    if (!transcriptShowsCompletedRun(latestSincePrompt, session.initialPrompt)) {
      return;
    }

    completeClaudeSession(session, latestOutput);
  }, CLAUDE_AUTO_EXIT_GRACE_MS);
}

async function finalizeSessionConversation(session: ActiveSession): Promise<void> {
  const meta = await readConversationMeta(session.id);
  if (!meta) return;

  const plain = stripAnsi(session.output.join(""));
  if (meta.status !== "running") {
    completedOutput.set(session.id, { output: plain, completedAt: Date.now() });
    return;
  }
  await finalizeConversation(session.id, {
    status: session.resolvedStatus || (session.exitCode === 0 ? "completed" : "failed"),
    exitCode: session.resolvedStatus === "completed" ? 0 : session.exitCode,
    output: plain,
  }, meta.cabinetPath);
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

  // Check if this is a reconnection to an existing session
  const existing = sessions.get(sessionId);
  if (existing) {
    console.log(`Session ${sessionId} reconnected (exited=${existing.exited})`);
    attachSessionSocket(existing, ws);
    return;
  }

  // New session — spawn PTY or structured adapter execution
  try {
    createSession({
      sessionId,
      providerId,
      adapterType,
      prompt: prompt || undefined,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to spawn PTY for session ${sessionId}:`, errMsg);
    ws.send(`\r\n\x1b[31mError: Failed to start agent CLI\x1b[0m\r\n`);
    ws.send(`\x1b[90m${errMsg}\x1b[0m\r\n`);
    ws.close();
    return;
  }
  const session = sessions.get(sessionId)!;
  console.log(`Session ${sessionId} started (${prompt ? "agent" : "interactive"} mode)`);
  attachSessionSocket(session, ws);
}

function createDetachedSession(input: {
  sessionId: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  prompt?: string;
  cwd?: string;
  timeoutSeconds?: number;
  onData?: (chunk: string) => void;
  launchMode?: "session" | "one-shot";
}): PtySession {
  const cwd = resolveSessionCwd(input.cwd);
  const executionProviderId = resolveLegacyExecutionProviderId({
    adapterType: input.adapterType,
    providerId: input.providerId,
  });
  let launch =
    input.launchMode === "one-shot" && input.prompt?.trim()
      ? getOneShotLaunchSpec({
          providerId: executionProviderId,
          prompt: input.prompt,
          workdir: cwd,
        })
      : getSessionLaunchSpec({
          providerId: executionProviderId,
          prompt: input.prompt,
          workdir: cwd,
        });
  const resolvedProviderId = resolveProviderId(executionProviderId);

  if (
    input.launchMode === "one-shot" &&
    resolvedProviderId === "claude-code"
  ) {
    const nextArgs: string[] = [];
    for (let index = 0; index < launch.args.length; index += 1) {
      const arg = launch.args[index];
      if (arg === "--output-format") {
        index += 1;
        continue;
      }
      if (arg === "text" && launch.args[index - 1] === "--output-format") {
        continue;
      }
      nextArgs.push(arg);
    }

    nextArgs.push(
      "--verbose",
      "--output-format",
      "stream-json",
      "--include-partial-messages"
    );
    launch = {
      ...launch,
      args: nextArgs,
    };
  }

  const invocation = buildPtyCliInvocation(launch.command, launch.args);

  const term = pty.spawn(invocation.command, invocation.args, {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...(process.env as Record<string, string>),
      PATH: enrichedPath,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      FORCE_COLOR: "3",
      LANG: "en_US.UTF-8",
    },
  });

  const session: PtySession = {
    id: input.sessionId,
    kind: "pty",
    providerId: resolvedProviderId,
    adapterType: input.adapterType,
    pty: term,
    ws: null,
    createdAt: new Date(),
    output: [],
    exited: false,
    exitCode: null,
    stop: (signal = "SIGTERM") => {
      try {
        term.kill(signal);
      } catch {}
    },
    initialPrompt: launch.initialPrompt?.trim() || undefined,
    initialPromptSent: false,
    promptSubmittedOutputLength: 0,
    autoExitRequested: false,
    readyStrategy: launch.readyStrategy,
    outputMode:
      input.launchMode === "one-shot" && resolvedProviderId === "claude-code"
        ? "claude-stream-json"
        : "plain",
    structuredOutput:
      input.launchMode === "one-shot" && resolvedProviderId === "claude-code"
        ? createClaudeStreamAccumulator()
        : undefined,
  };
  sessions.set(input.sessionId, session);

  term.onData((data: string) => {
    const displayChunk = consumeStructuredOutput(session, data);
    if (displayChunk) {
      emitSessionOutput(session, displayChunk, input.onData);
    }
    if (
      session.initialPrompt &&
      !session.initialPromptSent &&
      session.readyStrategy === "claude" &&
      claudePromptReady(session.output.join(""))
    ) {
      submitInitialPrompt(session);
    }
    maybeAutoExitClaudeSession(session);
  });

  term.onExit(({ exitCode }) => {
    console.log(`Session ${input.sessionId} PTY exited with code ${exitCode}`);
    session.exited = true;
    session.exitCode = exitCode;
    clearSessionStopFallbackTimer(session);
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
      delete session.timeoutHandle;
    }
    if (session.initialPromptTimer) {
      clearTimeout(session.initialPromptTimer);
      delete session.initialPromptTimer;
    }
    if (session.autoExitFallbackTimer) {
      clearTimeout(session.autoExitFallbackTimer);
      delete session.autoExitFallbackTimer;
    }
    clearClaudeCompletionTimer(session);

    const trailingDisplay = flushStructuredOutput(session);
    if (trailingDisplay) {
      emitSessionOutput(session, trailingDisplay, input.onData);
    }

    const plain = stripAnsi(session.output.join(""));
    completedOutput.set(input.sessionId, { output: plain, completedAt: Date.now() });
    void finalizeSessionConversation(session).catch(() => {});

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      sessions.delete(input.sessionId);
      session.ws.close();
    }
  });

  if (input.timeoutSeconds && input.timeoutSeconds > 0) {
    session.timeoutHandle = setTimeout(() => {
      console.warn(`Session ${input.sessionId} timed out after ${input.timeoutSeconds}s`);
      try {
        term.kill();
      } catch {}
    }, input.timeoutSeconds * 1000);
  }

  if (session.initialPrompt) {
    session.initialPromptTimer = setTimeout(() => {
      submitInitialPrompt(session);
    }, 1500);
  }

  return session;
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
        sessionId: input.sessionId,
        sessionParams: null,
        onLog: async (_stream, chunk) => {
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
      clearSessionStopFallbackTimer(session);

      if (!session.output.length && result.output) {
        emitSessionOutput(session, result.output, input.onData);
      }

      const plain = stripAnsi(session.output.join(""));
      completedOutput.set(input.sessionId, { output: plain, completedAt: Date.now() });
      await finalizeSessionConversation(session).catch(() => {});

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        sessions.delete(input.sessionId);
        session.ws.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitSessionOutput(session, `${message}\n`, input.onData);
      session.exited = true;
      session.exitCode = 1;
      session.resolvedStatus = "failed";
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
}): ActiveSession {
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
    });
  }

  return createDetachedSession(input);
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
    console.log(`Triggering scheduled job ${key}`);
    void putJson(`${getAppOrigin()}/api/agents/${job.agentSlug}/jobs/${job.id}`, {
      action: "run",
      source: "scheduler",
      cabinetPath: job.cabinetPath,
    }).catch((error) => {
      console.error(`Failed to trigger scheduled job ${key}:`, error);
    });
  });

  scheduledJobs.set(key, task);
  console.log(`  Scheduled job: ${key} (${job.schedule})`);
}

function scheduleHeartbeat(slug: string, cronExpr: string, cabinetPath: string): void {
  const key = `${cabinetPath}::heartbeat::${slug}`;

  if (!cron.validate(cronExpr)) {
    console.warn(`Invalid heartbeat schedule for ${key}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, () => {
    console.log(`Triggering heartbeat ${key}`);
    void putJson(`${getAppOrigin()}/api/agents/personas/${slug}`, {
      action: "run",
      source: "scheduler",
      cabinetPath,
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
        transcriptShowsCompletedRun(plain, active.initialPrompt)
      ) {
        completeClaudeSession(active, plain);
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
        await finalizeConversation(sessionId, {
          status: "completed",
          exitCode: 0,
          output: plainTranscript,
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
    req.on("end", () => {
      try {
        const {
          id,
          providerId,
          adapterType,
          adapterConfig,
          prompt,
          cwd,
          timeoutSeconds,
        } = JSON.parse(body) as {
          id: string;
          providerId?: string;
          adapterType?: string;
          adapterConfig?: Record<string, unknown>;
          prompt?: string;
          cwd?: string;
          timeoutSeconds?: number;
        };
        const sessionId = id || `session-${Date.now()}`;

        if (sessions.has(sessionId)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sessionId, existing: true }));
          return;
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
  console.log(`  Default provider: ${resolveProviderId()}`);
  console.log(`  Working directory: ${DATA_DIR}`);

  void reloadSchedules();
  void cleanupStaleRunningConversations();
});

// ===== Graceful Shutdown =====

function shutdown(): void {
  console.log("\nShutting down...");
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
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
