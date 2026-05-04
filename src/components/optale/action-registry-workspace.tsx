"use client";

import { useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { OptaleCommandActionsView } from "@/components/optale/command-actions-view";
import { OptaleCommandAuditView } from "@/components/optale/command-audit-view";
import { OptaleCommandHeader } from "@/components/optale/command-header";
import { OptaleCommandLineageView } from "@/components/optale/command-lineage-view";
import { OptaleCommandPolicyView } from "@/components/optale/command-policy-view";
import { OptaleCommandRunsView } from "@/components/optale/command-runs-view";
import { OptaleCommandSpineSummary } from "@/components/optale/command-spine-summary";
import { OptaleCommandToolbar } from "@/components/optale/command-toolbar";
import { OptaleCommandViewTabs } from "@/components/optale/command-view-tabs";
import { commandViewFromSlug } from "@/components/optale/command-workspace-state";
import { useOptaleCommandWorkspaceData } from "@/components/optale/use-command-workspace-data";
import { hasOptaleCapability } from "@/lib/optale/capabilities";
import type { OptaleCommandView } from "@/components/optale/command-workspace-types";

export function OptaleActionRegistryWorkspace({
  cabinetPath,
}: {
  cabinetPath: string;
}) {
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const activeView = commandViewFromSlug(
    section.type === "actions" ? section.slug : undefined,
  );
  const canViewDiagnostics = hasOptaleCapability("diagnostics.raw");
  const safeActiveView = canViewDiagnostics ? activeView : "actions";
  const {
    activeFilter,
    auditLog,
    commandViews,
    error,
    filteredActions,
    filteredAuditEvents,
    filteredLineageEdges,
    filteredPolicyDecisions,
    filteredQueues,
    filteredRuns,
    ledger,
    lineage,
    loading,
    policyLog,
    refresh,
    registry,
    search,
    selectedAuditEvent,
    selectedLineageEdge,
    selectedPolicyDecision,
    selectedRun,
    setActiveFilter,
    setSearch,
    setSelectedAuditEventId,
    setSelectedLineageEdgeId,
    setSelectedPolicyDecisionId,
    setSelectedRunId,
  } = useOptaleCommandWorkspaceData({ cabinetPath });

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
    <main className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden bg-background pb-12">
      <OptaleCommandHeader
        generatedAt={registry?.generatedAt}
        loading={loading}
        onRefresh={() => void refresh()}
      />

      <OptaleCommandToolbar
        activeView={safeActiveView}
        activeFilter={activeFilter}
        showDiagnostics={canViewDiagnostics}
        counts={{
          actions: canViewDiagnostics ? registry?.counts.actions ?? 0 : 0,
          queues: registry?.counts.pendingQueues ?? 0,
          runs: canViewDiagnostics ? ledger?.counts.runs ?? 0 : 0,
          policy: canViewDiagnostics ? policyLog?.counts.decisions ?? 0 : 0,
          lineage: canViewDiagnostics ? lineage?.counts.edges ?? 0 : 0,
          audit: canViewDiagnostics ? auditLog?.counts.events ?? 0 : 0,
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

      {canViewDiagnostics && (
        <OptaleCommandSpineSummary
          auditLog={auditLog}
          ledger={ledger}
          lineage={lineage}
          policyLog={policyLog}
          registry={registry}
        />
      )}

      <OptaleCommandViewTabs
        activeView={safeActiveView}
        views={
          canViewDiagnostics
            ? commandViews
            : [
                {
                  id: "actions",
                  count: registry?.counts.pendingQueues ?? 0,
                },
              ]
        }
        onSelectView={setCommandView}
      />

      {safeActiveView === "actions" && (
        <OptaleCommandActionsView
          loading={loading}
          registry={registry}
          filteredActions={filteredActions}
          filteredQueues={filteredQueues}
          showActionInventory={canViewDiagnostics}
        />
      )}

      {safeActiveView === "runs" && canViewDiagnostics && (
        <OptaleCommandRunsView
          loading={loading}
          ledger={ledger}
          filteredRuns={filteredRuns}
          selectedRun={selectedRun}
          onSelectRun={setSelectedRunId}
        />
      )}

      {safeActiveView === "policy" && canViewDiagnostics && (
        <OptaleCommandPolicyView
          loading={loading}
          policyLog={policyLog}
          filteredPolicyDecisions={filteredPolicyDecisions}
          selectedPolicyDecision={selectedPolicyDecision}
          onSelectPolicyDecision={setSelectedPolicyDecisionId}
        />
      )}

      {safeActiveView === "lineage" && canViewDiagnostics && (
        <OptaleCommandLineageView
          loading={loading}
          lineage={lineage}
          filteredLineageEdges={filteredLineageEdges}
          selectedLineageEdge={selectedLineageEdge}
          onSelectLineageEdge={setSelectedLineageEdgeId}
        />
      )}

      {safeActiveView === "audit" && canViewDiagnostics && (
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
