/**
 * Shared KB_PASSWORD auth primitives.
 *
 * The app's auth gate (src/proxy.ts) protects every `/api/*` route when
 * `KB_PASSWORD` is set, requiring a `kb-auth` cookie whose value is
 * SHA-256(password + salt). The scheduler daemon (server/cabinet-daemon.ts)
 * makes internal server-to-server calls to those same routes and must present
 * the identical cookie, so both sides derive the value from this one module to
 * prevent the hash/salt from drifting between them.
 */

/** Cookie name checked by the app's auth gate. */
export const KB_AUTH_COOKIE = "kb-auth";

const KB_AUTH_SALT = "cabinet-salt";

/**
 * Hex SHA-256 of `password + salt`. Uses Web Crypto (`crypto.subtle`), which is
 * available in both the Next edge/middleware runtime and Node 20+ (the daemon).
 */
export async function hashKbToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + KB_AUTH_SALT);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
