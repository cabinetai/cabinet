import dns from "node:dns/promises";
import net from "node:net";

/**
 * Server-side SSRF protection for fetches that target user-supplied URLs.
 *
 * Without this, a user could point the in-app browser's bookmark-title fetch or
 * the frame-check probe at `http://169.254.169.254/…` (cloud metadata),
 * `http://127.0.0.1:…` (local services) or other internal hosts and have the
 * server make the request on their behalf. We reject any URL whose hostname
 * resolves to a loopback/private/link-local address, follow redirects manually
 * so each hop is re-validated, and bound every request with a timeout.
 */

export class SsrfError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SsrfError";
  }
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved IPs. */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  // Not a recognizable IP literal — treat as unsafe.
  return true;
}

/**
 * Validate that `rawUrl` is an http(s) URL whose host does not resolve to a
 * non-public address. Returns the parsed URL or throws an {@link SsrfError}.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("invalid-protocol");
  }
  const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (!hostname || hostname.toLowerCase() === "localhost") {
    throw new SsrfError("private-address");
  }
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new SsrfError("private-address");
    return url;
  }
  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new SsrfError("dns-failed");
  }
  if (records.length === 0) throw new SsrfError("dns-failed");
  for (const record of records) {
    if (isPrivateAddress(record.address)) throw new SsrfError("private-address");
  }
  return url;
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Abort after this many ms (default 8000). */
  timeoutMs?: number;
  /** Max redirect hops to follow, each re-validated (default 5). */
  maxRedirects?: number;
}

export interface SafeFetchResult {
  response: Response;
  /** The final URL after any (validated) redirects. */
  finalUrl: string;
}

/**
 * Fetch a user-supplied URL with SSRF validation, manual + re-validated
 * redirects, and a hard timeout. Throws {@link SsrfError} when the target (or
 * any redirect hop) is not a public http(s) address.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { method = "GET", headers, timeoutMs = 8000, maxRedirects = 5 } = options;
  let current = await assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await fetch(current.toString(), {
        method,
        headers,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current);
        current = await assertPublicHttpUrl(next.toString());
        continue;
      }
      return { response, finalUrl: current.toString() };
    }
    throw new SsrfError("too-many-redirects");
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body as text, capped at `maxBytes` to avoid memory blowups. */
export async function readTextCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= maxBytes) break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder("utf-8").decode(concatChunks(chunks, Math.min(total, maxBytes)));
}

function concatChunks(chunks: Uint8Array[], limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= limit) break;
    const slice = chunk.subarray(0, Math.min(chunk.length, limit - offset));
    out.set(slice, offset);
    offset += slice.length;
  }
  return out;
}
