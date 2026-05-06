"use client";

import {
  Activity,
  ClipboardCheck,
  Database,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldCheck,
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

type ActionRun = {
  id: string;
  label: string;
  status: string;
  kind: string;
  action: string;
  source: string;
  agentSlug?: string;
  cabinetPath: string;
  createdAt: string;
  updatedAt?: string;
  warningCount: number;
  hardBlocked: boolean;
};

type ActionRunsPayload = {
  generatedAt: string;
  runs: ActionRun[];
  counts: {
    runs: number;
    commandRuns: number;
    proposalRuns: number;
    pendingReview: number;
    blocked: number;
    dispatched: number;
    rejected: number;
    running: number;
    completed: number;
    failed: number;
  };
};

type ActionQueue = {
  id: string;
  label: string;
  agentSlug: string;
  status: string;
  pendingCount: number;
  hardBlockedCount: number;
  softWarningCount: number;
  updatedAt?: string;
};

type ActionsPayload = {
  generatedAt: string;
  queues: ActionQueue[];
  counts: {
    actions: number;
    pendingQueues: number;
    pendingActions: number;
    hardBlockedActions: number;
  };
};

type ObservatorySummary = {
  windowHours?: number;
  runsByStatus?: Record<string, number>;
  policyByResult?: Record<string, number>;
  toolsByStatus?: Record<string, number>;
  eventsByKind?: Record<string, number>;
  ingestionJobsByStatus?: Record<string, number>;
  modelUsage?: {
    total?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    estimated_cost?: number;
    rate_limit_hits?: number;
    fallback_uses?: number;
    avg_latency_ms?: number;
  };
};

type HarnessRun = {
  id: string;
  status?: string;
  agent_id?: string | null;
  model_route_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ObservatoryDashboardPayload = {
  dashboard?: {
    summary?: ObservatorySummary;
    runs?: HarnessRun[];
  };
};

type ObservatoryRowKind =
  | "trace"
  | "local-run"
  | "approval"
  | "policy"
  | "budget"
  | "dataset"
  | "eval"
  | "empty";

type ObservatoryTableRow = TableRow & {
  __key: string;
  __kind: ObservatoryRowKind;
  __id: string;
};

export function ObservatorySurface({ subpage }: { subpage: string }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const actionRuns = useConsoleEndpoint<ActionRunsPayload>(
    "/api/optale/action-runs?limit=80",
    refreshKey,
  );
  const actions = useConsoleEndpoint<ActionsPayload>(
    "/api/optale/actions?limit=120",
    refreshKey,
  );
  const dashboard = useConsoleEndpoint<ObservatoryDashboardPayload>(
    "/api/optale/observatory/dashboard?hours=24&limit=25",
    refreshKey,
  );
  const loading = actionRuns.loading || actions.loading || dashboard.loading;
  const error = actionRuns.error || actions.error || dashboard.error;
  const columns = observatoryColumnsForSubpage(subpage);
  const rows = observatoryRowsForSubpage(
    subpage,
    actionRuns.data,
    actions.data,
    dashboard.data,
    loading,
  );
  const activeRowKey = selectableRowKey(rows, selectedRowKey);

  return (
    <SplitSurface
      eyebrow="Observatory"
      title={subpage}
      description="Trace, approval, eval, policy, budget, and dataset visibility for governed runs."
      table={
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 border border-white/10 text-[#aeb3b7] hover:bg-white/5 hover:text-white"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="Refresh Observatory"
              title="Refresh"
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
            rowKey={(row, index) => row.__key || `${row[columns[0]]}-${index}`}
            selectedRowKey={activeRowKey}
            onRowSelect={(row) => {
              if (!rowIsSelectable(row)) return;
              setSelectedRowKey(row.__key);
            }}
          />
        </div>
      }
      side={
        <div className="space-y-5">
          <ObservatoryInspector
            selectedKey={activeRowKey}
            actionRuns={actionRuns.data}
            actions={actions.data}
            dashboard={dashboard.data}
          />
          <ContextSection
            title="Run Window"
            rows={[
              ["Harness runs", count(sumValues(dashboard.data?.dashboard?.summary?.runsByStatus))],
              ["Local runs", count(actionRuns.data?.counts.runs)],
              ["Pending", count(actions.data?.counts.pendingActions)],
              ["Blocked", count(actionRuns.data?.counts.blocked)],
              ["Failed", count(actionRuns.data?.counts.failed)],
            ]}
          />
          <ContextSection
            title="Usage"
            rows={[
              ["Model calls", count(dashboard.data?.dashboard?.summary?.modelUsage?.total)],
              ["Prompt tokens", count(dashboard.data?.dashboard?.summary?.modelUsage?.prompt_tokens)],
              ["Completion tokens", count(dashboard.data?.dashboard?.summary?.modelUsage?.completion_tokens)],
              ["Estimated cost", costLabel(dashboard.data?.dashboard?.summary?.modelUsage?.estimated_cost)],
              ["Avg latency", latencyLabel(dashboard.data?.dashboard?.summary?.modelUsage?.avg_latency_ms)],
            ]}
          />
        </div>
      }
    />
  );
}

function observatoryColumnsForSubpage(subpage: string): string[] {
  const normalized = subpage.toLowerCase();
  if (normalized.includes("approval")) {
    return ["queue", "agent", "state", "pending", "blocked", "updated"];
  }
  if (normalized.includes("policy")) {
    return ["policy", "state", "count", "source", "window"];
  }
  if (normalized.includes("budget")) {
    return ["metric", "state", "value", "source", "window"];
  }
  if (normalized.includes("dataset")) {
    return ["dataset", "state", "count", "source", "window"];
  }
  if (normalized.includes("eval")) {
    return ["eval", "state", "count", "source", "window"];
  }
  return ["run", "state", "agent", "policy", "updated", "source"];
}

function observatoryRowsForSubpage(
  subpage: string,
  actionRuns: ActionRunsPayload | null,
  actions: ActionsPayload | null,
  dashboard: ObservatoryDashboardPayload | null,
  loading: boolean,
): ObservatoryTableRow[] {
  const columns = observatoryColumnsForSubpage(subpage);
  if (loading) return loadingRows(columns);
  const normalized = subpage.toLowerCase();
  if (normalized.includes("approval")) return approvalRows(actions);
  if (normalized.includes("policy")) {
    return counterRows(
      "policy",
      dashboard?.dashboard?.summary?.policyByResult,
      "Harness",
      windowLabel(dashboard),
    );
  }
  if (normalized.includes("budget")) return budgetRows(dashboard);
  if (normalized.includes("dataset")) {
    return counterRows(
      "dataset",
      dashboard?.dashboard?.summary?.ingestionJobsByStatus,
      "Harness ingestion jobs",
      windowLabel(dashboard),
    );
  }
  if (normalized.includes("eval")) return evalRows(dashboard, actionRuns);
  return traceRows(actionRuns, dashboard);
}

function traceRows(
  actionRuns: ActionRunsPayload | null,
  dashboard: ObservatoryDashboardPayload | null,
): ObservatoryTableRow[] {
  const harnessRuns = dashboard?.dashboard?.runs ?? [];
  if (harnessRuns.length > 0) {
    return harnessRuns.map((run) => ({
      __key: `trace:${run.id}`,
      __kind: "trace",
      __id: run.id,
      run: shortId(run.id),
      state: run.status || "Unknown",
      agent: shortId(run.agent_id || undefined),
      policy: "Harness",
      updated: formatDate(run.updated_at || run.created_at),
      source: "Agent Harness",
    }));
  }
  const runs = actionRuns?.runs ?? [];
  if (runs.length === 0) {
    return [emptyRow({
      key: "empty:trace",
      run: "No runs visible",
      state: "Empty",
      agent: "n/a",
      policy: "n/a",
      updated: "n/a",
      source: "n/a",
    })];
  }
  return runs.map((run) => ({
    __key: `local-run:${run.id}`,
    __kind: "local-run",
    __id: run.id,
    run: run.label || shortId(run.id),
    state: run.status,
    agent: run.agentSlug || "n/a",
    policy: run.hardBlocked ? "Review" : "Logged",
    updated: formatDate(run.updatedAt || run.createdAt),
    source: run.source,
  }));
}

function approvalRows(actions: ActionsPayload | null): ObservatoryTableRow[] {
  const queues = actions?.queues ?? [];
  if (queues.length === 0) {
    return [emptyRow({
      key: "empty:approval",
      queue: "No pending approvals",
      agent: "n/a",
      state: "Clear",
      pending: "0",
      blocked: "0",
      updated: "n/a",
    })];
  }
  return queues.map((queue) => ({
    __key: `approval:${queue.id}`,
    __kind: "approval",
    __id: queue.id,
    queue: queue.label,
    agent: queue.agentSlug,
    state: queue.status,
    pending: String(queue.pendingCount),
    blocked: String(queue.hardBlockedCount),
    updated: formatDate(queue.updatedAt),
  }));
}

function budgetRows(dashboard: ObservatoryDashboardPayload | null): ObservatoryTableRow[] {
  const usage = dashboard?.dashboard?.summary?.modelUsage;
  if (!usage) {
    return [emptyRow({
      key: "empty:budget",
      metric: "No model usage reported",
      state: "Empty",
      value: "0",
      source: "Harness",
      window: windowLabel(dashboard),
    })];
  }
  return [
    budgetMetricRow("model_calls", "Model calls", "Reported", count(usage.total), dashboard),
    budgetMetricRow("prompt_tokens", "Prompt tokens", "Reported", count(usage.prompt_tokens), dashboard),
    budgetMetricRow(
      "completion_tokens",
      "Completion tokens",
      "Reported",
      count(usage.completion_tokens),
      dashboard,
    ),
    budgetMetricRow(
      "estimated_cost",
      "Estimated cost",
      "Reported",
      costLabel(usage.estimated_cost),
      dashboard,
    ),
    budgetMetricRow(
      "rate_limit_hits",
      "Rate limit hits",
      usage.rate_limit_hits ? "Review" : "Clear",
      count(usage.rate_limit_hits),
      dashboard,
    ),
  ];
}

function evalRows(
  dashboard: ObservatoryDashboardPayload | null,
  actionRuns: ActionRunsPayload | null,
): ObservatoryTableRow[] {
  const events = dashboard?.dashboard?.summary?.eventsByKind ?? {};
  const evalCount = events.eval_run ?? events.eval ?? 0;
  if (evalCount === 0) {
    return [emptyRow({
      key: "empty:eval",
      eval: "No eval runs reported",
      state: "Empty",
      count: "0",
      source: "Harness",
      window: windowLabel(dashboard),
    })];
  }
  return [
    {
      __key: "eval:harness_eval_events",
      __kind: "eval",
      __id: "harness_eval_events",
      eval: "Harness eval events",
      state: "Reported",
      count: String(evalCount),
      source: "Harness",
      window: windowLabel(dashboard),
    },
    {
      __key: "eval:local_action_failures",
      __kind: "eval",
      __id: "local_action_failures",
      eval: "Local action failures",
      state: actionRuns?.counts.failed ? "Review" : "Clear",
      count: count(actionRuns?.counts.failed),
      source: "Console ledger",
      window: "current",
    },
  ];
}

function counterRows(
  label: string,
  counters: Record<string, number> | undefined,
  source: string,
  window: string,
): ObservatoryTableRow[] {
  const entries = Object.entries(counters ?? {});
  if (entries.length === 0) {
    return [emptyRow({
      key: `empty:${label}`,
      [label]: `No ${label} counters reported`,
      state: "Empty",
      count: "0",
      source,
      window,
    })];
  }
  return entries.map(([state, value]) => ({
    __key: `${label}:${state}`,
    __kind: label === "dataset" ? "dataset" : "policy",
    __id: state,
    [label]: state,
    state: stateLabel(state),
    count: String(value),
    source,
    window,
  }));
}

function budgetMetricRow(
  id: string,
  metric: string,
  state: string,
  value: string,
  dashboard: ObservatoryDashboardPayload | null,
): ObservatoryTableRow {
  return {
    __key: `budget:${id}`,
    __kind: "budget",
    __id: id,
    metric,
    state,
    value,
    source: "Harness",
    window: windowLabel(dashboard),
  };
}

function emptyRow(row: TableRow & { key: string }): ObservatoryTableRow {
  const { key, ...values } = row;
  return {
    __key: key,
    __kind: "empty",
    __id: "empty",
    ...values,
  };
}

function selectableRowKey(
  rows: ObservatoryTableRow[],
  selectedKey: string | null,
): string | null {
  if (selectedKey && rows.some((row) => rowIsSelectable(row) && row.__key === selectedKey)) {
    return selectedKey;
  }
  return rows.find(rowIsSelectable)?.__key ?? null;
}

function rowIsSelectable(row: TableRow): row is ObservatoryTableRow {
  return Boolean(row.__key && row.__id && row.__kind !== "empty");
}

function ObservatoryInspector({
  selectedKey,
  actionRuns,
  actions,
  dashboard,
}: {
  selectedKey: string | null;
  actionRuns: ActionRunsPayload | null;
  actions: ActionsPayload | null;
  dashboard: ObservatoryDashboardPayload | null;
}) {
  const detail = selectedKey
    ? inspectorDetailForKey(selectedKey, actionRuns, actions, dashboard)
    : null;

  return (
    <section className="border-b border-white/10 pb-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-[#8fd2ef]">
          <InspectorIcon kind={detail?.kind} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">
            {detail?.title ?? "No event selected"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#8f9498]">
            {detail?.subtitle ?? "Select a visible row to inspect the live run signal."}
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

type InspectorDetail = {
  kind: ObservatoryRowKind;
  title: string;
  subtitle: string;
  summary?: string;
  rows: [string, string][];
  relatedTitle: string;
  related: [string, string][];
};

function inspectorDetailForKey(
  key: string,
  actionRuns: ActionRunsPayload | null,
  actions: ActionsPayload | null,
  dashboard: ObservatoryDashboardPayload | null,
): InspectorDetail | null {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (!id) return null;
  if (kind === "trace") return harnessRunDetail(id, dashboard);
  if (kind === "local-run") return localRunDetail(id, actionRuns);
  if (kind === "approval") return approvalDetail(id, actions);
  if (kind === "policy") return counterDetail("policy", id, dashboard);
  if (kind === "dataset") return counterDetail("dataset", id, dashboard);
  if (kind === "budget") return budgetDetail(id, dashboard);
  if (kind === "eval") return evalDetail(id, dashboard, actionRuns);
  return null;
}

function harnessRunDetail(
  id: string,
  dashboard: ObservatoryDashboardPayload | null,
): InspectorDetail | null {
  const run = dashboard?.dashboard?.runs?.find((entry) => entry.id === id);
  if (!run) return null;
  return {
    kind: "trace",
    title: shortId(run.id),
    subtitle: "Agent Harness trace",
    rows: [
      ["Run ID", run.id],
      ["State", run.status || "Unknown"],
      ["Agent", run.agent_id || "n/a"],
      ["Model route", run.model_route_id || "n/a"],
      ["Created", formatDate(run.created_at)],
      ["Updated", formatDate(run.updated_at || run.created_at)],
    ],
    relatedTitle: "Window",
    related: [
      ["Runs", count(sumValues(dashboard?.dashboard?.summary?.runsByStatus))],
      ["Policy results", count(sumValues(dashboard?.dashboard?.summary?.policyByResult))],
      ["Events", count(sumValues(dashboard?.dashboard?.summary?.eventsByKind))],
    ],
  };
}

function localRunDetail(
  id: string,
  actionRuns: ActionRunsPayload | null,
): InspectorDetail | null {
  const run = actionRuns?.runs.find((entry) => entry.id === id);
  if (!run) return null;
  return {
    kind: "local-run",
    title: run.label || shortId(run.id),
    subtitle: `${run.kind} / ${run.source}`,
    rows: [
      ["Run ID", run.id],
      ["State", run.status],
      ["Action", run.action],
      ["Agent", run.agentSlug || "n/a"],
      ["Cabinet", run.cabinetPath],
      ["Warnings", String(run.warningCount)],
      ["Hard blocked", run.hardBlocked ? "Yes" : "No"],
      ["Created", formatDate(run.createdAt)],
      ["Updated", formatDate(run.updatedAt || run.createdAt)],
    ],
    relatedTitle: "Ledger",
    related: [
      ["Total runs", count(actionRuns?.counts.runs)],
      ["Blocked", count(actionRuns?.counts.blocked)],
      ["Failed", count(actionRuns?.counts.failed)],
    ],
  };
}

function approvalDetail(
  id: string,
  actions: ActionsPayload | null,
): InspectorDetail | null {
  const queue = actions?.queues.find((entry) => entry.id === id);
  if (!queue) return null;
  return {
    kind: "approval",
    title: queue.label,
    subtitle: `${queue.agentSlug} approval queue`,
    rows: [
      ["Queue ID", queue.id],
      ["State", queue.status],
      ["Pending", String(queue.pendingCount)],
      ["Hard blocked", String(queue.hardBlockedCount)],
      ["Warnings", String(queue.softWarningCount)],
      ["Updated", formatDate(queue.updatedAt)],
    ],
    relatedTitle: "Queues",
    related: [
      ["All actions", count(actions?.counts.actions)],
      ["Pending queues", count(actions?.counts.pendingQueues)],
      ["Pending actions", count(actions?.counts.pendingActions)],
      ["Hard blocked", count(actions?.counts.hardBlockedActions)],
    ],
  };
}

function counterDetail(
  kind: "policy" | "dataset",
  id: string,
  dashboard: ObservatoryDashboardPayload | null,
): InspectorDetail | null {
  const counters =
    kind === "policy"
      ? dashboard?.dashboard?.summary?.policyByResult
      : dashboard?.dashboard?.summary?.ingestionJobsByStatus;
  const value = counters?.[id];
  if (value === undefined) return null;
  return {
    kind,
    title: stateLabel(id),
    subtitle: kind === "policy" ? "Policy result counter" : "Dataset job counter",
    rows: [
      ["State", stateLabel(id)],
      ["Count", String(value)],
      ["Source", kind === "policy" ? "Harness policy" : "Harness ingestion jobs"],
      ["Window", windowLabel(dashboard)],
    ],
    relatedTitle: "Window Totals",
    related: Object.entries(counters ?? {}).map(([state, count]) => [
      stateLabel(state),
      String(count),
    ]),
  };
}

function budgetDetail(
  id: string,
  dashboard: ObservatoryDashboardPayload | null,
): InspectorDetail | null {
  const usage = dashboard?.dashboard?.summary?.modelUsage;
  if (!usage) return null;
  const rowsByMetric: Record<string, [string, string]> = {
    model_calls: ["Model calls", count(usage.total)],
    prompt_tokens: ["Prompt tokens", count(usage.prompt_tokens)],
    completion_tokens: ["Completion tokens", count(usage.completion_tokens)],
    estimated_cost: ["Estimated cost", costLabel(usage.estimated_cost)],
    rate_limit_hits: ["Rate limit hits", count(usage.rate_limit_hits)],
  };
  const metric = rowsByMetric[id];
  if (!metric) return null;
  return {
    kind: "budget",
    title: metric[0],
    subtitle: "Harness usage metric",
    rows: [
      ["Metric", metric[0]],
      ["Value", metric[1]],
      ["Window", windowLabel(dashboard)],
      ["Source", "Harness"],
    ],
    relatedTitle: "Usage",
    related: [
      ["Fallback uses", count(usage.fallback_uses)],
      ["Avg latency", latencyLabel(usage.avg_latency_ms)],
      ["Rate limits", count(usage.rate_limit_hits)],
    ],
  };
}

function evalDetail(
  id: string,
  dashboard: ObservatoryDashboardPayload | null,
  actionRuns: ActionRunsPayload | null,
): InspectorDetail | null {
  const events = dashboard?.dashboard?.summary?.eventsByKind ?? {};
  const evalCount = events.eval_run ?? events.eval ?? 0;
  if (id === "harness_eval_events") {
    return {
      kind: "eval",
      title: "Harness eval events",
      subtitle: "Evaluation event counter",
      rows: [
        ["Count", String(evalCount)],
        ["Window", windowLabel(dashboard)],
        ["Source", "Harness"],
      ],
      relatedTitle: "Events",
      related: Object.entries(events).slice(0, 6).map(([event, count]) => [
        stateLabel(event),
        String(count),
      ]),
    };
  }
  if (id === "local_action_failures") {
    return {
      kind: "eval",
      title: "Local action failures",
      subtitle: "Console ledger failure signal",
      rows: [
        ["Count", count(actionRuns?.counts.failed)],
        ["Window", "current"],
        ["Source", "Console ledger"],
      ],
      relatedTitle: "Runs",
      related: [
        ["Running", count(actionRuns?.counts.running)],
        ["Completed", count(actionRuns?.counts.completed)],
        ["Rejected", count(actionRuns?.counts.rejected)],
      ],
    };
  }
  return null;
}

function InspectorIcon({ kind }: { kind: ObservatoryRowKind | undefined }) {
  if (kind === "approval") return <ClipboardCheck className="size-4" />;
  if (kind === "policy") return <ShieldCheck className="size-4" />;
  if (kind === "budget") return <Gauge className="size-4" />;
  if (kind === "dataset" || kind === "eval") {
    return <Database className="size-4" />;
  }
  return <Activity className="size-4" />;
}

function LiveError({ message }: { message: string }) {
  return (
    <div className="border border-[#c9a86a]/30 bg-[#c9a86a]/8 px-3 py-2 text-sm text-[#d8c18c]">
      {message}
    </div>
  );
}

function loadingRows(columns: string[]): ObservatoryTableRow[] {
  return [
    emptyRow({
      key: "empty:loading",
      ...Object.fromEntries(
        columns.map((column) => [column, column === "state" ? "Loading" : "n/a"]),
      ),
    }),
  ];
}

function count(value: number | undefined): string {
  return value === undefined ? "Loading" : String(value);
}

function costLabel(value: number | undefined): string {
  if (value === undefined) return "Loading";
  return `$${value.toFixed(4)}`;
}

function latencyLabel(value: number | undefined): string {
  if (value === undefined) return "Loading";
  return `${Math.round(value)} ms`;
}

function shortId(value: string | undefined): string {
  if (!value) return "n/a";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function sumValues(value: Record<string, number> | undefined): number | undefined {
  if (!value) return undefined;
  return Object.values(value).reduce((total, count) => total + count, 0);
}

function windowLabel(dashboard: ObservatoryDashboardPayload | null): string {
  const hours = dashboard?.dashboard?.summary?.windowHours;
  return hours ? `${hours}h` : "24h";
}

function stateLabel(value: string): string {
  return value.replace(/_/g, " ");
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
