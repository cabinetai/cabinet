import { createRemoteJWKSet, jwtVerify } from "jose";

/** Cookie the panel sets on `.runcabinet.com` (Supabase ES256 access token). */
export const CABINET_JWT_COOKIE = "cabinet_jwt";

// A remote JWK set caches keys and rate-limits refetches internally, so build
// it ONCE per JWKS URL and reuse it across requests. Memoized on the URL so an
// env change (e.g. in tests) still rebuilds.
let jwksMemo: {
  url: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  if (jwksMemo && jwksMemo.url === url) return jwksMemo.jwks;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksMemo = { url, jwks };
  return jwks;
}

/** Whether the hosted-edition Supabase-JWT gate is active for this process. */
export function cloudGateActive(): boolean {
  return (
    process.env.CABINET_CLOUD === "1" && !!process.env.CABINET_JWT_JWKS_URL
  );
}

/**
 * Verify a Supabase access token and return its subject, or null when the
 * token is missing/invalid/expired or no JWKS URL is configured (fail closed).
 * Pinning `algorithms: ["ES256"]` blocks algorithm-confusion attacks; jose
 * also enforces `exp`/`nbf`.
 */
export async function verifyCloudToken(
  token: string | undefined
): Promise<string | null> {
  const jwksUrl = process.env.CABINET_JWT_JWKS_URL;
  if (!jwksUrl || !token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      algorithms: ["ES256"],
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
