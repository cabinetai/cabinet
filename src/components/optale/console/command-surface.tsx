"use client";

import { useState } from "react";
import {
  Activity,
  Bookmark,
  Bot,
  ChevronDown,
  ClipboardCheck,
  History,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { cn } from "@/lib/utils";
import {
  identityRoleLabel,
  identitySourceLabel,
} from "./identity-labels";
import { useConsoleEndpoint } from "./live-endpoint";
import {
  ContextSection,
  DataTable,
  PlainStatus,
  SplitSurface,
} from "./primitives";
import type { ComposerPanel, TableRow } from "./types";

type CommandConversation = {
  id: string;
  title: string;
  agentSlug: string;
  status: string;
  trigger: string;
  startedAt: string;
  completedAt?: string;
};

type CommandCenterPayload = {
  counts: {
    conversations: number;
    pendingActions: number;
  };
  conversations: CommandConversation[];
};

type ActionRun = {
  id: string;
  label: string;
  status: string;
  source: string;
  agentSlug?: string;
  createdAt: string;
  updatedAt?: string;
};

type ActionRunsPayload = {
  runs: ActionRun[];
  counts: {
    runs: number;
    running: number;
    completed: number;
    failed: number;
    pendingReview: number;
  };
};

type HarnessRun = {
  id: string;
  status?: string;
  agent_id?: string | null;
  conversation_id?: string | null;
  model_route_id?: string | null;
  created_at?: string;
  updated_at?: string;
  input?: unknown;
};

type ObservatoryDashboardPayload = {
  dashboard?: {
    summary?: {
      windowHours?: number;
      runsByStatus?: Record<string, number>;
    };
    runs?: HarnessRun[];
  };
};

type CommandRowKind =
  | "conversation"
  | "action-run"
  | "harness-run"
  | "saved"
  | "empty";

type CommandTableRow = TableRow & {
  __key: string;
  __kind: CommandRowKind;
  __id: string;
};

type CommandInspectorDetail = {
  kind: CommandRowKind;
  title: string;
  subtitle: string;
  summary?: string;
  rows: [string, string][];
  relatedTitle: string;
  related: [string, string][];
};

export function CommandSurface({
  subpage,
  identity,
}: {
  subpage: string;
  identity: OptaleIdentitySnapshot | null;
}) {
  const [composerPanel, setComposerPanel] = useState<ComposerPanel>(null);
  const showingHome = subpage === "Home";

  if (!showingHome) {
    return <CommandRecordsSurface subpage={subpage} />;
  }

  return (
    <div className="grid min-h-full grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[calc(100vh-7rem)] flex-col">
        <section className="border-b border-white/10 px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center bg-[#b8d47a]/14 text-[#b8d47a]">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-white">
                  Optale Agent
                </h2>
                <p className="truncate text-xs text-[#aeb3b7]">
                  Governed engineering agent
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <PlainStatus value="Ready" tone="good" />
              <span className="text-[#8f9498]">Policy: enforce</span>
              <span className="text-[#8f9498]">
                Role: {identityRoleLabel(identity)}
              </span>
            </div>
          </div>
        </section>

        <section className="flex-1 space-y-4 px-4 py-5 lg:px-6">
          <div className="max-w-3xl space-y-3">
            <article className="border border-white/10 bg-[#181a1e] px-3 py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="flex size-6 items-center justify-center bg-[#b8d47a]/14 text-[#b8d47a]">
                  <Bot className="size-3.5" />
                </span>
                <span className="font-medium text-white">Optale Agent</span>
                <PlainStatus value="Idle" tone="muted" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#d7d9dc]">
                No active command in this workspace view yet.
              </p>
            </article>
            <RunEvidenceBlock />
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#15171b] px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <ComposerChip
              label="Brain"
              value="company"
              active={composerPanel === "brain"}
              onClick={() =>
                setComposerPanel((current) =>
                  current === "brain" ? null : "brain"
                )
              }
            />
            <ComposerChip
              label="Tools"
              value="gated"
              active={composerPanel === "tools"}
              onClick={() =>
                setComposerPanel((current) =>
                  current === "tools" ? null : "tools"
                )
              }
            />
            <ComposerChip
              label="Settings"
              value={identityRoleLabel(identity)}
              active={composerPanel === "settings"}
              onClick={() =>
                setComposerPanel((current) =>
                  current === "settings" ? null : "settings"
                )
              }
            />
          </div>
          {composerPanel ? (
            <ComposerDetailPanel panel={composerPanel} identity={identity} />
          ) : null}
          <div className="mt-3 flex items-end gap-2">
            <textarea
              rows={3}
              className="min-h-20 flex-1 resize-none border border-white/10 bg-[#0f1115] px-3 py-2 text-sm text-white outline-none placeholder:text-[#73787d] focus:border-[#b8d47a]/70"
              placeholder="Ask Optale Agent..."
            />
            <Button
              className="h-10 bg-[#b8d47a] text-[#141619] hover:bg-[#c5df86]"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </section>
      </div>

      <aside className="border-t border-white/10 bg-[#181a1e] p-4 xl:border-l xl:border-t-0">
        <div className="space-y-5">
          <ContextSection
            title="Active Context"
            rows={[
              ["Workspace", "Optale OS"],
              ["Identity", identitySourceLabel(identity)],
              ["Role", identityRoleLabel(identity)],
              ["Scope", "Company"],
              ["Policy", "Enforce"],
            ]}
          />
          <ContextSection
            title="Available Tools"
            rows={[
              ["Slack", "Admin managed"],
              ["Objects", "Read registry"],
              ["Brain", "Scoped retrieval"],
              ["Audit", "Run log"],
            ]}
          />
          <ContextSection
            title="Controls"
            rows={[
              ["Persona", "Settings / Meta agent"],
              ["Harness", "Settings / Provisioning"],
              ["Slack", "Settings / Integrations"],
            ]}
          />
        </div>
      </aside>
    </div>
  );
}

function CommandRecordsSurface({ subpage }: { subpage: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const isSaved = subpage.toLowerCase() === "saved";
  const commandCenter = useConsoleEndpoint<CommandCenterPayload>(
    isSaved ? null : "/api/optale/command-center?limit=80",
    refreshKey,
  );
  const actionRuns = useConsoleEndpoint<ActionRunsPayload>(
    isSaved ? null : "/api/optale/action-runs?limit=80",
    refreshKey,
  );
  const dashboard = useConsoleEndpoint<ObservatoryDashboardPayload>(
    isSaved ? null : "/api/optale/observatory/dashboard?hours=168&limit=80",
    refreshKey,
  );
  const loading = commandCenter.loading || actionRuns.loading || dashboard.loading;
  const error = commandCenter.error || actionRuns.error || dashboard.error;
  const rows = isSaved
    ? savedCommandRows()
    : commandHistoryRows(commandCenter.data, actionRuns.data, dashboard.data, loading);
  const columns = ["thread", "agent", "state", "sources", "updated"];
  const activeRowKey = selectableCommandRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Command"
      title={subpage}
      description={
        isSaved
          ? "Saved command templates will appear here once the saved-command backend is enabled."
          : "Source-backed Console and Harness command history, summarized without raw provider payloads."
      }
      table={
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 border border-white/10 text-[#aeb3b7] hover:bg-white/5 hover:text-white"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label={`Refresh Command ${subpage}`}
              title="Refresh"
              disabled={isSaved}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
          {error ? <LiveError message={error} /> : null}
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row, index) => row.__key || `${row.thread}-${index}`}
            selectedRowKey={activeRowKey}
            onRowSelect={(row) => {
              if (!commandRowIsSelectable(row)) return;
              setSelectedRowKey(row.__key);
            }}
          />
        </div>
      }
      side={
        isSaved ? (
          <div className="space-y-5">
            <CommandInspector
              detail={commandInspectorDetail(
                activeRowKey,
                commandCenter.data,
                actionRuns.data,
                dashboard.data,
              )}
            />
            <ContextSection
              title="Saved Commands"
              rows={[
                ["Backend", "Not connected"],
                ["Visible", "0"],
                ["Source", "Command templates"],
                ["Policy", "Will inherit Command"],
              ]}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <CommandInspector
              detail={commandInspectorDetail(
                activeRowKey,
                commandCenter.data,
                actionRuns.data,
                dashboard.data,
              )}
            />
            <ContextSection
              title="History Sources"
              rows={[
                ["Console conversations", count(commandCenter.data?.counts.conversations)],
                ["Console runs", count(actionRuns.data?.counts.runs)],
                ["Harness runs", count(dashboard.data?.dashboard?.runs?.length)],
                ["Pending actions", count(commandCenter.data?.counts.pendingActions)],
                ["Window", windowLabel(dashboard.data)],
              ]}
            />
            <ContextSection
              title="Run State"
              rows={[
                ["Running", count(actionRuns.data?.counts.running)],
                ["Completed", count(actionRuns.data?.counts.completed)],
                ["Failed", count(actionRuns.data?.counts.failed)],
                ["Review", count(actionRuns.data?.counts.pendingReview)],
              ]}
            />
          </div>
        )
      }
    />
  );
}

function commandHistoryRows(
  commandCenter: CommandCenterPayload | null,
  actionRuns: ActionRunsPayload | null,
  dashboard: ObservatoryDashboardPayload | null,
  loading: boolean,
): CommandTableRow[] {
  if (loading) {
    return [
      {
        __key: "empty:loading",
        __kind: "empty",
        __id: "loading",
        thread: "Loading",
        agent: "n/a",
        state: "Loading",
        sources: "n/a",
        updated: "n/a",
      },
    ];
  }

  const rows: Array<{ sortTime: number; row: CommandTableRow }> = [];
  for (const conversation of commandCenter?.conversations ?? []) {
    rows.push({
      sortTime: dateTime(conversation.completedAt || conversation.startedAt),
      row: {
        __key: `conversation:${conversation.id}`,
        __kind: "conversation",
        __id: conversation.id,
        thread: conversation.title || shortId(conversation.id),
        agent: conversation.agentSlug || "Console",
        state: conversation.status,
        sources: conversation.trigger || "Console",
        updated: formatDate(conversation.completedAt || conversation.startedAt),
      },
    });
  }
  for (const run of actionRuns?.runs ?? []) {
    rows.push({
      sortTime: dateTime(run.updatedAt || run.createdAt),
      row: {
        __key: `action-run:${run.id}`,
        __kind: "action-run",
        __id: run.id,
        thread: run.label || shortId(run.id),
        agent: run.agentSlug || "Console",
        state: run.status,
        sources: run.source,
        updated: formatDate(run.updatedAt || run.createdAt),
      },
    });
  }
  for (const run of dashboard?.dashboard?.runs ?? []) {
    rows.push({
      sortTime: dateTime(run.updated_at || run.created_at),
      row: {
        __key: `harness-run:${run.id}`,
        __kind: "harness-run",
        __id: run.id,
        thread: harnessRunLabel(run),
        agent: shortId(run.agent_id || undefined),
        state: run.status || "Unknown",
        sources: harnessRunSource(run),
        updated: formatDate(run.updated_at || run.created_at),
      },
    });
  }

  if (rows.length === 0) {
    return [
      {
        __key: "empty:history",
        __kind: "empty",
        __id: "history",
        thread: "No command runs visible",
        agent: "n/a",
        state: "Empty",
        sources: "n/a",
        updated: "n/a",
      },
    ];
  }

  return rows
    .sort((left, right) => right.sortTime - left.sortTime)
    .slice(0, 80)
    .map((entry) => entry.row);
}

function savedCommandRows(): CommandTableRow[] {
  return [
    {
      __key: "empty:saved",
      __kind: "empty",
      __id: "saved",
      thread: "No saved commands visible",
      agent: "n/a",
      state: "Not connected",
      sources: "n/a",
      updated: "n/a",
    },
  ];
}

function selectableCommandRowKey(
  rows: CommandTableRow[],
  selectedKey: string | null,
): string | null {
  if (selectedKey && rows.some((row) => commandRowIsSelectable(row) && row.__key === selectedKey)) {
    return selectedKey;
  }
  return rows.find(commandRowIsSelectable)?.__key ?? null;
}

function commandRowIsSelectable(row: TableRow): row is CommandTableRow {
  return Boolean(row.__key && row.__id && row.__kind !== "empty");
}

function CommandInspector({ detail }: { detail: CommandInspectorDetail | null }) {
  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-[#b8d47a]">
          <CommandInspectorIcon kind={detail?.kind} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {detail?.title ?? "No command selected"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#8f9498]">
            {detail?.subtitle ?? "Select a visible command row to inspect source and run context."}
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

function CommandInspectorIcon({ kind }: { kind: CommandRowKind | undefined }) {
  if (kind === "conversation") return <MessageSquare className="size-4" />;
  if (kind === "action-run") return <ClipboardCheck className="size-4" />;
  if (kind === "harness-run") return <Activity className="size-4" />;
  if (kind === "saved") return <Bookmark className="size-4" />;
  return <History className="size-4" />;
}

function commandInspectorDetail(
  key: string | null,
  commandCenter: CommandCenterPayload | null,
  actionRuns: ActionRunsPayload | null,
  dashboard: ObservatoryDashboardPayload | null,
): CommandInspectorDetail | null {
  const [kind, ...rest] = (key || "").split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "conversation") return conversationDetail(id, commandCenter);
  if (kind === "action-run") return actionRunDetail(id, actionRuns);
  if (kind === "harness-run") return harnessRunDetail(id, dashboard);
  return null;
}

function conversationDetail(
  id: string,
  commandCenter: CommandCenterPayload | null,
): CommandInspectorDetail | null {
  const conversation = commandCenter?.conversations.find((entry) => entry.id === id);
  if (!conversation) return null;
  return {
    kind: "conversation",
    title: conversation.title || shortId(conversation.id),
    subtitle: `${conversation.agentSlug || "Console"} / ${conversation.trigger}`,
    rows: [
      ["Conversation ID", conversation.id],
      ["Agent", conversation.agentSlug || "n/a"],
      ["State", conversation.status],
      ["Trigger", conversation.trigger],
      ["Started", formatDate(conversation.startedAt)],
      ["Completed", formatDate(conversation.completedAt)],
    ],
    relatedTitle: "Command Center",
    related: [
      ["Conversations", count(commandCenter?.counts.conversations)],
      ["Pending actions", count(commandCenter?.counts.pendingActions)],
    ],
  };
}

function actionRunDetail(
  id: string,
  actionRuns: ActionRunsPayload | null,
): CommandInspectorDetail | null {
  const run = actionRuns?.runs.find((entry) => entry.id === id);
  if (!run) return null;
  return {
    kind: "action-run",
    title: run.label || shortId(run.id),
    subtitle: `${run.source} / ${run.status}`,
    rows: [
      ["Run ID", run.id],
      ["Agent", run.agentSlug || "Console"],
      ["State", run.status],
      ["Source", run.source],
      ["Created", formatDate(run.createdAt)],
      ["Updated", formatDate(run.updatedAt || run.createdAt)],
    ],
    relatedTitle: "Run State",
    related: [
      ["Total runs", count(actionRuns?.counts.runs)],
      ["Running", count(actionRuns?.counts.running)],
      ["Completed", count(actionRuns?.counts.completed)],
      ["Failed", count(actionRuns?.counts.failed)],
      ["Review", count(actionRuns?.counts.pendingReview)],
    ],
  };
}

function harnessRunDetail(
  id: string,
  dashboard: ObservatoryDashboardPayload | null,
): CommandInspectorDetail | null {
  const run = dashboard?.dashboard?.runs?.find((entry) => entry.id === id);
  if (!run) return null;
  return {
    kind: "harness-run",
    title: harnessRunLabel(run),
    subtitle: `${harnessRunSource(run)} / ${run.status || "Unknown"}`,
    rows: [
      ["Run ID", run.id],
      ["Agent", run.agent_id || "n/a"],
      ["Conversation", run.conversation_id || "n/a"],
      ["Model route", run.model_route_id || "n/a"],
      ["State", run.status || "Unknown"],
      ["Created", formatDate(run.created_at)],
      ["Updated", formatDate(run.updated_at || run.created_at)],
    ],
    relatedTitle: "Harness Window",
    related: [
      ["Runs", count(sumValues(dashboard?.dashboard?.summary?.runsByStatus))],
      ["Window", windowLabel(dashboard)],
      ["Input source", inputSource(run.input) || "n/a"],
    ],
  };
}

function LiveError({ message }: { message: string }) {
  return (
    <div className="border border-[#c9a86a]/30 bg-[#c9a86a]/8 px-3 py-2 text-sm text-[#d8c18c]">
      {message}
    </div>
  );
}

function RunEvidenceBlock() {
  return (
    <div className="max-w-3xl border border-white/10 bg-[#101217]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-white">
          <Wrench className="size-3.5 text-[#c9a86a]" />
          Run Evidence
        </span>
        <PlainStatus value="Idle" tone="muted" />
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-[12px] leading-5 text-[#aeb3b7]">
        {`No tool calls have run in this view yet.
Evidence, source links, approvals, and audit IDs appear here after a governed action.`}
      </pre>
    </div>
  );
}

function harnessRunLabel(run: HarnessRun): string {
  const source = inputSource(run.input);
  if (source === "slack") return "Slack command";
  if (source) return `${capitalize(source)} command`;
  if (run.conversation_id) return "Harness conversation";
  return "Harness run";
}

function harnessRunSource(run: HarnessRun): string {
  const source = inputSource(run.input);
  if (source === "slack") return "Slack / Harness";
  if (source) return `${capitalize(source)} / Harness`;
  return "Agent Harness";
}

function inputSource(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = (input as Record<string, unknown>).source;
  return typeof source === "string" && source.trim()
    ? source.trim().toLowerCase()
    : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function count(value: number | undefined): string {
  return value === undefined ? "Loading" : String(value);
}

function windowLabel(payload: ObservatoryDashboardPayload | null): string {
  const hours = payload?.dashboard?.summary?.windowHours;
  return hours ? `${hours}h` : "168h";
}

function sumValues(value: Record<string, number> | undefined): number | undefined {
  if (!value) return undefined;
  return Object.values(value).reduce((total, entry) => total + entry, 0);
}

function shortId(value: string | undefined): string {
  if (!value) return "n/a";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function dateTime(value: string | undefined): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function ComposerChip({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 border px-2 text-xs transition-colors",
        active
          ? "border-[#b8d47a]/50 bg-[#b8d47a]/12 text-white"
          : "border-white/10 text-[#aeb3b7] hover:bg-white/[0.05] hover:text-white",
      )}
    >
      {label}
      <span className="text-[#8f9498]">{value}</span>
      <ChevronDown className="size-3" />
    </button>
  );
}

function ComposerDetailPanel({
  panel,
  identity,
}: {
  panel: Exclude<ComposerPanel, null>;
  identity: OptaleIdentitySnapshot | null;
}) {
  const rows = {
    brain: [
      ["Default scope", "Company Brain"],
      ["Personal lane", "User scoped"],
      ["Retrieval", "Policy scoped"],
    ],
    tools: [
      ["Slack", "Admin managed"],
      ["Objects", "Read registry"],
      ["Audit", "Record run"],
    ],
    settings: [
      ["Role", identityRoleLabel(identity)],
      ["Identity", identitySourceLabel(identity)],
      ["Policy", "enforce"],
    ],
  }[panel];

  return (
    <div className="mt-2 grid gap-2 border border-white/10 bg-[#101217] p-3 text-xs text-[#aeb3b7] sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className="font-medium text-white">{label}</div>
          <div className="mt-1">{value}</div>
        </div>
      ))}
    </div>
  );
}
