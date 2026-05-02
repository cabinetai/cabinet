import { buildInternalOptaleMcpGatewayContext } from "@/lib/optale/mcp-gateway";
import {
  callOptaleMcpTool,
  type OptaleMcpToolCallResult,
} from "@/lib/optale/mcp-server";
import type { OptaleBrainAdapterBinding } from "@/lib/optale/brain-contracts";

export type OptaleBrainAdapterId =
  | "vault"
  | "memory"
  | "graph"
  | "entities"
  | "dreams"
  | "promotions"
  | "company-brain";

export type OptaleBrainDownstreamStatus = "ok" | "error";

export interface OptaleBrainDownstreamError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface OptaleBrainDownstreamCall {
  name: string;
  ok: boolean;
  status: OptaleBrainDownstreamStatus;
  text: string;
  json?: unknown;
  error?: OptaleBrainDownstreamError;
}

export interface OptaleBrainAdapterReadOptions {
  cabinetPath?: string | null;
  query?: string | null;
  limit?: number;
  includeDownstream?: boolean;
}

export interface OptaleBrainAdapterMcpCallInput {
  adapterId: OptaleBrainAdapterId;
  adapterName: string;
  toolName: string;
  args: Record<string, unknown>;
  cabinetPath: string;
}

export function trimBrainAdapterString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function clampBrainAdapterLimit(value: unknown, fallback = 12): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactBrainTextForClient(text: string): string {
  const home = process.env.HOME ? escapeRegExp(process.env.HOME) : undefined;
  const withHomeRedacted = home
    ? text.replace(new RegExp(`${home}[^\\s"'\\])}]*`, "g"), "[server-path]")
    : text;
  return withHomeRedacted.replace(
    /\/(?:home|mnt|tmp|var|srv|opt)\/[^\s"')\]}]*/g,
    "[server-path]"
  );
}

export function redactBrainValueForClient(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactBrainTextForClient(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 8) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.map((entry) => redactBrainValueForClient(entry, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactBrainValueForClient(entry, depth + 1),
    ])
  );
}

export function parseBrainAdapterJson(text: string): unknown | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function textFromBrainMcpToolResult(result: OptaleMcpToolCallResult): string {
  return result.content.map((entry) => entry.text).join("\n").trim();
}

export function normalizeBrainDownstreamError(
  text: string
): OptaleBrainDownstreamError {
  const normalized = text.trim() || "Downstream request failed.";
  if (/aborted|aborterror|timeout|timed out/i.test(normalized)) {
    return {
      code: "DownstreamRequestAborted",
      message: "Downstream request was aborted before it completed.",
      retryable: true,
    };
  }
  if (/unauthori[sz]ed|forbidden|401|403/i.test(normalized)) {
    return {
      code: "DownstreamUnauthorized",
      message: "Downstream source rejected the request.",
      retryable: false,
    };
  }
  return {
    code: "DownstreamError",
    message: normalized,
    retryable: false,
  };
}

export function isBrainAdapterReadEnabled(
  source: Pick<OptaleBrainAdapterBinding, "status" | "permissions">
): boolean {
  return source.status === "healthy" && source.permissions.includes("read");
}

export async function callBrainAdapterMcpTool(
  input: OptaleBrainAdapterMcpCallInput
): Promise<OptaleBrainDownstreamCall> {
  const gatewayContext = buildInternalOptaleMcpGatewayContext({
    clientId: `optale-observatory-brain-${input.adapterId}`,
    clientName: input.adapterName,
    defaultCabinetPath: input.cabinetPath,
    permissions: ["read"],
    canUseActions: false,
  });
  const result = await callOptaleMcpTool(input.toolName, input.args, {
    gatewayContext,
    includeDownstream: true,
    includeActions: false,
  });
  const text = redactBrainTextForClient(textFromBrainMcpToolResult(result));
  const error = result.isError ? normalizeBrainDownstreamError(text) : undefined;

  return {
    name: input.toolName,
    ok: result.isError !== true,
    status: result.isError ? "error" : "ok",
    text,
    json: parseBrainAdapterJson(text),
    error,
  };
}
