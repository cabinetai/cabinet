"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DirIcon } from "@/components/ui/dir-icon";
import {
  ScheduleCalendar,
  type CalendarMode,
} from "@/components/cabinets/schedule-calendar";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "@/components/agents/v2/tab-explainer";
import { useLocale } from "@/i18n/use-locale";
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
  const { t } = useLocale();
  const explainer = useExplainerState("tasks-schedule");
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
    // Use Intl.DateTimeFormat with `undefined` locale so the browser
    // picks up document language automatically — this hands us proper
    // Hebrew month names for `<html lang="he">` and Chinese for zh-*.
    const monthOf = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "long" });
    if (mode === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (mode === "month") {
      return `${monthOf(anchor)} ${anchor.getFullYear()}`;
    }
    const s = new Date(anchor);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return s.getMonth() === e.getMonth()
      ? `${monthOf(s)} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${monthOf(s)} ${s.getDate()} – ${monthOf(e)} ${e.getDate()}`;
  }, [anchor, mode]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
      <ExplainerCard state={explainer}>
        <p>{t("scheduleTab:explainer1")}</p>
        <p>{t("scheduleTab:explainer2")}</p>
      </ExplainerCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ExplainerIcon
            state={explainer}
            ariaLabel={t("scheduleTab:aboutAria")}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <DirIcon ltr={ChevronLeft} rtl={ChevronRight} className="size-4" />
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
              <DirIcon ltr={ChevronRight} rtl={ChevronLeft} className="size-4" />
            </button>
          </div>
          <span className="text-[13px] font-medium text-foreground">
            {label}
          </span>
        </div>

        <div className="inline-flex shrink-0 items-center rounded-md border border-border/70 bg-background p-0.5">
          {(["day", "week", "month"] as CalendarMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
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
