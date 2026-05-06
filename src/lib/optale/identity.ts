import type { NextRequest } from "next/server";
import { isOptaleRestrictedCustomerMode } from "./runtime-mode";
import { resolveRegisteredOptaleConsoleRole } from "./member-registry";
import {
  anonymousOptaleIdentity,
  normalizeOptaleConsoleRole,
  permissionsForOptaleRole,
  type OptaleConsoleRole,
  type OptaleIdentitySnapshot,
} from "./identity-shared";

type RuntimeModeEnv = Partial<Record<string, string | undefined>>;

const DEFAULT_ADMIN_GROUPS = ["admin", "admins", "optale-admin"];
const DEFAULT_ENGINEER_GROUPS = ["engineer", "engineering", "fde"];
const DEFAULT_OPERATOR_GROUPS = ["operator", "operators", "optale", "team"];
const DEFAULT_VIEWER_GROUPS = ["viewer", "viewers", "read-only", "readonly"];
const DEFAULT_PROXY_SECRET_HEADER = "X-Optale-Auth-Proxy-Secret";

function envValue(env: RuntimeModeEnv, key: string): string {
  return (env[key] || "").trim();
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

function configuredList(
  env: RuntimeModeEnv,
  key: string,
  fallback: string[],
): string[] {
  const configured = csv(env[key]);
  return configured.length > 0 ? configured : fallback;
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

function firstHeader(headers: Headers, names: string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function configuredHeaderNames(
  env: RuntimeModeEnv,
  key: string,
  fallback: string[],
): string[] {
  const configured = csv(env[key]);
  return configured.length > 0 ? configured : fallback;
}

function parseGroups(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function requestHostname(request: NextRequest): string {
  return (
    request.nextUrl.hostname ||
    (request.headers.get("host") || "").split(":")[0]
  );
}

export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isDesktopRuntime(env: RuntimeModeEnv): boolean {
  return Boolean(
    envValue(env, "OPTALE_DESKTOP_PROFILE") ||
      envValue(env, "NEXT_PUBLIC_OPTALE_DESKTOP_PROFILE"),
  );
}

function shouldTrustProxyIdentity(env: RuntimeModeEnv): boolean {
  return (
    truthyEnv(env.OPTALE_TRUST_PROXY_IDENTITY) ||
    truthyEnv(env.OPTALE_AUTH_TRUST_HEADERS) ||
    envValue(env, "OPTALE_AUTH_PROVIDER").toLowerCase() === "authelia"
  );
}

function proxySecretHeaderName(env: RuntimeModeEnv): string {
  return envValue(env, "OPTALE_AUTH_PROXY_SECRET_HEADER") || DEFAULT_PROXY_SECRET_HEADER;
}

function requestHasTrustedProxySecret(
  request: NextRequest,
  env: RuntimeModeEnv,
): boolean {
  const expected = envValue(env, "OPTALE_AUTH_PROXY_SHARED_SECRET");
  if (!expected) return true;
  return request.headers.get(proxySecretHeaderName(env)) === expected;
}

async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}cabinet-salt`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function roleFromGroups(
  groups: string[],
  env: RuntimeModeEnv,
): OptaleConsoleRole {
  const groupSet = normalizedSet(groups);
  const hasAny = (values: string[]) =>
    values.some((value) => groupSet.has(value.toLowerCase()));

  if (hasAny(configuredList(env, "OPTALE_AUTH_ADMIN_GROUPS", DEFAULT_ADMIN_GROUPS))) {
    return "admin";
  }
  if (
    hasAny(
      configuredList(
        env,
        "OPTALE_AUTH_ENGINEER_GROUPS",
        DEFAULT_ENGINEER_GROUPS,
      ),
    )
  ) {
    return "engineer";
  }
  if (
    hasAny(
      configuredList(
        env,
        "OPTALE_AUTH_OPERATOR_GROUPS",
        DEFAULT_OPERATOR_GROUPS,
      ),
    )
  ) {
    return "operator";
  }
  if (
    hasAny(
      configuredList(env, "OPTALE_AUTH_VIEWER_GROUPS", DEFAULT_VIEWER_GROUPS),
    )
  ) {
    return "viewer";
  }
  return "viewer";
}

function identitySnapshot(input: {
  provider: OptaleIdentitySnapshot["provider"];
  source: OptaleIdentitySnapshot["source"];
  subject: string;
  email?: string | null;
  name?: string | null;
  groups?: string[];
  role: OptaleConsoleRole;
}): OptaleIdentitySnapshot {
  return {
    authenticated: true,
    provider: input.provider,
    source: input.source,
    subject: input.subject,
    email: input.email || null,
    name: input.name || null,
    groups: input.groups || [],
    role: input.role,
    permissions: permissionsForOptaleRole(input.role),
  };
}

function resolveTrustedProxyIdentity(
  request: NextRequest,
  env: RuntimeModeEnv,
): OptaleIdentitySnapshot | null {
  if (!shouldTrustProxyIdentity(env)) return null;
  if (!requestHasTrustedProxySecret(request, env)) return null;

  const user = firstHeader(
    request.headers,
    configuredHeaderNames(env, "OPTALE_AUTH_USER_HEADERS", [
      "Remote-User",
      "X-Forwarded-User",
      "X-Auth-Request-User",
    ]),
  );
  const email = firstHeader(
    request.headers,
    configuredHeaderNames(env, "OPTALE_AUTH_EMAIL_HEADERS", [
      "Remote-Email",
      "X-Forwarded-Email",
      "X-Auth-Request-Email",
    ]),
  );
  const name = firstHeader(
    request.headers,
    configuredHeaderNames(env, "OPTALE_AUTH_NAME_HEADERS", [
      "Remote-Name",
      "X-Forwarded-Name",
      "X-Auth-Request-Name",
    ]),
  );
  const groupHeader = firstHeader(
    request.headers,
    configuredHeaderNames(env, "OPTALE_AUTH_GROUP_HEADERS", [
      "Remote-Groups",
      "X-Forwarded-Groups",
      "X-Auth-Request-Groups",
    ]),
  );
  const roleHeader = firstHeader(
    request.headers,
    configuredHeaderNames(env, "OPTALE_AUTH_ROLE_HEADERS", [
      "Remote-Role",
      "X-Optale-Role",
      "X-Auth-Request-Role",
    ]),
  );

  const subject = user || email;
  if (!subject) return null;

  const groups = parseGroups(groupHeader);
  const role =
    normalizeOptaleConsoleRole(roleHeader) || roleFromGroups(groups, env);

  return identitySnapshot({
    provider: "authelia",
    source: "trusted-proxy",
    subject,
    email,
    name,
    groups,
    role,
  });
}

async function resolveLegacyPasswordIdentity(
  request: NextRequest,
  env: RuntimeModeEnv,
): Promise<OptaleIdentitySnapshot | null> {
  const password = envValue(env, "KB_PASSWORD");
  if (!password) return null;

  const token = request.cookies.get("kb-auth")?.value;
  if (!token || token !== (await hashToken(password))) return null;

  return identitySnapshot({
    provider: "cabinet-password",
    source: "legacy-password",
    subject: envValue(env, "OPTALE_LOCAL_USER_ID") || "local-operator",
    email: envValue(env, "OPTALE_LOCAL_USER_EMAIL") || null,
    name: envValue(env, "OPTALE_LOCAL_USER_NAME") || "Local Operator",
    groups: ["local"],
    role: "admin",
  });
}

function resolveLocalIdentity(
  request: NextRequest,
  env: RuntimeModeEnv,
): OptaleIdentitySnapshot | null {
  const hostname = requestHostname(request);
  if (!isLoopbackHost(hostname)) return null;
  if (envValue(env, "KB_PASSWORD")) return null;

  const restricted = isOptaleRestrictedCustomerMode(env);
  const desktop = isDesktopRuntime(env);
  return identitySnapshot({
    provider: "local",
    source: desktop ? "desktop" : "local-dev",
    subject: envValue(env, "OPTALE_LOCAL_USER_ID") || "local-operator",
    email: envValue(env, "OPTALE_LOCAL_USER_EMAIL") || null,
    name:
      envValue(env, "OPTALE_LOCAL_USER_NAME") ||
      (desktop ? "Desktop Operator" : "Local Operator"),
    groups: [desktop ? "desktop" : "local"],
    role: restricted ? "viewer" : "admin",
  });
}

export async function resolveOptaleRequestIdentity(
  request: NextRequest,
  env: RuntimeModeEnv = process.env,
): Promise<OptaleIdentitySnapshot> {
  const identity =
    resolveTrustedProxyIdentity(request, env) ||
    (await resolveLegacyPasswordIdentity(request, env)) ||
    resolveLocalIdentity(request, env) ||
    anonymousOptaleIdentity();

  if (!identity.authenticated) return identity;

  try {
    const registeredRole = await resolveRegisteredOptaleConsoleRole(identity);
    if (!registeredRole || registeredRole === identity.role) return identity;
    return {
      ...identity,
      role: registeredRole,
      permissions: permissionsForOptaleRole(registeredRole),
    };
  } catch {
    return identity;
  }
}
