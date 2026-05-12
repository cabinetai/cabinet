"use client";

import { useState } from "react";
import { ScheduleCalendar } from "@/components/cabinets/schedule-calendar";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";
import type { JobConfig } from "@/types/jobs";
import { useAgentsContext } from "./agents-context";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "./tab-explainer";

type Mode = "day" | "week" | "month";

export function ScheduleTab() {
  const { agents, jobs, setRoutineDialog, setHeartbeatDialog } =
    useAgentsContext();
  const explainer = useExplainerState("schedule");
  const [mode, setMode] = useState<Mode>("week");
  const [anchor] = useState(() => new Date());

  function handleEventClick(event: ScheduleEvent) {
    if (event.sourceType === "heartbeat" && event.agentRef) {
      setHeartbeatDialog({
        agent: {
          slug: event.agentRef.slug,
          name: event.agentRef.name,
          role: event.agentRef.role,
          cabinetPath: event.agentRef.cabinetPath,
        },
        initialHeartbeat: event.agentRef.heartbeat,
        initialEnabled: event.agentRef.heartbeatEnabled !== false,
      });
    } else if (event.sourceType === "job" && event.jobRef && event.agentRef) {
      const job = event.jobRef;
      setRoutineDialog({
        agent: {
          slug: event.agentRef.slug,
          name: event.agentRef.name,
          role: event.agentRef.role,
          cabinetPath: event.agentRef.cabinetPath,
        },
        existingJob: {
          id: job.id,
          name: job.name,
          schedule: job.schedule,
          enabled: job.enabled,
        } as Partial<JobConfig>,
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ExplainerCard state={explainer}>
        <p>
          Everything your team is doing this week, on one calendar. Pink is
          a heartbeat, green is a routine. Click any pill to edit it.
        </p>
        <p>
          Use this tab to spot conflicts, find quiet stretches, or just see
          at a glance how busy the team is.
        </p>
      </ExplainerCard>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center text-[11.5px] text-muted-foreground/80">
          <ExplainerIcon state={explainer} ariaLabel="About the schedule" />
        </span>
        <div className="inline-flex shrink-0 items-center rounded-md border border-border/70 bg-background p-0.5">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded px-2.5 py-1 text-[11.5px] font-medium bg-foreground text-background"
                  : "rounded px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card">
        <ScheduleCalendar
          mode={mode}
          anchor={anchor}
          agents={agents}
          jobs={jobs}
          fullscreen
          onEventClick={handleEventClick}
          onDayClick={() => {
            /* day-click no-op for now */
          }}
        />
      </div>
    </div>
  );
}
