"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowUpRight, CalendarClock, GitBranch, Workflow } from "lucide-react";
import type { AgentAction, DispatchedAction } from "@/types/actions";
import type { TaskMeta } from "@/types/tasks";
import { buildTaskHash } from "@/lib/navigation/task-route";
import { cn } from "@/lib/utils";

function actionTitle(action: AgentAction): string {
  if (action.type === "SCHEDULE_JOB") return action.name;
  return action.title;
}

function actionAgent(action: AgentAction): string {
  return action.agent;
}

function actionKindLabel(action: AgentAction): string {
  switch (action.type) {
    case "LAUNCH_TASK":
      return "Task";
    case "SCHEDULE_TASK":
      return "Scheduled task";
    case "SCHEDULE_JOB":
      return "Routine";
  }
}

function childRuns(
  actions: DispatchedAction[] | undefined,
): DispatchedAction[] {
  return (actions ?? []).filter(
    (item) =>
      item.status === "dispatched" && (item.conversationId || item.jobId),
  );
}

export function RunLineagePanel({ meta }: { meta: TaskMeta }) {
  const children = childRuns(meta.dispatchedActions);
  const hasParent = Boolean(meta.parentTaskId);
  if (!hasParent && children.length === 0) return null;

  return (
    <section className="mx-auto mt-4 w-full max-w-3xl px-1">
      <div className="rounded-xl border border-border/70 bg-card">
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-[12px] font-medium">
          <Workflow className="size-3.5 text-muted-foreground" />
          Run lineage
          {typeof meta.spawnDepth === "number" && meta.spawnDepth > 0 ? (
            <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
              depth {meta.spawnDepth}
            </span>
          ) : null}
        </div>
        <div className="divide-y divide-border/60">
          {meta.parentTaskId ? (
            <LineageRow
              icon={GitBranch}
              label="Spawned by"
              title={meta.triggeringAgent || "parent agent"}
              detail={meta.parentTaskId}
              href={buildTaskHash(meta.parentTaskId, meta.cabinetPath)}
            />
          ) : null}
          {children.map((item) => (
            <LineageRow
              key={item.id}
              icon={item.conversationId ? GitBranch : CalendarClock}
              label={actionKindLabel(item.action)}
              title={actionTitle(item.action)}
              detail={actionAgent(item.action)}
              href={
                item.conversationId
                  ? buildTaskHash(item.conversationId, meta.cabinetPath)
                  : undefined
              }
              suffix={item.jobId ? `job ${item.jobId}` : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LineageRow({
  icon: Icon,
  label,
  title,
  detail,
  href,
  suffix,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  title: string;
  detail?: string;
  href?: string;
  suffix?: string;
}) {
  const content = (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 px-3 py-2.5 text-left",
        href ? "transition-colors hover:bg-muted/40" : "",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-[13px] font-medium text-foreground">
          {title}
        </div>
        {detail ? (
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </div>
      {suffix ? (
        <span className="max-w-[10rem] truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {suffix}
        </span>
      ) : null}
      {href ? (
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
      ) : null}
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
