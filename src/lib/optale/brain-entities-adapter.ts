import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import {
  redactBrainCoreStatusForClient,
  type OptaleBrainAdapterBinding,
  type OptaleBrainPublicCoreStatus,
} from "@/lib/optale/brain-contracts";
import {
  clampBrainAdapterLimit,
  isBrainAdapterReadEnabled,
  normalizeBrainDownstreamError,
  parseBrainAdapterJson,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  trimBrainAdapterString,
  type OptaleBrainAdapterReadOptions,
  type OptaleBrainDownstreamCall,
} from "@/lib/optale/brain-adapters";

export interface OptaleBrainEntityNode {
  id: string;
  title: string;
  type: string;
  category?: string;
  status?: string;
  owner?: string;
  vaultPath?: string;
  summary?: string;
  snippet?: string;
  health?: {
    key: string;
    label: string;
    severity?: string;
  };
  raw: Record<string, unknown>;
}

export interface OptaleBrainEntityEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  fact?: string;
  validAt?: string;
  active?: boolean;
  raw: Record<string, unknown>;
}

export interface OptaleBrainEntityCluster {
  id: string;
  label: string;
  nodeCount: number;
  edgeCount: number;
  relationshipTypes: Record<string, number>;
}

export interface OptaleBrainEntityGraph {
  nodes: OptaleBrainEntityNode[];
  edges: OptaleBrainEntityEdge[];
  clusters: OptaleBrainEntityCluster[];
  meta: {
    graphName?: string;
    edgeCount: number;
    nodeCount: number;
    clusterCount: number;
    limit: number;
    offset: number;
    totalEdgeCount: number;
    hasPrevious: boolean;
    hasNext: boolean;
    relationship: string;
    asOf?: string | null;
    temporalMode?: string;
    timeRange?: {
      min?: string | null;
      max?: string | null;
    };
    availableLenses: Array<{ key: string; label: string }>;
  };
}

export interface OptaleBrainEntitiesResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  query: string;
  limit: number;
  offset: number;
  namespace: string;
  profile: string;
  graph: OptaleBrainEntityGraph;
  downstream: OptaleBrainDownstreamCall[];
  stats: {
    entitiesEnabled: boolean;
    apiConfigured: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    nodesLoaded: number;
    edgesLoaded: number;
    clustersLoaded: number;
  };
}

export interface OptaleBrainEntitiesReadOptions extends OptaleBrainAdapterReadOptions {
  offset?: number;
  relationship?: string | null;
  asOf?: string | null;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string | null;
}

type JsonObject = Record<string, unknown>;

const MAX_CLIENT_STRING = 4_000;
const MAX_CLIENT_ARRAY_ITEMS = 25;
const MAX_CLIENT_OBJECT_KEYS = 60;

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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function clampOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.trunc(parsed), 0), 100_000);
}

function compactEntityValueForClient(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactBrainTextForClient(value).slice(0, MAX_CLIENT_STRING);
  }
  if (typeof value !== "object" || value === null) return value;
  if (depth > 6) return "[max-depth]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CLIENT_ARRAY_ITEMS)
      .map((entry) => compactEntityValueForClient(entry, depth + 1));
  }

  const record = asRecord(redactBrainValueForClient(value));
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_CLIENT_OBJECT_KEYS)
      .map(([key, entry]) => [key, compactEntityValueForClient(entry, depth + 1)])
  );
}

function compactRecord(value: unknown): JsonObject {
  return asRecord(compactEntityValueForClient(asRecord(value)));
}

function envName(base: string, profile: string): string {
  return `${base}_${profile.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function envFirst(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function resolveEntitiesApiBaseUrl(profile: string, override?: string | null): string {
  const explicit = override?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const configured = envFirst([
    envName("OPTALE_ENTITY_API_URL", profile),
    envName("OPTALE_OAG_API_URL", profile),
    envName("ENTITY_API_URL", profile),
    "OPTALE_ENTITY_API_URL",
    "OPTALE_OAG_API_URL",
    "ENTITY_API_URL",
    "OAG_API_BASE_URL",
  ]);
  return (configured || "http://127.0.0.1:3604").replace(/\/$/, "");
}

function fallbackEntitiesSource(): OptaleBrainAdapterBinding {
  return {
    id: "action-graph",
    name: "Action Graph",
    kind: "action_graph",
    source: "native",
    status: "unconfigured",
    statusReason: "OAG/entity graph is not configured for this Brain context.",
    readOnly: true,
    scopes: ["company", "personal", "system"],
    permissions: [],
    rawPolicyPermissions: [],
    capabilities: ["read", "search", "draft-promotion"],
  };
}

function searchParams(input: {
  query: string;
  limit: number;
  offset: number;
  relationship: string;
  asOf: string;
}): string {
  const params = new URLSearchParams();
  params.set("limit", String(input.limit));
  if (input.offset > 0) params.set("offset", String(input.offset));
  if (input.query) params.set("q", input.query);
  if (input.relationship) params.set("relationship", input.relationship);
  if (input.asOf) params.set("as_of", input.asOf);
  return params.toString();
}

async function callEntitiesJson(input: {
  baseUrl: string;
  path: string;
  name: string;
  fetchImpl: typeof fetch;
}): Promise<OptaleBrainDownstreamCall> {
  const url = `${input.baseUrl}${input.path}`;
  const name = productBrainDownstreamName(input.name);
  try {
    const response = await input.fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    const json = parseBrainAdapterJson(text);
    const compactJson =
      json === undefined ? undefined : compactEntityValueForClient(json);
    const renderedText =
      json === undefined
        ? redactBrainTextForClient(text).slice(0, 8_000)
        : JSON.stringify(compactJson).slice(0, 8_000);

    if (!response.ok) {
      return {
        name,
        ok: false,
        status: "error",
        text: renderedText || response.statusText,
        json: compactJson,
        error: normalizeBrainDownstreamError(
          `${response.status} ${renderedText || response.statusText}`
        ),
      };
    }

    return {
      name,
      ok: true,
      status: "ok",
      text: renderedText,
      json: compactJson,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Entity API request failed";
    return {
      name,
      ok: false,
      status: "error",
      text: message,
      error: normalizeBrainDownstreamError(message),
    };
  }
}

function findEntityCall(
  calls: OptaleBrainDownstreamCall[],
  name: string
): OptaleBrainDownstreamCall | undefined {
  const productName = productBrainDownstreamName(name);
  return calls.find((call) => call.name === name || call.name === productName);
}

function normalizeHealth(value: unknown): OptaleBrainEntityNode["health"] {
  const record = asRecord(value);
  const key = stringValue(record.key);
  const label = stringValue(record.label);
  if (!key && !label) return undefined;
  return {
    key: key || label || "unknown",
    label: label || key || "Unknown",
    severity: stringValue(record.severity),
  };
}

export function normalizeOagEntityNodes(payload: unknown): OptaleBrainEntityNode[] {
  const graph = asRecord(asRecord(payload).graph);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  return nodes
    .map((entry, index) => {
      const record = asRecord(entry);
      const sourcePreview = asRecord(record.source_preview);
      const lens = asRecord(record.lens);
      const title =
        stringValue(record.title) ||
        stringValue(record.name) ||
        stringValue(record.id) ||
        `Entity ${index + 1}`;
      return {
        id: stringValue(record.id) || `entity:${index + 1}`,
        title: redactBrainTextForClient(title),
        type: redactBrainTextForClient(
          stringValue(record.type) || stringValue(record.kind) || "entity"
        ),
        category: stringValue(record.category),
        status: stringValue(record.status),
        owner: stringValue(record.owner),
        vaultPath: stringValue(record.vault_path),
        summary: stringValue(record.summary),
        snippet: stringValue(sourcePreview.snippet),
        health: normalizeHealth(asRecord(lens.health)),
        raw: compactRecord(record),
      };
    })
    .filter((node) => node.id && node.title);
}

export function normalizeOagEntityEdges(payload: unknown): OptaleBrainEntityEdge[] {
  const graph = asRecord(asRecord(payload).graph);
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  return edges
    .map((entry, index) => {
      const record = asRecord(entry);
      return {
        id: stringValue(record.id) || `edge:${index + 1}`,
        source: stringValue(record.source) || "",
        target: stringValue(record.target) || "",
        type: redactBrainTextForClient(stringValue(record.type) || "related"),
        fact: stringValue(record.fact),
        validAt: stringValue(record.valid_at) || stringValue(record.validAt),
        active: booleanValue(record.active),
        raw: compactRecord(record),
      };
    })
    .filter((edge) => edge.id && edge.source && edge.target);
}

export function normalizeOagEntityClusters(payload: unknown): OptaleBrainEntityCluster[] {
  const graph = asRecord(asRecord(payload).graph);
  const clusters = Array.isArray(graph.clusters) ? graph.clusters : [];
  return clusters
    .map((entry, index) => {
      const record = asRecord(entry);
      return {
        id: stringValue(record.id) || `cluster:${index + 1}`,
        label: redactBrainTextForClient(
          stringValue(record.label) || stringValue(record.id) || `Cluster ${index + 1}`
        ),
        nodeCount: numberValue(record.node_count),
        edgeCount: numberValue(record.edge_count),
        relationshipTypes: asRecord(record.relationship_types) as Record<string, number>,
      };
    })
    .filter((cluster) => cluster.id && cluster.label);
}

function normalizeMeta(payload: unknown, limit: number, offset: number): OptaleBrainEntityGraph["meta"] {
  const meta = asRecord(asRecord(payload).meta);
  const lenses = Array.isArray(meta.available_lenses) ? meta.available_lenses : [];
  return {
    graphName: stringValue(meta.graph_name),
    edgeCount: numberValue(meta.edge_count),
    nodeCount: numberValue(meta.node_count),
    clusterCount: numberValue(meta.cluster_count),
    limit: numberValue(meta.limit, limit),
    offset: numberValue(meta.offset, offset),
    totalEdgeCount: numberValue(meta.total_edge_count),
    hasPrevious: Boolean(meta.has_previous),
    hasNext: Boolean(meta.has_next),
    relationship: stringValue(meta.relationship) || "all",
    asOf: stringValue(meta.as_of) || null,
    temporalMode: stringValue(meta.temporal_mode),
    timeRange: asRecord(meta.time_range),
    availableLenses: lenses
      .map((entry) => asRecord(entry))
      .map((entry) => ({
        key: stringValue(entry.key) || "",
        label: stringValue(entry.label) || "",
      }))
      .filter((entry) => entry.key && entry.label),
  };
}

function emptyEntityGraph(limit: number, offset: number): OptaleBrainEntityGraph {
  return {
    nodes: [],
    edges: [],
    clusters: [],
    meta: {
      edgeCount: 0,
      nodeCount: 0,
      clusterCount: 0,
      limit,
      offset,
      totalEdgeCount: 0,
      hasPrevious: false,
      hasNext: false,
      relationship: "all",
      availableLenses: [],
    },
  };
}

export function normalizeOagEntityGraph(
  payload: unknown,
  limit: number,
  offset: number
): OptaleBrainEntityGraph {
  return {
    nodes: normalizeOagEntityNodes(payload),
    edges: normalizeOagEntityEdges(payload),
    clusters: normalizeOagEntityClusters(payload),
    meta: normalizeMeta(payload, limit, offset),
  };
}

export async function readOptaleBrainEntities(
  options: OptaleBrainEntitiesReadOptions = {}
): Promise<OptaleBrainEntitiesResponse> {
  const cabinetPath =
    normalizeCabinetPath(options.cabinetPath, true) || ROOT_CABINET_PATH;
  const query = trimBrainAdapterString(options.query);
  const limit = clampBrainAdapterLimit(options.limit, 25);
  const offset = clampOffset(options.offset);
  const relationship = trimBrainAdapterString(options.relationship);
  const asOf = trimBrainAdapterString(options.asOf);
  const includeDownstream = options.includeDownstream !== false;
  const fetchImpl = options.fetchImpl || fetch;
  const coreStatus = await readOptaleBrainCoreStatus({ cabinetPath });
  const publicCore = redactBrainCoreStatusForClient(coreStatus);
  const context = coreStatus.request.brain;
  const source =
    publicCore.sources.find((entry) => entry.id === "action-graph") ||
    fallbackEntitiesSource();
  const entitiesEnabled = isBrainAdapterReadEnabled(source);
  const baseUrl = resolveEntitiesApiBaseUrl(context.entityProfile, options.apiBaseUrl);
  const apiConfigured = Boolean(baseUrl);
  const downstream =
    includeDownstream && entitiesEnabled && apiConfigured
      ? await Promise.all([
          callEntitiesJson({
            baseUrl,
            path: "/api/oag/status",
            name: "oag__status",
            fetchImpl,
          }),
          callEntitiesJson({
            baseUrl,
            path: `/api/oag/graph?${searchParams({
              query,
              limit,
              offset,
              relationship,
              asOf,
            })}`,
            name: "oag__graph",
            fetchImpl,
          }),
        ])
      : [];
  const statusCall = findEntityCall(downstream, "oag__status");
  const graphCall = findEntityCall(downstream, "oag__graph");
  const resolvedSource =
    statusCall && !statusCall.ok
      ? {
          ...source,
          status: "error" as const,
          statusReason:
            statusCall.error?.message || statusCall.text || "OAG status check failed.",
        }
      : source;
  const graph =
    graphCall?.ok && graphCall.json
      ? normalizeOagEntityGraph(graphCall.json, limit, offset)
      : emptyEntityGraph(limit, offset);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source: resolvedSource,
    query,
    limit,
    offset,
    namespace: context.entityNamespace,
    profile: context.entityProfile,
    graph,
    downstream,
    stats: {
      entitiesEnabled,
      apiConfigured,
      downstreamCalls: downstream.length,
      downstreamErrors: downstream.filter((call) => !call.ok).length,
      nodesLoaded: graph.nodes.length,
      edgesLoaded: graph.edges.length,
      clustersLoaded: graph.clusters.length,
    },
  };
}
