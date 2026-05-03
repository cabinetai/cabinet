import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import {
  redactBrainCoreStatusForClient,
  type OptaleBrainAdapterBinding,
  type OptaleBrainPublicCoreStatus,
} from "@/lib/optale/brain-contracts";
import {
  normalizeBrainDownstreamError,
  parseBrainAdapterJson,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  trimBrainAdapterString,
  type OptaleBrainAdapterReadOptions,
  type OptaleBrainDownstreamCall,
} from "@/lib/optale/brain-adapters";
import {
  buildOptaleBrainDreamsSourceBinding,
  resolveOptaleBrainDreamsConfig,
} from "@/lib/optale/brain-dreams-config";

export type OptaleBrainDreamProposalAction =
  | "approve"
  | "reject-soft"
  | "reject-hard";

export interface OptaleBrainDreamStats {
  messages: number;
  sessions: number;
  observationsByLevel: Record<string, number>;
  queue: Record<string, Record<string, number>>;
  activeRejections: number;
  newExplicit24h: number;
}

export interface OptaleBrainDreamProposal {
  id: string;
  file: string;
  path: string;
  target?: string | null;
  summary: string;
  confidence: number | null;
  levels: string[];
  sourceIds: string[];
  created?: string;
  mtime?: number;
  body: string;
}

export interface OptaleBrainDreamRejection {
  id: string;
  rejectionType: string;
  content: string;
  rejectedAt?: string;
  expiresAt?: string | null;
}

export interface OptaleBrainDreamRuleSection {
  id: string;
  label: string;
  description?: string;
  source?: string;
  settings: Record<string, string>;
}

export interface OptaleBrainDreamsResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  query: string;
  limit: number;
  namespace: string;
  profile: string;
  dashboard: {
    stats: OptaleBrainDreamStats;
    proposals: OptaleBrainDreamProposal[];
    proposalTotal: number;
    proposalFilteredTotal: number;
    rejections: OptaleBrainDreamRejection[];
    rules: OptaleBrainDreamRuleSection[];
  };
  downstream: OptaleBrainDownstreamCall[];
  stats: {
    dreamsEnabled: boolean;
    apiConfigured: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    proposalsLoaded: number;
    rejectionsLoaded: number;
    rulesLoaded: number;
  };
}

export interface OptaleBrainDreamsReadOptions extends OptaleBrainAdapterReadOptions {
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string | null;
}

export interface OptaleBrainDreamMutationResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  ok: boolean;
  status: number;
  action: string;
  result: unknown;
  downstream: OptaleBrainDownstreamCall[];
  error?: string;
}

export interface OptaleBrainDreamActionOptions {
  cabinetPath?: string | null;
  proposalPath?: string | null;
  action?: string | null;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string | null;
}

export interface OptaleBrainDreamAskOptions {
  cabinetPath?: string | null;
  question?: string | null;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string | null;
}

type JsonObject = Record<string, unknown>;
type DreamDownstreamCall = OptaleBrainDownstreamCall & {
  data?: unknown;
};

const MAX_CLIENT_STRING = 6_000;
const MAX_CLIENT_ARRAY_ITEMS = 25;
const MAX_CLIENT_OBJECT_KEYS = 60;
const MAX_DOWNSTREAM_TEXT = 8_000;
const MAX_DREAM_PROPOSALS = 200;

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDreamProposalLimit(value: unknown, fallback = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_DREAM_PROPOSALS);
}

function numberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, entry]) => [key, numberValue(entry, NaN)] as const)
      .filter((entry): entry is readonly [string, number] => Number.isFinite(entry[1]))
  );
}

function nestedNumberRecord(value: unknown): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, entry]) => [key, numberRecord(entry)])
  );
}

function compactDreamValueForClient(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactBrainTextForClient(value).slice(0, MAX_CLIENT_STRING);
  }
  if (typeof value !== "object" || value === null) return value;
  if (depth > 6) return "[max-depth]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CLIENT_ARRAY_ITEMS)
      .map((entry) => compactDreamValueForClient(entry, depth + 1));
  }

  const record = asRecord(redactBrainValueForClient(value));
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_CLIENT_OBJECT_KEYS)
      .map(([key, entry]) => [key, compactDreamValueForClient(entry, depth + 1)])
  );
}

function renderDownstreamText(text: string, parsed: unknown): string {
  if (parsed !== undefined) {
    try {
      return JSON.stringify(compactDreamValueForClient(parsed)).slice(
        0,
        MAX_DOWNSTREAM_TEXT
      );
    } catch {
      return redactBrainTextForClient(text).slice(0, MAX_DOWNSTREAM_TEXT);
    }
  }
  return redactBrainTextForClient(text).slice(0, MAX_DOWNSTREAM_TEXT);
}

function sanitizeDreamDownstreamCall(
  call: DreamDownstreamCall
): OptaleBrainDownstreamCall {
  return {
    name: productBrainDownstreamName(call.name),
    ok: call.ok,
    status: call.status,
    text: call.text,
    json: call.json,
    error: call.error,
  };
}

function findDreamCall(
  calls: DreamDownstreamCall[],
  name: string
): DreamDownstreamCall | undefined {
  const productName = productBrainDownstreamName(name);
  return calls.find((call) => call.name === name || call.name === productName);
}

async function callDreamsJson(input: {
  baseUrl: string;
  path: string;
  name: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  actorId?: string;
}): Promise<DreamDownstreamCall> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(`${input.baseUrl}${input.path}`, {
      method: input.method || "GET",
      headers: {
        Accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...(input.actorId ? { "Remote-User": input.actorId } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    const parsed = parseBrainAdapterJson(text);
    const renderedText = renderDownstreamText(text, parsed);
    const compactJson =
      parsed === undefined ? undefined : compactDreamValueForClient(parsed);
    if (!response.ok) {
      return {
        name: input.name,
        ok: false,
        status: "error",
        text: renderedText || response.statusText,
        json: compactJson,
        data: parsed,
        error: normalizeBrainDownstreamError(
          `${response.status} ${renderedText || response.statusText}`
        ),
      };
    }
    return {
      name: input.name,
      ok: true,
      status: "ok",
      text: renderedText,
      json: compactJson,
      data: parsed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dreams request failed";
    return {
      name: input.name,
      ok: false,
      status: "error",
      text: message,
      error: normalizeBrainDownstreamError(message),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function emptyDreamStats(): OptaleBrainDreamStats {
  return {
    messages: 0,
    sessions: 0,
    observationsByLevel: {},
    queue: {},
    activeRejections: 0,
    newExplicit24h: 0,
  };
}

export function normalizeDreamStats(value: unknown): OptaleBrainDreamStats {
  const record = asRecord(value);
  return {
    messages: numberValue(record.messages),
    sessions: numberValue(record.sessions),
    observationsByLevel: numberRecord(record.observations_by_level),
    queue: nestedNumberRecord(record.queue),
    activeRejections: numberValue(record.active_rejections),
    newExplicit24h: numberValue(record.new_explicit_24h),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => redactBrainTextForClient(String(entry || "").trim()))
        .filter(Boolean)
    : [];
}

export function normalizeDreamProposals(value: unknown): OptaleBrainDreamProposal[] {
  const proposals = Array.isArray(asRecord(value).proposals)
    ? (asRecord(value).proposals as unknown[])
    : [];
  return proposals
    .map((entry, index) => {
      const record = asRecord(entry);
      const file =
        stringValue(record.file) ||
        stringValue(record.path)?.split("/").pop() ||
        `proposal-${index + 1}.md`;
      const proposalPath = stringValue(record.path) || `_proposals/${file}`;
      const confidence =
        record.confidence === null ? null : numberValue(record.confidence, NaN);
      return {
        id: proposalPath,
        file: redactBrainTextForClient(file),
        path: redactBrainTextForClient(proposalPath),
        target: stringValue(record.target) || null,
        summary: redactBrainTextForClient(stringValue(record.summary) || ""),
        confidence: Number.isFinite(confidence) ? confidence : null,
        levels: stringArray(record.levels),
        sourceIds: stringArray(record.source_ids),
        created: stringValue(record.created),
        mtime: Number.isFinite(Number(record.mtime)) ? Number(record.mtime) : undefined,
        body: redactBrainTextForClient(stringValue(record.body) || "").slice(0, 12_000),
      };
    })
    .filter((proposal) => proposal.path && proposal.summary);
}

export function normalizeDreamRejections(value: unknown): OptaleBrainDreamRejection[] {
  const rejections = Array.isArray(asRecord(value).rejections)
    ? (asRecord(value).rejections as unknown[])
    : [];
  return rejections.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record.id) || `rejection-${index + 1}`,
      rejectionType: stringValue(record.rejection_type) || "unknown",
      content: redactBrainTextForClient(stringValue(record.content) || ""),
      rejectedAt: stringValue(record.rejected_at),
      expiresAt: stringValue(record.expires_at) || null,
    };
  });
}

export function normalizeDreamRules(value: unknown): OptaleBrainDreamRuleSection[] {
  const rules = asRecord(asRecord(value).rules);
  return Object.entries(rules).map(([id, section]) => {
    const record = asRecord(section);
    const settings = Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => key !== "description" && key !== "_source")
        .map(([key, entry]) => [
          key,
          redactBrainTextForClient(String(entry ?? "")).slice(0, 500),
        ])
    );
    return {
      id,
      label: id.replace(/_/g, " "),
      description: stringValue(record.description),
      source: stringValue(record._source),
      settings,
    };
  });
}

function proposalMatchesQuery(
  proposal: OptaleBrainDreamProposal,
  query: string
): boolean {
  if (!query) return true;
  const haystack = [
    proposal.file,
    proposal.path,
    proposal.target || "",
    proposal.summary,
    proposal.body,
    proposal.levels.join(" "),
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function safeProposalPath(value: string): string | undefined {
  const path = value.trim();
  if (!/^_proposals\/[^/\\]+\.md$/.test(path)) return undefined;
  if (path.includes("..") || path.includes("\0")) return undefined;
  return path;
}

function normalizeDreamAction(value: string): OptaleBrainDreamProposalAction | undefined {
  if (value === "approve" || value === "reject-soft" || value === "reject-hard") {
    return value;
  }
  return undefined;
}

async function resolveDreamsSource(input: {
  cabinetPath?: string | null;
  apiBaseUrl?: string | null;
}) {
  const cabinetPath =
    normalizeCabinetPath(input.cabinetPath, true) || ROOT_CABINET_PATH;
  const coreStatus = await readOptaleBrainCoreStatus({ cabinetPath });
  const publicCore = redactBrainCoreStatusForClient(coreStatus);
  const context = coreStatus.request.brain;
  const source =
    publicCore.sources.find((entry) => entry.id === "dreams") ||
    buildOptaleBrainDreamsSourceBinding(context);
  const config = resolveOptaleBrainDreamsConfig(context, input.apiBaseUrl);
  return { cabinetPath, coreStatus, publicCore, context, source, config };
}

export async function readOptaleBrainDreams(
  options: OptaleBrainDreamsReadOptions = {}
): Promise<OptaleBrainDreamsResponse> {
  const query = trimBrainAdapterString(options.query);
  const limit = clampDreamProposalLimit(options.limit);
  const includeDownstream = options.includeDownstream !== false;
  const fetchImpl = options.fetchImpl || fetch;
  const { publicCore, context, source, config } = await resolveDreamsSource({
    cabinetPath: options.cabinetPath,
    apiBaseUrl: options.apiBaseUrl,
  });
  const dreamsEnabled = source.status === "healthy" && source.permissions.includes("read");
  const apiConfigured = config.enabled && Boolean(config.baseUrl);
  const downstreamCalls =
    includeDownstream && dreamsEnabled && apiConfigured
      ? await Promise.all([
          callDreamsJson({
            baseUrl: config.baseUrl,
            path: "/api/honcho/dashboard/stats",
            name: "dreams__stats",
            fetchImpl,
            timeoutMs: config.timeoutMs,
          }),
          callDreamsJson({
            baseUrl: config.baseUrl,
            path: "/api/honcho/proposals",
            name: "dreams__proposals",
            fetchImpl,
            timeoutMs: config.timeoutMs,
          }),
          callDreamsJson({
            baseUrl: config.baseUrl,
            path: "/api/honcho/dashboard/rejections",
            name: "dreams__rejections",
            fetchImpl,
            timeoutMs: config.timeoutMs,
          }),
          callDreamsJson({
            baseUrl: config.baseUrl,
            path: "/api/honcho/dashboard/rules",
            name: "dreams__rules",
            fetchImpl,
            timeoutMs: config.timeoutMs,
          }),
        ])
      : [];
  const statsCall = findDreamCall(downstreamCalls, "dreams__stats");
  const proposalsCall = findDreamCall(downstreamCalls, "dreams__proposals");
  const rejectionsCall = findDreamCall(downstreamCalls, "dreams__rejections");
  const rulesCall = findDreamCall(downstreamCalls, "dreams__rules");
  const downstream = downstreamCalls.map(sanitizeDreamDownstreamCall);
  const sourceError =
    statsCall && !statsCall.ok
      ? statsCall
      : proposalsCall && !proposalsCall.ok
        ? proposalsCall
        : undefined;
  const resolvedSource = sourceError
    ? {
        ...source,
        status: "error" as const,
        statusReason:
          sourceError.error?.message ||
          sourceError.text ||
          "Dreams dashboard request failed.",
      }
    : source;
  const proposals = proposalsCall?.ok
    ? normalizeDreamProposals(proposalsCall.data)
    : [];
  const filteredProposals = proposals.filter((proposal) =>
    proposalMatchesQuery(proposal, query)
  );
  const rejections = rejectionsCall?.ok
    ? normalizeDreamRejections(rejectionsCall.data)
    : [];
  const rules = rulesCall?.ok ? normalizeDreamRules(rulesCall.data) : [];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source: resolvedSource,
    query,
    limit,
    namespace: context.memoryNamespace,
    profile: config.profile,
    dashboard: {
      stats: statsCall?.ok ? normalizeDreamStats(statsCall.data) : emptyDreamStats(),
      proposals: filteredProposals.slice(0, limit),
      proposalTotal: proposals.length,
      proposalFilteredTotal: filteredProposals.length,
      rejections,
      rules,
    },
    downstream,
    stats: {
      dreamsEnabled,
      apiConfigured,
      downstreamCalls: downstream.length,
      downstreamErrors: downstream.filter((call) => !call.ok).length,
      proposalsLoaded: Math.min(filteredProposals.length, limit),
      rejectionsLoaded: rejections.length,
      rulesLoaded: rules.length,
    },
  };
}

export async function submitOptaleBrainDreamProposalAction(
  options: OptaleBrainDreamActionOptions
): Promise<OptaleBrainDreamMutationResponse> {
  const fetchImpl = options.fetchImpl || fetch;
  const { publicCore, source, config } = await resolveDreamsSource({
    cabinetPath: options.cabinetPath,
    apiBaseUrl: options.apiBaseUrl,
  });
  const action = normalizeDreamAction(trimBrainAdapterString(options.action));
  const proposalPath = safeProposalPath(trimBrainAdapterString(options.proposalPath));
  if (!action || !proposalPath) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      request: publicCore.request,
      source,
      ok: false,
      status: 400,
      action: action || "invalid",
      result: null,
      downstream: [],
      error: "A valid proposalPath and action are required.",
    };
  }
  if (source.status !== "healthy" || !config.enabled) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      request: publicCore.request,
      source,
      ok: false,
      status: 503,
      action,
      result: null,
      downstream: [],
      error: source.statusReason || "Dreams API is not configured.",
    };
  }

  const call = await callDreamsJson({
    baseUrl: config.baseUrl,
    path: "/api/honcho/proposals/action",
    name: "dreams__proposal_action",
    method: "POST",
    body: { proposalPath, action },
    actorId: config.actorId,
    fetchImpl,
    timeoutMs: config.timeoutMs,
  });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source,
    ok: call.ok,
    status: call.ok ? 200 : 502,
    action,
    result: call.json ?? call.text,
    downstream: [call],
    error: call.error?.message,
  };
}

export async function askOptaleBrainDreams(
  options: OptaleBrainDreamAskOptions
): Promise<OptaleBrainDreamMutationResponse> {
  const question = trimBrainAdapterString(options.question).slice(0, 2000);
  const fetchImpl = options.fetchImpl || fetch;
  const { publicCore, source, config } = await resolveDreamsSource({
    cabinetPath: options.cabinetPath,
    apiBaseUrl: options.apiBaseUrl,
  });
  if (!question) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      request: publicCore.request,
      source,
      ok: false,
      status: 400,
      action: "ask",
      result: null,
      downstream: [],
      error: "Question is required.",
    };
  }
  if (source.status !== "healthy" || !config.enabled) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      request: publicCore.request,
      source,
      ok: false,
      status: 503,
      action: "ask",
      result: null,
      downstream: [],
      error: source.statusReason || "Dreams API is not configured.",
    };
  }
  const call = await callDreamsJson({
    baseUrl: config.baseUrl,
    path: "/api/honcho/dashboard/ask",
    name: "dreams__ask",
    method: "POST",
    body: { question },
    actorId: config.actorId,
    fetchImpl,
    timeoutMs: config.timeoutMs,
  });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source,
    ok: call.ok,
    status: call.ok ? 200 : 502,
    action: "ask",
    result: call.json ?? call.text,
    downstream: [call],
    error: call.error?.message,
  };
}
