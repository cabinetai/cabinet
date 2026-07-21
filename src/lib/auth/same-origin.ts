import { NextRequest, NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/runtime/runtime-config";

function normalizedHttpOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Consequential browser requests must originate from Cabinet itself. The
 * standard Host header is used to survive a reverse proxy/Tailscale boundary;
 * forwarded host/proto headers are intentionally ignored because they are not
 * trustworthy without an explicit trusted-proxy configuration.
 */
export function requireSameOrigin(
  request: NextRequest,
  configuredOrigin = getAppOrigin(),
): NextResponse | null {
  const supplied = normalizedHttpOrigin(request.headers.get("origin"));
  if (!supplied) return NextResponse.json({ error: "A valid same-origin request is required." }, { status: 403 });

  const allowed = new Set<string>();
  const configured = normalizedHttpOrigin(configuredOrigin);
  if (configured) allowed.add(configured);
  allowed.add(request.nextUrl.origin);

  const host = request.headers.get("host")?.trim();
  if (host && !/[\s,/@\\]/.test(host)) {
    try {
      allowed.add(new URL(`${new URL(supplied).protocol}//${host}`).origin);
    } catch {
      // A malformed Host never broadens the allowlist.
    }
  }

  return allowed.has(supplied)
    ? null
    : NextResponse.json({ error: "Cross-origin requests are not permitted." }, { status: 403 });
}
