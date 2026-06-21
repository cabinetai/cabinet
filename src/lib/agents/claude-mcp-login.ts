/**
 * Drives Claude Code's MCP OAuth sign-in from Cabinet's own backend, so the
 * connect panel can authenticate an HTTP (remote/OAuth) MCP server *at connect
 * time* — instead of deferring it to the first agent run.
 *
 * Why this exists: Cabinet agents run by spawning a CLI (Claude Code), and that
 * CLI is the MCP client that owns the OAuth token. For an HTTP server the CLI
 * does an authorization-code + PKCE flow with an ephemeral loopback redirect
 * (http://localhost:<port>/callback). Deferring this to the first agent use is
 * broken: a one-shot task ends the moment it answers, killing the CLI process
 * and its loopback listener — so by the time the user clicks the surfaced link
 * the callback hits a dead port ("This site can't be reached") and the in-flight
 * PKCE state is gone. See microsoft-login.ts for the same idea on M365.
 *
 * The fix: keep ONE `claude` process alive across the human approval step. We
 * spawn it in stream-json mode (stdin stays open → process + loopback stay
 * alive), tell it to call the server's `authenticate` helper tool, and parse the
 * authorization URL it returns. When the user approves in the browser, the live
 * loopback catches the callback and Claude Code persists the token to disk — we
 * detect that via `claude mcp get <server>` flipping off "Needs authentication".
 * For remote/headless setups where the browser can't reach localhost, the user
 * can paste the callback URL and we forward it to `complete_authentication`.
 *
 * Claude Code only. Other CLIs keep the deferred (first-use) flow for now.
 *
 * The session registry is stashed on globalThis so it survives Next.js HMR in
 * dev. This is a local, single-instance feature — no cross-process store needed.
 */

import { spawn, execFile, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { claudeCodeProvider } from "./providers/claude-code";
import { getRuntimePath, resolveCliCommand } from "./provider-cli";

export type McpLoginStatus = "pending" | "success" | "error" | "expired";

interface McpLoginSession {
  id: string;
  /** The `cabinet-<id>` MCP server name as written into the CLI config. */
  serverName: string;
  proc: ChildProcess;
  status: McpLoginStatus;
  /** Authorization URL parsed from the `authenticate` tool result. */
  authorizeUrl?: string;
  error?: string;
  startedAt: number;
  /** When the session reached a terminal state. */
  finishedAt?: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  /** Polls `claude mcp get` until the server stops needing auth. */
  statusPoll?: ReturnType<typeof setInterval>;
  output: string;
}

const g = globalThis as unknown as {
  __claudeMcpLoginSessions?: Map<string, McpLoginSession>;
};
const sessions = (g.__claudeMcpLoginSessions ??= new Map<string, McpLoginSession>());

/** OAuth flows are short-lived; give the user a generous window to approve. */
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
/** Allow first-run `npx`/cold start + the model to call authenticate. */
const URL_WAIT_MS = 120_000;
/** Keep a finished session briefly so the client can read the final status. */
const COMPLETED_TTL_MS = 5 * 60 * 1000;
/** How often to check whether the server has finished authenticating. */
const STATUS_POLL_MS = 2500;

function markTerminal(
  session: McpLoginSession,
  status: Exclude<McpLoginStatus, "pending">,
): void {
  if (session.status === "pending") session.status = status;
  if (session.finishedAt == null) session.finishedAt = Date.now();
  if (session.statusPoll) {
    clearInterval(session.statusPoll);
    session.statusPoll = undefined;
  }
  // The flow is done; release the held `claude` process (and its loopback).
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

/** Reaper covering cleanup timers lost across an HMR reload. */
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

function claudeCommand(): string {
  return resolveCliCommand(claudeCodeProvider);
}

function claudeEnv(): NodeJS.ProcessEnv {
  // Match the runtime PATH the provider uses so nvm/homebrew `claude` resolves.
  return { ...process.env, PATH: getRuntimePath() };
}

/** A stream-json user turn, newline-delimited on the child's stdin. */
function userMessage(text: string): string {
  return (
    JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    }) + "\n"
  );
}

/**
 * The authorization URL is the first http(s) URL carrying OAuth params. Matching
 * on `redirect_uri`/`code_challenge` keeps this provider-agnostic (Notion,
 * GitHub, Linear, …) rather than hard-coding a host.
 */
function parseAuthorizeUrl(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s"'`\\]+/g);
  if (!urls) return undefined;
  return urls.find((u) => /redirect_uri=|code_challenge=|client_id=/.test(u));
}

/**
 * Read the server's connection status from a *separate* process, which only
 * succeeds once Claude Code has persisted the OAuth token to disk. Resolves:
 *   - "authenticated": connected / no longer needs auth
 *   - "needs-auth":    still awaiting sign-in
 *   - "unknown":       couldn't tell (treat as still pending)
 */
export function readServerAuthState(
  serverName: string,
): Promise<"authenticated" | "needs-auth" | "unknown"> {
  return new Promise((resolve) => {
    execFile(
      claudeCommand(),
      ["mcp", "get", serverName],
      { env: claudeEnv(), timeout: 8000 },
      (err, stdout) => {
        const out = `${stdout ?? ""}`;
        if (/needs authentication/i.test(out)) return resolve("needs-auth");
        if (/\bconnected\b/i.test(out)) return resolve("authenticated");
        if (err) return resolve("unknown");
        // Got a clean read with neither marker → server is configured and not
        // flagged as needing auth, so treat as authenticated.
        return resolve(out.includes(serverName) ? "authenticated" : "unknown");
      },
    );
  });
}

export interface McpLoginStartResult {
  sessionId: string;
  /** Present when a fresh sign-in is needed. */
  authorizeUrl?: string;
  /** True when the server was already authenticated — nothing to do. */
  alreadyAuthenticated?: boolean;
}

/**
 * Begin an OAuth sign-in for `serverName`. Resolves once the authorization URL
 * is available (or immediately if already authenticated). The child keeps
 * running so its loopback can catch the callback; poll `getMcpLoginStatus`.
 *
 * Precondition: the server must already be registered in Claude Code's config
 * (so its `authenticate` helper tool exists). The connect route writes it first.
 */
export async function startMcpLogin(serverName: string): Promise<McpLoginStartResult> {
  sweepSessions();

  // Fast path: nothing to do if it's already signed in.
  if ((await readServerAuthState(serverName)) === "authenticated") {
    const id = randomUUID();
    const session: McpLoginSession = {
      id,
      serverName,
      proc: { kill() {}, stdin: null } as unknown as ChildProcess,
      status: "success",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      output: "",
    };
    sessions.set(id, session);
    session.cleanupTimer = setTimeout(() => sessions.delete(id), COMPLETED_TTL_MS);
    session.cleanupTimer.unref?.();
    return { sessionId: id, alreadyAuthenticated: true };
  }

  const id = randomUUID();
  const authTool = `mcp__${serverName}__authenticate`;
  const completeTool = `mcp__${serverName}__complete_authentication`;
  const proc = spawn(
    claudeCommand(),
    [
      "--dangerously-skip-permissions",
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      // Restrict to just the OAuth helpers so the model reliably calls them and
      // can't wander off doing anything else.
      "--allowedTools",
      authTool,
      completeTool,
    ],
    { env: claudeEnv(), stdio: ["pipe", "pipe", "pipe"] },
  );

  const session: McpLoginSession = {
    id,
    serverName,
    proc,
    status: "pending",
    startedAt: Date.now(),
    output: "",
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
      if (!session.authorizeUrl) {
        const url = parseAuthorizeUrl(session.output);
        if (url) {
          session.authorizeUrl = url;
          if (!settled) {
            settled = true;
            // Start watching for the user to finish in the browser.
            session.statusPoll = setInterval(() => {
              void readServerAuthState(serverName).then((state) => {
                if (state === "authenticated") markTerminal(session, "success");
              });
            }, STATUS_POLL_MS);
            session.statusPoll.unref?.();
            resolve({ sessionId: id, authorizeUrl: url });
          }
        }
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", (err) => fail(err.message));
    proc.on("exit", () => {
      // If the process dies before we got a URL, the start failed. If it dies
      // after, the loopback is gone — but a poll may still confirm success
      // (token persisted), so only flip to error when not already authenticated.
      if (!settled) {
        fail(session.error ?? "Sign-in ended before an authorization URL was issued");
        return;
      }
      if (session.status === "pending") {
        void readServerAuthState(serverName).then((state) => {
          if (state === "authenticated") markTerminal(session, "success");
          else fail("The sign-in process exited before authorization completed.");
        });
      }
    });

    // Kick off the flow.
    try {
      proc.stdin?.write(
        userMessage(
          `Call the ${authTool} tool now and then output ONLY the authorization URL it returns, nothing else. Do not call any other tool.`,
        ),
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not write to sign-in process");
    }

    setTimeout(() => {
      if (!settled) fail("Timed out waiting for the authorization URL");
    }, URL_WAIT_MS);
  });
}

export function getMcpLoginStatus(sessionId: string): {
  status: McpLoginStatus;
  authorizeUrl?: string;
  error?: string;
} | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (s.status === "pending" && Date.now() - s.startedAt > LOGIN_TIMEOUT_MS) {
    markTerminal(s, "expired");
  }
  return { status: s.status, authorizeUrl: s.authorizeUrl, error: s.error };
}

/**
 * Fallback for when the browser can't reach the loopback (remote/headless): the
 * user pastes the full `http://localhost:<port>/callback?code=...&state=...` URL
 * and we forward it to the server's `complete_authentication` tool on the SAME
 * live process (which still holds the in-flight PKCE state).
 */
export function completeMcpLogin(sessionId: string, callbackUrl: string): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.status !== "pending") return false;
  const completeTool = `mcp__${s.serverName}__complete_authentication`;
  try {
    s.proc.stdin?.write(
      userMessage(
        `Call the ${completeTool} tool with callback_url set to exactly: ${callbackUrl}`,
      ),
    );
  } catch {
    return false;
  }
  return true;
}

export function cancelMcpLogin(sessionId: string): boolean {
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
