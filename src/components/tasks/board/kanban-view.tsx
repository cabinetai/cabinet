"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronLeft,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Square,
  type LucideIcon,
} from "lucide-react";
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
import { CARD_DROP_PREFIX, laneDropId } from "./dnd-keys";
import { usePersistentState } from "./use-persistent-state";

interface LaneDef {
  key: LaneKey;
  label: string;
  hint: string;
  icon: LucideIcon;
  spin?: boolean;
}

const LANES: LaneDef[] = [
  { key: "inbox", label: "Inbox", hint: "Drafted — waiting for you to start", icon: Inbox },
  { key: "needs", label: "Your turn", hint: "Agent asked a question or needs approval", icon: MessageCircleQuestion },
  { key: "running", label: "Running", hint: "Agents working right now", icon: Loader2, spin: true },
  { key: "done", label: "Just Finished", hint: "Completed in the last hour", icon: CheckCircle2 },
  { key: "archive", label: "Archive", hint: "Older and acknowledged", icon: Archive },
];

function LaneHeader({
  lane,
  count,
  onCollapse,
  onAddTask,
  onKillAll,
  onRestartAll,
}: {
  lane: LaneDef;
  count: number;
  /** Collapse the column into the narrow 48px variant. */
  onCollapse?: () => void;
  onAddTask?: () => void;
  onKillAll?: () => void;
  onRestartAll?: () => void;
}) {
  const LaneIcon = lane.icon;
  return (
    <div className="flex w-full items-center gap-2 px-3 py-2 text-left">
      <div className="flex flex-1 items-center gap-2">
        <LaneIcon
          className={cn("size-3.5 text-muted-foreground", lane.spin && "animate-spin [animation-duration:3s]")}
        />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {lane.label}
        </span>
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      {onKillAll ? (
        <button
          type="button"
          onClick={onKillAll}
          className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9.5px] font-medium text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          title="Stop all running tasks in this lane"
        >
          <Square className="size-2.5" />
          Kill
        </button>
      ) : null}
      {onRestartAll ? (
        <button
          type="button"
          onClick={onRestartAll}
          className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[9.5px] font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
          title="Restart all tasks in this lane"
        >
          <RotateCcw className="size-2.5" />
          Restart
        </button>
      ) : null}
      {onAddTask ? (
        <button
          type="button"
          onClick={onAddTask}
          className="ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="New task"
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
      {onCollapse ? (
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Collapse column"
        >
          <ChevronLeft className="size-3.5" />
        </button>
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
  onRefresh?: () => Promise<void> | void;
  density: "compact" | "comfortable";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
      )}
    >
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
  // Persisted set of collapsed lane keys. Default: Archive + Running collapsed,
  // rest open. Running auto-toggles with its content (see effect below), but a
  // manual toggle in between transitions still sticks.
  const [collapsedCsv, setCollapsedCsv] = usePersistentState<string>(
    "cabinet.tasks.v2.collapsedLanes",
    "archive",
    (raw) => raw
  );
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
    if (prev === null) {
      if (runningCount > 0) {
        const next = parse();
        if (next.has("running")) {
          next.delete("running");
          setCollapsedCsv([...next].join(","));
        }
      }
      return;
    }
    if (prev === 0 && runningCount > 0) {
      const next = parse();
      if (next.has("running")) {
        next.delete("running");
        setCollapsedCsv([...next].join(","));
      }
    } else if (prev > 0 && runningCount === 0) {
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

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4">
      {LANES.map((lane) => {
        const items = byLane[lane.key];
        const isInbox = lane.key === "inbox";
        const isRunning = lane.key === "running";
        const isNeeds = lane.key === "needs";
        const failedCount = items.filter((t) => t.status === "failed").length;
        const collapsed = collapsedLanes.has(lane.key);
        const LaneIcon = lane.icon;
        return (
          <DroppableLane
            key={lane.key}
            lane={lane.key}
            className={cn(
              "flex min-h-0 shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20",
              collapsed ? "w-12" : "w-[280px]"
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
                    lane.spin && "animate-spin [animation-duration:3s]"
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
                  count={items.length}
                  onCollapse={() => toggleLane(lane.key)}
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
                          ? () => void restartLane(lane.key, items.filter((t) => t.status === "failed"))
                          : undefined
                      : undefined
                  }
                />
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1">
                  <SortableContext
                    items={items.map((t) => `${CARD_DROP_PREFIX}${t.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
                          {lane.hint}
                        </div>
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
                          onRefresh={onRefresh}
                          density={density}
                        />
                      ))
                    )}
                  </SortableContext>
                </div>
              </>
            )}
          </DroppableLane>
        );
      })}
    </div>
  );
}

export function shorten(s: string, max = 40): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
