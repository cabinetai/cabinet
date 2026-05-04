import type { CabinetVisibilityMode } from "@/types/cabinets";
import {
  readOptaleCommandCenterSnapshot,
  type OptaleCommandCenterAction,
} from "@/lib/optale/command-center-control";
import {
  readPublicOptaleContextRegistry,
  type OptalePublicContextRegistry,
} from "@/lib/optale/context-registry";
import {
  buildOptaleOperationalSpineBinding,
  buildOptaleOperationalSpineSummary,
  type OptaleOperationalSpineBinding,
  type OptaleOperationalSpineSummary,
} from "@/lib/optale/operational-spine";
import {
  buildOptaleOagObjectIdentity,
  type OptaleOagObjectIdentity,
} from "@/lib/optale/oag-object-identity";
import {
  optaleOagObjectSchemaProjectionForType,
  type OptaleOagObjectSchemaProjection,
} from "@/lib/optale/oag-schema";

export type OptaleResourceKind =
  | "space"
  | "agent"
  | "job"
  | "task"
  | "conversation"
  | "brain_source"
  | "mcp_server"
  | "mcp_client"
  | "mcp_policy"
  | "action_type";

export type OptaleResourceSource =
  | "cabinet"
  | "agent-harness"
  | "brain"
  | "mcp"
  | "command-center";

export interface OptaleResourceFact {
  label: string;
  value: string | number | boolean;
}

export interface OptaleResourceRecord {
  id: string;
  kind: OptaleResourceKind;
  label: string;
  description?: string;
  status?: string;
  cabinetPath?: string;
  source: OptaleResourceSource;
  updatedAt?: string;
  href?: string;
  facts: OptaleResourceFact[];
  operationalSpine?: OptaleOperationalSpineBinding;
  oag?: OptaleOagObjectIdentity;
  oagSchema?: OptaleOagObjectSchemaProjection;
}

export interface OptaleResourceRegistry {
  generatedAt: string;
  cabinetPath: string;
  visibilityMode: CabinetVisibilityMode;
  resources: OptaleResourceRecord[];
  counts: Record<OptaleResourceKind, number>;
  operationalSpine: OptaleOperationalSpineSummary;
}

type CommandCenterSnapshot = Awaited<
  ReturnType<typeof readOptaleCommandCenterSnapshot>
>;

const RESOURCE_KIND_ORDER: OptaleResourceKind[] = [
  "space",
  "agent",
  "job",
  "task",
  "conversation",
  "brain_source",
  "mcp_server",
  "mcp_client",
  "mcp_policy",
  "action_type",
];

const ACTION_LABELS: Record<OptaleCommandCenterAction, string> = {
  launch_conversation: "Launch Conversation",
  create_task: "Create Task",
  update_task: "Update Task",
  set_agent_active: "Set Agent Active",
  run_job: "Run Job",
  toggle_job: "Toggle Job",
  stop_conversation: "Stop Conversation",
  review_actions: "Review Actions",
};

function compactFacts(
  facts: Array<OptaleResourceFact | false | null | undefined>,
): OptaleResourceFact[] {
  return facts.filter((fact): fact is OptaleResourceFact => Boolean(fact));
}

function resourceKindCounts(
  resources: OptaleResourceRecord[],
): Record<OptaleResourceKind, number> {
  const counts = Object.fromEntries(
    RESOURCE_KIND_ORDER.map((kind) => [kind, 0]),
  ) as Record<OptaleResourceKind, number>;
  for (const resource of resources) {
    counts[resource.kind] += 1;
  }
  return counts;
}

function factValue(
  facts: OptaleResourceFact[],
  label: string,
): string | undefined {
  const match = facts.find((fact) => fact.label === label);
  if (!match) return undefined;
  return String(match.value).trim() || undefined;
}

export function sortOptaleResources(
  resources: OptaleResourceRecord[],
): OptaleResourceRecord[] {
  return [...resources].sort((left, right) => {
    const kindDelta =
      RESOURCE_KIND_ORDER.indexOf(left.kind) -
      RESOURCE_KIND_ORDER.indexOf(right.kind);
    if (kindDelta !== 0) return kindDelta;
    return left.label.localeCompare(right.label);
  });
}

export function optaleResourceKindLabel(kind: OptaleResourceKind): string {
  switch (kind) {
    case "space":
      return "Space";
    case "agent":
      return "Agent";
    case "job":
      return "Job";
    case "task":
      return "Task";
    case "conversation":
      return "Conversation";
    case "brain_source":
      return "Brain Source";
    case "mcp_server":
      return "MCP Server";
    case "mcp_client":
      return "MCP Client";
    case "mcp_policy":
      return "MCP Policy";
    case "action_type":
      return "Action Type";
  }
}

export function buildOptaleResourceRegistry(input: {
  commandCenter: CommandCenterSnapshot;
  context: OptalePublicContextRegistry;
}): OptaleResourceRegistry {
  const { commandCenter, context } = input;
  const resources: OptaleResourceRecord[] = [];

  for (const space of commandCenter.visibleCabinets) {
    resources.push({
      id: `space:${space.path}`,
      kind: "space",
      label: space.name || space.path,
      description: space.description,
      status: space.optaleScope?.scope || "space",
      cabinetPath: space.path,
      source: "cabinet",
      href:
        space.path === "."
          ? "#/home"
          : `#/cabinet/${encodeURIComponent(space.path)}`,
      facts: compactFacts([
        { label: "Path", value: space.path },
        { label: "Depth", value: space.cabinetDepth ?? 0 },
        space.optaleScope?.scope
          ? { label: "Scope", value: space.optaleScope.scope }
          : null,
      ]),
    });
  }

  for (const agent of commandCenter.agents) {
    resources.push({
      id: `agent:${agent.scopedId}`,
      kind: "agent",
      label: agent.displayName || agent.name || agent.slug,
      description: agent.role,
      status: agent.active ? "active" : "inactive",
      cabinetPath: agent.cabinetPath,
      source: "agent-harness",
      href: `#/cabinet/${encodeURIComponent(agent.cabinetPath)}/agents/${encodeURIComponent(agent.slug)}`,
      facts: compactFacts([
        { label: "Slug", value: agent.slug },
        { label: "Jobs", value: agent.jobCount },
        { label: "Tasks", value: agent.taskCount },
        { label: "Inherited", value: agent.inherited },
        agent.optaleScope?.scope
          ? { label: "Scope", value: agent.optaleScope.scope }
          : null,
      ]),
    });
  }

  for (const job of commandCenter.jobs) {
    resources.push({
      id: `job:${job.scopedId}`,
      kind: "job",
      label: job.name,
      description: job.description,
      status: job.enabled ? "enabled" : "paused",
      cabinetPath: job.cabinetPath,
      source: "agent-harness",
      facts: compactFacts([
        { label: "Schedule", value: job.schedule },
        job.ownerAgent ? { label: "Owner", value: job.ownerAgent } : null,
        { label: "Inherited", value: job.inherited },
      ]),
    });
  }

  for (const task of commandCenter.tasks) {
    resources.push({
      id: `task:${task.cabinetPath || commandCenter.cabinet.path}:${task.id}`,
      kind: "task",
      label: task.title,
      description: task.description,
      status: task.status,
      cabinetPath: task.cabinetPath || commandCenter.cabinet.path,
      source: "agent-harness",
      updatedAt: task.updatedAt,
      facts: compactFacts([
        { label: "To", value: task.toAgent },
        { label: "From", value: task.fromAgent },
        { label: "Priority", value: task.priority },
        task.linkedConversationId
          ? { label: "Conversation", value: task.linkedConversationId }
          : null,
      ]),
    });
  }

  for (const conversation of commandCenter.conversations) {
    const cabinetPath = conversation.cabinetPath || commandCenter.cabinet.path;
    resources.push({
      id: `conversation:${cabinetPath}:${conversation.id}`,
      kind: "conversation",
      label: conversation.title,
      status: conversation.status,
      cabinetPath,
      source: "agent-harness",
      updatedAt: conversation.completedAt || conversation.startedAt,
      href: `#/cabinet/${encodeURIComponent(cabinetPath)}/tasks/${encodeURIComponent(conversation.id)}`,
      facts: compactFacts([
        { label: "Agent", value: conversation.agentSlug },
        { label: "Trigger", value: conversation.trigger },
        { label: "Started", value: conversation.startedAt },
        conversation.providerId
          ? { label: "Provider", value: conversation.providerId }
          : null,
      ]),
    });
  }

  for (const source of context.brainSources) {
    resources.push({
      id: `brain-source:${source.id}`,
      kind: "brain_source",
      label: source.name,
      description: source.description,
      status: source.mcpServer ? "connected" : "planned",
      source: "brain",
      facts: compactFacts([
        { label: "Kind", value: source.kind },
        { label: "Scopes", value: source.scopes.join(", ") },
        source.mcpServer ? { label: "MCP", value: source.mcpServer } : null,
      ]),
    });
  }

  for (const server of context.mcp.servers) {
    resources.push({
      id: `mcp-server:${server.id}`,
      kind: "mcp_server",
      label: server.name,
      description: server.description,
      status: server.status,
      source: "mcp",
      facts: compactFacts([
        { label: "Scopes", value: server.scopes.join(", ") },
      ]),
    });
  }

  for (const client of commandCenter.mcp.clients) {
    resources.push({
      id: `mcp-client:${client.id}`,
      kind: "mcp_client",
      label: client.name || client.id,
      status: client.enabled ? "enabled" : "disabled",
      cabinetPath: client.cabinetPath,
      source: "mcp",
      updatedAt: client.updatedAt || client.createdAt,
      facts: compactFacts([
        { label: "Permissions", value: client.permissions.join(", ") },
        { label: "Scope", value: client.agentScope || "company" },
        { label: "Lock Cabinet", value: client.lockCabinet },
        { label: "Remote Actions", value: client.remoteActionsEnabled },
      ]),
    });
  }

  resources.push({
    id: `mcp-policy:${commandCenter.cabinet.path}`,
    kind: "mcp_policy",
    label: "MCP Policy",
    status: commandCenter.mcpPolicy.enforcementMode,
    cabinetPath: commandCenter.cabinet.path,
    source: "mcp",
    facts: compactFacts([
      { label: "Default", value: commandCenter.mcpPolicy.defaultDecision },
      { label: "Source", value: commandCenter.mcpPolicy.source },
      {
        label: "Servers",
        value: commandCenter.counts.mcpClients,
      },
    ]),
  });

  for (const action of commandCenter.controls) {
    resources.push({
      id: `action-type:${action}`,
      kind: "action_type",
      label: ACTION_LABELS[action],
      status: "available",
      cabinetPath: commandCenter.cabinet.path,
      source: "command-center",
      facts: [{ label: "Action", value: action }],
    });
  }

  const generatedAt = new Date().toISOString();
  const sorted = sortOptaleResources(resources).map((resource) => {
    const oag = buildOptaleOagObjectIdentity({
      resourceId: resource.id,
      resourceKind: resource.kind,
      resourceSource: resource.source,
      cabinetPath: resource.cabinetPath || commandCenter.cabinet.path,
      scope: factValue(resource.facts, "Scope"),
    });
    return {
      ...resource,
      operationalSpine: buildOptaleOperationalSpineBinding({
        subjectType: "resource",
        subjectId: resource.id,
        cabinetPath: resource.cabinetPath || commandCenter.cabinet.path,
      }),
      oag,
      oagSchema: optaleOagObjectSchemaProjectionForType(oag.objectType),
    };
  });
  return {
    generatedAt,
    cabinetPath: commandCenter.cabinet.path,
    visibilityMode: commandCenter.visibilityMode,
    resources: sorted,
    counts: resourceKindCounts(sorted),
    operationalSpine: buildOptaleOperationalSpineSummary({
      generatedAt,
      cabinetPath: commandCenter.cabinet.path,
      bindings: sorted.map((resource) => resource.operationalSpine),
    }),
  };
}

export async function readOptaleResourceRegistry(
  input: {
    cabinetPath?: string;
    visibilityMode?: CabinetVisibilityMode;
    limit?: number;
  } = {},
): Promise<OptaleResourceRegistry> {
  const [commandCenter, context] = await Promise.all([
    readOptaleCommandCenterSnapshot(input),
    Promise.resolve(readPublicOptaleContextRegistry()),
  ]);
  const registry = buildOptaleResourceRegistry({ commandCenter, context });
  if (!input.limit || registry.resources.length <= input.limit) {
    return registry;
  }
  return {
    ...registry,
    resources: registry.resources.slice(0, input.limit),
  };
}
