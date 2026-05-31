"use client";

import { useState } from "react";
import { ScheduleCalendar } from "@/components/cabinets/schedule-calendar";
import { useAgentsDemo } from "../store";
import { TabExplainer } from "../tab-explainer";

type Mode = "day" | "week" | "month";

export default function ScheduleTab() {
  const { agents, jobs } = useAgentsDemo();
  const [mode, setMode] = useState<Mode>("week");
  const [anchor] = useState(() => new Date());

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TabExplainer
            id="schedule"
            ariaLabel="About the schedule"
            body={
              <>
                <p>
                  Everything your team is doing this week, on one calendar.
                  Pink is a heartbeat, green is a routine. Click any pill to
                  edit it.
                </p>
                <p>
                  Use this tab to spot conflicts, find quiet stretches, or
                  just see at a glance how busy the team is.
                </p>
              </>
            }
          />
        </div>
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
          onEventClick={() => {
            // Demo: no-op.
          }}
          onDayClick={() => {
            // Demo: no-op.
          }}
        />
      </div>
    </div>
  );
}
