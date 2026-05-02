import fs from "node:fs/promises";
import path from "path";
import { ensureDirectory } from "@/lib/storage/fs-operations";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";

export type OptaleMcpAuditOutcome = "ok" | "error" | "denied" | "notification";

export interface OptaleMcpAuditEvent {
  timestamp?: string;
  requestId?: string;
  clientId?: string;
  authType?: string;
  method: string;
  toolName?: string;
  cabinetPath?: string;
  agentScope?: string;
  outcome: OptaleMcpAuditOutcome;
  durationMs?: number;
  argumentKeys?: string[];
  error?: string;
}

export interface OptaleMcpAuditClientSummary {
  clientId: string;
  events: number;
  toolCalls: number;
  errors: number;
  denied: number;
  notifications: number;
  lastSeenAt?: string;
}

export interface OptaleMcpAuditSummary {
  date: string;
  enabled: boolean;
  totalEvents: number;
  toolCalls: number;
  outcomes: Record<OptaleMcpAuditOutcome, number>;
  clients: OptaleMcpAuditClientSummary[];
  recentEvents: OptaleMcpAuditEvent[];
}

function compactEvent(event: OptaleMcpAuditEvent): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      timestamp: event.timestamp || new Date().toISOString(),
      requestId: event.requestId,
      clientId: event.clientId,
      authType: event.authType,
      method: event.method,
      toolName: event.toolName,
      cabinetPath: event.cabinetPath,
      agentScope: event.agentScope,
      outcome: event.outcome,
      durationMs:
        typeof event.durationMs === "number"
          ? Math.max(0, Math.round(event.durationMs))
          : undefined,
      argumentKeys:
        event.argumentKeys && event.argumentKeys.length > 0
          ? event.argumentKeys.slice(0, 50)
          : undefined,
      error: event.error ? event.error.slice(0, 500) : undefined,
    }).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""
    )
  );
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function outcomeCounts(): Record<OptaleMcpAuditOutcome, number> {
  return {
    ok: 0,
    error: 0,
    denied: 0,
    notification: 0,
  };
}

function auditOutcome(value: unknown): OptaleMcpAuditOutcome | null {
  return value === "ok" ||
    value === "error" ||
    value === "denied" ||
    value === "notification"
    ? value
    : null;
}

function compactParsedEvent(value: unknown): OptaleMcpAuditEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const method = trimString(record.method);
  const outcome = auditOutcome(record.outcome);
  if (!method || !outcome) return null;

  const durationMs =
    typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
      ? Math.max(0, Math.round(record.durationMs))
      : undefined;
  const argumentKeys = Array.isArray(record.argumentKeys)
    ? record.argumentKeys
        .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
        .map((entry) => entry.trim())
        .slice(0, 50)
    : undefined;

  const event: OptaleMcpAuditEvent = { method, outcome };
  const timestamp = trimString(record.timestamp);
  const requestId = trimString(record.requestId);
  const clientId = trimString(record.clientId);
  const authType = trimString(record.authType);
  const toolName = trimString(record.toolName);
  const cabinetPath = trimString(record.cabinetPath);
  const agentScope = trimString(record.agentScope);
  const error = trimString(record.error);

  if (timestamp) event.timestamp = timestamp;
  if (requestId) event.requestId = requestId;
  if (clientId) event.clientId = clientId;
  if (authType) event.authType = authType;
  if (toolName) event.toolName = toolName;
  if (cabinetPath) event.cabinetPath = cabinetPath;
  if (agentScope) event.agentScope = agentScope;
  if (durationMs !== undefined) event.durationMs = durationMs;
  if (argumentKeys && argumentKeys.length > 0) event.argumentKeys = argumentKeys;
  if (error) event.error = error.slice(0, 500);
  return event;
}

function emptyAuditSummary(date: Date): OptaleMcpAuditSummary {
  return {
    date: dateKey(date),
    enabled: isOptaleMcpAuditEnabled(),
    totalEvents: 0,
    toolCalls: 0,
    outcomes: outcomeCounts(),
    clients: [],
    recentEvents: [],
  };
}

export function isOptaleMcpAuditEnabled(): boolean {
  return process.env.OPTALE_MCP_AUDIT_LOG !== "false";
}

export function getOptaleMcpAuditLogPath(date = new Date()): string {
  return path.join(
    CABINET_INTERNAL_DIR,
    "optale-mcp",
    "audit",
    `${dateKey(date)}.jsonl`
  );
}

export async function appendOptaleMcpAuditEvent(
  event: OptaleMcpAuditEvent
): Promise<void> {
  if (!isOptaleMcpAuditEnabled()) return;

  try {
    const logPath = getOptaleMcpAuditLogPath();
    await ensureDirectory(path.dirname(logPath));
    await fs.appendFile(logPath, `${JSON.stringify(compactEvent(event))}\n`, "utf8");
  } catch (error) {
    console.warn(
      "[optale-mcp] failed to write audit event",
      error instanceof Error ? error.message : error
    );
  }
}

export async function readOptaleMcpAuditSummary(input: {
  date?: Date;
  limit?: number;
  clientIds?: string[];
} = {}): Promise<OptaleMcpAuditSummary> {
  const date = input.date || new Date();
  const limit = Math.max(1, Math.min(input.limit || 25, 100));
  const clientIds = input.clientIds?.length ? new Set(input.clientIds) : null;

  try {
    const raw = await fs.readFile(getOptaleMcpAuditLogPath(date), "utf8");
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return compactParsedEvent(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((event): event is OptaleMcpAuditEvent => {
        if (!event) return false;
        return !clientIds || (event.clientId ? clientIds.has(event.clientId) : false);
      });
    const clients = new Map<string, OptaleMcpAuditClientSummary>();
    const summary: OptaleMcpAuditSummary = {
      date: dateKey(date),
      enabled: isOptaleMcpAuditEnabled(),
      totalEvents: events.length,
      toolCalls: 0,
      outcomes: outcomeCounts(),
      clients: [],
      recentEvents: events.slice(-limit).reverse(),
    };

    for (const event of events) {
      summary.outcomes[event.outcome] += 1;
      if (event.method === "tools/call") summary.toolCalls += 1;
      const clientId = event.clientId || "unknown";
      const client = clients.get(clientId) || {
        clientId,
        events: 0,
        toolCalls: 0,
        errors: 0,
        denied: 0,
        notifications: 0,
      };
      client.events += 1;
      if (event.method === "tools/call") client.toolCalls += 1;
      if (event.outcome === "error") client.errors += 1;
      if (event.outcome === "denied") client.denied += 1;
      if (event.outcome === "notification") client.notifications += 1;
      if (event.timestamp && (!client.lastSeenAt || event.timestamp > client.lastSeenAt)) {
        client.lastSeenAt = event.timestamp;
      }
      clients.set(clientId, client);
    }

    summary.clients = Array.from(clients.values()).sort((left, right) => {
      const lastSeen = (right.lastSeenAt || "").localeCompare(left.lastSeenAt || "");
      return lastSeen || right.events - left.events || left.clientId.localeCompare(right.clientId);
    });
    return summary;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === "ENOENT") return emptyAuditSummary(date);
    throw error;
  }
}

export async function countOptaleMcpToolCallsToday(input: {
  clientId: string;
  date?: Date;
}): Promise<number> {
  try {
    const raw = await fs.readFile(getOptaleMcpAuditLogPath(input.date), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .reduce((count, line) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          return parsed.clientId === input.clientId && parsed.method === "tools/call"
            ? count + 1
            : count;
        } catch {
          return count;
        }
      }, 0);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === "ENOENT") return 0;
    throw error;
  }
}
