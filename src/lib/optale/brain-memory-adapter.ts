import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import {
  redactBrainCoreStatusForClient,
  type OptaleBrainAdapterBinding,
  type OptaleBrainPublicCoreStatus,
} from "@/lib/optale/brain-contracts";
import {
  buildOptaleBrainMemorySourceBinding,
  resolveOptaleBrainMemoryAuthHeader,
  resolveOptaleBrainMemoryConfig,
  type OptaleBrainMemoryConfig,
} from "@/lib/optale/brain-memory-config";
import {
  clampBrainAdapterLimit,
  normalizeBrainDownstreamError,
  parseBrainAdapterJson,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  trimBrainAdapterString,
  type OptaleBrainAdapterReadOptions,
  type OptaleBrainDownstreamCall,
} from "@/lib/optale/brain-adapters";
import type { OptaleBrainContext } from "@/lib/optale/brain-context";

export interface OptaleBrainMemoryPeer {
  id: string;
  created_at?: string;
  metadata: Record<string, unknown>;
}

export interface OptaleBrainMemorySession {
  id: string;
  is_active: boolean;
  created_at?: string;
  metadata: Record<string, unknown>;
}

export interface OptaleBrainMemoryConclusion {
  id: string;
  content: string;
  observer_id?: string;
  observed_id?: string;
  session_id?: string | null;
  created_at?: string;
}

export interface OptaleBrainMemoryDetail {
  peerId: string;
  card: string[];
  context: unknown;
  sessions: OptaleBrainMemorySession[];
  conclusions: OptaleBrainMemoryConclusion[];
  errors: {
    card: string | null;
    context: string | null;
    sessions: string | null;
    conclusions: string | null;
  };
}

export interface OptaleBrainMemoryResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  query: string;
  limit: number;
  workspace: string;
  namespace: string;
  profile: string;
  defaultPeer: string;
  selectedPeer: string;
  peers: OptaleBrainMemoryPeer[];
  peerTotal: number;
  queue: unknown;
  detail: OptaleBrainMemoryDetail | null;
  downstream: OptaleBrainDownstreamCall[];
  errors: {
    peers: string | null;
    queue: string | null;
  };
  stats: {
    memoryEnabled: boolean;
    authConfigured: boolean;
    peersLoaded: number;
    sessionsLoaded: number;
    conclusionsLoaded: number;
    downstreamCalls: number;
  };
}

export interface OptaleBrainMemoryReadOptions extends OptaleBrainAdapterReadOptions {
  peer?: string | null;
  fetchImpl?: typeof fetch;
}

interface MemoryCallResult<T = unknown> {
  call: OptaleBrainDownstreamCall;
  data?: T;
}

const MAX_DOWNSTREAM_TEXT = 8_000;
const MAX_CLIENT_STRING = 4_000;
const MAX_CLIENT_ARRAY_ITEMS = 20;
const MAX_CLIENT_OBJECT_KEYS = 50;
const MAX_PEER_CARD_ITEMS = 80;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pageItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["items", "results", "data"]) {
    const items = record[key];
    if (Array.isArray(items)) return items;
  }
  return [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  const redacted = compactMemoryValueForClient(asRecord(value));
  return asRecord(redacted);
}

function compactMemoryValueForClient(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactBrainTextForClient(value).slice(0, MAX_CLIENT_STRING);
  }
  if (typeof value !== "object" || value === null) return value;
  if (depth > 6) return "[max-depth]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CLIENT_ARRAY_ITEMS)
      .map((entry) => compactMemoryValueForClient(entry, depth + 1));
  }

  const record = asRecord(redactBrainValueForClient(value));
  const entries = Object.entries(record).slice(0, MAX_CLIENT_OBJECT_KEYS);
  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      compactMemoryValueForClient(entry, depth + 1),
    ])
  );
}

function renderDownstreamText(text: string, parsed: unknown): string {
  if (parsed !== undefined) {
    const compactJson = compactMemoryValueForClient(parsed);
    try {
      return JSON.stringify(compactJson).slice(0, MAX_DOWNSTREAM_TEXT);
    } catch {
      return redactBrainTextForClient(text).slice(0, MAX_DOWNSTREAM_TEXT);
    }
  }
  return redactBrainTextForClient(text).slice(0, MAX_DOWNSTREAM_TEXT);
}

export function normalizeMemoryPeer(peer: unknown): OptaleBrainMemoryPeer {
  const record = asRecord(peer);
  return {
    id: String(record.id || ""),
    created_at: stringValue(record.created_at),
    metadata: metadataRecord(record.metadata),
  };
}

export function normalizeMemorySession(session: unknown): OptaleBrainMemorySession {
  const record = asRecord(session);
  return {
    id: String(record.id || ""),
    is_active: Boolean(record.is_active),
    created_at: stringValue(record.created_at),
    metadata: metadataRecord(record.metadata),
  };
}

export function normalizeMemoryConclusion(
  conclusion: unknown
): OptaleBrainMemoryConclusion {
  const record = asRecord(conclusion);
  return {
    id: String(record.id || ""),
    content: redactBrainTextForClient(String(record.content || "")),
    observer_id: stringValue(record.observer_id),
    observed_id: stringValue(record.observed_id),
    session_id:
      record.session_id === null ? null : stringValue(record.session_id),
    created_at: stringValue(record.created_at),
  };
}

function normalizePeerCard(value: unknown): string[] {
  const record = asRecord(value);
  const raw = Array.isArray(record.peer_card)
    ? record.peer_card
    : record.peer_card
      ? [record.peer_card]
      : [];
  return raw
    .map((entry) => redactBrainTextForClient(String(entry || "").trim()))
    .filter(Boolean)
    .slice(0, MAX_PEER_CARD_ITEMS);
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

function errorMessage(call: OptaleBrainDownstreamCall): string | null {
  return call.error?.message || (call.ok ? null : call.text || "Memory request failed");
}

async function callMemoryJson<T = unknown>(input: {
  context: OptaleBrainContext;
  config: OptaleBrainMemoryConfig;
  fetchImpl: typeof fetch;
  name: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<MemoryCallResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.timeoutMs);
  const url = `${input.config.baseUrl}${input.path}`;

  try {
    const response = await input.fetchImpl(url, {
      method: input.method || "GET",
      headers: {
        Accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...resolveOptaleBrainMemoryAuthHeader(input.context),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const parsed = parseBrainAdapterJson(text);
    const renderedText = renderDownstreamText(text, parsed);
    const compactJson =
      parsed === undefined ? undefined : compactMemoryValueForClient(parsed);

    if (!response.ok) {
      const record = asRecord(parsed);
      const message =
        stringValue(record.detail) ||
        stringValue(record.error) ||
        stringValue(record.message) ||
        renderedText ||
        response.statusText;
      return {
        call: {
          name: productBrainDownstreamName(input.name),
          ok: false,
          status: "error",
          text: renderedText || `${response.status} ${message}`,
          json: compactJson,
          error: normalizeBrainDownstreamError(`${response.status} ${message}`),
        },
      };
    }

    return {
      call: {
        name: productBrainDownstreamName(input.name),
        ok: true,
        status: "ok",
        text: renderedText,
        json: compactJson,
      },
      data: parsed as T,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Memory request failed";
    return {
      call: {
        name: productBrainDownstreamName(input.name),
        ok: false,
        status: "error",
        text: message,
        error: normalizeBrainDownstreamError(message),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function filterConclusions(
  conclusions: OptaleBrainMemoryConclusion[],
  peerId: string,
  query: string,
  limit: number
): OptaleBrainMemoryConclusion[] {
  const queried = query
    ? conclusions.filter((item) =>
        item.content.toLowerCase().includes(query.toLowerCase())
      )
    : conclusions;
  const peerConclusions = queried.filter(
    (item) => item.observer_id === peerId || item.observed_id === peerId
  );
  return (peerConclusions.length > 0 ? peerConclusions : queried).slice(0, limit);
}

function selectPeer(input: {
  requestedPeer: string;
  defaultPeer: string;
  peers: OptaleBrainMemoryPeer[];
}): string {
  if (input.requestedPeer) return input.requestedPeer;
  if (input.defaultPeer) return input.defaultPeer;
  return input.peers[0]?.id || "";
}

async function readMemoryPeer(input: {
  context: OptaleBrainContext;
  config: OptaleBrainMemoryConfig;
  fetchImpl: typeof fetch;
  peerId: string;
  query: string;
  limit: number;
}): Promise<{ detail: OptaleBrainMemoryDetail; calls: OptaleBrainDownstreamCall[] }> {
  const workspace = encoded(input.config.workspace);
  const peer = encoded(input.peerId);
  const contextQuery = queryString({
    search_query: input.query || undefined,
    search_top_k: input.query ? Math.min(input.limit, 12) : undefined,
  });
  const [card, context, sessions, conclusions] = await Promise.all([
    callMemoryJson({
      context: input.context,
      config: input.config,
      fetchImpl: input.fetchImpl,
      name: "honcho__peer_card",
      path: `/v3/workspaces/${workspace}/peers/${peer}/card`,
    }),
    callMemoryJson({
      context: input.context,
      config: input.config,
      fetchImpl: input.fetchImpl,
      name: "honcho__peer_context",
      path: `/v3/workspaces/${workspace}/peers/${peer}/context${contextQuery}`,
    }),
    callMemoryJson({
      context: input.context,
      config: input.config,
      fetchImpl: input.fetchImpl,
      name: "honcho__peer_sessions",
      path: `/v3/workspaces/${workspace}/peers/${peer}/sessions?page=1&size=12`,
      method: "POST",
      body: {},
    }),
    callMemoryJson({
      context: input.context,
      config: input.config,
      fetchImpl: input.fetchImpl,
      name: "honcho__conclusions_list",
      path: `/v3/workspaces/${workspace}/conclusions/list?page=1&size=80`,
      method: "POST",
      body: {},
    }),
  ]);
  const allConclusions = pageItems(conclusions.data).map(normalizeMemoryConclusion);

  return {
    detail: {
      peerId: input.peerId,
      card: card.call.ok ? normalizePeerCard(card.data) : [],
      context: context.call.ok ? compactMemoryValueForClient(context.data) : null,
      sessions: sessions.call.ok
        ? pageItems(sessions.data).map(normalizeMemorySession)
        : [],
      conclusions: filterConclusions(allConclusions, input.peerId, input.query, input.limit),
      errors: {
        card: errorMessage(card.call),
        context: errorMessage(context.call),
        sessions: errorMessage(sessions.call),
        conclusions: errorMessage(conclusions.call),
      },
    },
    calls: [card.call, context.call, sessions.call, conclusions.call],
  };
}

export async function readOptaleBrainMemory(
  options: OptaleBrainMemoryReadOptions = {}
): Promise<OptaleBrainMemoryResponse> {
  const cabinetPath =
    normalizeCabinetPath(options.cabinetPath, true) || ROOT_CABINET_PATH;
  const query = trimBrainAdapterString(options.query);
  const requestedPeer = trimBrainAdapterString(options.peer);
  const limit = clampBrainAdapterLimit(options.limit);
  const includeDownstream = options.includeDownstream !== false;
  const fetchImpl = options.fetchImpl || fetch;

  const coreStatus = await readOptaleBrainCoreStatus({ cabinetPath });
  const publicCore = redactBrainCoreStatusForClient(coreStatus);
  const context = coreStatus.request.brain;
  const config = resolveOptaleBrainMemoryConfig(context);
  const configuredSource =
    publicCore.sources.find((entry) => entry.id === "memory") ||
    buildOptaleBrainMemorySourceBinding(publicCore.request.brain, config);

  if (!config.enabled) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      request: publicCore.request,
      source: configuredSource,
      query,
      limit,
      workspace: "",
      namespace: config.namespace,
      profile: config.profile,
      defaultPeer: "",
      selectedPeer: "",
      peers: [],
      peerTotal: 0,
      queue: null,
      detail: null,
      downstream: [],
      errors: {
        peers: config.statusReason || "Memory is not configured.",
        queue: null,
      },
      stats: {
        memoryEnabled: false,
        authConfigured: config.authConfigured,
        peersLoaded: 0,
        sessionsLoaded: 0,
        conclusionsLoaded: 0,
        downstreamCalls: 0,
      },
    };
  }

  const workspace = encoded(config.workspace);
  const [peersResult, queueResult] = await Promise.all([
    callMemoryJson({
      context,
      config,
      fetchImpl,
      name: "honcho__peers_list",
      path: `/v3/workspaces/${workspace}/peers/list?page=1&size=80`,
      method: "POST",
      body: {},
    }),
    callMemoryJson({
      context,
      config,
      fetchImpl,
      name: "honcho__queue_status",
      path: `/v3/workspaces/${workspace}/queue/status`,
    }),
  ]);
  const peers = peersResult.call.ok
    ? pageItems(peersResult.data)
        .map(normalizeMemoryPeer)
        .filter((peer) => peer.id)
    : [];
  const peerTotal =
    Number(asRecord(peersResult.data).total) || peers.length;
  const selectedPeer = selectPeer({
    requestedPeer,
    defaultPeer: config.defaultPeer || "",
    peers,
  });
  const peerResult = selectedPeer
    ? await readMemoryPeer({
        context,
        config,
        fetchImpl,
        peerId: selectedPeer,
        query,
        limit,
      })
    : { detail: null, calls: [] };
  const allCalls = [peersResult.call, queueResult.call, ...peerResult.calls];
  const source: OptaleBrainAdapterBinding =
    peersResult.call.ok || !config.enabled
      ? configuredSource
      : {
          ...configuredSource,
          status: "error",
          statusReason: peersResult.call.error?.message || "Memory peer list failed.",
        };
  const detail = peerResult.detail;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source,
    query,
    limit,
    workspace: config.workspace,
    namespace: config.namespace,
    profile: config.profile,
    defaultPeer: config.defaultPeer || "",
    selectedPeer,
    peers,
    peerTotal,
    queue: queueResult.call.ok ? compactMemoryValueForClient(queueResult.data) : null,
    detail,
    downstream: includeDownstream ? allCalls : [],
    errors: {
      peers: errorMessage(peersResult.call),
      queue: errorMessage(queueResult.call),
    },
    stats: {
      memoryEnabled: true,
      authConfigured: config.authConfigured,
      peersLoaded: peers.length,
      sessionsLoaded: detail?.sessions.length || 0,
      conclusionsLoaded: detail?.conclusions.length || 0,
      downstreamCalls: allCalls.length,
    },
  };
}
