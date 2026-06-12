"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import {
  buildScheduledKey,
  getManualScheduleEvents,
  getScheduleEvents,
  getViewRange,
  getAgentColor,
  type ScheduleEvent,
} from "@/lib/agents/cron-compute";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ─── Constants ─── */

const DEFAULT_HOUR_HEIGHT = 56; // px per hour row (used until container is measured)
const MIN_HOUR_HEIGHT = 22;
const PILL_HEIGHT = 22;
const DOT_SIZE = 10; // crowded-slot circles
const DOT_ROW_HEIGHT = DOT_SIZE + 4;
const MAX_PILLS_MULTIDAY = 2;
const MAX_PILLS_MONTH = 3;
const DEFAULT_VISIBLE_START_HOUR = 5; // 5 AM
const DEFAULT_VISIBLE_END_HOUR = 23; // 11 PM
// Locale-aware short weekday names, Monday-first to match the calendar's
// column order. 2024-01-01 is a Monday — walk 7 days from it and let
// Intl.DateTimeFormat localize (Hebrew/Chinese resolve automatically from
// the document language the browser exposes via undefined locale).
const DAY_NAMES_SHORT = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(2024, 0, 1 + i); // Jan 1 2024 = Monday
  return d.toLocaleDateString(undefined, { weekday: "short" });
});

/* ─── Helpers ─── */

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ─── Types ─── */

export type CalendarMode = "day" | "week" | "month";

interface DragMove {
  eventId: string;
  event: ScheduleEvent;
  ghostColIdx: number;
  ghostTop: number;
  newTime: Date;
  moved: boolean;
  startX: number;
  startY: number;
}

interface ScheduleCalendarProps {
  mode: CalendarMode;
  anchor: Date;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  /**
   * Optional pool of conversations to render as extra ScheduleEvent pills
   * (e.g. past manual runs). The calendar filters them to the visible window
   * and paints them alongside jobs/heartbeats, one pill per conversation.
   */
  manualConversations?: ConversationMeta[];
  fullscreen?: boolean;
  /** 0 = whole day fits container; >0 = each hour row gains px and grid scrolls. */
  density?: number;
  /** Visible hour range in the time grid (day/week views). Inclusive start, exclusive end. */
  visibleStartHour?: number;
  visibleEndHour?: number;
  /** Called when the user clicks an off-window chevron to expand the visible range. */
  onVisibleHoursChange?: (next: { start: number; end: number }) => void;
  scheduledConversations?: Map<string, ConversationMeta>;
  onEventClick: (event: ScheduleEvent) => void;
  onDayClick: (date: Date) => void;
  /**
   * Drag a future job event to a new time. When provided, job pills in the
   * day/week time grid become draggable; dropping calls this with the snapped
   * (15-min) target time. Heartbeat/manual events stay click-only.
   */
  onEventMove?: (event: ScheduleEvent, newTime: Date) => void;
  /**
   * Click an empty time slot in day/week to create something at that instant
   * (15-min snapped). `anchor` is the viewport point of the click so callers can
   * anchor a popover to the slot. When omitted, empty clicks do nothing.
   */
  onCreateAt?: (date: Date, anchor?: { x: number; y: number }) => void;
  /**
   * Fired when the user tries to drag an event that can't be rescheduled
   * (a past run, or a heartbeat). The message explains why.
   */
  onBlockedDrag?: (message: string) => void;
  /** Right-click on an event pill. */
  onEventContextMenu?: (event: ScheduleEvent, x: number, y: number) => void;
  /** Right-click on an empty slot (carries the snapped instant). */
  onEmptyContextMenu?: (date: Date, x: number, y: number) => void;
}

function isEventMissed(
  event: ScheduleEvent,
  now: Date,
  scheduledConversations: Map<string, ConversationMeta> | undefined,
): boolean {
  if (!event.enabled) return false; // disabled is a different state, tracked separately
  if (event.time.getTime() >= now.getTime()) return false;
  // Manual events represent conversations that actually ran — never "missed".
  if (event.sourceType === "manual") return false;
  if (!scheduledConversations || scheduledConversations.size === 0) return false;
  const key = buildScheduledKey(
    event.agentSlug,
    event.sourceType,
    event.jobRef?.id,
    event.time,
  );
  return !scheduledConversations.has(key);
}

/* ─── Event pill ─── */

function EventPill({
  event,
  onClick,
  showTime,
  wide,
  missed,
  dragHandlers,
  dragging,
  blocked,
  onContextMenu,
}: {
  event: ScheduleEvent;
  onClick: () => void;
  showTime?: boolean;
  wide?: boolean;
  missed?: boolean;
  /** When present, these pointer handlers replace the default click. */
  dragHandlers?: HTMLAttributes<HTMLButtonElement>;
  /** True while this pill is the one being dragged (dim the original). */
  dragging?: boolean;
  /** Draggable-but-not-movable (past/heartbeat): show a not-allowed cursor. */
  blocked?: boolean;
  onContextMenu?: HTMLAttributes<HTMLButtonElement>["onContextMenu"];
}) {
  const color = getAgentColor(event.agentSlug);
  const defaultHandlers: HTMLAttributes<HTMLButtonElement> = {
    onClick: (e) => {
      e.stopPropagation();
      onClick();
    },
  };
  const cursorClass = blocked
    ? "cursor-not-allowed touch-none"
    : dragHandlers
      ? "cursor-grab touch-none active:cursor-grabbing"
      : undefined;
  return (
    <button
      type="button"
      {...(dragHandlers ?? defaultHandlers)}
      onContextMenu={onContextMenu}
      title={`${event.label} · ${event.agentName} · ${formatTime(event.time)}${dragHandlers && !blocked ? " · drag to reschedule" : ""}${missed ? " · no run logged — click to run now" : ""}`}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 text-left transition-all",
        "hover:ring-1 hover:ring-foreground/20 hover:shadow-sm",
        !event.enabled && "opacity-40",
        missed && "bg-muted/40 text-muted-foreground",
        cursorClass,
        dragging && "opacity-30"
      )}
      style={{
        height: PILL_HEIGHT,
        backgroundColor: missed ? undefined : event.enabled ? color.bg : undefined,
        color: missed ? undefined : event.enabled ? color.text : undefined,
      }}
    >
      {/*
       * Audit #019: missed = "no scheduled conversation found for this slot".
       * On a local-first product the most common cause is the daemon was off,
       * not a real failure. We render this as a neutral hollow chip rather
       * than an amber-warning chip — yelling about the normal state erodes
       * trust in the calendar.
       */}
      <span className="shrink-0 text-[10px] leading-none">{event.agentEmoji}</span>
      <span className={cn("truncate text-[10px] font-medium", wide && "text-[11px]")}>
        {event.label}
      </span>
      {showTime && (
        <span className="ml-auto shrink-0 text-[9px] opacity-70">
          {formatTime(event.time)}
        </span>
      )}
    </button>
  );
}

/* ─── Event dot (crowded slots) ─── */

function EventDot({
  event,
  onClick,
  now,
  size = DOT_SIZE,
  missed,
}: {
  event: ScheduleEvent;
  onClick: () => void;
  now: Date;
  size?: number;
  missed?: boolean;
}) {
  const color = getAgentColor(event.agentSlug);
  const isPast = event.time.getTime() < now.getTime();
  const dotBorderStyle: "solid" | "dashed" = !event.enabled ? "dashed" : "solid";
  const hollow = missed || !event.enabled;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            aria-label={`${event.label} · ${formatTime(event.time)}${missed ? " · no run logged" : ""}`}
            className={cn(
              "shrink-0 rounded-full outline-none transition-all",
              "hover:ring-2 hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/40",
              !event.enabled && "opacity-40"
            )}
            style={{
              width: size,
              height: size,
              backgroundColor: hollow ? "transparent" : color.bg,
              borderWidth: hollow ? 1.5 : 0,
              borderStyle: dotBorderStyle,
              borderColor: color.bg,
            }}
          />
        }
      />
      <TooltipContent className="flex flex-col items-start gap-0.5 px-2.5 py-1.5 text-left">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <span>{event.agentEmoji}</span>
          <span>{event.label}</span>
        </div>
        <div className="text-[10px] text-background/70">
          {event.agentName} · {formatTime(event.time)}
          {isPast ? " · past" : " · upcoming"}
          {!event.enabled && " · disabled"}
          {missed && " · no run logged"}
        </div>
        {missed && (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">
            Click to run now →
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Week / Day view ─── */

function TimeGridView({
  events,
  days,
  fullscreen,
  density = 0,
  visibleStartHour,
  visibleEndHour,
  onVisibleHoursChange,
  scheduledConversations,
  onEventClick,
  onEventMove,
  onCreateAt,
  onBlockedDrag,
  onEventContextMenu,
  onEmptyContextMenu,
}: {
  events: ScheduleEvent[];
  days: Date[];
  fullscreen?: boolean;
  density?: number;
  visibleStartHour: number;
  visibleEndHour: number;
  onVisibleHoursChange?: (next: { start: number; end: number }) => void;
  scheduledConversations?: Map<string, ConversationMeta>;
  onEventClick: (event: ScheduleEvent) => void;
  onEventMove?: (event: ScheduleEvent, newTime: Date) => void;
  onCreateAt?: (date: Date, anchor?: { x: number; y: number }) => void;
  onBlockedDrag?: (message: string) => void;
  onEventContextMenu?: (event: ScheduleEvent, x: number, y: number) => void;
  onEmptyContextMenu?: (date: Date, x: number, y: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [containerHeight, setContainerHeight] = useState(0);
  const isMultiDay = days.length > 1;
  const TOTAL_HOURS = Math.max(1, visibleEndHour - visibleStartHour);

  // Off-window event counts (events on visible days that fall outside [start, end))
  const dayKeys = useMemo(
    () => new Set(days.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)),
    [days],
  );
  const { beforeCount, afterCount } = useMemo(() => {
    let before = 0;
    let after = 0;
    for (const e of events) {
      const key = `${e.time.getFullYear()}-${e.time.getMonth()}-${e.time.getDate()}`;
      if (!dayKeys.has(key)) continue;
      const h = e.time.getHours();
      if (h < visibleStartHour) before++;
      else if (h >= visibleEndHour) after++;
    }
    return { beforeCount: before, afterCount: after };
  }, [events, dayKeys, visibleStartHour, visibleEndHour]);

  // Update current time
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Measure scroll container height so we can fit the day exactly at density=0.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerHeight(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // At density=0, fit TOTAL_HOURS into the available height. Each density unit
  // adds 1px per hour row, so the grid grows past the container and scrolls.
  const fitHourHeight = containerHeight > 0 ? containerHeight / TOTAL_HOURS : DEFAULT_HOUR_HEIGHT;
  const HOUR_HEIGHT = Math.max(MIN_HOUR_HEIGHT, fitHourHeight + density);

  // Auto-scroll to current hour
  useEffect(() => {
    const hour = new Date().getHours();
    const target = Math.max(0, (hour - visibleStartHour - 1) * HOUR_HEIGHT);
    scrollRef.current?.scrollTo({ top: target, behavior: "smooth" });
  }, [days[0]?.getTime(), HOUR_HEIGHT, visibleStartHour]);

  // Group events by day column → per 15-min slot
  // Week (multi-day): slots with too many events collapse into dots.
  // Day (single): always render pills, expand column vertically if needed so nothing overlaps.
  const maxPills = isMultiDay ? MAX_PILLS_MULTIDAY : Number.POSITIVE_INFINITY;
  const dayColumns = useMemo(() => {
    return days.map((day) => {
      const dayEvents = events.filter((e) => isSameDay(e.time, day));

      // Group events by 15-min slot to handle overlaps
      const slotMap = new Map<number, ScheduleEvent[]>();
      for (const e of dayEvents) {
        const slotKey = Math.floor((e.time.getHours() * 60 + e.time.getMinutes()) / 15);
        if (!slotMap.has(slotKey)) slotMap.set(slotKey, []);
        slotMap.get(slotKey)!.push(e);
      }

      type Bucket =
        | { mode: "pills"; top: number; events: ScheduleEvent[] }
        | { mode: "dots"; top: number; events: ScheduleEvent[] };

      const buckets: Bucket[] = [];
      for (const [, slotEvents] of slotMap) {
        const first = slotEvents[0];
        const hour = first.time.getHours();
        const minute = first.time.getMinutes();
        const top = (hour - visibleStartHour) * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
        const sorted = [...slotEvents].sort(
          (a, b) => a.time.getTime() - b.time.getTime()
        );
        if (sorted.length > maxPills) {
          buckets.push({ mode: "dots", top, events: sorted });
        } else {
          buckets.push({ mode: "pills", top, events: sorted });
        }
      }

      // Day view: walk buckets in time order and shift later ones down so tall
      // stacks never overlap the next slot. Single column, so horizontal overlap
      // isn't an option — grow vertically.
      let columnHeight = TOTAL_HOURS * HOUR_HEIGHT;
      if (!isMultiDay) {
        buckets.sort((a, b) => a.top - b.top);
        let cursor = 0;
        for (const b of buckets) {
          if (b.top < cursor) b.top = cursor;
          const count = b.events.length;
          const h =
            b.mode === "pills"
              ? count * PILL_HEIGHT + Math.max(0, count - 1) * 2
              : DOT_ROW_HEIGHT;
          cursor = b.top + h + 4;
        }
        columnHeight = Math.max(columnHeight, cursor);
      }

      return { day, buckets, columnHeight };
    });
  }, [days, events, maxPills, isMultiDay, HOUR_HEIGHT, visibleStartHour, TOTAL_HOURS]);

  const gridHeight = Math.max(
    TOTAL_HOURS * HOUR_HEIGHT,
    ...dayColumns.map((c) => c.columnHeight)
  );

  // ─── Drag / create / hover controller ───
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const suppressClickRef = useRef(false);
  // `drag` is read inside the pointer handlers, which are recreated on every
  // render so they always close over the latest value — no ref needed.
  const [drag, setDrag] = useState<DragMove | null>(null);
  // Faint "click to create" ghost following the cursor over empty grid.
  const [hoverSlot, setHoverSlot] = useState<{ colIdx: number; top: number; time: Date } | null>(null);
  // Tracks a drag attempt on a non-movable (past/heartbeat) pill so we can toast once.
  const blockedRef = useRef<{ id: string; x: number; y: number; toasted: boolean } | null>(null);

  const snapMinutes = (
    clientY: number,
    colIdx: number
  ): { date: Date; topPx: number } => {
    const rect = colRefs.current[colIdx]?.getBoundingClientRect();
    const localY = rect ? clientY - rect.top : 0;
    const clampedY = Math.max(0, Math.min(localY, gridHeight));
    let minutes = visibleStartHour * 60 + (clampedY / HOUR_HEIGHT) * 60;
    minutes = Math.round(minutes / 15) * 15;
    minutes = Math.max(0, Math.min(minutes, 24 * 60 - 15));
    const date = new Date(days[colIdx] ?? days[0]);
    date.setHours(0, 0, 0, 0);
    date.setMinutes(minutes);
    const topPx = (minutes / 60 - visibleStartHour) * HOUR_HEIGHT;
    return { date, topPx };
  };

  const colIdxAtX = (clientX: number): number => {
    for (let i = 0; i < days.length; i++) {
      const r = colRefs.current[i]?.getBoundingClientRect();
      if (r && clientX >= r.left && clientX <= r.right) return i;
    }
    return drag?.ghostColIdx ?? 0;
  };

  // A future job event can be rescheduled; anything else (past run, heartbeat)
  // is draggable-blocked: grabbing it explains why instead of moving it.
  const isMovable = (event: ScheduleEvent): boolean =>
    !!onEventMove && event.sourceType === "job" && event.time.getTime() >= now.getTime();

  const blockedReason = (event: ScheduleEvent): string => {
    if (event.sourceType === "heartbeat")
      return "Heartbeats are set per agent — open the agent to change its check-in time.";
    if (event.sourceType === "manual")
      return "Past runs can't be moved — click to open the log.";
    return "This run already happened — it can't be rescheduled.";
  };

  const makeMoveHandlers = (
    event: ScheduleEvent,
    colIdx: number
  ): HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      setHoverSlot(null);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      const top =
        ((event.time.getHours() * 60 + event.time.getMinutes()) / 60 -
          visibleStartHour) *
        HOUR_HEIGHT;
      setDrag({
        eventId: event.id,
        event,
        ghostColIdx: colIdx,
        ghostTop: top,
        newTime: event.time,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
      });
    },
    onPointerMove: (e) => {
      const d = drag;
      if (!d || d.eventId !== event.id) return;
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (!d.moved && dist < 4) return;
      const col = isMultiDay ? colIdxAtX(e.clientX) : 0;
      const { date, topPx } = snapMinutes(e.clientY, col);
      setDrag({ ...d, ghostColIdx: col, ghostTop: topPx, newTime: date, moved: true });
    },
    onPointerUp: (e) => {
      const d = drag;
      if (!d || d.eventId !== event.id) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be released */
      }
      if (d.moved) {
        suppressClickRef.current = true;
        onEventMove?.(d.event, d.newTime);
      } else {
        onEventClick(event);
      }
      setDrag(null);
    },
    onClick: (e) => {
      // Action handled in pointerup; swallow the synthetic click.
      e.stopPropagation();
    },
  });

  const makeBlockedHandlers = (
    event: ScheduleEvent
  ): HTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      blockedRef.current = { id: event.id, x: e.clientX, y: e.clientY, toasted: false };
    },
    onPointerMove: (e) => {
      const b = blockedRef.current;
      if (!b || b.id !== event.id || b.toasted) return;
      if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > 4) {
        b.toasted = true;
        onBlockedDrag?.(blockedReason(event));
      }
    },
    onPointerUp: () => {
      const b = blockedRef.current;
      blockedRef.current = null;
      if (b && !b.toasted) onEventClick(event); // a plain click → open
    },
    onClick: (e) => e.stopPropagation(),
  });

  const pillDragProps = (
    event: ScheduleEvent,
    colIdx: number
  ): { handlers: HTMLAttributes<HTMLButtonElement> | undefined; blocked: boolean } => {
    if (!onEventMove) return { handlers: undefined, blocked: false };
    if (isMovable(event)) return { handlers: makeMoveHandlers(event, colIdx), blocked: false };
    return { handlers: makeBlockedHandlers(event), blocked: true };
  };

  const pillContextHandler = (event: ScheduleEvent) =>
    onEventContextMenu
      ? (e: { preventDefault: () => void; stopPropagation: () => void; clientX: number; clientY: number }) => {
          e.preventDefault();
          e.stopPropagation();
          onEventContextMenu(event, e.clientX, e.clientY);
        }
      : undefined;

  const handleColumnCreate = (colIdx: number, e: { clientX: number; clientY: number }) => {
    if (!onCreateAt) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const { date } = snapMinutes(e.clientY, colIdx);
    onCreateAt(date, { x: e.clientX, y: e.clientY });
  };

  const handleColumnHover = (colIdx: number, e: { target: EventTarget | null; clientY: number }) => {
    if (!onCreateAt || drag) {
      if (hoverSlot) setHoverSlot(null);
      return;
    }
    // Suppress the ghost when the cursor is over an existing pill/dot.
    if ((e.target as HTMLElement | null)?.closest("button")) {
      if (hoverSlot) setHoverSlot(null);
      return;
    }
    const { date, topPx } = snapMinutes(e.clientY, colIdx);
    if (!hoverSlot || hoverSlot.colIdx !== colIdx || hoverSlot.top !== topPx) {
      setHoverSlot({ colIdx, top: topPx, time: date });
    }
  };

  const handleColumnContextMenu = (
    colIdx: number,
    e: { preventDefault: () => void; target: EventTarget | null; clientX: number; clientY: number }
  ) => {
    if (!onEmptyContextMenu) return;
    if ((e.target as HTMLElement | null)?.closest("button")) return; // pill handles its own
    e.preventDefault();
    const { date } = snapMinutes(e.clientY, colIdx);
    onEmptyContextMenu(date, e.clientX, e.clientY);
  };

  // Current time position
  const nowTop = (now.getHours() - visibleStartHour) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
  const showNowLine = now.getHours() >= visibleStartHour && now.getHours() < visibleEndHour;
  const todayIndex = days.findIndex((d) => isSameDay(d, now));

  const canExpandStart = visibleStartHour > 0;
  const canExpandEnd = visibleEndHour < 24;
  const expandStart = () => {
    if (!onVisibleHoursChange || !canExpandStart) return;
    onVisibleHoursChange({ start: visibleStartHour - 1, end: visibleEndHour });
  };
  const expandEnd = () => {
    if (!onVisibleHoursChange || !canExpandEnd) return;
    onVisibleHoursChange({ start: visibleStartHour, end: visibleEndHour + 1 });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Column headers */}
      <div
        className="grid border-b border-border/50 bg-muted/20"
        style={{ gridTemplateColumns: isMultiDay ? `56px repeat(${days.length}, 1fr)` : "56px 1fr" }}
      >
        <div className="border-e border-border/30 px-2 py-2" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, now);
          return (
            <div
              key={i}
              className={cn(
                "border-e border-border/30 px-2 py-2 text-center last:border-e-0",
                isToday && "bg-amber-500/[0.06]"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {DAY_NAMES_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
              </div>
              <div
                className={cn(
                  "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Off-window indicator: events earlier than visible range */}
      {beforeCount > 0 && canExpandStart && (
        <button
          type="button"
          onClick={expandStart}
          title={`Show ${formatHour(visibleStartHour - 1)} — ${beforeCount} event${beforeCount === 1 ? "" : "s"} earlier`}
          className="flex w-full items-center justify-center gap-1.5 border-b border-border/30 bg-muted/20 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ChevronUp className="h-3 w-3" />
          <span>{beforeCount} earlier</span>
          <span className="opacity-60">· show {formatHour(visibleStartHour - 1)}</span>
        </button>
      )}

      {/* Time grid */}
      <div
        ref={scrollRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto",
          drag?.moved && "select-none"
        )}
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: isMultiDay ? `56px repeat(${days.length}, 1fr)` : "56px 1fr",
            height: gridHeight,
          }}
        >
          {/* Hour labels column */}
          <div className="relative border-e border-border/30">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="absolute end-2 text-[10px] tabular-nums text-muted-foreground/50"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {formatHour(visibleStartHour + i)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dayColumns.map(({ day, buckets }, colIdx) => {
            const isToday = isSameDay(day, now);
            return (
              <div
                key={colIdx}
                ref={(el) => {
                  colRefs.current[colIdx] = el;
                }}
                onClick={(e) => handleColumnCreate(colIdx, e)}
                onPointerMove={(e) => handleColumnHover(colIdx, e)}
                onPointerLeave={() => hoverSlot?.colIdx === colIdx && setHoverSlot(null)}
                onContextMenu={(e) => handleColumnContextMenu(colIdx, e)}
                className={cn(
                  "relative border-e border-border/30 last:border-e-0",
                  isToday && "bg-amber-500/[0.03]",
                  onCreateAt && "cursor-copy"
                )}
              >
                {/* Hour grid lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="pointer-events-none absolute left-0 right-0 border-t border-border/20"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}

                {/* Hover "click to create" ghost */}
                {hoverSlot && hoverSlot.colIdx === colIdx && !drag && (
                  <div
                    className="pointer-events-none absolute left-0.5 right-0.5 z-10"
                    style={{ top: hoverSlot.top }}
                  >
                    <div
                      className="flex items-center gap-1 overflow-hidden rounded-md border border-primary/40 bg-primary/15 px-1.5 text-[10px] font-medium text-primary"
                      style={{ height: PILL_HEIGHT }}
                    >
                      <span className="shrink-0">+</span>
                      <span className="truncate">New task · {formatTime(hoverSlot.time)}</span>
                    </div>
                  </div>
                )}

                {/* Drag ghost */}
                {drag?.moved && drag.ghostColIdx === colIdx && (
                  <div
                    className="pointer-events-none absolute left-0.5 right-0.5 z-20"
                    style={{ top: drag.ghostTop }}
                  >
                    <div
                      className="flex items-center justify-center rounded-md border border-primary bg-primary/30 px-1.5 text-[10px] font-semibold text-foreground shadow-sm"
                      style={{ height: PILL_HEIGHT }}
                    >
                      {formatTime(drag.newTime)}
                    </div>
                  </div>
                )}

                {/* Event buckets */}
                {buckets.map((bucket, bIdx) => {
                  if (bucket.top < 0) return null;
                  if (bucket.mode === "pills") {
                    return (
                      <div
                        key={bIdx}
                        className="absolute left-0.5 right-0.5 flex flex-col gap-[2px]"
                        style={{ top: bucket.top }}
                      >
                        {bucket.events.map((event) => {
                          const dp = pillDragProps(event, colIdx);
                          return (
                            <EventPill
                              key={event.id}
                              event={event}
                              onClick={() => onEventClick(event)}
                              showTime={!isMultiDay}
                              wide={!isMultiDay}
                              missed={isEventMissed(event, now, scheduledConversations)}
                              dragHandlers={dp.handlers}
                              blocked={dp.blocked}
                              dragging={drag?.eventId === event.id && drag.moved}
                              onContextMenu={pillContextHandler(event)}
                            />
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={bIdx}
                      className="absolute left-0.5 right-0.5 flex flex-wrap items-start gap-[3px]"
                      style={{ top: bucket.top, minHeight: DOT_ROW_HEIGHT }}
                    >
                      {bucket.events.map((event) => (
                        <EventDot
                          key={event.id}
                          event={event}
                          onClick={() => onEventClick(event)}
                          now={now}
                          missed={isEventMissed(event, now, scheduledConversations)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Current time line */}
          {showNowLine && todayIndex >= 0 && (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                top: nowTop,
                insetInlineStart: isMultiDay ? `calc(56px + ${(todayIndex / days.length) * 100}% * ${days.length} / ${days.length})` : 56,
                insetInlineEnd: 0,
              }}
            >
              {/* Full-width red line spanning today column to the right */}
            </div>
          )}
        </div>

        {/* Current time red line (spans full width for visibility) */}
        {showNowLine && (
          <div
            className="pointer-events-none absolute start-[56px] end-0 z-10"
            style={{ top: nowTop }}
          >
            <div className="h-px w-full bg-red-500/60" />
            <div className="absolute -start-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500" />
          </div>
        )}
      </div>

      {/* Off-window indicator: events later than visible range */}
      {afterCount > 0 && canExpandEnd && (
        <button
          type="button"
          onClick={expandEnd}
          title={`Show ${formatHour(visibleEndHour)} — ${afterCount} event${afterCount === 1 ? "" : "s"} later`}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/30 bg-muted/20 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ChevronDown className="h-3 w-3" />
          <span>{afterCount} later</span>
          <span className="opacity-60">· show {formatHour(visibleEndHour)}</span>
        </button>
      )}
    </div>
  );
}

/* ─── Month view ─── */

function MonthView({
  events,
  anchor,
  scheduledConversations,
  onEventClick,
  onDayClick,
  onEventContextMenu,
  onEmptyContextMenu,
}: {
  events: ScheduleEvent[];
  anchor: Date;
  scheduledConversations?: Map<string, ConversationMeta>;
  onEventClick: (event: ScheduleEvent) => void;
  onDayClick: (date: Date) => void;
  onEventContextMenu?: (event: ScheduleEvent, x: number, y: number) => void;
  onEmptyContextMenu?: (date: Date, x: number, y: number) => void;
}) {
  const now = new Date();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Build calendar grid (start on Monday)
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Mon=0
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  const cells: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, 1 - startDow + i);
    cells.push(d);
  }

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const key = `${e.time.getFullYear()}-${e.time.getMonth()}-${e.time.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  // Collapse high-frequency events per day
  function getDayDisplay(day: Date) {
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const dayEvents = eventsByDay.get(key) || [];

    // Group by source to detect high-frequency
    const bySource = new Map<string, ScheduleEvent[]>();
    for (const e of dayEvents) {
      if (!bySource.has(e.sourceId)) bySource.set(e.sourceId, []);
      bySource.get(e.sourceId)!.push(e);
    }

    const display: { event: ScheduleEvent; count?: number }[] = [];
    for (const [, sourceEvents] of bySource) {
      if (sourceEvents.length > 8) {
        display.push({ event: sourceEvents[0], count: sourceEvents.length });
      } else {
        for (const e of sourceEvents) display.push({ event: e });
      }
    }

    display.sort((a, b) => a.event.time.getTime() - b.event.time.getTime());
    return display;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border/50 bg-muted/20">
        {DAY_NAMES_SHORT.map((name) => (
          <div
            key={name}
            className="border-e border-border/30 px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 last:border-e-0"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, now);
          const display = getDayDisplay(day);
          const maxShow = MAX_PILLS_MONTH;

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onContextMenu={(e) => {
                if (!onEmptyContextMenu) return;
                if ((e.target as HTMLElement).closest("[data-month-event]")) return;
                e.preventDefault();
                const d = new Date(day);
                d.setHours(9, 0, 0, 0);
                onEmptyContextMenu(d, e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDayClick(day);
                }
              }}
              className={cn(
                "min-h-[90px] cursor-pointer border-b border-e border-border/20 p-1.5 text-start transition-colors last:border-e-0",
                "hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30",
                !isCurrentMonth && "opacity-40",
                isToday && "bg-amber-500/[0.05]"
              )}
            >
              <div
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {day.getDate()}
              </div>
              {display.length > maxShow ? (
                <div
                  className="flex flex-wrap items-start gap-[3px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {display.map(({ event, count }) => (
                    <div key={event.id} className="relative">
                      <EventDot
                        event={event}
                        onClick={() => onEventClick(event)}
                        now={now}
                        missed={isEventMissed(event, now, scheduledConversations)}
                      />
                      {count && count > 1 && (
                        <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-foreground/80 px-1 text-[7px] font-bold leading-[10px] text-background">
                          {count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : display.length === 0 ? (
                <span className="text-[9px] text-muted-foreground/30 select-none">—</span>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {display.map(({ event, count }) => {
                    const color = getAgentColor(event.agentSlug);
                    const missed = isEventMissed(event, now, scheduledConversations);
                    return (
                      <div
                        key={event.id}
                        data-month-event
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium",
                          !event.enabled && "opacity-40",
                          missed && "bg-muted/40 text-muted-foreground"
                        )}
                        style={{
                          backgroundColor: missed ? undefined : event.enabled ? color.bg : undefined,
                          color: missed ? undefined : event.enabled ? color.text : undefined,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        onContextMenu={
                          onEventContextMenu
                            ? (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onEventContextMenu(event, e.clientX, e.clientY);
                              }
                            : undefined
                        }
                      >
                        {/* Audit #019: muted, not amber. */}
                        <span className="shrink-0 text-[8px]">{event.agentEmoji}</span>
                        <span className="truncate">
                          {event.label}
                          {count ? ` (${count}x)` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ─── Main calendar component ─── */

export function ScheduleCalendar({
  mode,
  anchor,
  agents,
  jobs,
  manualConversations,
  fullscreen,
  density,
  visibleStartHour = DEFAULT_VISIBLE_START_HOUR,
  visibleEndHour = DEFAULT_VISIBLE_END_HOUR,
  onVisibleHoursChange,
  scheduledConversations,
  onEventClick,
  onDayClick,
  onEventMove,
  onCreateAt,
  onBlockedDrag,
  onEventContextMenu,
  onEmptyContextMenu,
}: ScheduleCalendarProps) {
  const { start, end } = useMemo(() => getViewRange(mode, anchor), [mode, anchor]);

  const events = useMemo(() => {
    const scheduled = getScheduleEvents(agents, jobs, start, end);
    const manual = manualConversations
      ? getManualScheduleEvents(manualConversations, agents, start, end)
      : [];
    if (manual.length === 0) return scheduled;
    return [...scheduled, ...manual].sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [agents, jobs, manualConversations, start, end]);

  // Build day list for week/day views
  const days = useMemo(() => {
    if (mode === "month") return [];
    const result: Date[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [mode, start, end]);

  if (mode === "month") {
    return (
      <TooltipProvider delay={120}>
        <MonthView
          events={events}
          anchor={anchor}
          scheduledConversations={scheduledConversations}
          onEventClick={onEventClick}
          onDayClick={onDayClick}
          onEventContextMenu={onEventContextMenu}
          onEmptyContextMenu={onEmptyContextMenu}
        />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delay={120}>
      <TimeGridView
        events={events}
        days={days}
        fullscreen={fullscreen}
        density={density}
        visibleStartHour={visibleStartHour}
        visibleEndHour={visibleEndHour}
        onVisibleHoursChange={onVisibleHoursChange}
        scheduledConversations={scheduledConversations}
        onEventClick={onEventClick}
        onEventMove={onEventMove}
        onCreateAt={onCreateAt}
        onBlockedDrag={onBlockedDrag}
        onEventContextMenu={onEventContextMenu}
        onEmptyContextMenu={onEmptyContextMenu}
      />
    </TooltipProvider>
  );
}
