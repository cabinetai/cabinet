import { NextRequest, NextResponse } from "next/server";

async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "cabinet-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function hasMcpBearer(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  return /^Bearer\s+.+$/i.test(header);
}

function truthyEnv(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "authelia" ||
    normalized === "trusted-proxy"
  );
}

function csv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configuredHeaderNames(key: string, fallback: string[]): string[] {
  const configured = csv(process.env[key]);
  return configured.length > 0 ? configured : fallback;
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function shouldTrustProxyIdentity(): boolean {
  return (
    truthyEnv(process.env.OPTALE_TRUST_PROXY_IDENTITY) ||
    truthyEnv(process.env.OPTALE_AUTH_TRUST_HEADERS) ||
    (process.env.OPTALE_AUTH_PROVIDER || "").trim().toLowerCase() === "authelia"
  );
}

function proxySecretHeaderName(): string {
  return (
    (process.env.OPTALE_AUTH_PROXY_SECRET_HEADER || "").trim() ||
    "X-Optale-Auth-Proxy-Secret"
  );
}

function hasTrustedProxySecret(req: NextRequest): boolean {
  const expected = (process.env.OPTALE_AUTH_PROXY_SHARED_SECRET || "").trim();
  if (!expected) return true;
  return req.headers.get(proxySecretHeaderName()) === expected;
}

function hasTrustedProxyIdentity(req: NextRequest): boolean {
  if (!shouldTrustProxyIdentity()) return false;
  if (!hasTrustedProxySecret(req)) return false;
  const user = firstHeader(
    req.headers,
    configuredHeaderNames("OPTALE_AUTH_USER_HEADERS", [
      "Remote-User",
      "X-Forwarded-User",
      "X-Auth-Request-User",
    ]),
  );
  const email = firstHeader(
    req.headers,
    configuredHeaderNames("OPTALE_AUTH_EMAIL_HEADERS", [
      "Remote-Email",
      "X-Forwarded-Email",
      "X-Auth-Request-Email",
    ]),
  );
  return Boolean(user || email);
}

function hasMalformedPercentEncoding(url: string): boolean {
  try {
    decodeURI(url);
    return false;
  } catch {
    return true;
  }
}

function isOptaleControlPlanePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/optale/admin") ||
    pathname.startsWith("/api/optale/brain") ||
    pathname.startsWith("/api/optale/command-center") ||
    pathname.startsWith("/api/optale/context-registry") ||
    pathname.startsWith("/api/optale/mcp-clients") ||
    pathname.startsWith("/api/optale/mcp-policy") ||
    pathname.startsWith("/api/optale/scopes")
  );
}

export async function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (host === "cabinet.optale.com") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "observatory.optale.com";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  if (
    req.url.includes("/api/optale/brain/command/") &&
    hasMalformedPercentEncoding(req.url)
  ) {
    return NextResponse.json(
      {
        error: "CommandBrainRouteNotAllowed",
        message: "This Command Brain route is not in the read-only allowlist.",
      },
      { status: 403 },
    );
  }

  const password = process.env.KB_PASSWORD || "";
  const { pathname } = req.nextUrl;

  if (hasTrustedProxyIdentity(req)) {
    return NextResponse.next();
  }

  if (
    !password &&
    pathname.startsWith("/api/optale/brain") &&
    !isLoopbackHost(host)
  ) {
    return NextResponse.json(
      {
        error: "BrainAuthRequired",
        message:
          "Optale Brain APIs require authentication before exposing scoped Brain data on public hosts.",
      },
      { status: 403 },
    );
  }

  if (
    !password &&
    isOptaleControlPlanePath(pathname) &&
    !isLoopbackHost(host)
  ) {
    return NextResponse.json(
      {
        error: "OptaleControlPlaneAuthRequired",
        message:
          "Optale control-plane APIs require authentication before exposing or mutating governance state on public hosts.",
      },
      { status: 403 },
    );
  }

  // Auth disabled — no password set
  if (!password) {
    return NextResponse.next();
  }

  // Allow login page and login API
  if (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/check"
  ) {
    return NextResponse.next();
  }

  // Allow health check
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  // MCP clients are usually non-browser processes and cannot present the
  // Cabinet UI cookie. The route validates bearer tokens against the
  // client registry; proxy only lets bearer-shaped MCP traffic reach it.
  if (
    pathname === "/api/optale/mcp" &&
    (isLoopbackHost(req.nextUrl.hostname) || hasMcpBearer(req))
  ) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/optale/slack-agent-policy" &&
    (isLoopbackHost(req.nextUrl.hostname) || hasMcpBearer(req))
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = req.cookies.get("kb-auth")?.value;
  const expected = await hashToken(password);

  if (token !== expected) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
