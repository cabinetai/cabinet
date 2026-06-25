import { NextRequest, NextResponse } from "next/server";
import { safeFetch, SsrfError } from "@/lib/net/ssrf-guard";

function parseFrameAncestors(csp: string): string[] | null {
  const directives = csp
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const directive = directives.find((part) => part.toLowerCase().startsWith("frame-ancestors"));
  if (!directive) return null;
  return directive
    .split(/\s+/)
    .slice(1)
    .map((token) => token.trim())
    .filter(Boolean);
}

function allowsAppOrigin(tokens: string[], appOrigin: string): boolean {
  if (tokens.includes("*")) return true;
  const app = new URL(appOrigin);
  for (const token of tokens) {
    const normalized = token.replace(/^"|"$/g, "");
    if (normalized === "'none'") return false;
    if (normalized === "'self'") continue;
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      try {
        const allowed = new URL(normalized);
        if (allowed.origin === app.origin) return true;
      } catch {
      }
    }
  }
  return false;
}

function xfoBlocksEmbedding(xfo: string, targetOrigin: string, appOrigin: string): boolean {
  const value = xfo.trim().toLowerCase();
  if (!value) return false;
  if (value === "deny") return true;
  if (value === "sameorigin") return targetOrigin !== appOrigin;
  if (value.startsWith("allow-from")) {
    const parts = xfo.split(/\s+/);
    const allowedOrigin = parts.slice(1).join(" ").trim();
    if (!allowedOrigin) return true;
    try {
      return new URL(allowedOrigin).origin !== appOrigin;
    } catch {
      return true;
    }
  }
  return false;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "invalid-protocol" }, { status: 400 });
  }

  // SSRF guard: reject loopback/private/link-local hosts (validated at the
  // socket lookup + across redirects) and bound the probe with a timeout so a
  // slow host can't hang it.
  let status: number;
  let headers: import("node:http").IncomingHttpHeaders;
  let finalUrl: string;
  try {
    const result = await safeFetch(target.toString(), { method: "HEAD", timeoutMs: 8000 });
    status = result.status;
    headers = result.headers;
    finalUrl = result.finalUrl;
    // HEAD has no body to read; release the socket.
    result.dispose();
  } catch (error) {
    if (error instanceof SsrfError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 400 });
    }
    return NextResponse.json({ ok: true, blocked: false, unreachable: true });
  }
  void status;

  const finalOrigin = (() => {
    try {
      return new URL(finalUrl).origin;
    } catch {
      return target.origin;
    }
  })();

  const headerValue = (name: string): string => {
    const v = headers[name];
    return Array.isArray(v) ? v.join(", ") : v || "";
  };
  const appOrigin = request.nextUrl.origin;
  const xfo = headerValue("x-frame-options");
  const csp = headerValue("content-security-policy");

  let blocked = false;
  if (xfoBlocksEmbedding(xfo, finalOrigin, appOrigin)) {
    blocked = true;
  }

  if (!blocked && csp) {
    const frameAncestors = parseFrameAncestors(csp);
    if (frameAncestors) {
      blocked = !allowsAppOrigin(frameAncestors, appOrigin);
    }
  }

  return NextResponse.json({ ok: true, blocked, unreachable: false });
}
