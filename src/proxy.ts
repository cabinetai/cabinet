import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth/kb-auth";
import {
  cloudGateActive,
  cloudUserSub,
  hasValidKbAuthCookie,
} from "@/lib/auth/request-gate";
import { getDaemonUrl } from "@/lib/runtime/runtime-config";

// ---------------------------------------------------------------------------
// Cabinet Cloud gate (CABINET_CLOUD=1)
// ---------------------------------------------------------------------------
// In the hosted, multi-tenant edition each tenant is a container fronted by a
// host agent that already authorizes requests. This gate is defense-in-depth:
// the app ITSELF verifies the Supabase access token the panel issued, so a
// request that somehow reaches the container without a valid session is denied
// here too. Verification is a signature check against the Supabase JWKS
// (ES256), so no shared secret lives in the container.
//
// This path is entirely separate from the local/desktop KB_PASSWORD gate below
// and only runs when CABINET_CLOUD === "1"; every other deployment keeps the
// existing behavior untouched.

// The JWT verification itself lives in @/lib/auth/request-gate so routes
// excluded from the matcher below (/api/upload) can apply the identical gate.

// Transitional switch for the Express-backend migration: when enabled, the
// proxy forwards authorized /api/* requests to the daemon's embedded Express
// app instead of the local Next route handlers. /api/upload never reaches
// this code — it is excluded from the matcher below (Next buffers matched
// request bodies), and keeps hitting its Next route until migration step 2.
function apiViaDaemon(): boolean {
  return process.env.CABINET_API_VIA_DAEMON === "1";
}

function maybeRewriteApi(
  req: NextRequest,
  requestHeaders?: Headers
): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (!apiViaDaemon() || !pathname.startsWith("/api/")) return null;
  const target = new URL(pathname + search, getDaemonUrl());
  return requestHeaders
    ? NextResponse.rewrite(target, { request: { headers: requestHeaders } })
    : NextResponse.rewrite(target);
}

async function cloudProxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Liveness/readiness probes must answer without a user session so the host
  // agent / orchestrator can tell a booting container from a dead one.
  if (pathname.startsWith("/api/health")) {
    return maybeRewriteApi(req) ?? NextResponse.next();
  }

  const sub = await cloudUserSub(req);

  if (!sub) {
    // API routes get a machine-readable 401.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages bounce to the panel's login (a different origin). Resolve relative
    // to the request so a relative override still works; fail closed with a 401
    // if no login URL is configured rather than looping or leaking the app.
    const loginUrl = process.env.CABINET_CLOUD_LOGIN_URL;
    if (loginUrl) {
      return NextResponse.redirect(new URL(loginUrl, req.url));
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authenticated: hand the verified subject to downstream handlers. Build the
  // forwarded headers from the incoming ones and OVERWRITE any client-supplied
  // `x-cabinet-user` (Headers.set replaces), so the value can only ever come
  // from a verified token — never spoofed by the caller.
  const headers = new Headers(req.headers);
  headers.set("x-cabinet-user", sub);
  return (
    maybeRewriteApi(req, headers) ?? NextResponse.next({ request: { headers } })
  );
}

export async function proxy(req: NextRequest) {
  // Hosted edition: Supabase-JWT gate, independent of the KB_PASSWORD path.
  // Opt-in via CABINET_JWT_JWKS_URL: only gate when it's configured. This keeps
  // the in-app gate a deliberate, verifiable choice (the host agent already gates
  // at the edge) — a cloud tenant with CABINET_CLOUD=1 but no JWKS URL configured
  // must NOT fail closed and lock itself out.
  if (cloudGateActive()) {
    return cloudProxy(req);
  }

  // Auth disabled — no password set
  if (!isAuthEnabled()) {
    return maybeRewriteApi(req) ?? NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // Allow login page and login API
  if (pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/check") {
    return maybeRewriteApi(req) ?? NextResponse.next();
  }

  // Allow health check
  if (pathname.startsWith("/api/health")) {
    return maybeRewriteApi(req) ?? NextResponse.next();
  }

  // Check auth cookie (constant-time; expected token is memoized so this is
  // O(1) per request — PBKDF2 runs once per process, not per request).
  if (!(await hasValidKbAuthCookie(req))) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return maybeRewriteApi(req) ?? NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except static files and Next.js internals.
    // /api/upload is excluded on purpose: matched requests get their body
    // cloned into memory by Next (and silently truncated at 10MB —
    // proxyClientMaxBodySize), which breaks and bloats large streaming
    // uploads. That route enforces the identical gate itself via
    // requireApiAuth() from @/lib/auth/request-gate.
    "/((?!_next/static|_next/image|favicon.ico|api/upload).*)",
  ],
};
