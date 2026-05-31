"use client";

import { useState } from "react";
import { ScheduleCalendar } from "@/components/cabinets/schedule-calendar";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";
import type { JobConfig } from "@/types/jobs";
import { useLocale } from "@/i18n/use-locale";
import { useAgentsContext } from "./agents-context";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "./tab-explainer";

type Mode = "day" | "week" | "month";

export function ScheduleTab() {
  const { t } = useLocale();
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
        <p>{t("scheduleTab:explainer1")}</p>
        <p>{t("scheduleTab:explainer2")}</p>
      </ExplainerCard>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center text-[11.5px] text-muted-foreground/80">
          <ExplainerIcon state={explainer} ariaLabel={t("scheduleTab:aboutAria")} />
        </span>
        <div className="inline-flex shrink-0 items-center rounded-md border border-border/70 bg-background p-0.5">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? "rounded px-2.5 py-1 text-[11.5px] font-medium bg-primary text-primary-foreground"
                  : "rounded px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {m === "day" ? t("scheduleTab:modeDay") : m === "week" ? t("scheduleTab:modeWeek") : t("scheduleTab:modeMonth")}
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
