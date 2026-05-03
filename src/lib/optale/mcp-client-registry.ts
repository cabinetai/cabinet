import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "path";
import { normalizeCabinetPath } from "@/lib/cabinets/paths";
import type { OptaleAgentScope } from "@/lib/optale/product";
import { normalizeOptaleScope } from "@/lib/optale/scope-registry";
import {
  internalMcpClientToolNameForProduct,
  productMcpClientToolName,
} from "@/lib/optale/context-registry";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { ensureDirectory } from "@/lib/storage/fs-operations";

export type OptaleMcpClientPermission = "read" | "write" | "execute";

export interface OptaleMcpClientBudget {
  dailyToolCalls?: number;
}

export interface ResolvedOptaleMcpClient {
  id: string;
  name?: string;
  cabinetPath?: string;
  lockCabinet: boolean;
  agentScope?: OptaleAgentScope;
  permissions: OptaleMcpClientPermission[];
  allowedTools: string[];
  deniedTools: string[];
  budget?: OptaleMcpClientBudget;
  auditEnabled: boolean;
  remoteActionsEnabled: boolean;
  source: "registry" | "legacy-env";
}

export interface OptaleMcpClientWriteInput {
  id?: unknown;
  name?: unknown;
  cabinetPath?: unknown;
  defaultCabinetPath?: unknown;
  lockCabinet?: unknown;
  cabinetPathLocked?: unknown;
  agentScope?: unknown;
  scope?: unknown;
  permissions?: unknown;
  allowedTools?: unknown;
  deniedTools?: unknown;
  dailyToolCalls?: unknown;
  dailyToolCallBudget?: unknown;
  budget?: unknown;
  auditEnabled?: unknown;
  remoteActionsEnabled?: unknown;
  enabled?: unknown;
}

export interface SanitizedOptaleMcpClient {
  id: string;
  name?: string;
  enabled: boolean;
  cabinetPath?: string;
  lockCabinet: boolean;
  agentScope?: OptaleAgentScope;
  permissions: OptaleMcpClientPermission[];
  allowedTools: string[];
  deniedTools: string[];
  budget?: OptaleMcpClientBudget;
  auditEnabled: boolean;
  remoteActionsEnabled: boolean;
  source: "registry" | "legacy-env";
  tokenConfigured: boolean;
  tokenHashPrefix?: string;
  createdAt?: string;
  updatedAt?: string;
  lastRotatedAt?: string;
  disabledAt?: string;
}

export type PublicSanitizedOptaleMcpClient = Omit<
  SanitizedOptaleMcpClient,
  "allowedTools" | "deniedTools" | "tokenHashPrefix"
> & {
  allowedTools: string[];
  deniedTools: string[];
};

interface RawClientEntry {
  id?: unknown;
  clientId?: unknown;
  name?: unknown;
  enabled?: unknown;
  status?: unknown;
  token?: unknown;
  tokenSha256?: unknown;
  tokenHash?: unknown;
  cabinetPath?: unknown;
  defaultCabinetPath?: unknown;
  lockCabinet?: unknown;
  cabinetPathLocked?: unknown;
  agentScope?: unknown;
  scope?: unknown;
  permissions?: unknown;
  allowedTools?: unknown;
  deniedTools?: unknown;
  budget?: unknown;
  dailyToolCalls?: unknown;
  dailyToolCallBudget?: unknown;
  auditEnabled?: unknown;
  audit?: unknown;
  remoteActionsEnabled?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastRotatedAt?: unknown;
  disabledAt?: unknown;
}

const VALID_PERMISSIONS = new Set<OptaleMcpClientPermission>([
  "read",
  "write",
  "execute",
]);

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && entry.trim() !== "",
        )
        .map((entry) => entry.trim()),
    ),
  );
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== "",
    )
    .map((entry) => entry.trim());
}

function toolNameArrayForWrite(value: unknown, existing?: unknown): string[] {
  const existingTools = stringArray(existing);
  const existingByPublicName = new Map<string, string[]>();
  for (const toolName of existingTools) {
    const publicToolName = productMcpClientToolName(toolName);
    existingByPublicName.set(publicToolName, [
      ...(existingByPublicName.get(publicToolName) || []),
      toolName,
    ]);
  }
  return Array.from(
    new Set(
      stringList(value).map((toolName) => {
        if (toolName === "sense_downstream_call") {
          return existingByPublicName.get(toolName)?.shift() || toolName;
        }
        return internalMcpClientToolNameForProduct(toolName);
      }),
    ),
  );
}

function permissionArray(value: unknown): OptaleMcpClientPermission[] {
  const permissions = stringArray(value).filter(
    (entry): entry is OptaleMcpClientPermission =>
      VALID_PERMISSIONS.has(entry as OptaleMcpClientPermission),
  );
  return permissions.length > 0 ? permissions : ["read"];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes")
    return true;
  if (normalized === "false" || normalized === "0" || normalized === "no")
    return false;
  return fallback;
}

function positiveInteger(value: unknown): number | undefined {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined;
  return Math.floor(numberValue);
}

function normalizeBudget(
  raw: RawClientEntry,
): OptaleMcpClientBudget | undefined {
  const budget =
    raw.budget && typeof raw.budget === "object" && !Array.isArray(raw.budget)
      ? (raw.budget as Record<string, unknown>)
      : {};
  const dailyToolCalls =
    positiveInteger(raw.dailyToolCalls) ||
    positiveInteger(raw.dailyToolCallBudget) ||
    positiveInteger(budget.dailyToolCalls) ||
    positiveInteger(budget.dailyToolCallBudget);
  return dailyToolCalls ? { dailyToolCalls } : undefined;
}

export function getOptaleMcpClientRegistryPath(): string {
  return (
    process.env.OPTALE_MCP_CLIENTS_PATH?.trim() ||
    path.join(CABINET_INTERNAL_DIR, "optale-mcp", "clients.json")
  );
}

function parseClientList(raw: unknown): RawClientEntry[] {
  if (Array.isArray(raw)) return raw as RawClientEntry[];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.clients))
      return record.clients as RawClientEntry[];
  }
  return [];
}

function parseEnvClients(): RawClientEntry[] {
  const raw = process.env.OPTALE_MCP_CLIENTS_JSON?.trim();
  if (!raw) return [];
  try {
    return parseClientList(JSON.parse(raw));
  } catch (error) {
    console.warn(
      "[optale-mcp] invalid OPTALE_MCP_CLIENTS_JSON",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

async function parseFileClients(): Promise<RawClientEntry[]> {
  try {
    const raw = await fs.readFile(getOptaleMcpClientRegistryPath(), "utf8");
    return parseClientList(JSON.parse(raw));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code !== "ENOENT") {
      console.warn(
        "[optale-mcp] invalid MCP client registry",
        error instanceof Error ? error.message : error,
      );
    }
    return [];
  }
}

async function readFileClientDocument(): Promise<{
  clients: RawClientEntry[];
}> {
  try {
    const raw = await fs.readFile(getOptaleMcpClientRegistryPath(), "utf8");
    const parsed = JSON.parse(raw);
    return { clients: parseClientList(parsed) };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === "ENOENT") return { clients: [] };
    throw error;
  }
}

async function writeFileClientDocument(
  clients: RawClientEntry[],
): Promise<void> {
  const filePath = getOptaleMcpClientRegistryPath();
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(
    filePath,
    `${JSON.stringify({ version: 1, clients }, null, 2)}\n`,
    "utf8",
  );
}

function normalizeClient(
  raw: RawClientEntry,
  source: "registry" | "legacy-env",
): ResolvedOptaleMcpClient | null {
  const id = trimString(raw.id) || trimString(raw.clientId);
  if (!id) return null;
  if (
    raw.enabled === false ||
    trimString(raw.status)?.toLowerCase() === "disabled"
  ) {
    return null;
  }
  const cabinetPath = normalizeCabinetPath(
    trimString(raw.cabinetPath) || trimString(raw.defaultCabinetPath),
    false,
  );
  const agentScope =
    normalizeOptaleScope(raw.agentScope) || normalizeOptaleScope(raw.scope);
  const permissions = permissionArray(raw.permissions);

  return {
    id,
    name: trimString(raw.name),
    cabinetPath,
    lockCabinet:
      Boolean(cabinetPath) &&
      booleanValue(
        raw.lockCabinet ?? raw.cabinetPathLocked,
        Boolean(cabinetPath),
      ),
    agentScope,
    permissions,
    allowedTools: toolNameArrayForWrite(raw.allowedTools),
    deniedTools: toolNameArrayForWrite(raw.deniedTools),
    budget: normalizeBudget(raw),
    auditEnabled: booleanValue(raw.auditEnabled ?? raw.audit, true),
    remoteActionsEnabled: booleanValue(raw.remoteActionsEnabled, false),
    source,
  };
}

function normalizeClientId(value: unknown): string {
  const id = trimString(value);
  if (!id) throw new Error("id is required");
  if (!/^[a-zA-Z0-9._:-]{2,80}$/.test(id)) {
    throw new Error(
      "id must be 2-80 characters using letters, numbers, dot, underscore, colon, or dash",
    );
  }
  return id;
}

function isoNow(): string {
  return new Date().toISOString();
}

function secretToken(): string {
  return `oa_mcp_${crypto.randomBytes(32).toString("base64url")}`;
}

function compactWritableClient(
  input: OptaleMcpClientWriteInput,
  existing?: RawClientEntry,
): RawClientEntry {
  const id = normalizeClientId(input.id ?? existing?.id ?? existing?.clientId);
  const now = isoNow();
  const cabinetPath = normalizeCabinetPath(
    trimString(input.cabinetPath) ||
      trimString(input.defaultCabinetPath) ||
      trimString(existing?.cabinetPath) ||
      trimString(existing?.defaultCabinetPath),
    false,
  );
  const dailyToolCalls =
    input.dailyToolCalls !== undefined ||
    input.dailyToolCallBudget !== undefined ||
    input.budget !== undefined
      ? positiveInteger(input.dailyToolCalls) ||
        positiveInteger(input.dailyToolCallBudget) ||
        normalizeBudget(input as RawClientEntry)?.dailyToolCalls
      : normalizeBudget(existing || {})?.dailyToolCalls;
  const budget = dailyToolCalls ? { dailyToolCalls } : undefined;
  const enabled =
    typeof input.enabled === "boolean"
      ? input.enabled
      : existing?.enabled === false ||
          trimString(existing?.status)?.toLowerCase() === "disabled"
        ? false
        : true;

  return Object.fromEntries(
    Object.entries({
      id,
      name: trimString(input.name) || trimString(existing?.name),
      enabled,
      tokenSha256:
        trimString(existing?.tokenSha256) || trimString(existing?.tokenHash),
      cabinetPath,
      lockCabinet:
        Boolean(cabinetPath) &&
        booleanValue(
          input.lockCabinet ??
            input.cabinetPathLocked ??
            existing?.lockCabinet ??
            existing?.cabinetPathLocked,
          Boolean(cabinetPath),
        ),
      agentScope:
        normalizeOptaleScope(input.agentScope) ||
        normalizeOptaleScope(input.scope) ||
        normalizeOptaleScope(existing?.agentScope) ||
        normalizeOptaleScope(existing?.scope),
      permissions:
        input.permissions !== undefined
          ? permissionArray(input.permissions)
          : permissionArray(existing?.permissions),
      allowedTools:
        input.allowedTools !== undefined
          ? toolNameArrayForWrite(input.allowedTools, existing?.allowedTools)
          : toolNameArrayForWrite(existing?.allowedTools),
      deniedTools:
        input.deniedTools !== undefined
          ? toolNameArrayForWrite(input.deniedTools, existing?.deniedTools)
          : toolNameArrayForWrite(existing?.deniedTools),
      budget,
      auditEnabled: booleanValue(
        input.auditEnabled ?? existing?.auditEnabled ?? existing?.audit,
        true,
      ),
      remoteActionsEnabled: booleanValue(
        input.remoteActionsEnabled ?? existing?.remoteActionsEnabled,
        false,
      ),
      createdAt: trimString(existing?.createdAt) || now,
      updatedAt: now,
      lastRotatedAt: trimString(existing?.lastRotatedAt),
      disabledAt: enabled ? undefined : trimString(existing?.disabledAt) || now,
    }).filter(([, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== "",
    ),
  ) as RawClientEntry;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function hashOptaleMcpBearerToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenHashPrefix(raw: RawClientEntry): string | undefined {
  const hash = trimString(raw.tokenSha256) || trimString(raw.tokenHash);
  return hash ? hash.slice(0, 12) : undefined;
}

function sanitizeClient(
  raw: RawClientEntry,
  source: "registry" | "legacy-env",
): SanitizedOptaleMcpClient | null {
  const normalized = normalizeClient(raw, source);
  const id = trimString(raw.id) || trimString(raw.clientId);
  if (!id) return null;
  const enabled = !(
    raw.enabled === false ||
    trimString(raw.status)?.toLowerCase() === "disabled"
  );
  const resolved =
    normalized ||
    normalizeClient(
      {
        ...raw,
        enabled: true,
        status: undefined,
      },
      source,
    );
  if (!resolved) return null;

  return {
    id,
    name: trimString(raw.name),
    enabled,
    cabinetPath: resolved.cabinetPath,
    lockCabinet: resolved.lockCabinet,
    agentScope: resolved.agentScope,
    permissions: resolved.permissions,
    allowedTools: resolved.allowedTools,
    deniedTools: resolved.deniedTools,
    budget: resolved.budget,
    auditEnabled: resolved.auditEnabled,
    remoteActionsEnabled: resolved.remoteActionsEnabled,
    source,
    tokenConfigured: Boolean(
      trimString(raw.tokenSha256) ||
      trimString(raw.tokenHash) ||
      trimString(raw.token),
    ),
    tokenHashPrefix: tokenHashPrefix(raw),
    createdAt: trimString(raw.createdAt),
    updatedAt: trimString(raw.updatedAt),
    lastRotatedAt: trimString(raw.lastRotatedAt),
    disabledAt: trimString(raw.disabledAt),
  };
}

function rawClientMatchesToken(raw: RawClientEntry, token: string): boolean {
  const hash = hashOptaleMcpBearerToken(token);
  const expectedHash = trimString(raw.tokenSha256) || trimString(raw.tokenHash);
  if (expectedHash && timingSafeEqual(expectedHash, hash)) return true;
  const plainToken = trimString(raw.token);
  return Boolean(plainToken && timingSafeEqual(plainToken, token));
}

function legacyEnvClient(token: string): ResolvedOptaleMcpClient | null {
  const expected = process.env.OPTALE_MCP_TOKEN?.trim();
  if (!expected || !timingSafeEqual(expected, token)) return null;
  return normalizeClient(
    {
      id: process.env.OPTALE_MCP_CLIENT_ID || "legacy-bearer",
      name: "Legacy MCP bearer",
      cabinetPath: process.env.OPTALE_MCP_DEFAULT_CABINET_PATH,
      lockCabinet: process.env.OPTALE_MCP_LOCK_CABINET_SCOPE,
      agentScope: process.env.OPTALE_MCP_DEFAULT_AGENT_SCOPE,
      permissions: process.env.OPTALE_MCP_TOKEN_PERMISSIONS
        ? process.env.OPTALE_MCP_TOKEN_PERMISSIONS.split(",")
        : ["read"],
      auditEnabled: process.env.OPTALE_MCP_AUDIT_LOG !== "false",
      remoteActionsEnabled:
        process.env.OPTALE_MCP_ENABLE_REMOTE_ACTIONS === "true",
      dailyToolCalls: process.env.OPTALE_MCP_DAILY_TOOL_CALL_BUDGET,
    },
    "legacy-env",
  );
}

export async function readOptaleMcpClientRegistry(): Promise<
  ResolvedOptaleMcpClient[]
> {
  const clients = [...parseEnvClients(), ...(await parseFileClients())];
  return clients
    .map((client) => normalizeClient(client, "registry"))
    .filter((client): client is ResolvedOptaleMcpClient => client !== null);
}

export async function listSanitizedOptaleMcpClients(): Promise<
  SanitizedOptaleMcpClient[]
> {
  const envClients = parseEnvClients()
    .map((client) => sanitizeClient(client, "registry"))
    .filter((client): client is SanitizedOptaleMcpClient => client !== null)
    .map((client) => ({ ...client, source: "registry" as const }));
  const fileClients = (await parseFileClients())
    .map((client) => sanitizeClient(client, "registry"))
    .filter((client): client is SanitizedOptaleMcpClient => client !== null);
  const legacy = process.env.OPTALE_MCP_TOKEN?.trim()
    ? sanitizeClient(
        {
          id: process.env.OPTALE_MCP_CLIENT_ID || "legacy-bearer",
          name: "Legacy MCP bearer",
          cabinetPath: process.env.OPTALE_MCP_DEFAULT_CABINET_PATH,
          lockCabinet: process.env.OPTALE_MCP_LOCK_CABINET_SCOPE,
          agentScope: process.env.OPTALE_MCP_DEFAULT_AGENT_SCOPE,
          permissions: process.env.OPTALE_MCP_TOKEN_PERMISSIONS
            ? process.env.OPTALE_MCP_TOKEN_PERMISSIONS.split(",")
            : ["read"],
          auditEnabled: process.env.OPTALE_MCP_AUDIT_LOG !== "false",
          remoteActionsEnabled:
            process.env.OPTALE_MCP_ENABLE_REMOTE_ACTIONS === "true",
          dailyToolCalls: process.env.OPTALE_MCP_DAILY_TOOL_CALL_BUDGET,
          tokenSha256: hashOptaleMcpBearerToken(process.env.OPTALE_MCP_TOKEN),
        },
        "legacy-env",
      )
    : null;

  return [...envClients, ...fileClients, ...(legacy ? [legacy] : [])];
}

export function redactOptaleMcpClientForClient(
  client: SanitizedOptaleMcpClient,
): PublicSanitizedOptaleMcpClient {
  const { tokenHashPrefix: _tokenHashPrefix, ...rest } = client;
  void _tokenHashPrefix;
  return {
    ...rest,
    allowedTools: client.allowedTools.map(productMcpClientToolName),
    deniedTools: client.deniedTools.map(productMcpClientToolName),
  };
}

export async function listPublicOptaleMcpClients(): Promise<
  PublicSanitizedOptaleMcpClient[]
> {
  return (await listSanitizedOptaleMcpClients()).map(
    redactOptaleMcpClientForClient,
  );
}

function findClientIndex(clients: RawClientEntry[], id: string): number {
  return clients.findIndex(
    (client) => (trimString(client.id) || trimString(client.clientId)) === id,
  );
}

async function assertClientIdAvailable(id: string): Promise<void> {
  const existing = await listSanitizedOptaleMcpClients();
  if (existing.some((client) => client.id === id)) {
    throw new Error(`MCP client already exists: ${id}`);
  }
}

export async function createOptaleMcpClient(
  input: OptaleMcpClientWriteInput,
): Promise<{
  client: SanitizedOptaleMcpClient;
  token: string;
}> {
  const id = normalizeClientId(input.id);
  await assertClientIdAvailable(id);
  const token = secretToken();
  const document = await readFileClientDocument();
  const client = {
    ...compactWritableClient({ ...input, id }),
    tokenSha256: hashOptaleMcpBearerToken(token),
    lastRotatedAt: isoNow(),
  };
  document.clients.push(client);
  await writeFileClientDocument(document.clients);
  const sanitized = sanitizeClient(client, "registry");
  if (!sanitized) throw new Error("Failed to create MCP client");
  return { client: sanitized, token };
}

export async function updateOptaleMcpClient(
  input: OptaleMcpClientWriteInput & { id: unknown },
): Promise<{
  client: SanitizedOptaleMcpClient;
}> {
  const id = normalizeClientId(input.id);
  const document = await readFileClientDocument();
  const index = findClientIndex(document.clients, id);
  if (index < 0) throw new Error(`File-backed MCP client not found: ${id}`);
  const next = compactWritableClient(input, document.clients[index]);
  document.clients[index] = {
    ...next,
    tokenSha256:
      trimString(document.clients[index].tokenSha256) ||
      trimString(document.clients[index].tokenHash),
  };
  await writeFileClientDocument(document.clients);
  const sanitized = sanitizeClient(document.clients[index], "registry");
  if (!sanitized) throw new Error("Failed to update MCP client");
  return { client: sanitized };
}

export async function rotateOptaleMcpClientToken(idValue: unknown): Promise<{
  client: SanitizedOptaleMcpClient;
  token: string;
}> {
  const id = normalizeClientId(idValue);
  const document = await readFileClientDocument();
  const index = findClientIndex(document.clients, id);
  if (index < 0) throw new Error(`File-backed MCP client not found: ${id}`);
  const token = secretToken();
  const now = isoNow();
  document.clients[index] = {
    ...document.clients[index],
    token: undefined,
    tokenHash: undefined,
    tokenSha256: hashOptaleMcpBearerToken(token),
    updatedAt: now,
    lastRotatedAt: now,
  };
  await writeFileClientDocument(document.clients);
  const sanitized = sanitizeClient(document.clients[index], "registry");
  if (!sanitized) throw new Error("Failed to rotate MCP client token");
  return { client: sanitized, token };
}

export async function resolveOptaleMcpBearerClient(
  token: string,
): Promise<ResolvedOptaleMcpClient | null> {
  for (const raw of [...parseEnvClients(), ...(await parseFileClients())]) {
    if (!rawClientMatchesToken(raw, token)) continue;
    return normalizeClient(raw, "registry");
  }
  return legacyEnvClient(token);
}
