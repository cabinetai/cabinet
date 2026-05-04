"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Command,
  GitBranch,
  Loader2,
  Play,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OptaleActionCategory,
  OptaleActionDefinition,
  OptaleActionKind,
  OptaleActionQueueRecord,
  OptaleActionRegistry,
  OptaleActionRisk,
  OptaleActionStatus,
} from "@/lib/optale/action-registry";

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

export function OptaleCommandActionsView({
  loading,
  registry,
  filteredActions,
  filteredQueues,
  showActionInventory = true,
}: {
  loading: boolean;
  registry: OptaleActionRegistry | null;
  filteredActions: OptaleActionDefinition[];
  filteredQueues: OptaleActionQueueRecord[];
  showActionInventory?: boolean;
}) {
  return (
    <>
      {showActionInventory && (
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
      )}

      <section
        className={cn(
          "px-6 py-5",
          showActionInventory && "border-t border-border/70",
        )}
      >
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
                        {showActionInventory
                          ? `${queue.agentSlug} · ${queue.cabinetPath}`
                          : queue.agentSlug}
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
  );
}
