import { NextRequest, NextResponse } from "next/server";
import {
  KB_AUTH_COOKIE,
  expectedToken,
  isAuthEnabled,
  timingSafeEqualHex,
} from "./kb-auth";
import {
  CABINET_JWT_COOKIE,
  cloudGateActive,
  verifyCloudToken,
} from "./cloud-token";

export { CABINET_JWT_COOKIE, cloudGateActive };

// Shared auth decision used by BOTH the proxy (src/proxy.ts) and API routes
// that are excluded from the proxy matcher. Large-body routes (/api/upload)
// must be excluded there because Next's proxy plumbing buffers a full clone
// of every matched request body in memory (and truncates it at
// proxyClientMaxBodySize) — so those routes enforce the same gate themselves
// via requireApiAuth().

/**
 * Verify the `cabinet_jwt` cookie and return the token subject (the Supabase
 * user id), or null when the token is missing/invalid/expired or the gate is
 * misconfigured (no JWKS URL). Pinning `algorithms: ["ES256"]` blocks
 * algorithm-confusion attacks (`alg: none`, HS256-with-public-key). jose also
 * enforces `exp`/`nbf`, so expired sessions fail closed here.
 */
export async function cloudUserSub(req: NextRequest): Promise<string | null> {
  return verifyCloudToken(req.cookies.get(CABINET_JWT_COOKIE)?.value);
}

/** Constant-time check of the local KB_PASSWORD auth cookie. */
export async function hasValidKbAuthCookie(
  req: NextRequest
): Promise<boolean> {
  const token = req.cookies.get(KB_AUTH_COOKIE)?.value ?? "";
  return timingSafeEqualHex(token, await expectedToken());
}

/**
 * Same gate the proxy applies, for API routes outside its matcher. Returns a
 * 401 response to send back, or null when the request is authorized.
 */
export async function requireApiAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  const unauthorized = () =>
    NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (cloudGateActive()) {
    return (await cloudUserSub(req)) ? null : unauthorized();
  }
  if (!isAuthEnabled()) return null;
  return (await hasValidKbAuthCookie(req)) ? null : unauthorized();
}
