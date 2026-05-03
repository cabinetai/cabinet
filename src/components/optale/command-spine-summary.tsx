"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { OptaleActionRegistry } from "@/lib/optale/action-registry";
import type { OptaleActionRunLedger } from "@/lib/optale/action-run-ledger";
import type { OptaleAuditEventLog } from "@/lib/optale/audit-event-log";
import type { OptaleLineageEdgeTable } from "@/lib/optale/lineage-edge-table";
import type { OptalePolicyDecisionLog } from "@/lib/optale/policy-decision-log";

export function OptaleCommandSpineSummary({
  auditLog,
  ledger,
  lineage,
  policyLog,
  registry,
}: {
  auditLog: OptaleAuditEventLog | null;
  ledger: OptaleActionRunLedger | null;
  lineage: OptaleLineageEdgeTable | null;
  policyLog: OptalePolicyDecisionLog | null;
  registry: OptaleActionRegistry | null;
}) {
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

  return (
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
              policyLog?.operationalSpine.capabilities.policy_decision.active ??
              0,
            detail: "active decisions",
            tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          },
          {
            label: "Lineage",
            value:
              lineage?.operationalSpine.capabilities.lineage_edge.active ?? 0,
            detail: "active edges",
            tone: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
          },
          {
            label: "Audit",
            value:
              auditLog?.operationalSpine.capabilities.audit_event.active ?? 0,
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
  );
}
