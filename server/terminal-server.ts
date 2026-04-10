import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import http from "http";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { getDaemonPort } from "../src/lib/runtime/runtime-config";
import {
  buildPtyCliInvocation,
  buildCommandCandidates,
  resolveCliCommand,
  RUNTIME_PATH,
} from "../src/lib/agents/provider-cli";

const PORT = getDaemonPort();

interface Session {
  id: string;
  pty: pty.IPty;
  ws: WebSocket | null;  // null when detached (client disconnected but PTY still running)
  createdAt: Date;
  output: string[];  // captured output chunks
  exited: boolean;   // true when PTY process has exited
  exitCode: number | null;
  initialPrompt?: string;
  initialPromptSent?: boolean;
  initialPromptTimer?: NodeJS.Timeout;
}

// Active sessions (includes detached ones where PTY is still running)
const sessions = new Map<string, Session>();

// Completed session output (kept for 30 minutes for retrieval)
const completedOutput = new Map<string, { output: string; completedAt: number }>();

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

// Strip ANSI escape codes for plain text summary
function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}

function claudePromptReady(output: string): boolean {
  const plain = stripAnsi(output).replace(/\r/g, "\n");
  return (
    plain.includes("shift+tab to cycle") ||
    /(?:^|\n)[❯>]\s*$/.test(plain)
  );
}

function submitInitialPrompt(session: Session): void {
  if (!session.initialPrompt || session.initialPromptSent || session.exited) {
    return;
  }

  session.initialPromptSent = true;
  if (session.initialPromptTimer) {
    clearTimeout(session.initialPromptTimer);
    delete session.initialPromptTimer;
  }

  session.pty.write(session.initialPrompt);
  session.pty.write("\r");
}

// Resolve the claude binary path at startup
function resolveClaudePath(): string {
  try {
    return resolveCliCommand({
      id: "claude-code",
      name: "Claude Code Max",
      type: "cli",
      icon: "sparkles",
      command: "claude",
      commandCandidates: buildCommandCandidates("claude"),
      async isAvailable() {
        return true;
      },
      async healthCheck() {
        return {
          available: true,
          authenticated: true,
          version: "Claude Code Max",
        };
      },
    });
  } catch {}

  console.warn("Could not resolve claude path, using 'claude' directly");
  return "claude";
}

const CLAUDE_PATH = resolveClaudePath();

const enrichedPath = RUNTIME_PATH;

// Create HTTP server to handle both WebSocket upgrades and REST endpoints
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "", `http://localhost:${PORT}`);

  // GET /session/:id/output — retrieve captured output for a completed session
  const outputMatch = url.pathname.match(/^\/session\/([^/]+)\/output$/);
  if (outputMatch && req.method === "GET") {
    const sessionId = outputMatch[1];

    // Check active session first
    const active = sessions.get(sessionId);
    if (active) {
      const raw = active.output.join("");
      const plain = stripAnsi(raw);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId, status: "running", output: plain }));
      return;
    }

    // Check completed
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

  // GET /sessions — list all active sessions (including detached)
  if (url.pathname === "/sessions" && req.method === "GET") {
    const activeSessions = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      connected: s.ws !== null,
      exited: s.exited,
      exitCode: s.exitCode,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(activeSessions));
    return;
  }

  // Default: 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

console.log(`Terminal WebSocket server running on ws://localhost:${PORT}`);
console.log(`Session output API on http://localhost:${PORT}/session/:id/output`);
console.log(`Using claude binary: ${CLAUDE_PATH}`);
console.log(`Working directory: ${DATA_DIR}`);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get("id") || `session-${Date.now()}`;
  const prompt = url.searchParams.get("prompt")?.trim() || undefined;

  // Check if this is a reconnection to an existing session
  const existing = sessions.get(sessionId);
  if (existing) {
    console.log(`Session ${sessionId} reconnected (exited=${existing.exited})`);
    existing.ws = ws;

    // Replay all buffered output so the client sees the full history
    const replay = existing.output.join("");
    if (replay && ws.readyState === WebSocket.OPEN) {
      ws.send(replay);
    }

    // If the process already exited while detached, notify and clean up
    if (existing.exited) {
      ws.send(`\r\n\x1b[90m[Process exited with code ${existing.exitCode}]\x1b[0m\r\n`);
      const raw = existing.output.join("");
      const plain = stripAnsi(raw);
      completedOutput.set(sessionId, { output: plain, completedAt: Date.now() });
      sessions.delete(sessionId);
      ws.close();
      return;
    }

    // Wire up input from the new WebSocket to the existing PTY
    ws.on("message", (data: Buffer) => {
      const msg = data.toString();
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === "resize" && parsed.cols && parsed.rows) {
          existing.pty.resize(parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Not JSON, treat as terminal input
      }
      existing.pty.write(msg);
    });

    // On disconnect again, just detach — don't kill
    ws.on("close", () => {
      console.log(`Session ${sessionId} detached (WebSocket closed, PTY kept alive)`);
      existing.ws = null;
    });

    return;
  }

  // New session — spawn PTY
  const shell = CLAUDE_PATH;
  const args = prompt
    ? ["--dangerously-skip-permissions", prompt]
    : ["--dangerously-skip-permissions"];

  let term: pty.IPty;
  try {
    const invocation = buildPtyCliInvocation(shell, args);
    term = pty.spawn(invocation.command, invocation.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: DATA_DIR,
      env: {
        ...(process.env as Record<string, string>),
        PATH: enrichedPath,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
        LANG: "en_US.UTF-8",
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to spawn PTY for session ${sessionId}:`, errMsg);
    ws.send(`\r\n\x1b[31mError: Failed to start Claude CLI\x1b[0m\r\n`);
    ws.send(`\x1b[90m${errMsg}\x1b[0m\r\n`);
    ws.send(`\r\n\x1b[33mMake sure 'claude' is installed and accessible.\x1b[0m\r\n`);
    ws.close();
    return;
  }

  const session: Session = {
    id: sessionId,
    pty: term,
    ws,
    createdAt: new Date(),
    output: [],
    exited: false,
    exitCode: null,
    initialPrompt: undefined,
    initialPromptSent: false,
  };

  sessions.set(sessionId, session);
  console.log(`Session ${sessionId} started (${prompt ? "agent" : "interactive"} mode)`);

  // PTY output → WebSocket + capture (always capture, send only if connected)
  term.onData((data: string) => {
    session.output.push(data);
    if (
      session.initialPrompt &&
      !session.initialPromptSent &&
      claudePromptReady(session.output.join(""))
    ) {
      submitInitialPrompt(session);
    }
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  });

  // WebSocket input → PTY
  ws.on("message", (data: Buffer) => {
    const msg = data.toString();
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        term.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {
      // Not JSON, treat as terminal input
    }
    term.write(msg);
  });

  // On WebSocket close: DETACH, don't kill the PTY
  ws.on("close", () => {
    console.log(`Session ${sessionId} detached (WebSocket closed, PTY kept alive)`);
    session.ws = null;
  });

  // PTY exit: finalize if no client connected, otherwise notify client
  term.onExit(({ exitCode }) => {
    console.log(`Session ${sessionId} PTY exited with code ${exitCode}`);
    session.exited = true;
    session.exitCode = exitCode;
    if (session.initialPromptTimer) {
      clearTimeout(session.initialPromptTimer);
      delete session.initialPromptTimer;
    }

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      // Client is connected — notify and finalize
      const raw = session.output.join("");
      const plain = stripAnsi(raw);
      completedOutput.set(sessionId, { output: plain, completedAt: Date.now() });
      sessions.delete(sessionId);
      session.ws.close();
    }
    // If no client connected, session stays in map as exited — will be picked up on reconnect or cleanup
  });

  if (session.initialPrompt) {
    session.initialPromptTimer = setTimeout(() => {
      submitInitialPrompt(session);
    }, 1500);
  }
});

server.listen(PORT);

// Handle server-level errors gracefully
wss.on("error", (err) => {
  console.error("WebSocket server error:", err.message);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
