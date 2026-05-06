"use client";

import {
  Bot,
  CalendarClock,
  ClipboardList,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConsoleEndpoint } from "./live-endpoint";
import {
  ContextSection,
  DataTable,
  SplitSurface,
} from "./primitives";
import type { TableRow } from "./types";

type AgentSummary = {
  slug: string;
  name: string;
  displayName?: string;
  role?: string;
  active: boolean;
  cabinetPath: string;
  optaleScope?: { scope?: string };
  jobCount: number;
  taskCount: number;
};

type JobSummary = {
  id: string;
  name: string;
  ownerAgent?: string;
  enabled: boolean;
  schedule: string;
  cabinetPath: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  agentSlug: string;
  status: string;
  trigger: string;
  startedAt: string;
  completedAt?: string;
};

type TaskSummary = {
  id: string;
  title: string;
  toAgent: string;
  status: string;
  priority: number;
  updatedAt?: string;
  createdAt: string;
};

type McpPolicyServer = {
  id: string;
  name: string;
  enabled: boolean;
  permissions: string[];
  scopes: string[];
};

type CommandCenterPayload = {
  counts: {
    agents: number;
    activeAgents: number;
    jobs: number;
    enabledJobs: number;
    conversations: number;
    pendingActions: number;
    tasks: number;
    mcpClients: number;
    activeMcpClients: number;
  };
  agents: AgentSummary[];
  jobs: JobSummary[];
  conversations: ConversationSummary[];
  tasks: TaskSummary[];
  controls: string[];
  operatorOnlyControls?: string[];
  mcpPolicy: {
    enforcementMode: string;
    defaultDecision: string;
    commandCenterManaged: boolean;
    servers: McpPolicyServer[];
  };
};

type AgentRowKind =
  | "agent"
  | "job"
  | "conversation"
  | "permission"
  | "mission"
  | "empty";

type AgentTableRow = TableRow & {
  __key: string;
  __kind: AgentRowKind;
  __id: string;
};

type AgentInspectorDetail = {
  kind: AgentRowKind;
  title: string;
  subtitle: string;
  summary?: string;
  rows: [string, string][];
  relatedTitle: string;
  related: [string, string][];
};

export function AgentsSurface({ subpage }: { subpage: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const commandCenter = useConsoleEndpoint<CommandCenterPayload>(
    "/api/optale/command-center?limit=80",
    refreshKey,
  );
  const columns = agentColumnsForSubpage(subpage);
  const rows = agentRowsForSubpage(
    subpage,
    commandCenter.data,
    commandCenter.loading,
  );
  const activeRowKey = selectableAgentRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Agents"
      title={subpage}
      description="Agent definitions, permissions, schedules, routines, and channel adapters stay controlled from this module."
      table={
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 border border-white/10 text-[#aeb3b7] hover:bg-white/5 hover:text-white"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="Refresh Agents"
              title="Refresh"
            >
              {commandCenter.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
          {commandCenter.error ? <LiveError message={commandCenter.error} /> : null}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row, index) => row.__key || `${row[columns[0]]}-${index}`}
            selectedRowKey={activeRowKey}
            onRowSelect={(row) => {
              if (!agentRowIsSelectable(row)) return;
              setSelectedRowKey(row.__key);
            }}
          />
        </div>
      }
      side={
        <div className="space-y-5">
          <AgentInspector
            detail={agentInspectorDetail(activeRowKey, commandCenter.data)}
          />
          <ContextSection
            title="Runtime"
            rows={[
              ["Agents", count(commandCenter.data?.counts.agents)],
              ["Active", count(commandCenter.data?.counts.activeAgents)],
              ["Jobs", count(commandCenter.data?.counts.jobs)],
              ["Enabled jobs", count(commandCenter.data?.counts.enabledJobs)],
              ["Pending actions", count(commandCenter.data?.counts.pendingActions)],
            ]}
          />
          <ContextSection
            title="Policy"
            rows={[
              ["Mode", commandCenter.data?.mcpPolicy.enforcementMode ?? "Loading"],
              ["Default", commandCenter.data?.mcpPolicy.defaultDecision ?? "Loading"],
              ["Managed", commandCenter.data?.mcpPolicy.commandCenterManaged ? "Yes" : "Loading"],
              ["Controls", count(commandCenter.data?.controls.length)],
              ["Operator only", count(commandCenter.data?.operatorOnlyControls?.length)],
            ]}
          />
        </div>
      }
    />
  );
}

function agentColumnsForSubpage(subpage: string): string[] {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("conversation")) {
    return ["conversation", "agent", "state", "trigger", "updated"];
  }
  if (normalized.includes("schedule") || normalized.includes("routine")) {
    return ["job", "owner", "state", "schedule", "space"];
  }
  if (normalized.includes("permission")) {
    return ["surface", "state", "scopes", "permissions", "source"];
  }
  if (normalized.includes("mission")) {
    return ["surface", "state", "count", "source", "updated"];
  }
  return ["agent", "role", "state", "scope", "jobs", "tasks"];
}

function agentRowsForSubpage(
  subpage: string,
  payload: CommandCenterPayload | null,
  loading: boolean,
): AgentTableRow[] {
  if (loading) return loadingRows(agentColumnsForSubpage(subpage));
  const normalized = subpage.toLowerCase();
  if (normalized.includes("conversation")) return conversationRows(payload);
  if (normalized.includes("schedule") || normalized.includes("routine")) return jobRows(payload);
  if (normalized.includes("permission")) return permissionRows(payload);
  if (normalized.includes("mission")) return missionRows(payload);
  return rosterRows(payload);
}

function missionRows(payload: CommandCenterPayload | null): AgentTableRow[] {
  if (!payload) return emptyRows(["surface", "state", "count", "source", "updated"], "No mission data visible");
  return [
    {
      __key: "mission:roster",
      __kind: "mission",
      __id: "roster",
      surface: "Agent roster",
      state: payload.counts.activeAgents > 0 ? "Ready" : "Empty",
      count: `${payload.counts.activeAgents}/${payload.counts.agents}`,
      source: "Command Center",
      updated: "live",
    },
    {
      __key: "mission:schedules",
      __kind: "mission",
      __id: "schedules",
      surface: "Schedules",
      state: payload.counts.enabledJobs > 0 ? "Ready" : "Empty",
      count: `${payload.counts.enabledJobs}/${payload.counts.jobs}`,
      source: "Command Center",
      updated: "live",
    },
    {
      __key: "mission:approvals",
      __kind: "mission",
      __id: "approvals",
      surface: "Approvals",
      state: payload.counts.pendingActions > 0 ? "Review" : "Clear",
      count: String(payload.counts.pendingActions),
      source: "Action queue",
      updated: "live",
    },
    {
      __key: "mission:mcp-clients",
      __kind: "mission",
      __id: "mcp-clients",
      surface: "MCP clients",
      state: payload.counts.activeMcpClients > 0 ? "Ready" : "Planned",
      count: `${payload.counts.activeMcpClients}/${payload.counts.mcpClients}`,
      source: "Policy",
      updated: "live",
    },
  ];
}

function rosterRows(payload: CommandCenterPayload | null): AgentTableRow[] {
  const agents = payload?.agents ?? [];
  if (agents.length === 0) {
    return emptyRows(["agent", "role", "state", "scope", "jobs", "tasks"], "No agents visible");
  }
  return agents.map((agent) => ({
    __key: `agent:${agent.slug}`,
    __kind: "agent",
    __id: agent.slug,
    agent: agent.displayName || agent.name || agent.slug,
    role: agent.role || "n/a",
    state: agent.active ? "Active" : "Paused",
    scope: agent.optaleScope?.scope || scopeFromPath(agent.cabinetPath),
    jobs: String(agent.jobCount),
    tasks: String(agent.taskCount),
  }));
}

function jobRows(payload: CommandCenterPayload | null): AgentTableRow[] {
  const jobs = payload?.jobs ?? [];
  if (jobs.length === 0) {
    return emptyRows(["job", "owner", "state", "schedule", "space"], "No scheduled jobs visible");
  }
  return jobs.map((job) => ({
    __key: `job:${job.id}`,
    __kind: "job",
    __id: job.id,
    job: job.name,
    owner: job.ownerAgent || "n/a",
    state: job.enabled ? "Enabled" : "Paused",
    schedule: job.schedule,
    space: job.cabinetPath || ".",
  }));
}

function conversationRows(payload: CommandCenterPayload | null): AgentTableRow[] {
  const conversations = payload?.conversations ?? [];
  if (conversations.length === 0) {
    return emptyRows(["conversation", "agent", "state", "trigger", "updated"], "No Console conversations visible");
  }
  return conversations.map((conversation) => ({
    __key: `conversation:${conversation.id}`,
    __kind: "conversation",
    __id: conversation.id,
    conversation: conversation.title || conversation.id,
    agent: conversation.agentSlug,
    state: conversation.status,
    trigger: conversation.trigger,
    updated: formatDate(conversation.completedAt || conversation.startedAt),
  }));
}

function permissionRows(payload: CommandCenterPayload | null): AgentTableRow[] {
  const servers = payload?.mcpPolicy.servers ?? [];
  if (servers.length === 0) {
    return emptyRows(["surface", "state", "scopes", "permissions", "source"], "No permission surfaces visible");
  }
  return servers.map((server) => ({
    __key: `permission:${server.id}`,
    __kind: "permission",
    __id: server.id,
    surface: server.name,
    state: server.enabled ? "Enabled" : "Planned",
    scopes: server.scopes.join(", ") || "n/a",
    permissions: server.permissions.join(", ") || "none",
    source: server.id,
  }));
}

function selectableAgentRowKey(
  rows: AgentTableRow[],
  selectedKey: string | null,
): string | null {
  if (selectedKey && rows.some((row) => agentRowIsSelectable(row) && row.__key === selectedKey)) {
    return selectedKey;
  }
  return rows.find(agentRowIsSelectable)?.__key ?? null;
}

function agentRowIsSelectable(row: TableRow): row is AgentTableRow {
  return Boolean(row.__key && row.__id && row.__kind !== "empty");
}

function AgentInspector({ detail }: { detail: AgentInspectorDetail | null }) {
  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-[#8fd2ef]">
          <AgentInspectorIcon kind={detail?.kind} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {detail?.title ?? "No agent row selected"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#8f9498]">
            {detail?.subtitle ?? "Select a visible row to inspect its agent control context."}
          </p>
        </div>
      </div>
      {detail ? (
        <div className="mt-4 space-y-4">
          {detail.summary ? (
            <p className="text-sm leading-6 text-[#d7d9dc]">{detail.summary}</p>
          ) : null}
          <ContextSection title="Selection" rows={detail.rows} />
          {detail.related.length > 0 ? (
            <ContextSection title={detail.relatedTitle} rows={detail.related} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AgentInspectorIcon({ kind }: { kind: AgentRowKind | undefined }) {
  if (kind === "job") return <CalendarClock className="size-4" />;
  if (kind === "conversation") return <MessageSquare className="size-4" />;
  if (kind === "permission") return <ShieldCheck className="size-4" />;
  if (kind === "mission") return <Target className="size-4" />;
  if (kind === "agent") return <Bot className="size-4" />;
  return <ClipboardList className="size-4" />;
}

function agentInspectorDetail(
  key: string | null,
  payload: CommandCenterPayload | null,
): AgentInspectorDetail | null {
  const [kind, ...rest] = (key || "").split(":");
  const id = rest.join(":");
  if (!payload || !id) return null;
  if (kind === "agent") return agentDetail(id, payload);
  if (kind === "job") return jobDetail(id, payload);
  if (kind === "conversation") return conversationDetail(id, payload);
  if (kind === "permission") return permissionDetail(id, payload);
  if (kind === "mission") return missionDetail(id, payload);
  return null;
}

function agentDetail(
  slug: string,
  payload: CommandCenterPayload,
): AgentInspectorDetail | null {
  const agent = payload.agents.find((entry) => entry.slug === slug);
  if (!agent) return null;
  const jobs = payload.jobs.filter((job) => job.ownerAgent === agent.slug);
  const conversations = payload.conversations.filter(
    (conversation) => conversation.agentSlug === agent.slug,
  );
  const tasks = payload.tasks.filter((task) => task.toAgent === agent.slug);
  return {
    kind: "agent",
    title: agent.displayName || agent.name || agent.slug,
    subtitle: agent.role || "Agent",
    rows: [
      ["Slug", agent.slug],
      ["State", agent.active ? "Active" : "Paused"],
      ["Scope", agent.optaleScope?.scope || scopeFromPath(agent.cabinetPath)],
      ["Cabinet", agent.cabinetPath],
      ["Jobs", String(agent.jobCount)],
      ["Tasks", String(agent.taskCount)],
    ],
    relatedTitle: "Assignments",
    related: [
      ["Owned jobs", String(jobs.length)],
      ["Conversations", String(conversations.length)],
      ["Open tasks", String(tasks.length)],
      ["Pending actions", String(payload.counts.pendingActions)],
    ],
  };
}

function jobDetail(
  id: string,
  payload: CommandCenterPayload,
): AgentInspectorDetail | null {
  const job = payload.jobs.find((entry) => entry.id === id);
  if (!job) return null;
  const owner = payload.agents.find((agent) => agent.slug === job.ownerAgent);
  return {
    kind: "job",
    title: job.name,
    subtitle: job.enabled ? "Enabled schedule" : "Paused schedule",
    rows: [
      ["Job ID", job.id],
      ["Owner", job.ownerAgent || "n/a"],
      ["Schedule", job.schedule],
      ["Space", job.cabinetPath || "."],
      ["State", job.enabled ? "Enabled" : "Paused"],
    ],
    relatedTitle: "Owner",
    related: [
      ["Agent", owner?.displayName || owner?.name || owner?.slug || "n/a"],
      ["Role", owner?.role || "n/a"],
      ["Scope", owner?.optaleScope?.scope || scopeFromPath(owner?.cabinetPath || job.cabinetPath)],
    ],
  };
}

function conversationDetail(
  id: string,
  payload: CommandCenterPayload,
): AgentInspectorDetail | null {
  const conversation = payload.conversations.find((entry) => entry.id === id);
  if (!conversation) return null;
  return {
    kind: "conversation",
    title: conversation.title || conversation.id,
    subtitle: `${conversation.agentSlug} / ${conversation.trigger}`,
    rows: [
      ["Conversation ID", conversation.id],
      ["Agent", conversation.agentSlug],
      ["State", conversation.status],
      ["Trigger", conversation.trigger],
      ["Started", formatDate(conversation.startedAt)],
      ["Completed", formatDate(conversation.completedAt)],
    ],
    relatedTitle: "Runtime",
    related: [
      ["Total conversations", String(payload.counts.conversations)],
      ["Pending actions", String(payload.counts.pendingActions)],
    ],
  };
}

function permissionDetail(
  id: string,
  payload: CommandCenterPayload,
): AgentInspectorDetail | null {
  const server = payload.mcpPolicy.servers.find((entry) => entry.id === id);
  if (!server) return null;
  return {
    kind: "permission",
    title: server.name,
    subtitle: server.enabled ? "Enabled MCP surface" : "Planned MCP surface",
    rows: [
      ["Server ID", server.id],
      ["State", server.enabled ? "Enabled" : "Planned"],
      ["Scopes", server.scopes.join(", ") || "n/a"],
      ["Permissions", server.permissions.join(", ") || "none"],
      ["Mode", payload.mcpPolicy.enforcementMode],
      ["Default", payload.mcpPolicy.defaultDecision],
    ],
    relatedTitle: "Policy",
    related: [
      ["Managed", payload.mcpPolicy.commandCenterManaged ? "Yes" : "No"],
      ["Controls", String(payload.controls.length)],
      ["Operator only", String(payload.operatorOnlyControls?.length ?? 0)],
    ],
  };
}

function missionDetail(
  id: string,
  payload: CommandCenterPayload,
): AgentInspectorDetail | null {
  const details: Record<string, AgentInspectorDetail> = {
    roster: {
      kind: "mission",
      title: "Agent roster",
      subtitle: "Agent availability",
      rows: [
        ["Active", `${payload.counts.activeAgents}/${payload.counts.agents}`],
        ["Jobs", String(payload.counts.jobs)],
        ["Tasks", String(payload.counts.tasks)],
      ],
      relatedTitle: "Runtime",
      related: missionRuntimeRows(payload),
    },
    schedules: {
      kind: "mission",
      title: "Schedules",
      subtitle: "Routine execution",
      rows: [
        ["Enabled", `${payload.counts.enabledJobs}/${payload.counts.jobs}`],
        ["Agents", String(payload.counts.agents)],
        ["Conversations", String(payload.counts.conversations)],
      ],
      relatedTitle: "Runtime",
      related: missionRuntimeRows(payload),
    },
    approvals: {
      kind: "mission",
      title: "Approvals",
      subtitle: "Action queue state",
      rows: [
        ["Pending actions", String(payload.counts.pendingActions)],
        ["Tasks", String(payload.counts.tasks)],
        ["Conversations", String(payload.counts.conversations)],
      ],
      relatedTitle: "Runtime",
      related: missionRuntimeRows(payload),
    },
    "mcp-clients": {
      kind: "mission",
      title: "MCP clients",
      subtitle: "Tool client state",
      rows: [
        ["Active", `${payload.counts.activeMcpClients}/${payload.counts.mcpClients}`],
        ["Mode", payload.mcpPolicy.enforcementMode],
        ["Default", payload.mcpPolicy.defaultDecision],
      ],
      relatedTitle: "Policy",
      related: [
        ["Managed", payload.mcpPolicy.commandCenterManaged ? "Yes" : "No"],
        ["Controls", String(payload.controls.length)],
        ["Operator only", String(payload.operatorOnlyControls?.length ?? 0)],
      ],
    },
  };
  return details[id] ?? null;
}

function missionRuntimeRows(payload: CommandCenterPayload): [string, string][] {
  return [
    ["Agents", String(payload.counts.agents)],
    ["Jobs", String(payload.counts.jobs)],
    ["Tasks", String(payload.counts.tasks)],
    ["Pending actions", String(payload.counts.pendingActions)],
  ];
}

function LiveError({ message }: { message: string }) {
  return (
    <div className="border border-[#c9a86a]/30 bg-[#c9a86a]/8 px-3 py-2 text-sm text-[#d8c18c]">
      {message}
    </div>
  );
}

function loadingRows(columns: string[]): AgentTableRow[] {
  return [
    {
      __key: "empty:loading",
      __kind: "empty",
      __id: "loading",
      ...Object.fromEntries(
        columns.map((column) => [column, column === "state" ? "Loading" : "n/a"]),
      ),
    },
  ];
}

function emptyRows(columns: string[], message: string): AgentTableRow[] {
  return [
    {
      __key: `empty:${columns[0]}`,
      __kind: "empty",
      __id: "empty",
      ...Object.fromEntries(
        columns.map((column, index) => [
          column,
          index === 0 ? message : column === "state" ? "Empty" : "n/a",
        ]),
      ),
    },
  ];
}

function count(value: number | undefined): string {
  return value === undefined ? "Loading" : String(value);
}

function scopeFromPath(path: string): string {
  if (path.startsWith("personal/")) return "personal";
  if (path === ".") return "company";
  return "space";
}

function formatDate(value: string | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
