"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Command,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { OptaleCommandInspectorPanel as InspectorPanel } from "@/components/optale/command-inspector-panel";
import type {
  OptaleActionCategory,
  OptaleActionDefinition,
  OptaleActionKind,
  OptaleActionQueueRecord,
  OptaleActionRegistry,
  OptaleActionRisk,
  OptaleActionStatus,
} from "@/lib/optale/action-registry";
import type {
  OptaleActionRunLedger,
  OptaleActionRunRecord,
  OptaleActionRunStatus,
} from "@/lib/optale/action-run-ledger";
import type {
  OptalePolicyDecisionLog,
  OptalePolicyDecisionOutcome,
  OptalePolicyDecisionRecord,
} from "@/lib/optale/policy-decision-log";
import type {
  OptaleLineageEdgeKind,
  OptaleLineageEdgeRecord,
  OptaleLineageEdgeTable,
} from "@/lib/optale/lineage-edge-table";
import type {
  OptaleAuditEventLog,
  OptaleAuditEventRecord,
  OptaleAuditEventSeverity,
  OptaleAuditEventSource,
} from "@/lib/optale/audit-event-log";

const KIND_LABELS: Record<OptaleActionKind, string> = {
  command: "Command",
  agent_proposal: "Proposal",
};

const CATEGORY_LABELS: Record<OptaleActionCategory, string> = {
  execution: "Execution",
  delegation: "Delegation",
  scheduling: "Scheduling",
  governance: "Governance",
  review: "Review",
};

const FILTERS: Array<{
  id: "all" | OptaleActionKind | OptaleActionCategory;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "command", label: "Command" },
  { id: "agent_proposal", label: "Proposals" },
  { id: "review", label: "Review" },
  { id: "scheduling", label: "Scheduling" },
  { id: "governance", label: "Governance" },
];

type OptaleCommandView = "actions" | "runs" | "policy" | "lineage" | "audit";

const COMMAND_VIEW_LABELS: Record<OptaleCommandView, string> = {
  actions: "Actions",
  runs: "Runs",
  policy: "Policy",
  lineage: "Lineage",
  audit: "Audit",
};

const COMMAND_VIEW_SEARCH_PLACEHOLDERS: Record<OptaleCommandView, string> = {
  actions: "Search actions and queues",
  runs: "Search runs",
  policy: "Search policy decisions",
  lineage: "Search lineage edges",
  audit: "Search audit events",
};

function commandViewFromSlug(slug?: string): OptaleCommandView {
  if (
    slug === "runs" ||
    slug === "policy" ||
    slug === "lineage" ||
    slug === "audit"
  ) {
    return slug;
  }
  return "actions";
}

const LINEAGE_EDGE_KIND_LABELS: Record<OptaleLineageEdgeKind, string> = {
  produces_run: "Produces Run",
  invokes: "Invokes",
  produces_decision: "Decision",
  targets_agent: "Targets Agent",
  created_child_run: "Child Run",
  created_job: "Created Job",
};

const AUDIT_SOURCE_LABELS: Record<OptaleAuditEventSource, string> = {
  action_run_ledger: "Run Ledger",
  policy_decision_log: "Policy Decisions",
  lineage_edge_table: "Lineage Edges",
};

function ActionIcon({
  action,
  className,
}: {
  action: OptaleActionDefinition;
  className?: string;
}) {
  if (action.category === "scheduling") {
    return <CalendarClock className={className} />;
  }
  if (action.category === "review")
    return <ShieldCheck className={className} />;
  if (action.category === "delegation") {
    return <GitBranch className={className} />;
  }
  if (action.category === "execution") return <Play className={className} />;
  return <Command className={className} />;
}

function riskTone(risk: OptaleActionRisk): string {
  if (risk === "destructive") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (risk === "mutation") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function statusTone(status: OptaleActionStatus): string {
  if (status === "unavailable") {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-primary/25 bg-primary/10 text-primary";
}

function runStatusTone(status: OptaleActionRunStatus): string {
  if (status === "blocked" || status === "rejected" || status === "failed") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "pending_review" || status === "running") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "completed" || status === "dispatched") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function policyOutcomeTone(outcome: OptalePolicyDecisionOutcome): string {
  if (outcome === "deny") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (outcome === "needs_review") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (outcome === "allow") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

function auditSeverityTone(severity: OptaleAuditEventSeverity): string {
  if (severity === "error") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (severity === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function matchesAction(
  action: OptaleActionDefinition,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    action.id,
    action.kind,
    action.action,
    action.label,
    action.description,
    action.category,
    action.risk,
    action.status,
    action.source,
    action.executionPath,
    ...action.inputs.map((input) => input.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesQueue(queue: OptaleActionQueueRecord, search: string): boolean {
  if (!search) return true;
  const haystack = [
    queue.id,
    queue.conversationId,
    queue.label,
    queue.agentSlug,
    queue.status,
    queue.cabinetPath,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesRun(run: OptaleActionRunRecord, search: string): boolean {
  if (!search) return true;
  const haystack = [
    run.id,
    run.kind,
    run.action,
    run.actionId,
    run.label,
    run.status,
    run.source,
    run.cabinetPath,
    run.conversationId,
    run.agentSlug,
    ...run.evidence.flatMap((item) => [item.label, String(item.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesPolicyDecision(
  decision: OptalePolicyDecisionRecord,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    decision.id,
    decision.subjectId,
    decision.action,
    decision.actionId,
    decision.outcome,
    decision.reasonCode,
    decision.explanation,
    decision.actor,
    decision.cabinetPath,
    decision.conversationId,
    ...decision.evidence.flatMap((item) => [item.label, String(item.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesLineageEdge(
  edge: OptaleLineageEdgeRecord,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    edge.id,
    edge.kind,
    edge.cabinetPath,
    edge.runId,
    edge.policyDecisionId,
    edge.source.kind,
    edge.source.id,
    edge.source.label,
    edge.target.kind,
    edge.target.id,
    edge.target.label,
    ...edge.evidence.flatMap((item) => [item.label, String(item.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchesAuditEvent(
  event: OptaleAuditEventRecord,
  search: string,
): boolean {
  if (!search) return true;
  const haystack = [
    event.id,
    event.kind,
    event.source,
    event.severity,
    event.subjectType,
    event.subjectId,
    event.action,
    event.actor,
    event.cabinetPath,
    event.conversationId,
    event.summary,
    ...event.evidence.flatMap((item) => [item.label, String(item.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function formatGeneratedAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OptaleActionRegistryWorkspace({
  cabinetPath,
}: {
  cabinetPath: string;
}) {
  const [registry, setRegistry] = useState<OptaleActionRegistry | null>(null);
  const [ledger, setLedger] = useState<OptaleActionRunLedger | null>(null);
  const [policyLog, setPolicyLog] =
    useState<OptalePolicyDecisionLog | null>(null);
  const [lineage, setLineage] = useState<OptaleLineageEdgeTable | null>(null);
  const [auditLog, setAuditLog] = useState<OptaleAuditEventLog | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | OptaleActionKind | OptaleActionCategory
  >("all");
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const [search, setSearch] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedPolicyDecisionId, setSelectedPolicyDecisionId] = useState<
    string | null
  >(null);
  const [selectedLineageEdgeId, setSelectedLineageEdgeId] = useState<
    string | null
  >(null);
  const [selectedAuditEventId, setSelectedAuditEventId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeView = commandViewFromSlug(
    section.type === "actions" ? section.slug : undefined,
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        cabinetPath,
        visibilityMode: "all",
        limit: "300",
      });
      const [
        registryResponse,
        ledgerResponse,
        policyResponse,
        lineageResponse,
        auditResponse,
      ] =
        await Promise.all([
          fetch(`/api/optale/actions?${params.toString()}`),
          fetch(`/api/optale/action-runs?${params.toString()}`),
          fetch(`/api/optale/policy-decisions?${params.toString()}`),
          fetch(`/api/optale/lineage-edges?${params.toString()}`),
          fetch(`/api/optale/audit-events?${params.toString()}`),
        ]);
      if (!registryResponse.ok) {
        throw new Error(
          `Action registry fetch failed: ${registryResponse.status}`,
        );
      }
      if (!ledgerResponse.ok) {
        throw new Error(
          `Action run ledger fetch failed: ${ledgerResponse.status}`,
        );
      }
      if (!policyResponse.ok) {
        throw new Error(
          `Policy decision log fetch failed: ${policyResponse.status}`,
        );
      }
      if (!lineageResponse.ok) {
        throw new Error(
          `Lineage edge table fetch failed: ${lineageResponse.status}`,
        );
      }
      if (!auditResponse.ok) {
        throw new Error(`Audit event log fetch failed: ${auditResponse.status}`);
      }
      setRegistry((await registryResponse.json()) as OptaleActionRegistry);
      setLedger((await ledgerResponse.json()) as OptaleActionRunLedger);
      setPolicyLog((await policyResponse.json()) as OptalePolicyDecisionLog);
      setLineage((await lineageResponse.json()) as OptaleLineageEdgeTable);
      setAuditLog((await auditResponse.json()) as OptaleAuditEventLog);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Action registry fetch failed",
      );
    } finally {
      setLoading(false);
    }
  }, [cabinetPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredActions = useMemo(() => {
    const actions = registry?.actions || [];
    const trimmedSearch = search.trim();
    return actions.filter((action) => {
      const filterMatches =
        activeFilter === "all" ||
        action.kind === activeFilter ||
        action.category === activeFilter;
      return filterMatches && matchesAction(action, trimmedSearch);
    });
  }, [activeFilter, registry?.actions, search]);

  const filteredQueues = useMemo(() => {
    const trimmedSearch = search.trim();
    return (registry?.queues || []).filter((queue) =>
      matchesQueue(queue, trimmedSearch),
    );
  }, [registry?.queues, search]);

  const filteredRuns = useMemo(() => {
    const trimmedSearch = search.trim();
    return (ledger?.runs || []).filter((run) => matchesRun(run, trimmedSearch));
  }, [ledger?.runs, search]);

  const filteredPolicyDecisions = useMemo(() => {
    const trimmedSearch = search.trim();
    return (policyLog?.decisions || []).filter((decision) =>
      matchesPolicyDecision(decision, trimmedSearch),
    );
  }, [policyLog?.decisions, search]);

  const filteredLineageEdges = useMemo(() => {
    const trimmedSearch = search.trim();
    return (lineage?.edges || []).filter((edge) =>
      matchesLineageEdge(edge, trimmedSearch),
    );
  }, [lineage?.edges, search]);

  const filteredAuditEvents = useMemo(() => {
    const trimmedSearch = search.trim();
    return (auditLog?.events || []).filter((event) =>
      matchesAuditEvent(event, trimmedSearch),
    );
  }, [auditLog?.events, search]);

  const selectedRun = useMemo(
    () =>
      filteredRuns.find((run) => run.id === selectedRunId) ||
      filteredRuns[0] ||
      null,
    [filteredRuns, selectedRunId],
  );

  const selectedPolicyDecision = useMemo(
    () =>
      filteredPolicyDecisions.find(
        (decision) => decision.id === selectedPolicyDecisionId,
      ) ||
      filteredPolicyDecisions[0] ||
      null,
    [filteredPolicyDecisions, selectedPolicyDecisionId],
  );

  const selectedLineageEdge = useMemo(
    () =>
      filteredLineageEdges.find((edge) => edge.id === selectedLineageEdgeId) ||
      filteredLineageEdges[0] ||
      null,
    [filteredLineageEdges, selectedLineageEdgeId],
  );

  const selectedAuditEvent = useMemo(
    () =>
      filteredAuditEvents.find((event) => event.id === selectedAuditEventId) ||
      filteredAuditEvents[0] ||
      null,
    [filteredAuditEvents, selectedAuditEventId],
  );

  const futureSurfaceCount = useMemo(() => {
    const summary =
      auditLog?.operationalSpine ||
      lineage?.operationalSpine ||
      policyLog?.operationalSpine ||
      ledger?.operationalSpine ||
      registry?.operationalSpine;
    return summary ? Object.keys(summary.futureSurfaces).length : 0;
  }, [
    auditLog?.operationalSpine,
    ledger?.operationalSpine,
    lineage?.operationalSpine,
    policyLog?.operationalSpine,
    registry?.operationalSpine,
  ]);

  const commandViews = useMemo(
    () =>
      [
        {
          id: "actions",
          count:
            (registry?.counts.actions ?? 0) +
            (registry?.counts.pendingQueues ?? 0),
        },
        { id: "runs", count: ledger?.counts.runs ?? 0 },
        { id: "policy", count: policyLog?.counts.decisions ?? 0 },
        { id: "lineage", count: lineage?.counts.edges ?? 0 },
        { id: "audit", count: auditLog?.counts.events ?? 0 },
      ] satisfies Array<{ id: OptaleCommandView; count: number }>,
    [
      auditLog?.counts.events,
      ledger?.counts.runs,
      lineage?.counts.edges,
      policyLog?.counts.decisions,
      registry?.counts.actions,
      registry?.counts.pendingQueues,
    ],
  );

  const setCommandView = useCallback(
    (view: OptaleCommandView) => {
      setSection({
        type: "actions",
        cabinetPath,
        slug: view === "actions" ? undefined : view,
      });
    },
    [cabinetPath, setSection],
  );

  return (
    <main className="flex min-h-full flex-col bg-background">
      <section className="border-b border-border/70 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
              <Command className="size-3.5" />
              Optale Command
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">
              Action Registry
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Command actions, agent proposal types, and pending review queues.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {registry?.generatedAt && (
              <span className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
                {formatGeneratedAt(registry.generatedAt)}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70 px-6 py-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Actions</div>
              <div className="text-lg font-semibold text-foreground">
                {registry?.counts.actions ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Queues</div>
              <div className="text-lg font-semibold text-foreground">
                {registry?.counts.pendingQueues ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Runs</div>
              <div className="text-lg font-semibold text-foreground">
                {ledger?.counts.runs ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Policy</div>
              <div className="text-lg font-semibold text-foreground">
                {policyLog?.counts.decisions ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Lineage</div>
              <div className="text-lg font-semibold text-foreground">
                {lineage?.counts.edges ?? 0}
              </div>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Audit</div>
              <div className="text-lg font-semibold text-foreground">
                {auditLog?.counts.events ?? 0}
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={COMMAND_VIEW_SEARCH_PLACEHOLDERS[activeView]}
              className="h-9 pl-8"
            />
          </div>
        </div>
        {activeView === "actions" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activeFilter === filter.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="border-b border-border/70 px-6 py-4">
        <div className="mb-3 flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-normal text-foreground">
            Operational Spine
          </h2>
          <p className="text-xs text-muted-foreground">
            Read-model chain for governed actions, decisions, lineage, and audit
            trail.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {[
            {
              label: "Registry",
              value: registry?.operationalSpine.bindingCount ?? 0,
              detail: "actions + queues",
              tone: "border-border bg-card text-foreground",
            },
            {
              label: "Runs",
              value: ledger?.operationalSpine.bindingCount ?? 0,
              detail: "commands + proposals",
              tone: "border-primary/25 bg-primary/10 text-primary",
            },
            {
              label: "Policy",
              value:
                policyLog?.operationalSpine.capabilities.policy_decision
                  .active ?? 0,
              detail: "active decisions",
              tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            },
            {
              label: "Lineage",
              value:
                lineage?.operationalSpine.capabilities.lineage_edge.active ??
                0,
              detail: "active edges",
              tone: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            },
            {
              label: "Audit",
              value:
                auditLog?.operationalSpine.capabilities.audit_event.active ??
                0,
              detail: "active events",
              tone: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            },
            {
              label: "Future",
              value: futureSurfaceCount,
              detail: "reserved surfaces",
              tone: "border-border bg-muted text-muted-foreground",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-muted-foreground">
                  {item.label}
                </div>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                    item.tone,
                  )}
                >
                  {item.detail}
                </span>
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border/70 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {commandViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setCommandView(view.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                activeView === view.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{COMMAND_VIEW_LABELS[view.id]}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px]",
                  activeView === view.id
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {view.count}
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeView === "actions" && (
        <>
          <section className="grid gap-3 px-6 py-5 xl:grid-cols-2">
        {loading && !registry ? (
          <div className="col-span-full flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading actions
          </div>
        ) : filteredActions.length === 0 ? (
          <div className="col-span-full flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No matching actions.
          </div>
        ) : (
          filteredActions.map((action) => (
            <article
              key={action.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <ActionIcon action={action} className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-normal text-foreground">
                        {action.label}
                      </h2>
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {KIND_LABELS[action.kind]}
                      </span>
                      <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {CATEGORY_LABELS[action.category]}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      statusTone(action.status),
                    )}
                  >
                    {action.status}
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                      riskTone(action.risk),
                    )}
                  >
                    {action.risk}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="size-3" />
                {action.executionPath}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {action.inputs.map((input) => (
                  <span
                    key={`${action.id}:${input.name}`}
                    className="rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {input.name}
                    {input.required ? (
                      <span className="text-foreground/80"> required</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </article>
          ))
        )}
          </section>

          <section className="border-t border-border/70 px-6 py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Review Queues
            </h2>
            <p className="text-xs text-muted-foreground">
              Conversations with pending agent-proposed actions.
            </p>
          </div>
        </div>
        {filteredQueues.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No pending action queues.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredQueues.map((queue) => (
              <a
                key={queue.id}
                href={queue.href}
                className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                      <ClipboardList className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {queue.label}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {queue.agentSlug} · {queue.cabinetPath}
                      </p>
                    </div>
                  </div>
                  {queue.hardBlockedCount > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                      <AlertTriangle className="size-3" />
                      {queue.hardBlockedCount} blocked
                    </span>
                  ) : (
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      review
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-border/70 bg-background px-2 py-1">
                    <div className="text-[10px] text-muted-foreground">
                      Pending
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {queue.pendingCount}
                    </div>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background px-2 py-1">
                    <div className="text-[10px] text-muted-foreground">
                      Soft Warnings
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {queue.softWarningCount}
                    </div>
                  </div>
                  <div className="rounded-md border border-border/70 bg-background px-2 py-1">
                    <div className="text-[10px] text-muted-foreground">
                      Status
                    </div>
                    <div className="truncate text-sm font-semibold text-foreground">
                      {queue.status}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
          </section>
        </>
      )}

      {activeView === "runs" && (
        <section className="px-6 py-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Run Ledger
            </h2>
            <p className="text-xs text-muted-foreground">
              Read-only evidence for command starts, pending proposals, and
              dispatched or rejected agent actions.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              ["Runs", ledger?.counts.runs ?? 0],
              ["Pending", ledger?.counts.pendingReview ?? 0],
              ["Blocked", ledger?.counts.blocked ?? 0],
              ["Dispatched", ledger?.counts.dispatched ?? 0],
              ["Rejected", ledger?.counts.rejected ?? 0],
              ["Running", ledger?.counts.running ?? 0],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="text-[10px] text-muted-foreground">
                  {label}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading && !ledger ? (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading run ledger
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No action runs match the current search.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <div className="grid min-w-[760px] grid-cols-[minmax(180px,1.3fr)_120px_120px_minmax(160px,1fr)_120px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                <div>Action</div>
                <div>Status</div>
                <div>Kind</div>
                <div>Evidence</div>
                <div>Updated</div>
              </div>
              <div className="divide-y divide-border">
                {filteredRuns.slice(0, 25).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    className={cn(
                      "grid w-full min-w-[760px] grid-cols-[minmax(180px,1.3fr)_120px_120px_minmax(160px,1fr)_120px] gap-3 px-3 py-3 text-left text-xs transition-colors",
                      selectedRun?.id === run.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {run.label}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {run.agentSlug || "command"} · {run.cabinetPath}
                      </div>
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          runStatusTone(run.status),
                        )}
                      >
                        {run.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {run.kind === "command" ? "Command" : "Proposal"}
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {run.evidence
                        .slice(0, 2)
                        .map((item) => `${item.label}: ${item.value}`)
                        .join(" · ")}
                    </div>
                    <div className="text-muted-foreground">
                      {formatGeneratedAt(run.updatedAt || run.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selectedRun ? (
              <InspectorPanel
                title={selectedRun.label}
                subtitle={`${selectedRun.agentSlug || "command-center"} · ${selectedRun.cabinetPath}`}
                badge={{
                  label: selectedRun.status.replace("_", " "),
                  tone: runStatusTone(selectedRun.status),
                }}
                href={selectedRun.href}
                fields={[
                  { label: "Run ID", value: selectedRun.id },
                  { label: "Action", value: String(selectedRun.action) },
                  { label: "Action ID", value: selectedRun.actionId },
                  { label: "Kind", value: selectedRun.kind },
                  { label: "Source", value: selectedRun.source },
                  { label: "Conversation", value: selectedRun.conversationId },
                  { label: "Created", value: selectedRun.createdAt },
                  { label: "Updated", value: selectedRun.updatedAt },
                  { label: "Warnings", value: selectedRun.warningCount },
                  { label: "Hard Blocked", value: selectedRun.hardBlocked },
                ]}
                evidence={selectedRun.evidence}
                spine={selectedRun.operationalSpine}
              />
            ) : null}
          </div>
        )}
        </section>
      )}

      {activeView === "policy" && (
        <section className="px-6 py-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Policy Decisions
            </h2>
            <p className="text-xs text-muted-foreground">
              Reason-coded allow, deny, and review outcomes for the current
              action runs.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Allow", policyLog?.counts.allow ?? 0],
              ["Review", policyLog?.counts.needsReview ?? 0],
              ["Deny", policyLog?.counts.deny ?? 0],
              ["Unevaluated", policyLog?.counts.notEvaluated ?? 0],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="text-[10px] text-muted-foreground">
                  {label}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading && !policyLog ? (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading policy decisions
          </div>
        ) : filteredPolicyDecisions.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No policy decisions match the current search.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <div className="grid min-w-[760px] grid-cols-[120px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_120px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                <div>Outcome</div>
                <div>Action</div>
                <div>Reason</div>
                <div>Explanation</div>
                <div>Evaluated</div>
              </div>
              <div className="divide-y divide-border">
                {filteredPolicyDecisions.slice(0, 25).map((decision) => (
                  <button
                    key={decision.id}
                    type="button"
                    onClick={() => setSelectedPolicyDecisionId(decision.id)}
                    className={cn(
                      "grid w-full min-w-[760px] grid-cols-[120px_minmax(180px,1fr)_180px_minmax(220px,1.2fr)_120px] gap-3 px-3 py-3 text-left text-xs transition-colors",
                      selectedPolicyDecision?.id === decision.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          policyOutcomeTone(decision.outcome),
                        )}
                      >
                        {decision.outcome.replace("_", " ")}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {decision.action}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {decision.actor} · {decision.cabinetPath}
                      </div>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {decision.reasonCode.replaceAll("_", " ")}
                    </div>
                    <div className="line-clamp-2 text-muted-foreground">
                      {decision.explanation}
                    </div>
                    <div className="text-muted-foreground">
                      {formatGeneratedAt(decision.evaluatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selectedPolicyDecision ? (
              <InspectorPanel
                title={String(selectedPolicyDecision.action)}
                subtitle={`${selectedPolicyDecision.actor} · ${selectedPolicyDecision.cabinetPath}`}
                badge={{
                  label: selectedPolicyDecision.outcome.replace("_", " "),
                  tone: policyOutcomeTone(selectedPolicyDecision.outcome),
                }}
                href={selectedPolicyDecision.href}
                fields={[
                  { label: "Decision ID", value: selectedPolicyDecision.id },
                  { label: "Subject Run", value: selectedPolicyDecision.subjectId },
                  { label: "Action ID", value: selectedPolicyDecision.actionId },
                  { label: "Reason", value: selectedPolicyDecision.reasonCode },
                  { label: "Conversation", value: selectedPolicyDecision.conversationId },
                  { label: "Evaluated", value: selectedPolicyDecision.evaluatedAt },
                  { label: "Explanation", value: selectedPolicyDecision.explanation },
                ]}
                evidence={selectedPolicyDecision.evidence}
                spine={selectedPolicyDecision.operationalSpine}
              />
            ) : null}
          </div>
        )}
        </section>
      )}

      {activeView === "lineage" && (
        <section className="px-6 py-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Lineage Edges
            </h2>
            <p className="text-xs text-muted-foreground">
              Read-only graph edges linking conversations, actions, decisions,
              agents, and produced work.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Edges", lineage?.counts.edges ?? 0],
              ["Invokes", lineage?.counts.byKind.invokes ?? 0],
              ["Decisions", lineage?.counts.byKind.produces_decision ?? 0],
              ["Targets", lineage?.counts.byKind.targets_agent ?? 0],
              [
                "Outputs",
                (lineage?.counts.byKind.created_child_run ?? 0) +
                  (lineage?.counts.byKind.created_job ?? 0),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="text-[10px] text-muted-foreground">
                  {label}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading && !lineage ? (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading lineage edges
          </div>
        ) : filteredLineageEdges.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No lineage edges match the current search.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <div className="grid min-w-[840px] grid-cols-[140px_minmax(190px,1fr)_minmax(190px,1fr)_minmax(180px,1fr)_120px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                <div>Kind</div>
                <div>Source</div>
                <div>Target</div>
                <div>Evidence</div>
                <div>Created</div>
              </div>
              <div className="divide-y divide-border">
                {filteredLineageEdges.slice(0, 25).map((edge) => (
                  <button
                    key={edge.id}
                    type="button"
                    onClick={() => setSelectedLineageEdgeId(edge.id)}
                    className={cn(
                      "grid w-full min-w-[840px] grid-cols-[140px_minmax(190px,1fr)_minmax(190px,1fr)_minmax(180px,1fr)_120px] gap-3 px-3 py-3 text-left text-xs transition-colors",
                      selectedLineageEdge?.id === edge.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div>
                      <span className="inline-flex rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {LINEAGE_EDGE_KIND_LABELS[edge.kind]}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {edge.source.label}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {edge.source.kind.replaceAll("_", " ")} ·{" "}
                        {edge.cabinetPath}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {edge.target.label}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {edge.target.kind.replaceAll("_", " ")} ·{" "}
                        {edge.target.cabinetPath || edge.cabinetPath}
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {edge.evidence
                        .slice(0, 2)
                        .map((item) => `${item.label}: ${item.value}`)
                        .join(" · ")}
                    </div>
                    <div className="text-muted-foreground">
                      {formatGeneratedAt(edge.createdAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selectedLineageEdge ? (
              <InspectorPanel
                title={`${selectedLineageEdge.source.label} -> ${selectedLineageEdge.target.label}`}
                subtitle={`${selectedLineageEdge.source.kind.replaceAll("_", " ")} to ${selectedLineageEdge.target.kind.replaceAll("_", " ")}`}
                badge={{
                  label: LINEAGE_EDGE_KIND_LABELS[selectedLineageEdge.kind],
                  tone: "border-primary/25 bg-primary/10 text-primary",
                }}
                href={
                  selectedLineageEdge.target.href ||
                  selectedLineageEdge.source.href
                }
                fields={[
                  { label: "Edge ID", value: selectedLineageEdge.id },
                  { label: "Kind", value: selectedLineageEdge.kind },
                  { label: "Source ID", value: selectedLineageEdge.source.id },
                  { label: "Target ID", value: selectedLineageEdge.target.id },
                  { label: "Cabinet", value: selectedLineageEdge.cabinetPath },
                  { label: "Run ID", value: selectedLineageEdge.runId },
                  {
                    label: "Policy Decision",
                    value: selectedLineageEdge.policyDecisionId,
                  },
                  { label: "Created", value: selectedLineageEdge.createdAt },
                ]}
                evidence={selectedLineageEdge.evidence}
                spine={selectedLineageEdge.operationalSpine}
              />
            ) : null}
          </div>
        )}
        </section>
      )}

      {activeView === "audit" && (
        <section className="px-6 py-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Audit Events
            </h2>
            <p className="text-xs text-muted-foreground">
              Normalized audit trail derived from runs, decisions, and lineage
              projections.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {[
              ["Events", auditLog?.counts.events ?? 0],
              ["Info", auditLog?.counts.info ?? 0],
              ["Warnings", auditLog?.counts.warning ?? 0],
              ["Errors", auditLog?.counts.error ?? 0],
              ["Runs", auditLog?.counts.bySource.action_run_ledger ?? 0],
              ["Decisions", auditLog?.counts.bySource.policy_decision_log ?? 0],
              ["Lineage", auditLog?.counts.bySource.lineage_edge_table ?? 0],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="text-[10px] text-muted-foreground">
                  {label}
                </div>
                <div className="text-sm font-semibold text-foreground">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {loading && !auditLog ? (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading audit events
          </div>
        ) : filteredAuditEvents.length === 0 ? (
          <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No audit events match the current search.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <div className="grid min-w-[920px] grid-cols-[110px_140px_minmax(190px,1fr)_minmax(220px,1.3fr)_minmax(180px,1fr)_120px] border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                <div>Severity</div>
                <div>Source</div>
                <div>Subject</div>
                <div>Summary</div>
                <div>Evidence</div>
                <div>Occurred</div>
              </div>
              <div className="divide-y divide-border">
                {filteredAuditEvents.slice(0, 25).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedAuditEventId(event.id)}
                    className={cn(
                      "grid w-full min-w-[920px] grid-cols-[110px_140px_minmax(190px,1fr)_minmax(220px,1.3fr)_minmax(180px,1fr)_120px] gap-3 px-3 py-3 text-left text-xs transition-colors",
                      selectedAuditEvent?.id === event.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          auditSeverityTone(event.severity),
                        )}
                      >
                        {event.severity}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {AUDIT_SOURCE_LABELS[event.source]}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {event.subjectType.replaceAll("_", " ")}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {event.subjectId}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {event.summary}
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {event.actor} · {event.cabinetPath}
                      </div>
                    </div>
                    <div className="min-w-0 truncate text-muted-foreground">
                      {event.evidence
                        .slice(0, 2)
                        .map((item) => `${item.label}: ${item.value}`)
                        .join(" · ")}
                    </div>
                    <div className="text-muted-foreground">
                      {formatGeneratedAt(event.occurredAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selectedAuditEvent ? (
              <InspectorPanel
                title={selectedAuditEvent.summary}
                subtitle={`${AUDIT_SOURCE_LABELS[selectedAuditEvent.source]} · ${selectedAuditEvent.actor}`}
                badge={{
                  label: selectedAuditEvent.severity,
                  tone: auditSeverityTone(selectedAuditEvent.severity),
                }}
                href={selectedAuditEvent.href}
                fields={[
                  { label: "Event ID", value: selectedAuditEvent.id },
                  { label: "Kind", value: selectedAuditEvent.kind },
                  { label: "Source", value: selectedAuditEvent.source },
                  {
                    label: "Subject",
                    value: selectedAuditEvent.subjectType,
                  },
                  { label: "Subject ID", value: selectedAuditEvent.subjectId },
                  { label: "Action", value: selectedAuditEvent.action },
                  { label: "Cabinet", value: selectedAuditEvent.cabinetPath },
                  {
                    label: "Conversation",
                    value: selectedAuditEvent.conversationId,
                  },
                  { label: "Occurred", value: selectedAuditEvent.occurredAt },
                ]}
                evidence={selectedAuditEvent.evidence}
                spine={selectedAuditEvent.operationalSpine}
              />
            ) : null}
          </div>
        )}
        </section>
      )}
    </main>
  );
}
