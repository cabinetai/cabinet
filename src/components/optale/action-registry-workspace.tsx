"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { OptaleCommandActionsView } from "@/components/optale/command-actions-view";
import { OptaleCommandAuditView } from "@/components/optale/command-audit-view";
import { OptaleCommandHeader } from "@/components/optale/command-header";
import { OptaleCommandLineageView } from "@/components/optale/command-lineage-view";
import { OptaleCommandPolicyView } from "@/components/optale/command-policy-view";
import { OptaleCommandRunsView } from "@/components/optale/command-runs-view";
import { OptaleCommandSpineSummary } from "@/components/optale/command-spine-summary";
import { OptaleCommandToolbar } from "@/components/optale/command-toolbar";
import type {
  OptaleCommandActionFilter,
  OptaleCommandView,
} from "@/components/optale/command-workspace-types";
import type {
  OptaleActionDefinition,
  OptaleActionQueueRecord,
  OptaleActionRegistry,
} from "@/lib/optale/action-registry";
import type {
  OptaleActionRunLedger,
  OptaleActionRunRecord,
} from "@/lib/optale/action-run-ledger";
import type {
  OptalePolicyDecisionLog,
  OptalePolicyDecisionRecord,
} from "@/lib/optale/policy-decision-log";
import type {
  OptaleLineageEdgeRecord,
  OptaleLineageEdgeTable,
} from "@/lib/optale/lineage-edge-table";
import type {
  OptaleAuditEventLog,
  OptaleAuditEventRecord,
} from "@/lib/optale/audit-event-log";

const COMMAND_VIEW_LABELS: Record<OptaleCommandView, string> = {
  actions: "Actions",
  runs: "Runs",
  policy: "Policy",
  lineage: "Lineage",
  audit: "Audit",
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
  const [activeFilter, setActiveFilter] =
    useState<OptaleCommandActionFilter>("all");
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
      <OptaleCommandHeader
        generatedAt={registry?.generatedAt}
        loading={loading}
        onRefresh={() => void refresh()}
      />

      <OptaleCommandToolbar
        activeView={activeView}
        activeFilter={activeFilter}
        counts={{
          actions: registry?.counts.actions ?? 0,
          queues: registry?.counts.pendingQueues ?? 0,
          runs: ledger?.counts.runs ?? 0,
          policy: policyLog?.counts.decisions ?? 0,
          lineage: lineage?.counts.edges ?? 0,
          audit: auditLog?.counts.events ?? 0,
        }}
        search={search}
        onActiveFilterChange={setActiveFilter}
        onSearchChange={setSearch}
      />

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <OptaleCommandSpineSummary
        auditLog={auditLog}
        ledger={ledger}
        lineage={lineage}
        policyLog={policyLog}
        registry={registry}
      />

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
        <OptaleCommandActionsView
          loading={loading}
          registry={registry}
          filteredActions={filteredActions}
          filteredQueues={filteredQueues}
        />
      )}

      {activeView === "runs" && (
        <OptaleCommandRunsView
          loading={loading}
          ledger={ledger}
          filteredRuns={filteredRuns}
          selectedRun={selectedRun}
          onSelectRun={setSelectedRunId}
        />
      )}

      {activeView === "policy" && (
        <OptaleCommandPolicyView
          loading={loading}
          policyLog={policyLog}
          filteredPolicyDecisions={filteredPolicyDecisions}
          selectedPolicyDecision={selectedPolicyDecision}
          onSelectPolicyDecision={setSelectedPolicyDecisionId}
        />
      )}

      {activeView === "lineage" && (
        <OptaleCommandLineageView
          loading={loading}
          lineage={lineage}
          filteredLineageEdges={filteredLineageEdges}
          selectedLineageEdge={selectedLineageEdge}
          onSelectLineageEdge={setSelectedLineageEdgeId}
        />
      )}

      {activeView === "audit" && (
        <OptaleCommandAuditView
          loading={loading}
          auditLog={auditLog}
          filteredAuditEvents={filteredAuditEvents}
          selectedAuditEvent={selectedAuditEvent}
          onSelectAuditEvent={setSelectedAuditEventId}
        />
      )}
    </main>
  );
}
