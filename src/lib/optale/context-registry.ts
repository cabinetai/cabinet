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

function envUrl(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
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
      scopes: ["company", "personal", "system"],
      description: "Markdown/vault search and retrieval.",
      status: "configured",
    },
    {
      id: "graphiti",
      name: "Graphiti Memory Graph",
      transport: "http",
      url: envUrl("OPTALE_MCP_GRAPHITI_URL", "http://127.0.0.1:8102/mcp"),
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
      description: "Context assembly, entity context, and action graph operations.",
      status: "configured",
    },
    {
      id: "gitnexus",
      name: "GitNexus",
      transport: "stdio",
      command: process.env.OPTALE_MCP_GITNEXUS_COMMAND?.trim() || "/usr/bin/gitnexus",
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
      description: "Optale Observatory space, brain, and Command Center MCP surface.",
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
      description: "Private and scoped agent memory from the configured Honcho workspace.",
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
      description: "Private Honcho Dream proposals, review queue, and memory consolidation controls.",
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
      description: "Optale Observatory spaces, tasks, agents, jobs, and brain summaries.",
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
        description: "Shared client/company context, agents, memory, and workflows.",
      },
      {
        id: "personal",
        label: OPTALE_SCOPE_LABELS.personal,
        description: "Individual user context, agents, memory, and private workflows.",
      },
      {
        id: "system",
        label: OPTALE_SCOPE_LABELS.system,
        description: "Optale-controlled governance, eval, bridge, and control agents.",
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
