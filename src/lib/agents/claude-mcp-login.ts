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
 * run `claude mcp login <server> --no-browser` inside a PTY (the CLI refuses to
 * authenticate without a terminal), parse the authorization URL it prints, and
 * keep the process — and its loopback on the configured callback port — alive
 * while the user approves in the browser. The CLI's own loopback catches the
 * callback and persists the token; we detect that via `claude mcp get <server>`
 * flipping off "Needs authentication". For remote/headless setups where the
 * browser can't reach localhost, the user pastes the callback URL and we write
 * it to the CLI's "Or paste the redirect URL here:" prompt over the PTY.
 *
 * (Earlier this drove a headless `claude -p` agent calling a `…__authenticate`
 * helper tool; that tool no longer exists in Claude Code ≥2.1.x, so the agent
 * could never emit a URL and the flow timed out. `claude mcp login` replaces it.)
 *
 * Claude Code only. Other CLIs keep the deferred (first-use) flow for now.
 *
 * The session registry is stashed on globalThis so it survives Next.js HMR in
 * dev. This is a local, single-instance feature — no cross-process store needed.
 */

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import { claudeCodeProvider } from "./providers/claude-code";
import { getRuntimePath, resolveCliCommand } from "./provider-cli";

export type McpLoginStatus = "pending" | "success" | "error" | "expired";

interface McpLoginSession {
  id: string;
  /** The `cabinet-<id>` MCP server name as written into the CLI config. */
  serverName: string;
  /** The `claude mcp login` PTY child. Null for the already-authenticated fast path. */
  term: IPty | null;
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
    session.term?.kill();
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
        s.term?.kill();
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
      (err, stdout, stderr) => {
        const out = `${stdout ?? ""}\n${stderr ?? ""}`;
        // Not registered at all. `claude mcp get <name>` echoes the name back in
        // its "No MCP server named …" error, so this must be checked BEFORE the
        // name-presence fallback below — otherwise a missing server reads as
        // authenticated (the panel would falsely show "Signed in").
        if (/no mcp server named/i.test(out)) return resolve("needs-auth");
        if (/needs authentication/i.test(out)) return resolve("needs-auth");
        // Registered + has a token, but the server rejects the connection (e.g.
        // Slack app not enabled for MCP). Not usable → don't report it as signed
        // in; surface it as needing attention so the panel offers reconnect.
        if (/failed to connect/i.test(out)) return resolve("needs-auth");
        if (/\bconnected\b/i.test(out)) return resolve("authenticated");
        if (err) return resolve("unknown");
        // Got a clean read with neither marker → server is configured and not
        // flagged as needing auth, so treat as authenticated.
        return resolve(out.includes(serverName) ? "authenticated" : "unknown");
      },
    );
  });
}

/**
 * Register a pre-configured confidential OAuth client with Claude Code for a
 * remote server whose auth server lacks Dynamic Client Registration (Slack).
 *
 * `claude mcp add-json … --client-secret` is the only supported way to get the
 * secret into Claude Code's keychain (it can't live in config) while ALSO
 * setting the `oauth` block — including `scopes`, which `claude mcp add` flags
 * can't express. It writes the config entry too, so we remove any existing one
 * first (add refuses to overwrite). The secret is passed via `MCP_CLIENT_SECRET`,
 * never on argv. Scope `user` matches where the JSON writer keeps cabinet
 * servers (top-level `mcpServers` in ~/.claude.json).
 */
export function registerConfidentialOAuthClient(opts: {
  serverName: string;
  url: string;
  clientId: string;
  clientSecret: string;
  callbackPort: number;
  /** Optional space-separated scope pin (overrides server-discovered scopes). */
  scopes?: string;
}): Promise<void> {
  const { serverName, url, clientId, clientSecret, callbackPort, scopes } = opts;
  const oauth: Record<string, unknown> = { clientId, callbackPort };
  if (scopes) oauth.scopes = scopes;
  const json = JSON.stringify({ type: "http", url, oauth });
  return new Promise((resolve, reject) => {
    // Best-effort remove of any prior entry so add-json doesn't error on conflict.
    execFile(
      claudeCommand(),
      ["mcp", "remove", "--scope", "user", serverName],
      { env: claudeEnv(), timeout: 15_000 },
      () => {
        execFile(
          claudeCommand(),
          ["mcp", "add-json", "--scope", "user", "--client-secret", serverName, json],
          { env: { ...claudeEnv(), MCP_CLIENT_SECRET: clientSecret }, timeout: 30_000 },
          (err, stdout, stderr) => {
            if (err) {
              reject(
                new Error(
                  `Failed to register Slack OAuth client: ${
                    `${stderr ?? ""}`.trim() || `${stdout ?? ""}`.trim() || err.message
                  }`,
                ),
              );
            } else {
              resolve();
            }
          },
        );
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
      term: null,
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
  // `claude mcp login` is the supported OAuth entry point, but it refuses to run
  // without a TTY — so drive it through a PTY. `--no-browser` makes it PRINT the
  // authorization URL (we surface it in the panel) while still arming its own
  // loopback on the configured callback port to catch the redirect.
  const term = pty.spawn(claudeCommand(), ["mcp", "login", serverName, "--no-browser"], {
    name: "xterm-color",
    // Wide enough that the long authorize URL is never wrapped mid-line.
    cols: 1000,
    rows: 30,
    env: claudeEnv() as { [key: string]: string },
  });

  const session: McpLoginSession = {
    id,
    serverName,
    term,
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

    term.onData((chunk) => {
      session.output += chunk;
      // The CLI prints a clear message when the loopback port is taken; surface
      // it verbatim instead of letting the start time out opaquely.
      if (!settled && /already in use/i.test(session.output)) {
        fail(
          "OAuth callback port is already in use — close any other sign-in in progress and try again.",
        );
        return;
      }
      if (!session.authorizeUrl) {
        const url = parseAuthorizeUrl(session.output);
        if (url) {
          session.authorizeUrl = url;
          if (!settled) {
            settled = true;
            // Watch for the user to finish in the browser. The CLI's own
            // loopback completes the token exchange; we poll the persisted token.
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
    });

    term.onExit(({ exitCode }) => {
      // If it dies before we got a URL, the start failed. If it dies after, the
      // loopback is gone — but the token may already be persisted, so only flip
      // to error when a fresh auth-state read says it isn't authenticated.
      if (!settled) {
        fail(
          session.error ??
            (exitCode === 0
              ? "Sign-in ended before an authorization URL was issued"
              : `Sign-in process exited (code ${exitCode}) before an authorization URL`),
        );
        return;
      }
      if (session.status === "pending") {
        void readServerAuthState(serverName).then((state) => {
          if (state === "authenticated") markTerminal(session, "success");
          else fail("The sign-in process exited before authorization completed.");
        });
      }
    });

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
 * and we deliver it to the SAME live `claude mcp login` process, which is parked
 * at its "Or paste the redirect URL here:" prompt holding the in-flight PKCE
 * state. A trailing CR submits the line.
 */
export function completeMcpLogin(sessionId: string, callbackUrl: string): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.status !== "pending" || !s.term) return false;
  try {
    s.term.write(`${callbackUrl}\r`);
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
    s.term?.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(sessionId);
  return true;
}
