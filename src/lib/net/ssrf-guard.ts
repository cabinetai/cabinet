import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

/**
 * Server-side SSRF protection for fetches that target user-supplied URLs.
 *
 * Without this, a user could point the in-app browser's bookmark-title fetch or
 * the frame-check probe at `http://169.254.169.254/…` (cloud metadata),
 * `http://127.0.0.1:…` (local services) or other internal hosts and have the
 * server make the request on their behalf.
 *
 * Defenses:
 *  - reject non-http(s) URLs and literal private/reserved IPs up front;
 *  - resolve + re-validate the host *inside the socket lookup* so a hostname
 *    that passed an earlier check can't rebind to a private IP at connect time
 *    (DNS-rebinding);
 *  - follow redirects manually, re-validating each hop and draining the
 *    intermediate response so sockets aren't leaked;
 *  - bound every request with a timeout and cap how much body we read.
 */

export class SsrfError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SsrfError";
  }
}

/**
 * True for loopback, private, link-local, CGNAT, benchmarking, documentation,
 * multicast and other reserved/non-public addresses (IPv4 and IPv6).
 */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // this-host / private / loopback
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking (198.18.0.0/15)
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
    if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + broadcast
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("ff")) return true; // multicast (ff00::/8)
    if (lower.startsWith("2001:db8")) return true; // documentation
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]); // IPv4-mapped
    return false;
  }
  // Not a recognizable IP literal — treat as unsafe.
  return true;
}

/**
 * Validate the static parts of a URL (protocol + any literal IP host). Hostname
 * DNS resolution is deferred to {@link guardedLookup} so the address that is
 * actually connected to is the one we validate. Throws an {@link SsrfError}.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
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
  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    throw new SsrfError("private-address");
  }
  return url;
}

// Socket-level lookup that resolves the host and rejects the connection if ANY
// resolved address is non-public. Used for every request so a hostname can't
// rebind to a private IP between validation and connect (DNS-rebinding).
const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  const wantsAll = typeof options === "object" && options?.all === true;
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      (callback as (e: Error | null) => void)(err);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    for (const entry of list) {
      if (isPrivateAddress(entry.address)) {
        (callback as (e: Error | null) => void)(new SsrfError("private-address"));
        return;
      }
    }
    if (wantsAll) {
      (callback as unknown as (e: Error | null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      const first = list[0];
      callback(null, first.address, first.family);
    }
  });
};

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Abort after this many ms (default 8000). */
  timeoutMs?: number;
  /** Max redirect hops to follow, each re-validated (default 5). */
  maxRedirects?: number;
}

export interface SafeFetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** The final URL after any (validated) redirects. */
  finalUrl: string;
  /** Read the body as text, capped at `maxBytes`, then release the socket. */
  readText: (maxBytes: number) => Promise<string>;
  /** Release the socket without reading the body (e.g. for HEAD probes). */
  dispose: () => void;
}

function requestOnce(
  url: URL,
  opts: { method: string; headers?: Record<string, string>; timeoutMs: number }
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      { method: opts.method, headers: opts.headers, lookup: guardedLookup },
      (res) => resolve(res)
    );
    req.on("error", reject);
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new SsrfError("timeout"));
    });
    req.end();
  });
}

function readStreamCapped(stream: http.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stream.destroy();
      resolve(Buffer.concat(chunks).subarray(0, maxBytes).toString("utf-8"));
    };
    stream.on("data", (chunk: Buffer) => {
      if (settled) return;
      chunks.push(chunk);
      total += chunk.length;
      if (total >= maxBytes) finish();
    });
    stream.on("end", finish);
    stream.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

/**
 * Fetch a user-supplied URL with SSRF validation (including at the socket
 * lookup), manual + re-validated redirects, and a hard timeout. Throws
 * {@link SsrfError} when the target — or any redirect hop — isn't a public
 * http(s) address.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { method = "GET", headers, timeoutMs = 8000, maxRedirects = 5 } = options;
  let current = assertPublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(current, { method, headers, timeoutMs });
    const status = res.statusCode ?? 0;
    const location = res.headers.location;

    if (status >= 300 && status < 400 && location) {
      // Drain + close the intermediate response so the socket isn't leaked.
      res.resume();
      res.destroy();
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }

    return {
      status,
      headers: res.headers,
      finalUrl: current.toString(),
      readText: (maxBytes: number) => readStreamCapped(res, maxBytes),
      dispose: () => {
        res.resume();
        res.destroy();
      },
    };
  }

  throw new SsrfError("too-many-redirects");
}
