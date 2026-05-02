import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import {
  resolveOptaleMcpBearerClient,
  type OptaleMcpClientBudget,
  type OptaleMcpClientPermission,
} from "@/lib/optale/mcp-client-registry";
import type { OptaleAgentScope } from "@/lib/optale/product";
import { normalizeOptaleScope } from "@/lib/optale/scope-registry";

export type OptaleMcpGatewayAuthType =
  | "internal"
  | "loopback"
  | "bearer"
  | "app-cookie"
  | "anonymous";

export interface OptaleMcpGatewayContext {
  requestId: string;
  clientId: string;
  clientName?: string;
  authorized: boolean;
  authorizationError?: string;
  authType: OptaleMcpGatewayAuthType;
  hostname?: string;
  remoteAddress?: string;
  userAgent?: string;
  origin?: string;
  defaultCabinetPath?: string;
  cabinetPathLocked: boolean;
  agentScope?: OptaleAgentScope;
  permissions: OptaleMcpClientPermission[];
  allowedTools: string[];
  deniedTools: string[];
  budget?: OptaleMcpClientBudget;
  canUseActions: boolean;
  auditEnabled: boolean;
}

interface OptaleMcpRequestLike {
  headers: Headers;
  nextUrl?: {
    hostname?: string;
  };
}

function randomId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}_${id}`;
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function headerValue(headers: Headers, name: string): string | undefined {
  return trimString(headers.get(name));
}

function envBool(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function auditEnabled(): boolean {
  return process.env.OPTALE_MCP_AUDIT_LOG !== "false";
}

function headerBool(headers: Headers, name: string): boolean | undefined {
  const value = headers.get(name)?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return undefined;
}

function isLoopbackHost(hostname?: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function hasBearer(headers: Headers): boolean {
  return /^Bearer\s+.+$/i.test(headers.get("authorization") || "");
}

function bearerToken(headers: Headers): string | undefined {
  const match = (headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function hasAppCookie(headers: Headers): boolean {
  return /(?:^|;\s*)kb-auth=/.test(headers.get("cookie") || "");
}

function remoteAddress(headers: Headers): string | undefined {
  return (
    headerValue(headers, "x-forwarded-for")?.split(",")[0]?.trim() ||
    headerValue(headers, "x-real-ip")
  );
}

function resolveAuthType(
  headers: Headers,
  hostname?: string
): OptaleMcpGatewayAuthType {
  if (hasBearer(headers)) return "bearer";
  if (isLoopbackHost(hostname)) return "loopback";
  if (hasAppCookie(headers)) return "app-cookie";
  return "anonymous";
}

function resolveClientId(
  headers: Headers,
  authType: OptaleMcpGatewayAuthType
): string {
  return (
    headerValue(headers, "x-optale-mcp-client") ||
    headerValue(headers, "x-client-id") ||
    (authType === "bearer" ? "bearer-client" : `${authType}-client`)
  );
}

function remoteActionsAllowed(authType: OptaleMcpGatewayAuthType): boolean {
  if (authType === "internal" || authType === "loopback") return true;
  return envBool("OPTALE_MCP_ENABLE_REMOTE_ACTIONS", false);
}

function baseGatewayContext(
  request: OptaleMcpRequestLike,
  authType: OptaleMcpGatewayAuthType
): Omit<
  OptaleMcpGatewayContext,
  | "authorized"
  | "clientId"
  | "permissions"
  | "allowedTools"
  | "deniedTools"
  | "canUseActions"
  | "auditEnabled"
> {
  const hostname = request.nextUrl?.hostname;
  return {
    requestId: headerValue(request.headers, "x-request-id") || randomId("mcp"),
    authType,
    hostname,
    remoteAddress: remoteAddress(request.headers),
    userAgent: headerValue(request.headers, "user-agent"),
    origin: headerValue(request.headers, "origin"),
    cabinetPathLocked: false,
  };
}

function headerScopedContext(
  request: OptaleMcpRequestLike,
  authType: OptaleMcpGatewayAuthType
): OptaleMcpGatewayContext {
  const base = baseGatewayContext(request, authType);
  const defaultCabinetPath = normalizeCabinetPath(
    headerValue(request.headers, "x-optale-cabinet-path") ||
      process.env.OPTALE_MCP_DEFAULT_CABINET_PATH,
    false
  );
  const agentScope = normalizeOptaleScope(
    headerValue(request.headers, "x-optale-agent-scope") ||
      process.env.OPTALE_MCP_DEFAULT_AGENT_SCOPE
  );
  const headerLock = headerBool(request.headers, "x-optale-lock-cabinet");
  const cabinetPathLocked =
    Boolean(defaultCabinetPath) &&
    (headerLock ?? envBool("OPTALE_MCP_LOCK_CABINET_SCOPE", false));
  const permissions: OptaleMcpClientPermission[] = ["read", "write", "execute"];
  const actionsGloballyEnabled = envBool("OPTALE_MCP_ENABLE_ACTIONS", false);

  return {
    ...base,
    authorized: true,
    clientId: resolveClientId(request.headers, authType),
    defaultCabinetPath,
    cabinetPathLocked,
    agentScope,
    permissions,
    allowedTools: [],
    deniedTools: [],
    canUseActions: actionsGloballyEnabled && remoteActionsAllowed(authType),
    auditEnabled: auditEnabled(),
  };
}

export async function buildOptaleMcpGatewayContextFromRequest(
  request: OptaleMcpRequestLike
): Promise<OptaleMcpGatewayContext> {
  const hostname = request.nextUrl?.hostname;
  const authType = resolveAuthType(request.headers, hostname);
  const token = bearerToken(request.headers);

  if (token) {
    const base = baseGatewayContext(request, "bearer");
    const client = await resolveOptaleMcpBearerClient(token);
    if (!client) {
      return {
        ...base,
        authorized: false,
        authorizationError: "Invalid MCP bearer token.",
        clientId: "invalid-bearer-client",
        cabinetPathLocked: false,
        permissions: [],
        allowedTools: [],
        deniedTools: [],
        canUseActions: false,
        auditEnabled: auditEnabled(),
      };
    }

    const canUseActions =
      envBool("OPTALE_MCP_ENABLE_ACTIONS", false) &&
      client.remoteActionsEnabled &&
      (client.permissions.includes("write") || client.permissions.includes("execute"));
    return {
      ...base,
      authorized: true,
      clientId: client.id,
      clientName: client.name,
      defaultCabinetPath: client.cabinetPath,
      cabinetPathLocked: client.lockCabinet,
      agentScope: client.agentScope,
      permissions: client.permissions,
      allowedTools: client.allowedTools,
      deniedTools: client.deniedTools,
      budget: client.budget,
      canUseActions,
      auditEnabled: client.auditEnabled || Boolean(client.budget?.dailyToolCalls),
    };
  }

  if (isLoopbackHost(hostname) || hasAppCookie(request.headers)) {
    return headerScopedContext(request, authType);
  }

  return {
    ...baseGatewayContext(request, authType),
    authorized: false,
    authorizationError: "MCP requests require loopback access, an authenticated app session, or a valid bearer token.",
    clientId: "anonymous-client",
    permissions: [],
    allowedTools: [],
    deniedTools: [],
    canUseActions: false,
    auditEnabled: auditEnabled(),
  };
}

export function buildInternalOptaleMcpGatewayContext(input: {
  requestId?: string;
  clientId: string;
  clientName?: string;
  defaultCabinetPath?: string;
  cabinetPathLocked?: boolean;
  agentScope?: OptaleAgentScope;
  permissions?: OptaleMcpClientPermission[];
  allowedTools?: string[];
  deniedTools?: string[];
  budget?: OptaleMcpClientBudget;
  canUseActions?: boolean;
  auditEnabled?: boolean;
}): OptaleMcpGatewayContext {
  return {
    requestId: input.requestId || randomId("mcp_internal"),
    clientId: input.clientId,
    clientName: input.clientName,
    authorized: true,
    authType: "internal",
    defaultCabinetPath: normalizeCabinetPath(input.defaultCabinetPath, false),
    cabinetPathLocked: Boolean(input.cabinetPathLocked && input.defaultCabinetPath),
    agentScope: input.agentScope,
    permissions: input.permissions || ["read", "write", "execute"],
    allowedTools: input.allowedTools || [],
    deniedTools: input.deniedTools || [],
    budget: input.budget,
    canUseActions: input.canUseActions ?? envBool("OPTALE_MCP_ENABLE_ACTIONS", false),
    auditEnabled: input.auditEnabled ?? auditEnabled(),
  };
}
