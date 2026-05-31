"use client";

import { useMemo } from "react";
import { Clock3 } from "lucide-react";
import { cronToHuman, cronToShortLabel } from "@/lib/agents/cron-utils";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import { useLocale } from "@/i18n/use-locale";

export function SchedulesPanel({
  agents,
  jobs,
  onAgentClick,
  onJobClick,
  onHeartbeatClick,
}: {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  onAgentClick?: (agent: CabinetAgentSummary) => void;
  onJobClick?: (job: CabinetJobSummary, agent: CabinetAgentSummary) => void;
  onHeartbeatClick?: (agent: CabinetAgentSummary) => void;
}) {
  const { t } = useLocale();
  const agentMap = useMemo(() => {
    const map = new Map<string, CabinetAgentSummary>();
    for (const a of agents) {
      map.set(a.scopedId, a);
      map.set(a.slug, a);
    }
    return map;
  }, [agents]);

  const heartbeatAgents = agents
    .filter((a) => a.heartbeat)
    .sort((l, r) => l.name.localeCompare(r.name));

  const jobsWithOwners = jobs.map((job) => {
    const owner = job.ownerScopedId
      ? agentMap.get(job.ownerScopedId)
      : job.ownerAgent
      ? agentMap.get(job.ownerAgent)
      : undefined;
    return {
      ...job,
      ownerName: owner?.name || job.ownerAgent || null,
      ownerEmoji: owner?.emoji || null,
      ownerAgentRef: owner || null,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">
          Jobs and heartbeats
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {jobsWithOwners.length} scheduled jobs and {heartbeatAgents.length} active heartbeats in this scope.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">{t("schedulesPanel:title")}</h3>
        <div className="mt-3 border-t border-border/70">
          {jobsWithOwners.length > 0 ? (
            jobsWithOwners.map((job) => {
              const clickable = !!(job.ownerAgentRef && onJobClick);
              return (
                <button
                  key={job.scopedId}
                  type="button"
                  onClick={() => {
                    if (job.ownerAgentRef && onJobClick) onJobClick(job, job.ownerAgentRef);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border/60 px-1 py-3 text-left transition-colors",
                    clickable && "hover:bg-muted/30 rounded-lg"
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
                    {job.ownerEmoji ? (
                      <span className="text-sm leading-none">{job.ownerEmoji}</span>
                    ) : (
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{job.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.ownerName ? `${job.ownerName} · ` : ""}
                      {cronToHuman(job.schedule)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      job.enabled
                        ? "bg-emerald-500/12 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {job.enabled ? "On" : "Off"}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="py-4 text-sm text-muted-foreground">{t("schedulesPanel:noJobs")}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">{t("schedulesPanel:heartbeats")}</h3>
        <div className="mt-3 border-t border-border/70">
          {heartbeatAgents.length > 0 ? (
            heartbeatAgents.map((agent) => (
              <button
                key={agent.scopedId}
                type="button"
                onClick={() => onHeartbeatClick?.(agent)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/60 px-1 py-3 text-left transition-colors",
                  onHeartbeatClick && "hover:bg-muted/30 rounded-lg"
                )}
              >
                <span className="text-lg leading-none shrink-0">{agent.emoji || "🤖"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {cronToHuman(agent.heartbeat || "")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                  {cronToShortLabel(agent.heartbeat || "")}
                </span>
              </button>
            ))
          ) : (
            <p className="py-4 text-sm text-muted-foreground">{t("schedulesPanel:noHeartbeats")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
