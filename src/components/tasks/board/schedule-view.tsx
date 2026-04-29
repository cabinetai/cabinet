"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ScheduleCalendar,
  type CalendarMode,
} from "@/components/cabinets/schedule-calendar";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";

/**
 * Thin v2 wrapper around the existing ScheduleCalendar primitive.
 * Calendar-only view — no list subview toggle.
 */
export function ScheduleView({
  agents,
  jobs,
  conversations,
  onConversationClick,
  onJobClick,
  onHeartbeatClick,
}: {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  conversations: ConversationMeta[];
  onConversationClick: (id: string) => void;
  onJobClick?: (job: CabinetJobSummary, agent: CabinetAgentSummary) => void;
  onHeartbeatClick?: (agent: CabinetAgentSummary) => void;
}) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  // ScheduleCalendar uses this map to de-duplicate cron-scheduled events
  // whose manual run already exists (key: `${agentSlug}|${cronExpr}|${time}`).
  // We just pass a map keyed by `${agentSlug}|${conversationId}` so any
  // collisions are graceful; the calendar's dedup is a best-effort filter.
  const scheduledConversationsMap = useMemo(() => {
    const m = new Map<string, ConversationMeta>();
    for (const c of conversations) m.set(`${c.agentSlug}|${c.id}`, c);
    return m;
  }, [conversations]);

  function navigate(direction: -1 | 0 | 1) {
    if (direction === 0) {
      setAnchor(new Date());
      return;
    }
    setAnchor((prev) => {
      const next = new Date(prev);
      if (mode === "day") next.setDate(next.getDate() + direction);
      else if (mode === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  const label = useMemo(() => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    if (mode === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (mode === "month") {
      return `${months[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    const s = new Date(anchor);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return s.getMonth() === e.getMonth()
      ? `${months[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}`;
  }, [anchor, mode]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
        <div className="flex items-center rounded-lg border border-border/60 p-0.5">
          {(["day", "week", "month"] as CalendarMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(0)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <span className="text-[13px] font-medium text-foreground">{label}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <ScheduleCalendar
          mode={mode}
          anchor={anchor}
          agents={agents}
          jobs={jobs}
          manualConversations={conversations}
          scheduledConversations={scheduledConversationsMap}
          onEventClick={(ev: ScheduleEvent) => {
            if (ev.sourceType === "manual" && ev.conversationId) {
              onConversationClick(ev.conversationId);
              return;
            }
            if (ev.sourceType === "job" && ev.jobRef && ev.agentRef && onJobClick) {
              onJobClick(ev.jobRef, ev.agentRef);
              return;
            }
            if (ev.sourceType === "heartbeat" && ev.agentRef && onHeartbeatClick) {
              onHeartbeatClick(ev.agentRef);
              return;
            }
          }}
          onDayClick={(date) => {
            setMode("day");
            setAnchor(date);
          }}
        />
      </div>
    </div>
  );
}
