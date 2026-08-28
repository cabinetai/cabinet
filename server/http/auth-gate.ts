import type { NextFunction, Request, Response } from "express";
import {
  getTokenFromAuthorizationHeader,
  isDaemonTokenValid,
} from "../../src/lib/agents/daemon-auth";
import {
  KB_AUTH_COOKIE,
  expectedToken,
  isAuthEnabled,
  timingSafeEqualHex,
} from "../../src/lib/auth/kb-auth";
import {
  CABINET_JWT_COOKIE,
  cloudGateActive,
  verifyCloudToken,
} from "../../src/lib/auth/cloud-token";

// Same carve-outs as src/proxy.ts: login + auth-check must answer before a
// session exists (local mode only; the cloud gate has no anonymous routes).
const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/check"]);

function parseCookies(header: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return map;
}

/**
 * Express port of the src/proxy.ts auth gate for the daemon-hosted /api
 * surface, plus one addition: the daemon bearer token is accepted so
 * server-to-server calls (scheduler triggers, tooling) don't need a browser
 * cookie.
 */
export async function apiAuthGate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Never trust a caller-supplied identity header; only this gate may set it.
  delete req.headers["x-cabinet-user"];

  // Liveness/readiness probes answer without a session.
  if (req.path.startsWith("/api/health")) return next();

  if (isDaemonTokenValid(getTokenFromAuthorizationHeader(req.headers.authorization))) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);

  if (cloudGateActive()) {
    const sub = await verifyCloudToken(cookies.get(CABINET_JWT_COOKIE));
    if (!sub) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.headers["x-cabinet-user"] = sub;
    return next();
  }

  if (!isAuthEnabled()) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();

  const token = cookies.get(KB_AUTH_COOKIE) ?? "";
  if (timingSafeEqualHex(token, await expectedToken())) return next();
  res.status(401).json({ error: "Unauthorized" });
}
