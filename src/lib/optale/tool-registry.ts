type ProductToolCategory = "memory" | "search" | "action" | "analysis";
type ProductToolStatus = "active" | "deprecated";

export interface OptaleProductToolDefinition {
  id: string;
  productName: string;
  productLabel: string;
  description: string;
  category: ProductToolCategory;
  executionMode: "mcp";
  executionConfig: {
    mcpServer: string;
    mcpTool: string;
    internalTarget: string;
  };
  tags: string[];
  status: ProductToolStatus;
}

export interface OptaleResolvedToolName {
  requestedToolName: string;
  internalToolName: string;
  internalServerId: string;
  productToolName?: string;
  productToolLabel?: string;
  productDescription?: string;
}

const INTERNAL_TOOL_SEPARATOR = "__";

const PRODUCT_TOOL_DEFINITIONS: OptaleProductToolDefinition[] = [
  {
    id: "sense_search_knowledge",
    productName: "sense_search_knowledge",
    productLabel: "Docs / Knowledge Search",
    description:
      "Search Optale knowledge sources for relevant notes, docs, and source artifacts.",
    category: "search",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "qmd",
      mcpTool: "query",
      internalTarget: "qmd__query",
    },
    tags: ["sense-memory", "knowledge", "docs", "read-only"],
    status: "active",
  },
  {
    id: "sense_search_graph_nodes",
    productName: "sense_search_graph_nodes",
    productLabel: "Relationship Graph / Node Search",
    description:
      "Search Optale relationship graph entities by name, topic, and attributes.",
    category: "search",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "graphiti",
      mcpTool: "search_nodes",
      internalTarget: "graphiti__search_nodes",
    },
    tags: ["sense-graph", "relationships", "entities", "read-only"],
    status: "active",
  },
  {
    id: "sense_search_graph_facts",
    productName: "sense_search_graph_facts",
    productLabel: "Relationship Graph / Fact Search",
    description:
      "Search Optale relationship graph facts, edges, and temporal memory.",
    category: "search",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "graphiti",
      mcpTool: "search_memory_facts",
      internalTarget: "graphiti__search_memory_facts",
    },
    tags: ["sense-graph", "relationships", "facts", "read-only"],
    status: "active",
  },
  {
    id: "sense_graph_entity_edge",
    productName: "sense_graph_entity_edge",
    productLabel: "Relationship Graph / Entity Edge",
    description:
      "Read a specific relationship graph edge between known entities.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "graphiti",
      mcpTool: "get_entity_edge",
      internalTarget: "graphiti__get_entity_edge",
    },
    tags: ["sense-graph", "relationships", "edges", "read-only"],
    status: "active",
  },
  {
    id: "sense_graph_episodes",
    productName: "sense_graph_episodes",
    productLabel: "Relationship Graph / Episodes",
    description:
      "Read source episodes that contributed to the relationship graph.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "graphiti",
      mcpTool: "get_episodes",
      internalTarget: "graphiti__get_episodes",
    },
    tags: ["sense-graph", "relationships", "episodes", "read-only"],
    status: "active",
  },
  {
    id: "sense_graph_status",
    productName: "sense_graph_status",
    productLabel: "Relationship Graph / Status",
    description:
      "Read Relationship Graph service status and configured memory scope.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "graphiti",
      mcpTool: "get_status",
      internalTarget: "graphiti__get_status",
    },
    tags: ["sense-graph", "relationships", "status", "read-only"],
    status: "active",
  },
  {
    id: "objects_action_graph_status",
    productName: "objects_action_graph_status",
    productLabel: "Objects / Action Graph Status",
    description:
      "Read Action Graph service status, graph counts, and viewer readiness.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "oag",
      mcpTool: "status",
      internalTarget: "oag__status",
    },
    tags: ["objects", "action-graph", "status", "read-only"],
    status: "active",
  },
  {
    id: "objects_entity_graph",
    productName: "objects_entity_graph",
    productLabel: "Objects / Entity Graph",
    description:
      "Read the Action Graph entity graph with Cytoscape-ready elements.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "oag",
      mcpTool: "graph",
      internalTarget: "oag__graph",
    },
    tags: ["objects", "action-graph", "entities", "cytoscape", "read-only"],
    status: "active",
  },
  {
    id: "objects_context_assemble",
    productName: "objects_context_assemble",
    productLabel: "Objects / Context Assembly",
    description:
      "Assemble read-only Action Graph context for an object or ontology question.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "oag",
      mcpTool: "context_assemble",
      internalTarget: "oag__context_assemble",
    },
    tags: ["objects", "action-graph", "context", "read-only"],
    status: "active",
  },
  {
    id: "objects_entity_context",
    productName: "objects_entity_context",
    productLabel: "Objects / Entity Context",
    description:
      "Read Action Graph relationships around one known object or entity.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "oag",
      mcpTool: "entity_context",
      internalTarget: "oag__entity_context",
    },
    tags: ["objects", "action-graph", "relationships", "read-only"],
    status: "active",
  },
  {
    id: "objects_task_bridge_status",
    productName: "objects_task_bridge_status",
    productLabel: "Objects / Task Bridge Status",
    description:
      "Read task bridge status from the Action Graph lane without dispatching writes.",
    category: "analysis",
    executionMode: "mcp",
    executionConfig: {
      mcpServer: "oag",
      mcpTool: "task_bridge_status",
      internalTarget: "oag__task_bridge_status",
    },
    tags: ["objects", "action-graph", "tasks", "read-only"],
    status: "active",
  },
];

function trimToolName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function internalServerIdForToolName(toolName: string): string {
  const separator = toolName.indexOf(INTERNAL_TOOL_SEPARATOR);
  return separator > 0 ? toolName.slice(0, separator) : "optale-agents";
}

function copyDefinition(
  definition: OptaleProductToolDefinition,
): OptaleProductToolDefinition {
  return {
    ...definition,
    executionConfig: { ...definition.executionConfig },
    tags: [...definition.tags],
  };
}

export function listOptaleProductTools(): OptaleProductToolDefinition[] {
  return PRODUCT_TOOL_DEFINITIONS.map(copyDefinition);
}

export function findOptaleProductTool(
  name: string,
): OptaleProductToolDefinition | undefined {
  const normalized = trimToolName(name);
  if (!normalized) return undefined;
  return PRODUCT_TOOL_DEFINITIONS.find(
    (definition) =>
      definition.productName === normalized ||
      definition.executionConfig.internalTarget === normalized,
  );
}

export function resolveOptaleToolName(name: string): OptaleResolvedToolName {
  const requestedToolName = trimToolName(name) || "unknown";
  const productTool = findOptaleProductTool(requestedToolName);

  if (productTool) {
    return {
      requestedToolName,
      internalToolName: productTool.executionConfig.internalTarget,
      internalServerId: productTool.executionConfig.mcpServer,
      productToolName: productTool.productName,
      productToolLabel: productTool.productLabel,
      productDescription: productTool.description,
    };
  }

  return {
    requestedToolName,
    internalToolName: requestedToolName,
    internalServerId: internalServerIdForToolName(requestedToolName),
  };
}

export function optaleToolNameMatches(
  candidateToolName: string,
  allowedOrDeniedToolName: string,
): boolean {
  const candidate = resolveOptaleToolName(candidateToolName);
  const configured = trimToolName(allowedOrDeniedToolName);
  if (!configured) return false;

  return (
    configured === candidate.internalToolName ||
    configured === candidate.productToolName
  );
}

export function optaleToolNameAllowedByList(
  candidateToolName: string,
  configuredToolNames: string[] | undefined,
): boolean {
  if (!configuredToolNames || configuredToolNames.length === 0) return true;
  return configuredToolNames.some((configuredToolName) =>
    optaleToolNameMatches(candidateToolName, configuredToolName),
  );
}

export function toProductFacingTool<
  T extends { name: string; description: string },
>(tool: T): T {
  const resolved = resolveOptaleToolName(tool.name);
  if (!resolved.productToolName) return tool;

  return {
    ...tool,
    name: resolved.productToolName,
    description: resolved.productDescription || tool.description,
  };
}

export function productFacingToolName(name: string): string | null {
  const normalized = trimToolName(name);
  if (!normalized) return null;
  const resolved = resolveOptaleToolName(normalized);
  if (resolved.productToolName) return resolved.productToolName;
  if (normalized.includes(INTERNAL_TOOL_SEPARATOR)) return null;
  return normalized;
}

export function isProductFacingToolName(name: string): boolean {
  const normalized = trimToolName(name);
  return Boolean(
    normalized && productFacingToolName(normalized) === normalized,
  );
}

export function toProductFacingToolOrNull<
  T extends { name: string; description: string },
>(tool: T): T | null {
  const productName = productFacingToolName(tool.name);
  if (!productName) return null;
  if (productName === tool.name) return tool;

  return {
    ...tool,
    name: productName,
    description:
      resolveOptaleToolName(tool.name).productDescription || tool.description,
  };
}
