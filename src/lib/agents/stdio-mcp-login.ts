/**
 * Connect-time OAuth sign-in for STDIO MCP servers that run their own local
 * browser-OAuth callback (e.g. taylorwilsdon/workspace-mcp, which listens on
 * http://localhost:8000/oauth2callback).
 *
 * Why this exists: it's the stdio twin of claude-mcp-login.ts. For an HTTP
 * server, Claude Code owns the OAuth loopback; for these stdio servers the
 * server process itself runs the loopback. Either way, deferring auth to the
 * first agent run is broken: a one-shot task ends the moment it answers, killing
 * the server and its loopback before the human finishes approving in the
 * browser, so Google's redirect hits a dead port ("can't connect to localhost").
 *
 * The fix (mirrors the HTTP path): the daemon spawns the server ONCE, keeps it
 * alive across the human approval step, speaks raw MCP over stdio to trigger the
 * server's OAuth (initialize -> a trigger tool call), and parses the authorize
 * URL the server surfaces. The held process keeps its loopback open, so the
 * callback lands and the server persists its token to disk. We detect completion
 * by watching the server's token directory. No agent, no CLI involved.
 *
 * Local, single-instance feature; the session registry lives on globalThis so it
 * survives Next.js HMR in dev (same pattern as claude-mcp-login.ts).
 */

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { getRuntimePath } from "./provider-cli";
import type { CatalogEntry } from "./mcp-catalog";
import type { McpLoginStatus, McpLoginStartResult } from "./claude-mcp-login";

interface StdioLoginSession {
  id: string;
  entryId: string;
  proc: ChildProcess;
  status: McpLoginStatus;
  authorizeUrl?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  statusPoll?: ReturnType<typeof setInterval>;
  output: string;
  /** Dir whose token file presence means the OAuth completed. */
  tokenDir: string;
  /** Configured account; the token file must be `<email>.json` to count. */
  email?: string;
}

const g = globalThis as unknown as {
  __stdioMcpLoginSessions?: Map<string, StdioLoginSession>;
};
const sessions = (g.__stdioMcpLoginSessions ??= new Map<string, StdioLoginSession>());

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
/** Allow the (uvx-cached) server to cold-start + answer initialize + emit the URL. */
const URL_WAIT_MS = 120_000;
const COMPLETED_TTL_MS = 5 * 60 * 1000;
const STATUS_POLL_MS = 2500;

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/**
 * Auth is done once the server has written a real token file into tokenDir. We
 * look for a `.json` that isn't the transient `oauth_states.json` (in-flight
 * OAuth state, present mid-flow) — workspace-mcp writes `<email>.json` on
 * success, so its mere presence would otherwise read as authenticated too early.
 */
export function tokenDirAuthenticated(tokenDir: string, email?: string): boolean {
  try {
    const dir = expandHome(tokenDir);
    if (!fs.existsSync(dir)) return false;
    const tokenFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f !== "oauth_states.json");
    // Scope to the configured account when known: a leftover token for a
    // different USER_GOOGLE_EMAIL must not read as authenticated.
    return email ? tokenFiles.includes(`${email}.json`) : tokenFiles.length > 0;
  } catch {
    return false;
  }
}

function markTerminal(
  session: StdioLoginSession,
  status: Exclude<McpLoginStatus, "pending">,
): void {
  if (session.status === "pending") session.status = status;
  if (session.finishedAt == null) session.finishedAt = Date.now();
  if (session.statusPoll) {
    clearInterval(session.statusPoll);
    session.statusPoll = undefined;
  }
  // Release the held server (and its loopback).
  try {
    session.proc.stdin?.end();
  } catch {
    /* already closed */
  }
  try {
    session.proc.kill();
  } catch {
    /* already gone */
  }
  if (!session.cleanupTimer) {
    session.cleanupTimer = setTimeout(() => sessions.delete(session.id), COMPLETED_TTL_MS);
    session.cleanupTimer.unref?.();
  }
}

function sweepSessions(): void {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (s.status !== "pending") {
      if (s.finishedAt != null && now - s.finishedAt > COMPLETED_TTL_MS) {
        sessions.delete(sid);
      }
    } else if (now - s.startedAt > LOGIN_TIMEOUT_MS + COMPLETED_TTL_MS) {
      try {
        s.proc.kill();
      } catch {
        /* already gone */
      }
      sessions.delete(sid);
    }
  }
}

/**
 * Resolve the real command/args/env to run the stdio server ourselves. Unlike
 * the config writer (which leaves `${ENV}` placeholders for the CLI), we inject
 * the actual secret values from .cabinet.env, since WE spawn the process.
 */
function resolveServerSpec(
  entry: CatalogEntry,
  argsOverride?: string[],
): {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const values = readCabinetEnvFile().values;
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Keep the provider runtime PATH (nvm/homebrew) AND the existing PATH so `uvx`
  // resolves whether it's in homebrew or a managed runtime.
  env.PATH = [getRuntimePath(), process.env.PATH].filter(Boolean).join(path.delimiter);
  for (const [k, v] of Object.entries(entry.serverEnv ?? {})) {
    const m = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(v);
    if (m) {
      const val = values[m[1]];
      if (val) env[k] = val; // unset optional → let the server default
    } else {
      env[k] = v;
    }
  }
  let command = entry.command ?? "";
  let args = argsOverride ? [...argsOverride] : entry.args ? [...entry.args] : [];
  if (entry.localBuild) {
    const local = path.join(PROJECT_ROOT, entry.localBuild);
    if (fs.existsSync(local)) {
      command = "node";
      args = [local];
    }
  }
  return { command, args, env };
}

function mcpLine(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

/** First http(s) URL carrying OAuth params (provider-agnostic). */
function parseAuthorizeUrl(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s"'`\\]+/g);
  if (!urls) return undefined;
  return urls.find((u) => /redirect_uri=|code_challenge=|client_id=/.test(u));
}

/**
 * Begin connect-time OAuth for a stdio server. Spawns the server, triggers its
 * OAuth, and resolves once the authorize URL is parsed (or immediately if a
 * token already exists). The process stays alive so its loopback catches the
 * callback; poll `getStdioLoginStatus`.
 */
export async function startStdioLogin(entry: CatalogEntry): Promise<McpLoginStartResult> {
  sweepSessions();
  const cfg = entry.connectAuth;
  if (!cfg || cfg.kind !== "stdio-loopback") {
    throw new Error("This integration doesn't support connect-time sign-in.");
  }

  const email = cfg.emailEnvKey ? readCabinetEnvFile().values[cfg.emailEnvKey] : undefined;

  // Fast path: a cached token for the configured account means we're signed in.
  if (tokenDirAuthenticated(cfg.tokenDir, email)) {
    const id = randomUUID();
    const session: StdioLoginSession = {
      id,
      entryId: entry.id,
      proc: { kill() {}, stdin: null } as unknown as ChildProcess,
      status: "success",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      output: "",
      tokenDir: cfg.tokenDir,
      email,
    };
    sessions.set(id, session);
    session.cleanupTimer = setTimeout(() => sessions.delete(id), COMPLETED_TTL_MS);
    session.cleanupTimer.unref?.();
    return { sessionId: id, alreadyAuthenticated: true };
  }

  const { command, args, env } = resolveServerSpec(entry, cfg.authArgs);
  if (!command) throw new Error(`Catalog entry ${entry.id} has no stdio command to run.`);

  const toolArgs: Record<string, unknown> = {
    ...(cfg.triggerArgs ?? {}),
    ...(email ? { user_google_email: email } : {}),
  };

  const proc = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  const id = randomUUID();
  const session: StdioLoginSession = {
    id,
    entryId: entry.id,
    proc,
    status: "pending",
    startedAt: Date.now(),
    output: "",
    tokenDir: cfg.tokenDir,
    email,
  };
  sessions.set(id, session);

  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (message: string) => {
      if (!session.error) session.error = message;
      markTerminal(session, "error");
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    };

    const onData = (buf: Buffer) => {
      session.output += buf.toString();
      if (session.authorizeUrl) return;
      const url = parseAuthorizeUrl(session.output);
      if (url) {
        session.authorizeUrl = url;
        if (!settled) {
          settled = true;
          session.statusPoll = setInterval(() => {
            if (tokenDirAuthenticated(session.tokenDir, session.email))
              markTerminal(session, "success");
          }, STATUS_POLL_MS);
          session.statusPoll.unref?.();
          resolve({ sessionId: id, authorizeUrl: url });
        }
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", (err) => fail(err.message));
    proc.on("exit", () => {
      // Died before a URL → start failed. Died after → loopback gone, but a token
      // may already be on disk, so only error when it isn't.
      if (!settled) {
        fail(session.error ?? "The sign-in server exited before issuing an authorization URL.");
        return;
      }
      if (session.status === "pending") {
        if (tokenDirAuthenticated(session.tokenDir, session.email))
          markTerminal(session, "success");
        else fail("The sign-in server exited before authorization completed.");
      }
    });

    // Pipeline the whole MCP handshake up front. A stdio server reads its stdin
    // sequentially and processes these in order once it's up, so sending
    // initialize -> initialized -> the trigger call without waiting for each
    // reply removes the round-trips and gets the authorize URL out as soon as
    // the server finishes starting.
    try {
      proc.stdin?.write(
        mcpLine({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "cabinet-connect", version: "1.0.0" },
          },
        }),
      );
      proc.stdin?.write(mcpLine({ jsonrpc: "2.0", method: "notifications/initialized" }));
      proc.stdin?.write(
        mcpLine({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: cfg.triggerTool, arguments: toolArgs },
        }),
      );
    } catch {
      fail("Could not start the sign-in server.");
      return;
    }

    setTimeout(() => {
      if (!settled) fail("Timed out waiting for the authorization URL.");
    }, URL_WAIT_MS);
  });
}

export function getStdioLoginStatus(sessionId: string): {
  status: McpLoginStatus;
  authorizeUrl?: string;
  error?: string;
} | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  // Belt-and-suspenders: the token may have landed between polls.
  if (s.status === "pending" && tokenDirAuthenticated(s.tokenDir, s.email)) {
    markTerminal(s, "success");
  }
  if (s.status === "pending" && Date.now() - s.startedAt > LOGIN_TIMEOUT_MS) {
    markTerminal(s, "expired");
  }
  return { status: s.status, authorizeUrl: s.authorizeUrl, error: s.error };
}

/**
 * Fallback for when the browser can't reach the loopback: the user pastes the
 * full `http://localhost:8000/oauth2callback?...` URL. Cabinet is on the same
 * machine, so we fetch it ourselves to deliver the code to the live loopback.
 */
export async function completeStdioLogin(
  sessionId: string,
  callbackUrl: string,
): Promise<boolean> {
  const s = sessions.get(sessionId);
  if (!s || s.status !== "pending") return false;
  // Bound the loopback fetch: a local endpoint can accept the connection but
  // never respond, which would otherwise hang the route.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(callbackUrl, { redirect: "manual", signal: ac.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function cancelStdioLogin(sessionId: string): boolean {
  const s = sessions.get(sessionId);
  if (!s) return false;
  if (s.cleanupTimer) clearTimeout(s.cleanupTimer);
  if (s.statusPoll) clearInterval(s.statusPoll);
  try {
    s.proc.stdin?.end();
  } catch {
    /* already closed */
  }
  try {
    s.proc.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(sessionId);
  return true;
}

/** Auth state for the connect panel's `?id=` probe. */
export function readStdioAuthState(entry: CatalogEntry): "authenticated" | "needs-auth" {
  const cfg = entry.connectAuth;
  if (!cfg || cfg.kind !== "stdio-loopback") return "needs-auth";
  const email = cfg.emailEnvKey ? readCabinetEnvFile().values[cfg.emailEnvKey] : undefined;
  return tokenDirAuthenticated(cfg.tokenDir, email) ? "authenticated" : "needs-auth";
}
