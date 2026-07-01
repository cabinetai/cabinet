import { NextRequest, NextResponse } from "next/server";
import { getCatalogEntry } from "@/lib/agents/mcp-catalog";
import {
  startMcpLogin,
  getMcpLoginStatus,
  completeMcpLogin,
  cancelMcpLogin,
  readServerAuthState,
} from "@/lib/agents/claude-mcp-login";
import {
  startStdioLogin,
  getStdioLoginStatus,
  completeStdioLogin,
  cancelStdioLogin,
  readStdioAuthState,
} from "@/lib/agents/stdio-mcp-login";

/**
 * `/api/agents/config/mcp-catalog/oauth/login`
 *
 * Connect-time OAuth sign-in for HTTP (remote) MCP servers, driven through
 * Claude Code so the token is cached BEFORE any agent runs — instead of the
 * broken "sign in on first agent use" loopback (which dies with the task). See
 * claude-mcp-login.ts.
 *
 * POST   { id }                     — start sign-in; returns { sessionId,
 *                                      authorizeUrl } (or { alreadyAuthenticated }).
 * POST   { sessionId, callbackUrl } — fallback: submit the pasted callback URL.
 * GET    ?sessionId                 — poll: pending | success | error | expired.
 * GET    ?id                        — current auth state for an integration:
 *                                      { authenticated: boolean }.
 * DELETE ?sessionId                 — cancel an in-flight sign-in.
 *
 * No secrets are handled here; the OAuth token is cached by the CLI.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, sessionId, callbackUrl } = (body ?? {}) as {
    id?: unknown;
    sessionId?: unknown;
    callbackUrl?: unknown;
  };

  // Completion branch: forward the pasted callback URL to the live session.
  // Accept any loopback path (the HTTP flow uses /callback; workspace-mcp uses
  // /oauth2callback). The session lookup is tried on both engines.
  if (typeof sessionId === "string" && typeof callbackUrl === "string") {
    const url = callbackUrl.trim();
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
      return NextResponse.json(
        { ok: false, error: "That doesn't look like a localhost callback URL." },
        { status: 400 },
      );
    }
    const ok = completeMcpLogin(sessionId, url) || (await completeStdioLogin(sessionId, url));
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { ok: false, error: "No in-progress sign-in for that session." },
          { status: 404 },
        );
  }

  // Start branch.
  const entry = typeof id === "string" ? getCatalogEntry(id) : undefined;
  if (!entry) {
    return NextResponse.json({ ok: false, error: "Unknown integration id" }, { status: 400 });
  }
  try {
    if (entry.transport === "http") {
      const res = await startMcpLogin(entry.mcpServerName);
      return NextResponse.json({ ok: true, ...res });
    }
    if (entry.connectAuth?.kind === "stdio-loopback") {
      const res = await startStdioLogin(entry);
      return NextResponse.json({ ok: true, ...res });
    }
    return NextResponse.json(
      { ok: false, error: "This integration doesn't use OAuth sign-in." },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not start sign-in" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // `?id=` → report whether the integration's server is already authenticated,
  // so the connect panel can show a true "signed in" state (registration alone
  // doesn't mean authenticated).
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const entry = getCatalogEntry(id);
    if (entry?.transport === "http") {
      const state = await readServerAuthState(entry.mcpServerName);
      return NextResponse.json({ authenticated: state === "authenticated", applicable: true, state });
    }
    if (entry?.connectAuth?.kind === "stdio-loopback") {
      const state = readStdioAuthState(entry);
      return NextResponse.json({ authenticated: state === "authenticated", applicable: true, state });
    }
    return NextResponse.json({ authenticated: false, applicable: false });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId or id" }, { status: 400 });
  }
  const status = getMcpLoginStatus(sessionId) ?? getStdioLoginStatus(sessionId);
  if (!status) {
    return NextResponse.json({ error: "Unknown sign-in session" }, { status: 404 });
  }
  return NextResponse.json(status);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  if (!cancelMcpLogin(sessionId)) cancelStdioLogin(sessionId);
  return NextResponse.json({ ok: true });
}
