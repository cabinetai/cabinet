"use client";

import { useMemo } from "react";
import { Clock3, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentPill } from "@/components/tasks/board/agent-pill";
import { getScheduleEvents, type ScheduleEvent } from "@/lib/agents/cron-compute";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";

const LIMIT = 8;
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

export function NextUpRuns({
  agents,
  jobs,
  now,
  onEventClick,
}: {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  now: Date;
  onEventClick: (event: ScheduleEvent) => void;
}) {
  const events = useMemo(() => {
    const end = new Date(now.getTime() + HORIZON_MS);
    return getScheduleEvents(agents, jobs, now, end).slice(0, LIMIT);
  }, [agents, jobs, now]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
            Next-up runs
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {events.length === 0
              ? "Nothing scheduled in the next 7 days"
              : `${events.length} upcoming · 7 days`}
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-[12px] text-muted-foreground">
          Set a heartbeat or job on an agent to see runs here.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {events.map((event) => {
            const isHeartbeat = event.sourceType === "heartbeat";
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onEventClick(event)}
                  className={cn(
                    "flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
                    !event.enabled && "opacity-60"
                  )}
                >
                  {isHeartbeat ? (
                    // Heartbeat: icon + agent pill inline + time. The event
                    // label is just the agent name, so we skip a dedicated
                    // title row to avoid showing the name twice.
                    <div className="flex items-center gap-2">
                      <HeartPulse className="size-3.5 shrink-0 text-pink-400" />
                      {event.agentRef ? (
                        <AgentPill
                          agent={event.agentRef}
                          slug={event.agentSlug}
                          size="sm"
                        />
                      ) : (
                        <span className="truncate text-[12px] font-medium text-foreground">
                          {event.agentName}
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                        {formatWhen(event.time, now)}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Job/manual: [icon] label (left) + time (right), agent pill below */}
                      <div className="flex items-start gap-3">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <div className="pt-0.5">
                            <Clock3 className="size-3.5 text-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium leading-snug text-foreground">
                              {event.label}
                            </p>
                          </div>
                        </div>
                        <span className="ml-2 shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                          {formatWhen(event.time, now)}
                        </span>
                      </div>
                      {event.agentRef ? (
                        <div>
                          <AgentPill
                            agent={event.agentRef}
                            slug={event.agentSlug}
                            size="sm"
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatWhen(when: Date, now: Date): string {
  const delta = when.getTime() - now.getTime();
  if (delta < 0) return "now";
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `in ${days}d`;
  return when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
