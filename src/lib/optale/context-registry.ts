import {
  OPTALE_PRODUCT,
  OPTALE_SCOPE_LABELS,
  type OptaleAgentScope,
} from "./product";
import { getAppOrigin } from "@/lib/runtime/runtime-config";

export type OptaleBrainKind =
  | "vault"
  | "memory"
  | "graph"
  | "dreams"
  | "action_graph"
  | "crm"
  | "project"
  | "communications"
  | "code";

export type OptaleMcpTransport = "http" | "stdio";

export type OptaleMcpServerConfig = {
  id: string;
  name: string;
  transport: OptaleMcpTransport;
  url?: string;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  scopes: OptaleAgentScope[];
  description: string;
  status: "configured" | "planned";
};

export type OptaleBrainSource = {
  id: string;
  name: string;
  kind: OptaleBrainKind;
  mcpServerId?: string;
  scopes: OptaleAgentScope[];
  description: string;
};

export type OptaleContextRegistry = {
  product: typeof OPTALE_PRODUCT;
  generatedAt: string;
  commandCenter: {
    role: "control-plane";
    origin: string | null;
    owns: string[];
  };
  scopes: Array<{
    id: OptaleAgentScope;
    label: string;
    description: string;
  }>;
  mcp: {
    currentMode: "governed-run-config";
    targetMode: "governed-native-client-and-server";
    servers: OptaleMcpServerConfig[];
  };
  brainSources: OptaleBrainSource[];
  policy: {
    defaultCompanyAgentScopes: OptaleAgentScope[];
    defaultPersonalAgentScopes: OptaleAgentScope[];
    crossScopeRule: string;
  };
};

export type OptalePublicMcpServerConfig = Pick<
  OptaleMcpServerConfig,
  "name" | "scopes" | "description" | "status"
> & {
  id: string;
};

export type OptalePublicBrainSource = Omit<OptaleBrainSource, "mcpServerId"> & {
  mcpServer?: string;
};

export type OptalePublicContextRegistry = Omit<
  OptaleContextRegistry,
  "commandCenter" | "mcp" | "brainSources"
> & {
  commandCenter: Omit<OptaleContextRegistry["commandCenter"], "origin"> & {
    origin: string | null;
  };
  mcp: Omit<OptaleContextRegistry["mcp"], "servers"> & {
    servers: OptalePublicMcpServerConfig[];
  };
  brainSources: OptalePublicBrainSource[];
};

const PRODUCT_MCP_SERVERS: Record<string, { id: string; name: string }> = {
  qmd: { id: "knowledge-search", name: "Knowledge Search" },
  graphiti: { id: "sense-graph", name: "Sense Graph" },
  oag: { id: "action-graph", name: "Action Graph" },
  gitnexus: { id: "code-intelligence", name: "Code Intelligence" },
  twenty: { id: "crm", name: "CRM" },
  plane: { id: "delivery", name: "Delivery" },
  matrix: { id: "communications", name: "Communications" },
  "optale-agents": { id: "agent-workspace", name: "Agent Workspace" },
};

const PRODUCT_DOWNSTREAM_TOOL_NAMES: Record<string, string> = {
  qmd__status: "sense_knowledge_status",
  qmd__query: "sense_search_knowledge",
  graphiti__get_status: "sense_graph_status",
  graphiti__search_nodes: "sense_search_graph_nodes",
  graphiti__search_memory_facts: "sense_search_graph_facts",
  graphiti__get_episodes: "sense_graph_episodes",
  honcho__peer_card: "sense_memory_profile",
  honcho__peer_context: "sense_memory_context",
  honcho__peer_sessions: "sense_memory_sessions",
  honcho__conclusions_list: "sense_memory_conclusions",
  honcho__peers_list: "sense_memory_peers",
  honcho__queue_status: "sense_memory_queue",
  oag__status: "ontology_status",
  oag__graph: "ontology_entity_graph",
  dreams__stats: "sense_dream_stats",
  dreams__proposals: "sense_dream_proposals",
  dreams__rejections: "sense_dream_rejections",
  dreams__rules: "sense_dream_rules",
  dreams__proposal_action: "sense_dream_proposal_action",
  dreams__ask: "sense_dream_ask",
};
const PRODUCT_OBSERVATORY_TOOL_NAMES: Record<string, string> = {
  optale_context_registry: "observatory_context",
  optale_list_cabinets: "observatory_list_spaces",
  optale_brain_summary: "observatory_brain_summary",
  optale_mcp_policy: "observatory_mcp_policy",
  optale_command_center_snapshot: "observatory_command_center_snapshot",
  optale_command_center_action: "observatory_command_center_action",
};
const PRODUCT_DOWNSTREAM_TOOL_NAME_SET = new Set(
  Object.values(PRODUCT_DOWNSTREAM_TOOL_NAMES),
);
const INTERNAL_DOWNSTREAM_TOOL_NAMES_BY_PRODUCT = new Map(
  Object.entries(PRODUCT_DOWNSTREAM_TOOL_NAMES).map(([internal, product]) => [
    product,
    internal,
  ]),
);
const INTERNAL_OBSERVATORY_TOOL_NAMES_BY_PRODUCT = new Map(
  Object.entries(PRODUCT_OBSERVATORY_TOOL_NAMES).map(([internal, product]) => [
    product,
    internal,
  ]),
);

export function productizeOptaleMcpText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[configured-url]")
    .replace(
      /\/(?:home|usr|bin|mnt|tmp|var|srv|opt|etc)\/[^\s"')\]}<>]*/g,
      "[server-path]",
    )
    .replace(
      /\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|KEY)[A-Z0-9_]*\s*[:=]\s*[^\s"'<>]+/gi,
      "[secret]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [secret]")
    .replace(/\boa_mcp_[A-Za-z0-9._~+/=-]+/g, "[secret]")
    .replace(/\bQMD\b/gi, "Knowledge Search")
    .replace(/\bGraphiti\b/gi, "Sense Graph")
    .replace(/\bOAG\b/gi, "Action Graph")
    .replace(/\bHoncho\b/gi, "Sense Memory")
    .replace(/\bGitNexus\b/gi, "Code Intelligence")
    .replace(/\bTwenty\b/gi, "CRM")
    .replace(/\bPlane\b/gi, "Delivery")
    .replace(/\bMatrix\b/gi, "Communications");
}

export function productMcpServerId(serverId: string): string {
  return PRODUCT_MCP_SERVERS[serverId]?.id || "managed-source";
}

export function productMcpServerName(
  serverId: string,
  fallback: string,
): string {
  void fallback;
  return PRODUCT_MCP_SERVERS[serverId]?.name || "Managed Source";
}

export function productMcpServerDescription(
  serverId: string,
  fallback: string | undefined,
): string | undefined {
  if (!fallback) return undefined;
  if (!PRODUCT_MCP_SERVERS[serverId]) {
    return "Managed source governed by Optale policy.";
  }
  return productizeOptaleMcpText(fallback);
}

export function internalMcpServerIdForProduct(id: string): string {
  const normalized = id.trim();
  if (!normalized) return normalized;
  if (PRODUCT_MCP_SERVERS[normalized]) return normalized;
  const match = Object.entries(PRODUCT_MCP_SERVERS).find(
    ([, product]) => product.id === normalized,
  );
  return match?.[0] || normalized;
}

export function productMcpToolName(serverId: string, toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) return normalized;
  if (PRODUCT_DOWNSTREAM_TOOL_NAME_SET.has(normalized)) return normalized;
  const prefixed = normalized.includes("__")
    ? normalized
    : `${serverId}__${normalized}`;
  const mapped = PRODUCT_DOWNSTREAM_TOOL_NAMES[prefixed];
  if (mapped) return mapped;
  if (serverId !== "optale-agents" || /^[a-z0-9-]+__/.test(normalized)) {
    return "sense_downstream_call";
  }
  return normalized;
}

export function productMcpClientToolName(toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) return normalized;
  const observatoryTool = PRODUCT_OBSERVATORY_TOOL_NAMES[normalized];
  if (observatoryTool) return observatoryTool;
  if (PRODUCT_DOWNSTREAM_TOOL_NAME_SET.has(normalized)) return normalized;
  const separator = normalized.indexOf("__");
  if (separator > 0) {
    return productMcpToolName(normalized.slice(0, separator), normalized);
  }
  return "sense_downstream_call";
}

export function internalMcpClientToolNameForProduct(toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) return normalized;
  if (
    PRODUCT_OBSERVATORY_TOOL_NAMES[normalized] ||
    PRODUCT_DOWNSTREAM_TOOL_NAMES[normalized]
  ) {
    return normalized;
  }
  return (
    INTERNAL_OBSERVATORY_TOOL_NAMES_BY_PRODUCT.get(normalized) ||
    INTERNAL_DOWNSTREAM_TOOL_NAMES_BY_PRODUCT.get(normalized) ||
    normalized
  );
}

export function toPublicOptaleMcpServer(
  server: OptaleMcpServerConfig,
): OptalePublicMcpServerConfig {
  return {
    id: productMcpServerId(server.id),
    name: productMcpServerName(server.id, server.name),
    scopes: [...server.scopes],
    description:
      productMcpServerDescription(server.id, server.description) || "",
    status: server.status,
  };
}

function envUrl(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function envPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name]?.trim() || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maybeEnvUrl(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function readOptaleMcpServers(): OptaleMcpServerConfig[] {
  return [
    {
      id: "qmd",
      name: "QMD Vault Search",
      transport: "http",
      url: envUrl("OPTALE_MCP_QMD_URL", "http://[::1]:7333/mcp"),
      timeoutMs: envPositiveInt("OPTALE_MCP_QMD_TIMEOUT_MS", 120_000),
      scopes: ["company", "personal", "system"],
      description: "Markdown/vault search and retrieval.",
      status: "configured",
    },
    {
      id: "graphiti",
      name: "Graphiti Memory Graph",
      transport: "http",
      url: envUrl("OPTALE_MCP_GRAPHITI_URL", "http://127.0.0.1:8102/mcp"),
      timeoutMs: envPositiveInt("OPTALE_MCP_GRAPHITI_TIMEOUT_MS", 4_000),
      scopes: ["company", "personal", "system"],
      description: "Temporal/entity memory graph.",
      status: "configured",
    },
    {
      id: "oag",
      name: "Optale Action Graph",
      transport: "http",
      url: envUrl("OPTALE_MCP_OAG_URL", "http://127.0.0.1:3750/mcp"),
      scopes: ["company", "personal", "system"],
      description:
        "Context assembly, entity context, and action graph operations.",
      status: "configured",
    },
    {
      id: "gitnexus",
      name: "GitNexus",
      transport: "stdio",
      command:
        process.env.OPTALE_MCP_GITNEXUS_COMMAND?.trim() || "/usr/bin/gitnexus",
      args: ["mcp"],
      scopes: ["company", "system"],
      description: "Repository intelligence and codebase analysis.",
      status: "configured",
    },
    {
      id: "twenty",
      name: "Twenty CRM",
      transport: "http",
      url: envUrl("OPTALE_MCP_TWENTY_URL", "http://127.0.0.1:3720/mcp"),
      scopes: ["company", "system"],
      description: "Company, people, notes, projects, and tasks from CRM.",
      status: "configured",
    },
    {
      id: "plane",
      name: "Plane",
      transport: "http",
      url: envUrl("OPTALE_MCP_PLANE_URL", "http://127.0.0.1:3740/mcp"),
      scopes: ["company", "system"],
      description: "Issues, projects, states, comments, and delivery workflow.",
      status: "configured",
    },
    {
      id: "matrix",
      name: "Matrix",
      transport: "http",
      url: envUrl("OPTALE_MCP_MATRIX_URL", "http://127.0.0.1:3730/mcp"),
      scopes: ["company", "personal", "system"],
      description: "Internal communication and user lookup.",
      status: "configured",
    },
    {
      id: "optale-agents",
      name: "Optale Observatory",
      transport: "http",
      url:
        process.env.OPTALE_AGENTS_MCP_URL?.trim() ||
        `${getAppOrigin()}/api/optale/mcp`,
      scopes: ["company", "personal", "system"],
      description:
        "Optale Observatory space, brain, and Command Center MCP surface.",
      status: "configured",
    },
  ];
}

export function readOptaleBrainSources(): OptaleBrainSource[] {
  return [
    {
      id: "vault",
      name: "Vault",
      kind: "vault",
      mcpServerId: "qmd",
      scopes: ["company", "personal", "system"],
      description: "Markdown knowledge base search and document retrieval.",
    },
    {
      id: "memory",
      name: "Memory",
      kind: "memory",
      scopes: ["company", "personal", "system"],
      description:
        "Private and scoped agent memory from the configured Honcho workspace.",
    },
    {
      id: "memory-graph",
      name: "Memory Graph",
      kind: "graph",
      mcpServerId: "graphiti",
      scopes: ["company", "personal", "system"],
      description: "Entity and temporal memory layer.",
    },
    {
      id: "dreams",
      name: "Dreams",
      kind: "dreams",
      scopes: ["company", "personal", "system"],
      description:
        "Private Honcho Dream proposals, review queue, and memory consolidation controls.",
    },
    {
      id: "action-graph",
      name: "Action Graph",
      kind: "action_graph",
      mcpServerId: "oag",
      scopes: ["company", "personal", "system"],
      description: "Operational graph and context assembly layer.",
    },
    {
      id: "crm",
      name: "CRM",
      kind: "crm",
      mcpServerId: "twenty",
      scopes: ["company", "system"],
      description: "Customer, company, and relationship records.",
    },
    {
      id: "delivery",
      name: "Delivery",
      kind: "project",
      mcpServerId: "plane",
      scopes: ["company", "system"],
      description: "Issues, work items, and delivery state.",
    },
    {
      id: "communications",
      name: "Communications",
      kind: "communications",
      mcpServerId: "matrix",
      scopes: ["company", "personal", "system"],
      description: "Team/user communication context.",
    },
    {
      id: "code-intelligence",
      name: "Code Intelligence",
      kind: "code",
      mcpServerId: "gitnexus",
      scopes: ["company", "system"],
      description: "Codebase graph, impact analysis, and repository search.",
    },
    {
      id: "agent-workspace",
      name: "Agent Workspace",
      kind: "action_graph",
      mcpServerId: "optale-agents",
      scopes: ["company", "personal", "system"],
      description:
        "Optale Observatory spaces, tasks, agents, jobs, and brain summaries.",
    },
  ];
}

export function readOptaleContextRegistry(): OptaleContextRegistry {
  return {
    product: OPTALE_PRODUCT,
    generatedAt: new Date().toISOString(),
    commandCenter: {
      role: "control-plane",
      origin: maybeEnvUrl("OPTALE_COMMAND_CENTER_ORIGIN"),
      owns: [
        "policy",
        "tool allowlists",
        "tenant membership",
        "secret routing",
        "approval ledgers",
        "execution traces",
        "budget accounting",
        "deployment control",
        "emergency pause",
      ],
    },
    scopes: [
      {
        id: "company",
        label: OPTALE_SCOPE_LABELS.company,
        description:
          "Shared client/company context, agents, memory, and workflows.",
      },
      {
        id: "personal",
        label: OPTALE_SCOPE_LABELS.personal,
        description:
          "Individual user context, agents, memory, and private workflows.",
      },
      {
        id: "system",
        label: OPTALE_SCOPE_LABELS.system,
        description:
          "Optale-controlled governance, eval, bridge, and control agents.",
      },
    ],
    mcp: {
      currentMode: "governed-run-config",
      targetMode: "governed-native-client-and-server",
      servers: readOptaleMcpServers(),
    },
    brainSources: readOptaleBrainSources(),
    policy: {
      defaultCompanyAgentScopes: ["company"],
      defaultPersonalAgentScopes: ["personal"],
      crossScopeRule:
        "Company and personal brain access must cross scopes only through explicit membership, sharing, or Command Center policy.",
    },
  };
}

export function readPublicOptaleContextRegistry(): OptalePublicContextRegistry {
  const registry = readOptaleContextRegistry();
  return {
    ...registry,
    commandCenter: {
      ...registry.commandCenter,
      origin: registry.commandCenter.origin ? "[configured]" : null,
    },
    mcp: {
      ...registry.mcp,
      servers: registry.mcp.servers.map(toPublicOptaleMcpServer),
    },
    brainSources: registry.brainSources.map(({ mcpServerId, ...source }) => ({
      ...source,
      description: productizeOptaleMcpText(source.description),
      ...(mcpServerId ? { mcpServer: productMcpServerId(mcpServerId) } : {}),
    })),
  };
}
