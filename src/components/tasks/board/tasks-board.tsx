"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  ChevronDown,
  Clock3,
  HeartPulse,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useBoardData } from "./use-board-data";
import { KanbanView } from "./kanban-view";
import { ListView } from "./list-view";
import { ScheduleView } from "./schedule-view";
import { DetailPanel } from "./detail-panel";
import { ViewToggle, type BoardViewMode } from "./view-toggle";
import { DensityToggle, type BoardDensity } from "./density-toggle";
import { FilterBar, TriggerChip, type TriggerFilter } from "./filter-bar";
import { UndoToast, type PendingUndo } from "./undo-toast";
import { ConfirmPopover, type PendingConfirm } from "./confirm-popover";
import { StartWorkDialog, type StartWorkMode } from "@/components/composer/start-work-dialog";
import { ReassignMenu } from "./reassign-menu";
import { deleteConversation, reassignConversation } from "./board-actions";
import {
  ScheduleJobDialog,
  ScheduleHeartbeatDialog,
  type JobDialogState,
  type HeartbeatDialogState,
} from "./schedule-dialogs";
import { useDragHandler } from "./use-drag-handler";
import { usePersistentState } from "./use-persistent-state";
import { TaskCard } from "./task-card";
import { CARD_DROP_PREFIX } from "./dnd-keys";
import { deriveLane, laneSort, type LaneKey } from "./lane-rules";
import { BoardSkeleton } from "./board-skeletons";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { useAppStore } from "@/stores/app-store";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import type { TaskMeta } from "@/types/tasks";
import { cn } from "@/lib/utils";

/**
 * Entry point for the Task Board.
 *  - Kanban / List / Schedule views toggleable from the header
 *  - Click-to-open DetailPanel that embeds the existing TaskConversationPage
 *  - Live updates via /api/agents/conversations/events SSE
 */
export function TasksBoard({
  cabinetPath = ROOT_CABINET_PATH,
  visibilityMode: visibilityModeProp = "own",
  standalone = false,
}: {
  cabinetPath?: string;
  visibilityMode?: CabinetVisibilityMode;
  standalone?: boolean;
}) {
  // Visibility depth is owned by the board (so the in-board segmented
  // control can change it) but seeded from the caller / the cabinet's
  // per-path store so sidebar + board share the same default.
  const [visibilityMode, setVisibilityMode] =
    useState<CabinetVisibilityMode>(visibilityModeProp);
  useEffect(() => {
    setVisibilityMode(visibilityModeProp);
  }, [visibilityModeProp]);
  const setCabinetVisibilityMode = useAppStore((s) => s.setCabinetVisibilityMode);

  const {
    byLane,
    agentsBySlug,
    overview,
    tasks,
    conversations,
    jobs,
    loading,
    refreshing,
    now,
    refresh,
  } = useBoardData({ cabinetPath, visibilityMode });

  const [selection, setSelection] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelection(new Set());

  const [view, setView] = usePersistentState<BoardViewMode>(
    "cabinet.tasks.v2.view",
    "kanban",
    (raw) => (raw === "kanban" || raw === "list" || raw === "schedule" ? raw : null)
  );
  const [agentFilter, setAgentFilter] = usePersistentState<string | null>(
    "cabinet.tasks.v2.agent",
    null,
    (raw) => (raw === "" || raw === "null" ? null : raw)
  );
  const [triggerFilter, setTriggerFilter] = usePersistentState<TriggerFilter>(
    "cabinet.tasks.v2.trigger",
    "all",
    (raw) =>
      raw === "all" || raw === "manual" || raw === "job" || raw === "heartbeat"
        ? raw
        : null
  );
  const [density, setDensity] = usePersistentState<BoardDensity>(
    "cabinet.tasks.v2.density",
    "comfortable",
    (raw) => (raw === "compact" || raw === "comfortable" ? raw : null)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskMode, setNewTaskMode] = useState<StartWorkMode>("now");
  const [newTaskInitialPrompt, setNewTaskInitialPrompt] = useState<string | undefined>(undefined);
  const [jobDialog, setJobDialog] = useState<JobDialogState | null>(null);
  const [heartbeatDialog, setHeartbeatDialog] = useState<HeartbeatDialogState | null>(null);

  // Sidebar "+ Tasks" pill dispatches `cabinet:open-create-task` after routing
  // to section=tasks. Listen for it so the pill actually opens the composer.
  // Event detail may include `initialPrompt` (onboarding tour uses this to
  // hand off a starter task the user can edit or submit).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { initialPrompt?: string; initialMode?: StartWorkMode }
        | undefined;
      setNewTaskMode(detail?.initialMode ?? "now");
      setNewTaskInitialPrompt(detail?.initialPrompt);
      setNewTaskOpen(true);
    };
    window.addEventListener("cabinet:open-create-task", handler);
    return () => window.removeEventListener("cabinet:open-create-task", handler);
  }, []);

  const openComposer = (mode: StartWorkMode) => {
    setNewTaskMode(mode);
    setNewTaskOpen(true);
  };

  // Esc clears selection (the detail panel has its own Esc handler when
  // open so that one wins — clearing selection fires when nothing else
  // claims Escape).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedId == null && selection.size > 0) {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selection.size]);

  // Client-side agent + trigger filters. Null/"all" = no narrowing. Non-null
  // narrows tasks + conversations; byLane is rebuilt from the filtered set so
  // lane counts reflect what the user actually sees.
  const filteredTasks = useMemo<TaskMeta[]>(() => {
    let out = tasks;
    if (agentFilter) out = out.filter((t) => t.agentSlug === agentFilter);
    if (triggerFilter !== "all") out = out.filter((t) => t.trigger === triggerFilter);
    return out;
  }, [tasks, agentFilter, triggerFilter]);
  const filteredConversations = useMemo(() => {
    let out = conversations;
    if (agentFilter) out = out.filter((c) => c.agentSlug === agentFilter);
    if (triggerFilter !== "all") out = out.filter((c) => c.trigger === triggerFilter);
    return out;
  }, [conversations, agentFilter, triggerFilter]);
  const filteredByLane = useMemo<Record<LaneKey, TaskMeta[]>>(() => {
    if (!agentFilter && triggerFilter === "all") return byLane;
    const map: Record<LaneKey, TaskMeta[]> = {
      inbox: [], needs: [], running: [], done: [], archive: [],
    };
    for (const t of filteredTasks) map[deriveLane(t, now)].push(t);
    for (const lane of Object.keys(map) as LaneKey[]) map[lane].sort(laneSort(lane));
    return map;
  }, [agentFilter, triggerFilter, byLane, filteredTasks, now]);

  // Flat list for the List view — running first (any lane), then newest-first
  // by lastActivity/started; matches the Agents workspace conversation list.
  const flatList = useMemo<TaskMeta[]>(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      const runA = a.status === "running" ? 0 : 1;
      const runB = b.status === "running" ? 0 : 1;
      if (runA !== runB) return runA - runB;
      const ta = new Date(a.lastActivityAt ?? a.startedAt ?? 0).getTime();
      const tb = new Date(b.lastActivityAt ?? b.startedAt ?? 0).getTime();
      return tb - ta;
    });
    return sorted;
  }, [filteredTasks]);

  const handleAddTask = () => openComposer("inbox");

  const selected = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null;
  const selectedLane = selected ? deriveLane(selected, now) : null;
  const selectedAgent = selected ? agentsBySlug.get(selected.agentSlug ?? "") : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useDragHandler({
    byLane: filteredByLane,
    selection,
    clearSelection,
    onUndoQueued: setPendingUndo,
    onConfirmRequested: setPendingConfirm,
    onRefresh: refresh,
  });

  const draggedTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) ?? null : null;
  const draggedLane = draggedTask ? deriveLane(draggedTask, now) : null;
  const draggedAgent = draggedTask ? agentsBySlug.get(draggedTask.agentSlug ?? "") : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/95 px-4 py-2.5 sm:px-6">
        {standalone && (
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <h1 className="text-[14px] font-semibold tracking-tight">Tasks</h1>
        {refreshing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        <div className="ml-4 flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <DensityToggle value={density} onChange={setDensity} />
        </div>

        {/* right-side: depth, trigger, selection */}
        <div className="ml-auto flex items-center gap-2">
          {/* visibility depth dropdown */}
          <DepthDropdown
            mode={visibilityMode}
            onChange={(mode) => {
              setVisibilityMode(mode);
              setCabinetVisibilityMode(cabinetPath, mode);
            }}
          />

          <div className="h-3.5 w-px bg-border/60" />

          {/* trigger filter chips — "All" carries the task count */}
          <div className="flex items-center gap-1">
            <TriggerChip
              active={triggerFilter === "all"}
              onClick={() => setTriggerFilter("all")}
              count={
                agentFilter
                  ? `${filteredTasks.length}/${tasks.length}`
                  : tasks.length
              }
            >
              All
            </TriggerChip>
            <TriggerChip
              active={triggerFilter === "manual"}
              onClick={() => setTriggerFilter("manual")}
              icon={<Bot className="size-3" />}
              tone="sky"
              title="Manual — tasks you launched directly"
            >
              Manual
            </TriggerChip>
            <TriggerChip
              active={triggerFilter === "job"}
              onClick={() => setTriggerFilter("job")}
              icon={<Clock3 className="size-3" />}
              tone="emerald"
              title="Jobs — scheduled recurring runs"
            >
              Jobs
            </TriggerChip>
            <TriggerChip
              active={triggerFilter === "heartbeat"}
              onClick={() => setTriggerFilter("heartbeat")}
              icon={<HeartPulse className="size-3" />}
              tone="pink"
              title="Heartbeat — self-directed agent runs"
            >
              Heartbeat
            </TriggerChip>
          </div>

          {selection.size > 0 && (
            <>
              <div className="h-3.5 w-px bg-border/60" />
              <div className="flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-300">
                <span>{selection.size} selected</span>
                <span className="h-3 w-px bg-sky-500/30" aria-hidden />
                <ReassignMenu
                  agents={overview?.agents ?? []}
                  onSelect={async (slug) => {
                    const selectedTasks = tasks.filter(
                      (t) => selection.has(t.id) && t.agentSlug !== slug
                    );
                    if (selectedTasks.length === 0) return;
                    try {
                      await Promise.all(
                        selectedTasks.map((t) =>
                          reassignConversation(t.id, slug, t.cabinetPath).catch((err) =>
                            console.error("[board] bulk reassign failed", t.id, err)
                          )
                        )
                      );
                      clearSelection();
                      await refresh();
                    } catch (err) {
                      console.error("[board] bulk reassign failed", err);
                    }
                  }}
                  triggerClassName="inline-flex items-center gap-1 rounded px-1.5 text-[10.5px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                >
                  <ArrowRightLeft className="size-3" />
                  Reassign
                </ReassignMenu>
                <span className="h-3 w-px bg-sky-500/30" aria-hidden />
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded px-1 text-[10.5px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                  title="Clear selection (Esc)"
                >
                  Clear
                </button>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              const toDelete = filteredTasks.slice();
              const count = toDelete.length;
              if (count === 0) {
                const scope =
                  triggerFilter !== "all"
                    ? `${triggerFilter} task`
                    : agentFilter
                    ? "task"
                    : "task";
                const narrowedBy =
                  triggerFilter !== "all" && agentFilter
                    ? `the ${triggerFilter} filter and selected agent`
                    : triggerFilter !== "all"
                    ? `the ${triggerFilter} filter`
                    : agentFilter
                    ? "the selected agent filter"
                    : null;
                setPendingConfirm({
                  id: `delete-empty-${Date.now()}`,
                  title: `No ${scope}s to delete`,
                  body: narrowedBy
                    ? `Nothing matches ${narrowedBy}. Clear the filter, pick another view, or create a new task.`
                    : `There are no tasks on the board yet. Create one with the + New Task button.`,
                  confirmLabel: "Got it",
                  infoOnly: true,
                  onConfirm: () => {},
                });
                return;
              }
              const narrowed = !!agentFilter || triggerFilter !== "all";
              setPendingConfirm({
                id: `delete-all-${Date.now()}`,
                title: `Delete ${count} task${count === 1 ? "" : "s"}?`,
                body: `This permanently removes conversation meta, transcripts, and artifacts for every task currently shown${
                  narrowed ? " by the active filters" : ""
                }. This can't be undone.`,
                confirmLabel: `Delete ${count}`,
                destructive: true,
                typedConfirmation: "DELETE",
                onConfirm: async () => {
                  const ids = new Set(toDelete.map((t) => t.id));
                  await Promise.all(
                    toDelete.map((t) =>
                      deleteConversation(t.id, t.cabinetPath).catch((err) =>
                        console.error("[board] bulk delete failed", t.id, err)
                      )
                    )
                  );
                  if (selectedId && ids.has(selectedId)) setSelectedId(null);
                  clearSelection();
                  await refresh();
                },
              });
            }}
            title={
              filteredTasks.length > 0
                ? `Delete all ${filteredTasks.length} shown task${
                    filteredTasks.length === 1 ? "" : "s"
                  }`
                : "Nothing to delete in this view"
            }
            aria-label={
              filteredTasks.length > 0
                ? "Delete all shown tasks"
                : "No tasks in this view"
            }
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-md transition-colors",
              filteredTasks.length > 0
                ? "text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                : "text-muted-foreground/40 hover:bg-muted/60 hover:text-muted-foreground/70"
            )}
          >
            <Trash2 className="size-3" />
          </button>

          <div className="h-3.5 w-px bg-border/60" />

          <NewWorkButton onCreate={openComposer} />
        </div>
      </header>

      <FilterBar
        agents={overview?.agents ?? []}
        agentFilter={agentFilter}
        onAgentChange={setAgentFilter}
      />

    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragTaskId(String(e.active.id).replace(CARD_DROP_PREFIX, ""))
      }
      onDragCancel={() => setDragTaskId(null)}
      onDragEnd={(e) => {
        setDragTaskId(null);
        void handleDragEnd(e);
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!loading && tasks.length > 0 && filteredTasks.length === 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
            <span>
              <strong>{tasks.length}</strong> task{tasks.length === 1 ? "" : "s"} hidden by filters
              {agentFilter && ` · agent: ${agentFilter}`}
              {triggerFilter !== "all" && ` · trigger: ${triggerFilter}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setAgentFilter(null);
                setTriggerFilter("all");
              }}
              className="rounded border border-amber-600/40 bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-amber-500/10"
            >
              Clear filters
            </button>
          </div>
        )}
        {loading ? (
          <BoardSkeleton view={view} />
        ) : (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {view === "kanban" && (
              <KanbanView
                byLane={filteredByLane}
                agents={overview?.agents ?? []}
                agentsBySlug={agentsBySlug}
                selectedId={selectedId}
                selection={selection}
                now={now}
                onSelect={setSelectedId}
                onToggleSelection={toggleSelection}
                onClearSelection={clearSelection}
                onAddTask={handleAddTask}
                onRefresh={refresh}
                density={density}
              />
            )}
            {view === "list" && (
              <ListView
                tasks={flatList}
                agents={overview?.agents ?? []}
                agentsBySlug={agentsBySlug}
                selectedId={selectedId}
                now={now}
                onSelect={setSelectedId}
                onRefresh={refresh}
                density={density}
              />
            )}
            {view === "schedule" && (
              <ScheduleView
                agents={
                  agentFilter
                    ? (overview?.agents ?? []).filter((a) => a.slug === agentFilter)
                    : overview?.agents ?? []
                }
                jobs={
                  agentFilter ? jobs.filter((j) => j.ownerAgent === agentFilter) : jobs
                }
                conversations={filteredConversations}
                onConversationClick={setSelectedId}
                onJobClick={(job, agent) => {
                  setJobDialog({
                    agentSlug: agent.slug,
                    agentName: agent.name,
                    cabinetPath: agent.cabinetPath || cabinetPath,
                    draft: {
                      id: job.id,
                      name: job.name,
                      schedule: job.schedule,
                      prompt: job.prompt || "",
                      enabled: job.enabled,
                    },
                  });
                }}
                onHeartbeatClick={(agent) => {
                  setHeartbeatDialog({
                    agentSlug: agent.slug,
                    agentName: agent.name,
                    cabinetPath: agent.cabinetPath || cabinetPath,
                    heartbeat: agent.heartbeat || "0 9 * * 1-5",
                    active: agent.active,
                  });
                }}
              />
            )}
          </main>
        )}

        {selected && selectedLane && (
          <DetailPanel
            task={selected}
            lane={selectedLane}
            agent={selectedAgent}
            onClose={() => setSelectedId(null)}
            onRefresh={refresh}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask && draggedLane ? (
          <div className="relative rotate-[-2deg] shadow-2xl">
            <TaskCard
              task={draggedTask}
              lane={draggedLane}
              agent={draggedAgent}
              isActive={false}
              now={now}
              onClick={() => undefined}
              density={density}
            />
            {selection.has(draggedTask.id) && selection.size > 1 && (
              <span className="absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border border-border/60 bg-foreground text-[11px] font-semibold text-background shadow-md">
                {selection.size}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>

      <UndoToast pending={pendingUndo} onDismiss={() => setPendingUndo(null)} />
      <ConfirmPopover
        pending={pendingConfirm}
        onDismiss={() => setPendingConfirm(null)}
      />

      <StartWorkDialog
        open={newTaskOpen}
        onOpenChange={(open) => {
          setNewTaskOpen(open);
          if (!open) setNewTaskInitialPrompt(undefined);
        }}
        cabinetPath={cabinetPath}
        agents={overview?.agents ?? []}
        initialMode={newTaskMode}
        initialPrompt={newTaskInitialPrompt}
        onStarted={(id) => {
          void refresh();
          setSelectedId(id);
        }}
      />

      <ScheduleJobDialog
        state={jobDialog}
        onStateChange={setJobDialog}
        onClose={() => setJobDialog(null)}
        onRefresh={refresh}
      />
      <ScheduleHeartbeatDialog
        state={heartbeatDialog}
        onStateChange={setHeartbeatDialog}
        onClose={() => setHeartbeatDialog(null)}
        onRefresh={refresh}
      />
    </div>
  );
}
function NewWorkButton({
  onCreate,
}: {
  onCreate: (mode: StartWorkMode) => void;
}) {
  return (
    <div className="inline-flex h-7 items-stretch overflow-hidden rounded-md shadow-sm ring-1 ring-primary/20">
      <button
        type="button"
        onClick={() => onCreate("now")}
        className="inline-flex items-center gap-1.5 bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        title="Create a new task"
      >
        <Plus className="size-3.5" />
        New Task
      </button>
      <div className="w-px bg-primary-foreground/20" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center bg-primary px-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
          title="More new item types"
          aria-label="More new item types"
        >
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem
            onClick={() => onCreate("now")}
            className="flex items-start gap-2 py-2"
          >
            <Zap className="mt-0.5 size-3.5 text-foreground/70" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">New Task</span>
              <span className="text-[11px] text-muted-foreground">
                Run once, right now
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onCreate("recurring")}
            className="flex items-start gap-2 py-2"
          >
            <Repeat className="mt-0.5 size-3.5 text-indigo-500" />
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">New Routine</span>
              <span className="text-[11px] text-muted-foreground">
                Run this prompt on a schedule
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
