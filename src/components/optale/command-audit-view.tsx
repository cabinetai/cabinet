"use client";

import { Loader2 } from "lucide-react";
import { OptaleCommandInspectorPanel as InspectorPanel } from "@/components/optale/command-inspector-panel";
import { cn } from "@/lib/utils";
import type {
  OptaleAuditEventLog,
  OptaleAuditEventRecord,
  OptaleAuditEventSeverity,
  OptaleAuditEventSource,
} from "@/lib/optale/audit-event-log";

const AUDIT_SOURCE_LABELS: Record<OptaleAuditEventSource, string> = {
  action_run_ledger: "Run Ledger",
  policy_decision_log: "Policy Decisions",
  lineage_edge_table: "Lineage Edges",
};

function auditSeverityTone(severity: OptaleAuditEventSeverity): string {
  if (severity === "error") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (severity === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
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

export function OptaleCommandAuditView({
  loading,
  auditLog,
  filteredAuditEvents,
  selectedAuditEvent,
  onSelectAuditEvent,
}: {
  loading: boolean;
  auditLog: OptaleAuditEventLog | null;
  filteredAuditEvents: OptaleAuditEventRecord[];
  selectedAuditEvent: OptaleAuditEventRecord | null;
  onSelectAuditEvent: (id: string) => void;
}) {
  return (
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
              <div className="text-[10px] text-muted-foreground">{label}</div>
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
                  onClick={() => onSelectAuditEvent(event.id)}
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
  );
}
