"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Square,
  type LucideIcon,
} from "lucide-react";
import { DirIcon } from "@/components/ui/dir-icon";
import { SelectCheckbox } from "./select-checkbox";
import { formatShortcut, isMacPlatform } from "@/lib/keys";
import { restartConversation, stopConversation } from "./board-actions";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { TaskCard } from "./task-card";
import { IconHint } from "./icon-hint";
import { CARD_DROP_PREFIX, laneDropId } from "./dnd-keys";
import { usePersistentState } from "./use-persistent-state";
import { useLocale } from "@/i18n/use-locale";

interface LaneDef {
  key: LaneKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  spin?: boolean;
}

interface LaneDefRaw {
  key: LaneDef["key"];
  labelKey: string;
  hintKey: string;
  icon: LucideIcon;
  spin?: boolean;
}

// Translation keys for lane labels/hints. Real `LaneDef[]` (with `label`
// and `hint` strings) is built inside the component via `t()`.
const LANES_RAW: LaneDefRaw[] = [
  { key: "inbox", labelKey: "kanban:laneInbox", hintKey: "kanban:laneInboxHint", icon: Inbox },
  { key: "needs", labelKey: "kanban:laneNeeds", hintKey: "kanban:laneNeedsHint", icon: MessageCircleQuestion },
  { key: "running", labelKey: "kanban:laneRunning", hintKey: "kanban:laneRunningHint", icon: Loader2, spin: true },
  { key: "done", labelKey: "kanban:laneDone", hintKey: "kanban:laneDoneHint", icon: CheckCircle2 },
  { key: "archive", labelKey: "kanban:laneArchive", hintKey: "kanban:laneArchiveHint", icon: Archive },
];

function LaneHeader({
  lane,
  count,
  onCollapse,
  onAddTask,
  onKillAll,
  onRestartAll,
  restartLabel,
  restartHint,
}: {
  lane: LaneDef;
  count: number;
  /** Collapse the column into the narrow 48px variant. */
  onCollapse?: () => void;
  onAddTask?: () => void;
  onKillAll?: () => void;
  onRestartAll?: () => void;
  /** Overrides for the bulk-restart affordance (audit #067 scopes the
   *  "Your turn" lane's restart to failed-only). */
  restartLabel?: string;
  restartHint?: string;
}) {
  const { t } = useLocale();
  const LaneIcon = lane.icon;
  return (
    <div className="flex w-full items-center gap-2 px-3 py-2 text-start">
      <IconHint label={lane.hint} side="bottom">
        <div className="flex flex-1 items-center gap-2">
          <LaneIcon
            className={cn(
              "size-3.5 text-muted-foreground",
              // Audit #051: only spin the Running loader when work is actually
              // in flight — an empty lane must not animate as if busy.
              lane.spin && count > 0 && "animate-spin [animation-duration:3s]"
            )}
          />
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {lane.label}
          </span>
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
      </IconHint>
      {onKillAll ? (
        <IconHint label={t("kanban:stopAllInLane")} side="bottom">
          <button
            type="button"
            onClick={onKillAll}
            className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9.5px] font-medium text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Square className="size-2.5" />
            {/* Audit #059: match the per-task "Stop" verb instead of "Kill". */}
            {t("rowActions:stop")}
          </button>
        </IconHint>
      ) : null}
      {onRestartAll ? (
        <IconHint label={restartHint ?? t("kanban:restartAllInLane")} side="bottom">
          <button
            type="button"
            onClick={onRestartAll}
            className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9.5px] font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
          >
            <RotateCcw className="size-2.5" />
            {restartLabel ?? t("rowActions:restart")}
          </button>
        </IconHint>
      ) : null}
      {onAddTask ? (
        // Audit #065: the Inbox "+" drafts a task into the Inbox (it does NOT
        // run now like the header "New Task"), so label it accordingly.
        <IconHint label={t("tinyExtras:addToInbox")} side="bottom">
          <button
            type="button"
            onClick={onAddTask}
            aria-label={t("tinyExtras:addToInbox")}
            className="ms-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </IconHint>
      ) : null}
      {onCollapse ? (
        <IconHint label={t("kanban:collapseColumn")} side="bottom">
          <button
            type="button"
            onClick={onCollapse}
            aria-label={t("kanban:collapseColumn")}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <DirIcon ltr={ChevronLeft} rtl={ChevronRight} className="size-3.5" />
          </button>
        </IconHint>
      ) : null}
    </div>
  );
}

function SortableTaskCard({
  task,
  lane,
  agent,
  agents,
  isActive,
  isSelected,
  now,
  onClick,
  onToggleSelect,
  onRefresh,
  density,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  agents?: CabinetAgentSummary[];
  isActive: boolean;
  isSelected: boolean;
  now: number;
  onClick: (modifiers: { shift: boolean; meta: boolean }) => void;
  onToggleSelect: () => void;
  onRefresh?: () => Promise<void> | void;
  density: "compact" | "comfortable";
}) {
  // Audit #053: only spread the drag `listeners` (pointer/keyboard drag
  // handlers) onto the wrapper — NOT `attributes`, which would slap
  // role="button" + tabIndex onto a <div> that already wraps TaskCard's real
  // <button>, producing nested interactives, a doubled tab stop, and a garbled
  // screen-reader announcement. The inner button stays the sole tab stop.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${CARD_DROP_PREFIX}${task.id}`,
    data: { taskId: task.id, lane },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      className={cn(
        "group/card relative rounded-md",
        isSelected && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
      )}
    >
      <SelectCheckbox
        selected={isSelected}
        onToggle={onToggleSelect}
        className="absolute start-1.5 top-1.5 z-20"
      />
      <TaskCard
        task={task}
        lane={lane}
        agent={agent}
        agents={agents}
        isActive={isActive}
        now={now}
        onClick={(e) =>
          onClick({
            shift: !!e?.shiftKey,
            meta: !!(e?.metaKey || e?.ctrlKey),
          })
        }
        onRefresh={onRefresh}
        density={density}
      />
    </div>
  );
}

function DroppableLane({
  lane,
  children,
  className,
}: {
  lane: LaneKey;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: laneDropId(lane),
    data: { lane },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background"
      )}
    >
      {children}
    </div>
  );
}

export function KanbanView({
  byLane,
  agents,
  agentsBySlug,
  selectedId,
  selection,
  now,
  onSelect,
  onToggleSelection,
  onClearSelection,
  onAddTask,
  onRefresh,
  density = "comfortable",
}: {
  byLane: Record<LaneKey, TaskMeta[]>;
  /** Full cabinet agent list — used for the Reassign dropdown. */
  agents?: CabinetAgentSummary[];
  agentsBySlug: Map<string, CabinetAgentSummary>;
  selectedId: string | null;
  selection: Set<string>;
  now: number;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onClearSelection: () => void;
  onAddTask?: () => void;
  onRefresh?: () => Promise<void> | void;
  density?: "compact" | "comfortable";
}) {
  const { t } = useLocale();
  // Audit #062: render the add-task chord per-platform (⌘⌥T on macOS,
  // Ctrl+Alt+T elsewhere) instead of hardcoding the Mac glyphs.
  const isMac = useMemo(isMacPlatform, []);
  const addTaskShortcut = formatShortcut(["cmd", "alt", "T"], isMac);
  // Build the LaneDef array each render using current locale.
  const LANES: LaneDef[] = LANES_RAW.map((raw) => ({
    key: raw.key,
    label: t(raw.labelKey),
    hint: t(raw.hintKey),
    icon: raw.icon,
    spin: raw.spin,
  }));
  // Persisted set of collapsed lane keys. Audit #035: Archive used to be
  // collapsed by default, hiding "what the team did overnight" behind a
  // narrow vertical rail on first open. Now the default is empty (all
  // open); Running auto-toggles with its content (see effect below). Manual
  // collapses still stick across reloads.
  const [collapsedCsv, setCollapsedCsv] = usePersistentState<string>(
    "cabinet.tasks.v2.collapsedLanes",
    "",
    (raw) => raw
  );

  // Audit #035: Archive is the long-tail lane — when there are 50+ entries
  // it shouldn't blow the column past the viewport. Default to showing the
  // first ARCHIVE_PEEK and surface a "Show N more" affordance for the rest.
  const ARCHIVE_PEEK = 8;
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const collapsedLanes: Set<LaneKey> = new Set(
    collapsedCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as LaneKey[]
  );
  const toggleLane = (key: LaneKey) => {
    const next = new Set(collapsedLanes);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedCsv([...next].join(","));
  };

  // Auto-collapse the Running lane when nothing is running; auto-expand when a
  // run starts. Fires on the empty ↔ non-empty transition (plus an initial
  // align on mount when runs are already live), so manual collapse/expand
  // clicks between transitions still stick.
  const runningCount = byLane.running.length;
  const priorRunningRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = priorRunningRef.current;
    priorRunningRef.current = runningCount;
    const parse = () =>
      new Set(
        collapsedCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as LaneKey[]
      );
    // Always force RUNNING open while tasks are present — users shouldn't be
    // able to hide live work. Auto-collapse only when the lane empties.
    if (runningCount > 0) {
      const next = parse();
      if (next.has("running")) {
        next.delete("running");
        setCollapsedCsv([...next].join(","));
      }
      return;
    }
    if (prev !== null && prev > 0 && runningCount === 0) {
      const next = parse();
      if (!next.has("running")) {
        next.add("running");
        setCollapsedCsv([...next].join(","));
      }
    }
  }, [runningCount, collapsedCsv, setCollapsedCsv]);

  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  async function killLane(laneKey: LaneKey, laneItems: TaskMeta[]) {
    if (bulkBusy) return;
    const running = laneItems.filter(
      (t) => t.status === "running" || t.status === "awaiting-input"
    );
    if (running.length === 0) return;
    setBulkBusy(`kill:${laneKey}`);
    try {
      await Promise.all(
        running.map((t) =>
          stopConversation(t.id, t.cabinetPath).catch((err) =>
            console.error("[board] bulk stop failed", t.id, err)
          )
        )
      );
      if (onRefresh) await onRefresh();
    } finally {
      setBulkBusy(null);
    }
  }

  async function restartLane(laneKey: LaneKey, laneItems: TaskMeta[]) {
    if (bulkBusy) return;
    // For Needs attention, only restart failed items (awaiting-input can't be restarted cleanly).
    // For Running, restart everything (stop-then-fresh-run).
    const restartable = laneItems.filter(
      (t) =>
        t.status === "failed" ||
        t.status === "done" ||
        t.status === "idle" ||
        t.status === "running"
    );
    if (restartable.length === 0) return;
    // Audit #060: restarting a live or finished run throws its work away
    // (stop-then-fresh-run). Failed/idle restarts are a safe retry, but confirm
    // before wiping running/done runs so the bulk "Restart" isn't a silent
    // sibling of the typed-"DELETE" bulk delete.
    // ponytail: native confirm; swap for the styled dialog if design wants it.
    const running = restartable.filter((t) => t.status === "running").length;
    const finished = restartable.filter((t) => t.status === "done").length;
    if ((running > 0 || finished > 0) && typeof window !== "undefined") {
      const ok = window.confirm(
        running > 0
          ? `Restart ${restartable.length} task${restartable.length === 1 ? "" : "s"}? This stops ${running} live run${running === 1 ? "" : "s"} and starts over. In-progress work is lost.`
          : `Restart ${restartable.length} finished task${restartable.length === 1 ? "" : "s"}? Their previous output will be replaced.`
      );
      if (!ok) return;
    }
    setBulkBusy(`restart:${laneKey}`);
    try {
      await Promise.all(
        restartable.map((t) =>
          restartConversation(t.id, t.cabinetPath).catch((err) =>
            console.error("[board] bulk restart failed", t.id, err)
          )
        )
      );
      if (onRefresh) await onRefresh();
    } finally {
      setBulkBusy(null);
    }
  }

  // Audit #052: five 280px lanes overflow the sheet, so Archive rests clipped
  // mid-card with nothing signalling the row scrolls. Track the scroll edges
  // and paint a gradient fade on whichever side has more content off-screen.
  // `Math.abs` handles RTL (Chromium reports negative scrollLeft).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ start: false, end: false });
  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setScrollEdges({ start: pos > 4, end: max - pos > 4 });
  }, []);
  useEffect(() => {
    updateScrollEdges();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateScrollEdges());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollEdges]);
  useEffect(() => {
    updateScrollEdges();
  }, [updateScrollEdges, collapsedCsv, archiveExpanded, runningCount, byLane]);

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1">
    <div
      ref={scrollRef}
      onScroll={updateScrollEdges}
      className="flex min-h-0 w-full min-w-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4 snap-x snap-mandatory md:snap-none rtl:flex-row-reverse"
    >
      {LANES.map((lane) => {
        const allItems = byLane[lane.key];
        const isArchive = lane.key === "archive";
        // Audit #035: cap the archive lane to ARCHIVE_PEEK by default so a
        // 50-item history doesn't crowd out the lanes that matter today.
        // The header still shows the full count; "Show N more" reveals
        // the rest within the same column.
        const items =
          isArchive && !archiveExpanded
            ? allItems.slice(0, ARCHIVE_PEEK)
            : allItems;
        const archiveHidden = isArchive ? allItems.length - items.length : 0;
        const isInbox = lane.key === "inbox";
        const isRunning = lane.key === "running";
        const isNeeds = lane.key === "needs";
        const failedCount = allItems.filter((t) => t.status === "failed").length;
        const collapsed = collapsedLanes.has(lane.key);
        const LaneIcon = lane.icon;
        return (
          <DroppableLane
            key={lane.key}
            lane={lane.key}
            className={cn(
              "flex min-h-0 shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20 snap-start",
              collapsed ? "w-12" : "w-[85vw] max-w-[280px] md:w-[280px]"
            )}
          >
            {collapsed ? (
              <button
                type="button"
                onClick={() => toggleLane(lane.key)}
                className="flex h-full w-full flex-col items-center gap-2 py-3 text-muted-foreground hover:bg-muted/40"
                title={`Expand ${lane.label}`}
              >
                <LaneIcon
                  className={cn(
                    "size-4",
                    // Audit #051: don't spin a collapsed empty Running rail.
                    lane.spin && items.length > 0 && "animate-spin [animation-duration:3s]"
                  )}
                />
                <span className="rotate-180 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
                  {lane.label} · {items.length}
                </span>
              </button>
            ) : (
              <>
                <LaneHeader
                  lane={lane}
                  count={allItems.length}
                  onCollapse={isRunning && items.length > 0 ? undefined : () => toggleLane(lane.key)}
                  onAddTask={isInbox && onAddTask ? onAddTask : undefined}
                  onKillAll={
                    isRunning && items.length > 0 && onRefresh
                      ? () => void killLane(lane.key, items)
                      : undefined
                  }
                  onRestartAll={
                    onRefresh
                      ? isRunning && items.length > 0
                        ? () => void restartLane(lane.key, items)
                        : isNeeds && failedCount > 0
                          ? () => void restartLane(lane.key, allItems.filter((t) => t.status === "failed"))
                          : undefined
                      : undefined
                  }
                  // Audit #067: the "Your turn" lane's restart only touches
                  // failed tasks — questions/approvals are left alone — so name
                  // and scope the affordance to that reality.
                  restartLabel={isNeeds ? `Restart failed (${failedCount})` : undefined}
                  restartHint={
                    isNeeds
                      ? "Restart only the failed tasks (questions and approvals are left untouched)"
                      : undefined
                  }
                />
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1">
                  <SortableContext
                    items={items.map((t) => `${CARD_DROP_PREFIX}${t.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.length === 0 ? (
                      isInbox ? (
                        <button
                          type="button"
                          onClick={onAddTask}
                          className="group w-full rounded-md border border-dashed border-border/50 px-3 py-8 text-center space-y-2 transition-colors hover:border-border hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <p className="text-[11px] text-muted-foreground group-hover:text-foreground/70 transition-colors">{lane.hint}</p>
                          <p className="text-[10.5px] text-muted-foreground/50">
                            Click or press{" "}
                            <kbd className="rounded px-1 py-0.5 text-[9.5px] ring-1 ring-foreground/10">{addTaskShortcut}</kbd>
                            {" "}to add it to your Inbox
                          </p>
                        </button>
                      ) : (
                        // Audit #034: empty lanes carry an icon + the lane's
                        // hint so they read as teaching, not as flat captions.
                        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border/50 px-3 py-6 text-center">
                          {/* Audit #051: an empty lane never animates as busy. */}
                          <lane.icon className="size-4 text-muted-foreground/50" />
                          <p className="text-[11px] text-muted-foreground/80">
                            {lane.hint}
                          </p>
                        </div>
                      )
                    ) : (
                      items.map((task) => (
                        <SortableTaskCard
                          key={task.id}
                          task={task}
                          lane={lane.key}
                          agent={agentsBySlug.get(task.agentSlug ?? "")}
                          agents={agents}
                          isActive={selectedId === task.id}
                          isSelected={selection.has(task.id)}
                          now={now}
                          onClick={({ shift, meta }) => {
                            if (shift || meta) {
                              onToggleSelection(task.id);
                            } else {
                              onClearSelection();
                              onSelect(task.id);
                            }
                          }}
                          onToggleSelect={() => onToggleSelection(task.id)}
                          onRefresh={onRefresh}
                          density={density}
                        />
                      ))
                    )}
                  </SortableContext>
                  {isInbox && items.length > 0 && onAddTask && (
                    <button
                      type="button"
                      onClick={onAddTask}
                      className="mt-1 w-full rounded-md px-3 py-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors text-start"
                    >
                      + {t("tinyExtras:addToInbox")}
                    </button>
                  )}
                  {isArchive && archiveHidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setArchiveExpanded(true)}
                      className="mt-1 w-full rounded-md border border-dashed border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground/70 hover:border-border hover:text-foreground hover:bg-muted/30 transition-colors text-center"
                    >
                      Show {archiveHidden} more →
                    </button>
                  )}
                  {isArchive && archiveExpanded && allItems.length > ARCHIVE_PEEK && (
                    <button
                      type="button"
                      onClick={() => setArchiveExpanded(false)}
                      className="mt-1 w-full rounded-md px-3 py-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors text-center"
                    >
                      Show fewer
                    </button>
                  )}
                </div>
              </>
            )}
          </DroppableLane>
        );
      })}
    </div>
      {scrollEdges.start && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-0 w-10 bg-gradient-to-r from-background to-transparent rtl:bg-gradient-to-l"
        />
      )}
      {scrollEdges.end && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-background to-transparent rtl:bg-gradient-to-r"
        />
      )}
    </div>
  );
}

export function shorten(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
