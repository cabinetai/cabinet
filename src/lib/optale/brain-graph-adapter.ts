import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { readOptaleBrainCoreStatus } from "@/lib/optale/brain-core";
import {
  redactBrainCoreStatusForClient,
  type OptaleBrainAdapterBinding,
  type OptaleBrainPublicCoreStatus,
} from "@/lib/optale/brain-contracts";
import {
  callBrainAdapterMcpTool,
  clampBrainAdapterLimit,
  isBrainAdapterReadEnabled,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  trimBrainAdapterString,
  type OptaleBrainAdapterReadOptions,
  type OptaleBrainDownstreamCall,
} from "@/lib/optale/brain-adapters";

export type OptaleBrainGraphDisplayNodeType =
  | "entity"
  | "fact"
  | "episode";

export interface OptaleBrainGraphNode {
  id: string;
  label: string;
  kind: string;
  summary?: string;
  createdAt?: string;
  raw: Record<string, unknown>;
}

export interface OptaleBrainGraphFact {
  id: string;
  label: string;
  sourceId?: string;
  targetId?: string;
  sourceLabel?: string;
  targetLabel?: string;
  createdAt?: string;
  validAt?: string;
  invalidAt?: string | null;
  raw: Record<string, unknown>;
}

export interface OptaleBrainGraphEpisode {
  id: string;
  label: string;
  summary?: string;
  createdAt?: string;
  source?: string;
  raw: Record<string, unknown>;
}

export interface OptaleBrainGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  factId?: string;
}

export interface OptaleBrainDerivedGraphNode {
  id: string;
  label: string;
  type: OptaleBrainGraphDisplayNodeType;
  status?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface OptaleBrainDerivedGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface OptaleBrainDerivedGraph {
  nodes: OptaleBrainDerivedGraphNode[];
  edges: OptaleBrainDerivedGraphEdge[];
  counts: Record<OptaleBrainGraphDisplayNodeType, number>;
}

export interface OptaleBrainSemanticGraph {
  nodes: OptaleBrainGraphNode[];
  facts: OptaleBrainGraphFact[];
  episodes: OptaleBrainGraphEpisode[];
  edges: OptaleBrainGraphEdge[];
  stats: {
    nodesLoaded: number;
    factsLoaded: number;
    episodesLoaded: number;
    edgesLoaded: number;
    nodesTotal?: number;
    factsTotal?: number;
    episodesTotal?: number;
  };
  nodeMessage?: string;
  factMessage?: string;
  episodeMessage?: string;
}

export interface OptaleBrainGraphResponse {
  version: 1;
  generatedAt: string;
  request: OptaleBrainPublicCoreStatus["request"];
  source: OptaleBrainAdapterBinding;
  query: string;
  limit: number;
  namespace: string;
  profile: string;
  graph: OptaleBrainDerivedGraph;
  semantic: OptaleBrainSemanticGraph;
  downstream: OptaleBrainDownstreamCall[];
  stats: {
    graphitiEnabled: boolean;
    downstreamCalls: number;
    downstreamErrors: number;
    scopedByNamespace: boolean;
  };
}

export interface OptaleBrainGraphToolCallInput {
  name: string;
  args: Record<string, unknown>;
  cabinetPath: string;
}

export interface OptaleBrainGraphReadOptions extends OptaleBrainAdapterReadOptions {
  callTool?: (
    input: OptaleBrainGraphToolCallInput
  ) => Promise<OptaleBrainDownstreamCall>;
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

function redactedOptional(value: string | undefined): string | undefined {
  return value ? redactBrainTextForClient(value) : undefined;
}

function stringFromKeys(record: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function nestedString(record: JsonObject, objectKeys: string[], keys: string[]): string | undefined {
  for (const objectKey of objectKeys) {
    const nested = asRecord(record[objectKey]);
    const value = stringFromKeys(nested, keys);
    if (value) return value;
  }
  return undefined;
}

function compactGraphValueForClient(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactBrainTextForClient(value).slice(0, MAX_CLIENT_STRING);
  }
  if (typeof value !== "object" || value === null) return value;
  if (depth > 6) return "[max-depth]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_CLIENT_ARRAY_ITEMS)
      .map((entry) => compactGraphValueForClient(entry, depth + 1));
  }

  const record = asRecord(redactBrainValueForClient(value));
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_CLIENT_OBJECT_KEYS)
      .map(([key, entry]) => [key, compactGraphValueForClient(entry, depth + 1)])
  );
}

function compactRecord(value: unknown): JsonObject {
  return asRecord(compactGraphValueForClient(asRecord(value)));
}

function arrayFromPayload(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of keys) {
    const entry = record[key];
    if (Array.isArray(entry)) return entry;
  }
  for (const key of ["result", "data", "payload", "response"]) {
    const entry = record[key];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const nested = arrayFromPayload(entry, keys);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function totalFromPayload(value: unknown, keys: string[]): number | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const entry = record[key];
    const parsed = Number(entry);
    if (Number.isFinite(parsed)) return parsed;
  }
  for (const key of ["result", "data", "payload", "response"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const total = totalFromPayload(nested, keys);
      if (total !== undefined) return total;
    }
  }
  return undefined;
}

function messageFromPayload(value: unknown): string | undefined {
  const record = asRecord(value);
  return stringFromKeys(record, ["message", "status", "detail"]);
}

function arrayLabel(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const labels = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return labels[0];
}

function fallbackId(prefix: string, index: number, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${prefix}:${slug || index}`;
}

function edgeLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "related";
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export function normalizeGraphitiNodes(payload: unknown, limit = 50): OptaleBrainGraphNode[] {
  return arrayFromPayload(payload, ["nodes", "entities", "results", "items"])
    .slice(0, limit)
    .map((entry, index) => {
      const record = asRecord(entry);
      const label =
        stringFromKeys(record, ["name", "label", "title", "text", "uuid", "id"]) ||
        fallbackId("entity", index, "entity");
      const kind =
        stringFromKeys(record, ["entity_type", "type", "kind"]) ||
        arrayLabel(record.labels) ||
        "entity";
      return {
        id:
          stringFromKeys(record, ["uuid", "id", "node_uuid", "node_id"]) ||
          fallbackId("entity", index, label),
        label: redactBrainTextForClient(label),
        kind: redactBrainTextForClient(kind),
        summary: redactedOptional(stringFromKeys(record, ["summary", "description", "content"])),
        createdAt: stringFromKeys(record, ["created_at", "createdAt", "created"]),
        raw: compactRecord(record),
      };
    })
    .filter((node) => node.id && node.label);
}

export function normalizeGraphitiFacts(payload: unknown, limit = 50): OptaleBrainGraphFact[] {
  return arrayFromPayload(payload, ["facts", "edges", "relationships", "results", "items"])
    .slice(0, limit)
    .map((entry, index) => {
      const record = asRecord(entry);
      const label =
        stringFromKeys(record, ["fact", "name", "label", "summary", "text"]) ||
        fallbackId("fact", index, "fact");
      const sourceId =
        stringFromKeys(record, [
          "source_node_uuid",
          "sourceNodeUuid",
          "source_uuid",
          "source_id",
          "source",
          "from",
        ]) ||
        nestedString(record, ["source_node", "sourceNode", "source"], ["uuid", "id"]);
      const targetId =
        stringFromKeys(record, [
          "target_node_uuid",
          "targetNodeUuid",
          "target_uuid",
          "target_id",
          "target",
          "to",
        ]) ||
        nestedString(record, ["target_node", "targetNode", "target"], ["uuid", "id"]);

      return {
        id:
          stringFromKeys(record, ["uuid", "id", "edge_uuid", "fact_id"]) ||
          fallbackId("fact", index, label),
        label: redactBrainTextForClient(label),
        sourceId,
        targetId,
        sourceLabel:
          redactedOptional(
            stringFromKeys(record, ["source_node_name", "sourceNodeName", "source_name"]) ||
              nestedString(record, ["source_node", "sourceNode", "source"], [
                "name",
                "label",
                "title",
              ])
          ),
        targetLabel:
          redactedOptional(
            stringFromKeys(record, ["target_node_name", "targetNodeName", "target_name"]) ||
              nestedString(record, ["target_node", "targetNode", "target"], [
                "name",
                "label",
                "title",
              ])
          ),
        createdAt: stringFromKeys(record, ["created_at", "createdAt", "created"]),
        validAt: stringFromKeys(record, ["valid_at", "validAt"]),
        invalidAt: stringFromKeys(record, ["invalid_at", "invalidAt"]) || null,
        raw: compactRecord(record),
      };
    })
    .filter((fact) => fact.id && fact.label);
}

export function normalizeGraphitiEpisodes(
  payload: unknown,
  limit = 50
): OptaleBrainGraphEpisode[] {
  return arrayFromPayload(payload, ["episodes", "results", "items", "data"])
    .slice(0, limit)
    .map((entry, index) => {
      const record = asRecord(entry);
      const label =
        stringFromKeys(record, ["name", "title", "label", "uuid", "id"]) ||
        fallbackId("episode", index, "episode");
      return {
        id:
          stringFromKeys(record, ["uuid", "id", "episode_uuid", "episode_id"]) ||
          fallbackId("episode", index, label),
        label: redactBrainTextForClient(label),
        summary: redactedOptional(
          stringFromKeys(record, [
            "summary",
            "episode_body",
            "body",
            "content",
            "text",
          ])
        ),
        createdAt: stringFromKeys(record, ["created_at", "createdAt", "created"]),
        source: redactedOptional(
          stringFromKeys(record, ["source", "source_description", "sourceDescription"])
        ),
        raw: compactRecord(record),
      };
    })
    .filter((episode) => episode.id && episode.label);
}

function findCall(calls: OptaleBrainDownstreamCall[], name: string): OptaleBrainDownstreamCall | undefined {
  const productName = productBrainDownstreamName(name);
  return calls.find((call) => call.name === name || call.name === productName);
}

function addDerivedNode(
  nodes: Map<string, OptaleBrainDerivedGraphNode>,
  node: OptaleBrainDerivedGraphNode
): void {
  const existing = nodes.get(node.id);
  nodes.set(node.id, existing ? { ...existing, ...node, meta: { ...existing.meta, ...node.meta } } : node);
}

function sourceTargetNode(input: {
  id: string;
  label?: string;
  fallback: string;
}): OptaleBrainDerivedGraphNode {
  return {
    id: input.id,
    label: redactBrainTextForClient(input.label || input.fallback),
    type: "entity",
    meta: { inferredFromFact: true },
  };
}

function buildSemanticGraph(
  calls: OptaleBrainDownstreamCall[],
  limit: number
): { semantic: OptaleBrainSemanticGraph; graph: OptaleBrainDerivedGraph } {
  const nodeCall = findCall(calls, "graphiti__search_nodes");
  const factCall = findCall(calls, "graphiti__search_memory_facts");
  const episodeCall = findCall(calls, "graphiti__get_episodes");
  const nodes = nodeCall?.ok ? normalizeGraphitiNodes(nodeCall.json, limit) : [];
  const facts = factCall?.ok ? normalizeGraphitiFacts(factCall.json, limit) : [];
  const episodes = episodeCall?.ok
    ? normalizeGraphitiEpisodes(episodeCall.json, limit)
    : [];
  const edges: OptaleBrainGraphEdge[] = [];
  const derivedNodes = new Map<string, OptaleBrainDerivedGraphNode>();

  for (const node of nodes) {
    addDerivedNode(derivedNodes, {
      id: node.id,
      label: node.label,
      type: "entity",
      meta: {
        kind: node.kind,
        ...(node.createdAt ? { createdAt: node.createdAt } : {}),
      },
    });
  }

  for (const episode of episodes) {
    addDerivedNode(derivedNodes, {
      id: episode.id,
      label: episode.label,
      type: "episode",
      meta: {
        ...(episode.source ? { source: episode.source } : {}),
        ...(episode.createdAt ? { createdAt: episode.createdAt } : {}),
      },
    });
  }

  for (const fact of facts) {
    if (!fact.sourceId || !fact.targetId) {
      addDerivedNode(derivedNodes, {
        id: fact.id,
        label: edgeLabel(fact.label),
        type: "fact",
        meta: {
          ...(fact.createdAt ? { createdAt: fact.createdAt } : {}),
        },
      });
      continue;
    }

    if (!derivedNodes.has(fact.sourceId)) {
      addDerivedNode(
        derivedNodes,
        sourceTargetNode({
          id: fact.sourceId,
          label: fact.sourceLabel,
          fallback: fact.sourceId,
        })
      );
    }
    if (!derivedNodes.has(fact.targetId)) {
      addDerivedNode(
        derivedNodes,
        sourceTargetNode({
          id: fact.targetId,
          label: fact.targetLabel,
          fallback: fact.targetId,
        })
      );
    }
    const edge: OptaleBrainGraphEdge = {
      id: `${fact.sourceId}->${fact.id}->${fact.targetId}`,
      source: fact.sourceId,
      target: fact.targetId,
      label: edgeLabel(fact.label),
      factId: fact.id,
    };
    if (!edges.some((entry) => entry.id === edge.id)) edges.push(edge);
  }

  const derivedList = Array.from(derivedNodes.values());
  const graph: OptaleBrainDerivedGraph = {
    nodes: derivedList.slice(0, Math.max(20, limit * 4)),
    edges: edges.slice(0, Math.max(30, limit * 6)),
    counts: {
      entity: derivedList.filter((node) => node.type === "entity").length,
      fact: facts.length,
      episode: episodes.length,
    },
  };

  return {
    semantic: {
      nodes,
      facts,
      episodes,
      edges,
      stats: {
        nodesLoaded: nodes.length,
        factsLoaded: facts.length,
        episodesLoaded: episodes.length,
        edgesLoaded: edges.length,
        nodesTotal: nodeCall?.json
          ? totalFromPayload(nodeCall.json, ["total", "total_nodes", "node_count", "count"])
          : undefined,
        factsTotal: factCall?.json
          ? totalFromPayload(factCall.json, ["total", "total_facts", "fact_count", "count"])
          : undefined,
        episodesTotal: episodeCall?.json
          ? totalFromPayload(episodeCall.json, [
              "total",
              "total_episodes",
              "episode_count",
              "count",
            ])
          : undefined,
      },
      nodeMessage: nodeCall?.json ? messageFromPayload(nodeCall.json) : undefined,
      factMessage: factCall?.json ? messageFromPayload(factCall.json) : undefined,
      episodeMessage: episodeCall?.json ? messageFromPayload(episodeCall.json) : undefined,
    },
    graph,
  };
}

function fallbackGraphSource(): OptaleBrainAdapterBinding {
  return {
    id: "memory-graph",
    name: "Memory Graph",
    kind: "graph",
    source: "native",
    status: "unconfigured",
    statusReason: "Graphiti is not configured for this Brain context.",
    readOnly: true,
    scopes: ["company", "personal", "system"],
    permissions: [],
    rawPolicyPermissions: [],
    capabilities: ["read", "search", "draft-promotion"],
  };
}

async function defaultGraphToolCall(
  input: OptaleBrainGraphToolCallInput
): Promise<OptaleBrainDownstreamCall> {
  return callBrainAdapterMcpTool({
    adapterId: "graph",
    adapterName: "Optale Observatory Brain Graph",
    toolName: input.name,
    args: input.args,
    cabinetPath: input.cabinetPath,
  });
}

async function readGraphDownstream(input: {
  query: string;
  cabinetPath: string;
  limit: number;
  namespace: string;
  callTool: OptaleBrainGraphReadOptions["callTool"];
}): Promise<OptaleBrainDownstreamCall[]> {
  const callTool = input.callTool || defaultGraphToolCall;
  const scopedSearchArgs = input.namespace
    ? { group_ids: [input.namespace] }
    : {};
  const scopedEpisodeArgs = input.namespace
    ? { group_id: input.namespace }
    : {};
  const calls = [
    callTool({
      name: "graphiti__get_status",
      args: {},
      cabinetPath: input.cabinetPath,
    }),
  ];

  if (input.query) {
    calls.push(
      callTool({
        name: "graphiti__search_nodes",
        args: {
          query: input.query,
          max_nodes: input.limit,
          ...scopedSearchArgs,
        },
        cabinetPath: input.cabinetPath,
      }),
      callTool({
        name: "graphiti__search_memory_facts",
        args: {
          query: input.query,
          max_facts: input.limit,
          ...scopedSearchArgs,
        },
        cabinetPath: input.cabinetPath,
      })
    );
  } else {
    calls.push(
      callTool({
        name: "graphiti__get_episodes",
        args: {
          max_episodes: input.limit,
          ...scopedEpisodeArgs,
        },
        cabinetPath: input.cabinetPath,
      })
    );
  }

  return Promise.all(calls);
}

export async function readOptaleBrainGraph(
  options: OptaleBrainGraphReadOptions = {}
): Promise<OptaleBrainGraphResponse> {
  const cabinetPath =
    normalizeCabinetPath(options.cabinetPath, true) || ROOT_CABINET_PATH;
  const query = trimBrainAdapterString(options.query);
  const limit = clampBrainAdapterLimit(options.limit);
  const includeDownstream = options.includeDownstream !== false;
  const coreStatus = await readOptaleBrainCoreStatus({ cabinetPath });
  const publicCore = redactBrainCoreStatusForClient(coreStatus);
  const context = coreStatus.request.brain;
  const source =
    publicCore.sources.find((entry) => entry.id === "memory-graph") ||
    publicCore.sources.find((entry) => entry.kind === "graph") ||
    fallbackGraphSource();
  const graphitiEnabled = isBrainAdapterReadEnabled(source);
  const downstream =
    includeDownstream && graphitiEnabled
      ? await readGraphDownstream({
          query,
          cabinetPath,
          limit,
          namespace: context.graphNamespace,
          callTool: options.callTool,
        })
      : [];
  const statusCall = findCall(downstream, "graphiti__get_status");
  const resolvedSource =
    statusCall && !statusCall.ok
      ? {
          ...source,
          status: "error" as const,
          statusReason:
            statusCall.error?.message || statusCall.text || "Graphiti status check failed.",
        }
      : source;
  const { semantic, graph } = buildSemanticGraph(downstream, limit);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    request: publicCore.request,
    source: resolvedSource,
    query,
    limit,
    namespace: context.graphNamespace,
    profile: context.graphProfile,
    graph,
    semantic,
    downstream,
    stats: {
      graphitiEnabled,
      downstreamCalls: downstream.length,
      downstreamErrors: downstream.filter((call) => !call.ok).length,
      scopedByNamespace: Boolean(context.graphNamespace),
    },
  };
}
