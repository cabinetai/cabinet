"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  Zap,
} from "lucide-react";
import { DirIcon } from "@/components/ui/dir-icon";
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
import { ScheduleView } from "@/components/cabinets/schedule-view";
import { ViewToggle, type BoardViewMode } from "./view-toggle";
import { DensityToggle, type BoardDensity } from "./density-toggle";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "@/components/agents/v2/tab-explainer";
import {
  AgentFilterDropdown,
  TriggerFilterDropdown,
  type TriggerFilter,
} from "./filter-bar";
import { UndoToast, type PendingUndo } from "./undo-toast";
import { ConfirmPopover, type PendingConfirm } from "./confirm-popover";
import { StartWorkDialog, type StartWorkMode } from "@/components/composer/start-work-dialog";
import type { TaskRuntimeSelection } from "@/components/composer/task-runtime-picker";
import { IconHint } from "./icon-hint";
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
import type { TaskMeta, TaskStatus } from "@/types/tasks";
import type { ConversationMeta, ConversationStatus } from "@/types/conversations";
import { fetchTask } from "@/lib/agents/task-client";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

/**
 * The board lists `TaskMeta`, but the shared task drawer is keyed on
 * `ConversationMeta`. The drawer only reads `id`/`cabinetPath`/`muted` (the
 * embedded conversation page re-fetches everything by id), so this adapter
 * only needs to be type-correct, not field-perfect — the status enums differ,
 * so awaiting-input collapses to "running" with the `awaitingInput` flag set.
 */
function taskStatusToConversationStatus(status: TaskStatus): ConversationStatus {
  switch (status) {
    case "running":
    case "awaiting-input":
      return "running";
    case "done":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

function taskMetaToConversationMeta(t: TaskMeta): ConversationMeta {
  return {
    id: t.id,
    agentSlug: t.agentSlug ?? "editor",
    cabinetPath: t.cabinetPath,
    title: t.title,
    trigger: t.trigger,
    status: taskStatusToConversationStatus(t.status),
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    jobId: t.jobId,
    jobName: t.jobName,
    providerId: t.providerId,
    adapterType: t.adapterType,
    adapterConfig: t.adapterConfig,
    promptPath: "",
    transcriptPath: "",
    mentionedPaths: t.mentionedPaths ?? [],
    artifactPaths: t.artifactPaths ?? [],
    summary: t.summary,
    lastActivityAt: t.lastActivityAt,
    tokens: t.tokens,
    runtime: t.runtime,
    archivedAt: t.archivedAt,
    awaitingInput: t.status === "awaiting-input",
    titlePinned: t.titlePinned,
    summaryEditedAt: t.summaryEditedAt,
    boardOrder: t.boardOrder,
    muted: t.muted,
    errorKind: t.errorKind as ConversationMeta["errorKind"],
    errorHint: t.errorHint,
    errorRetryAfterSec: t.errorRetryAfterSec,
    lastResumeAttempt: t.lastResumeAttempt,
    pendingActions: t.pendingActions,
    dispatchedActions: t.dispatchedActions,
  };
}

/**
 * Entry point for the Task Board.
 *  - Kanban / List / Schedule views toggleable from the header
 *  - Click-to-open hands off to the shared global task drawer (TaskDetailPanel)
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
  const { t } = useLocale();
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
  // Onboarding explainer for the kanban/list views. Schedule has its own
  // (keyed "tasks-schedule") inside ScheduleView.
  const boardExplainer = useExplainerState("tasks-board");
  // The opened task lives in the shared global drawer (same one the rail and
  // sidebar use), not a board-local panel. Derive the "selected card"
  // highlight from the drawer so the two stay in sync.
  const setTaskPanelConversation = useAppStore((s) => s.setTaskPanelConversation);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);
  const panelOpen = useAppStore((s) => s.taskPanelOpen);
  const panelConversationId = useAppStore(
    (s) => s.taskPanelConversation?.id ?? null
  );
  const selectedId = panelOpen ? panelConversationId : null;

  // Opening a card hands off to the global drawer. Cards already in the list
  // convert locally; a just-started task not yet in the list is fetched by id.
  const openTaskById = useCallback(
    async (id: string) => {
      const local = tasks.find((task) => task.id === id);
      if (local) {
        setTaskPanelConversation(taskMetaToConversationMeta(local));
        return;
      }
      try {
        const fresh = await fetchTask(id, cabinetPath);
        setTaskPanelConversation(taskMetaToConversationMeta(fresh.meta));
      } catch (err) {
        console.error("[board] open task failed", id, err);
      }
    },
    [tasks, cabinetPath, setTaskPanelConversation]
  );
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskMode, setNewTaskMode] = useState<StartWorkMode>("now");
  const [newTaskInitialPrompt, setNewTaskInitialPrompt] = useState<string | undefined>(undefined);
  // Inbox-draft edit: RowActions dispatches `cabinet:open-edit-draft`; we
  // load the draft's current text/agent/runtime and reopen StartWorkDialog
  // bound to that conversation so submit PATCHes instead of creating.
  const [editingDraft, setEditingDraft] = useState<
    { conversationId: string; cabinetPath?: string } | null
  >(null);
  const [editSeed, setEditSeed] = useState<
    { prompt: string; agentSlug?: string; runtime?: TaskRuntimeSelection } | null
  >(null);
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
      setEditingDraft(null);
      setEditSeed(null);
      setNewTaskMode(detail?.initialMode ?? "now");
      setNewTaskInitialPrompt(detail?.initialPrompt);
      setNewTaskOpen(true);
    };
    window.addEventListener("cabinet:open-create-task", handler);
    return () => window.removeEventListener("cabinet:open-create-task", handler);
  }, []);

  // Inbox-draft Edit (row action) → load the draft, then reopen the dialog
  // pre-filled and bound to it. `request` is the user's original typed text
  // (the composite prompt's "User request:" tail, peeled by the server).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { taskId?: string; cabinetPath?: string }
        | undefined;
      const taskId = detail?.taskId;
      if (!taskId) return;
      const cp = detail?.cabinetPath;
      void (async () => {
        try {
          const params = new URLSearchParams();
          if (cp) params.set("cabinetPath", cp);
          const qs = params.toString();
          const res = await fetch(
            `/api/agents/conversations/${encodeURIComponent(taskId)}${qs ? `?${qs}` : ""}`,
            { cache: "no-store" }
          );
          if (!res.ok) throw new Error(`load draft failed: ${res.status}`);
          const data = (await res.json()) as {
            request?: string;
            meta?: {
              agentSlug?: string;
              providerId?: string;
              adapterType?: string;
              adapterConfig?: Record<string, unknown>;
            };
          };
          const meta = data.meta;
          const cfg = meta?.adapterConfig ?? {};
          setEditSeed({
            prompt: data.request ?? "",
            agentSlug: meta?.agentSlug,
            runtime: {
              providerId: meta?.providerId,
              adapterType: meta?.adapterType,
              model: typeof cfg.model === "string" ? cfg.model : undefined,
              effort: typeof cfg.effort === "string" ? cfg.effort : undefined,
            },
          });
          setEditingDraft({ conversationId: taskId, cabinetPath: cp });
          setNewTaskOpen(true);
        } catch (err) {
          console.error("[board] open edit draft failed", err);
        }
      })();
    };
    window.addEventListener("cabinet:open-edit-draft", handler);
    return () => window.removeEventListener("cabinet:open-edit-draft", handler);
  }, []);

  const openComposer = (mode: StartWorkMode) => {
    // Always a fresh task — drop any edit binding so submit creates instead
    // of PATCHing the previously-edited draft.
    setEditingDraft(null);
    setEditSeed(null);
    setNewTaskInitialPrompt(undefined);
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
      <header
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-background px-4 py-2 transition-[padding] duration-200 md:h-12 md:flex-nowrap md:py-0"
        style={{ paddingInlineStart: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
      >
        {standalone && (
          <Link
            href="/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <DirIcon ltr={ArrowLeft} rtl={ArrowRight} className="size-4" />
          </Link>
        )}
        <h1 className="font-ui text-[14px] font-semibold tracking-tight">{t("tasksBoard:title")}</h1>
        {refreshing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {view !== "schedule" && (
          <ExplainerIcon
            state={boardExplainer}
            ariaLabel="About the task board"
          />
        )}
        <div className="flex items-center gap-2 md:ms-2">
          <ViewToggle value={view} onChange={setView} />
          {/* Density only affects kanban/list rows — the schedule grid
              ignores it, so don't surface a no-op control there. */}
          {view !== "schedule" && (
            <DensityToggle value={density} onChange={setDensity} />
          )}
        </div>

        {/* right-side: depth, trigger, selection */}
        <div className="ms-auto flex items-center gap-2">
          {/* visibility depth dropdown */}
          <DepthDropdown
            mode={visibilityMode}
            onChange={(mode) => {
              setVisibilityMode(mode);
              setCabinetVisibilityMode(cabinetPath, mode);
            }}
            descriptions={{
              own: "Show only this cabinet's tasks.",
              "children-1":
                "Also show tasks from direct child cabinets.",
              "children-2":
                "Also show tasks from two levels of child cabinets.",
              all: "Show tasks from this cabinet and all its children.",
            }}
          />

          <div className="h-3.5 w-px bg-border/60" />

          {/* Audit #036: agent filter is now a dropdown beside the trigger
              chips — single header row for all filtering. The dedicated
              agent-pill row below the header is gone. */}
          <AgentFilterDropdown
            agents={overview?.agents ?? []}
            agentFilter={agentFilter}
            onAgentChange={setAgentFilter}
          />

          <div className="h-3.5 w-px bg-border/60" />

          {/* trigger filter — dropdown, styled like the cabinet-scope and
              agent-filter dropdowns. "All" carries the task count. */}
          <TriggerFilterDropdown
            value={triggerFilter}
            onChange={setTriggerFilter}
            count={
              agentFilter
                ? `${filteredTasks.length}/${tasks.length}`
                : tasks.length
            }
          />

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
                  title={t("tasksBoard:clearSelection")}
                >
                  Clear
                </button>
              </div>
            </>
          )}

          {/*
           * Audit #033: bulk delete is a high-blast operation. Don't surface
           * it as a permanent toolbar icon next to filter chips — too easy
           * to mistake for a filter clear. Show only when the user has
           * narrowed the view (filter active) or made a selection. The
           * existing typed-DELETE modal stays as the safety net.
           */}
          {(triggerFilter !== "all" || agentFilter || selection.size > 0) && (
          <button
            type="button"
            onClick={() => {
              const toDelete = filteredTasks.slice();
              const count = toDelete.length;
              if (count === 0) {
                const narrowedBy =
                  triggerFilter !== "all" && agentFilter
                    ? t("tasksBoard:filterTriggerAndAgent", { trigger: triggerFilter })
                    : triggerFilter !== "all"
                    ? t("tasksBoard:filterTrigger", { trigger: triggerFilter })
                    : agentFilter
                    ? t("tasksBoard:filterSelectedAgent")
                    : null;
                setPendingConfirm({
                  id: `delete-empty-${Date.now()}`,
                  title: t("tasksBoard:noToDeleteTitle"),
                  body: narrowedBy
                    ? t("tasksBoard:noToDeleteFiltered", { filter: narrowedBy })
                    : t("tasksBoard:noToDeleteEmpty"),
                  confirmLabel: t("tasksBoard:gotIt"),
                  infoOnly: true,
                  onConfirm: () => {},
                });
                return;
              }
              const narrowed = !!agentFilter || triggerFilter !== "all";
              setPendingConfirm({
                id: `delete-all-${Date.now()}`,
                title:
                  count === 1
                    ? t("tasksBoard:deleteCountTitle", { count })
                    : t("tasksBoard:deleteCountTitlePlural", { count }),
                body: narrowed
                  ? t("tasksBoard:deleteBodyFiltered")
                  : t("tasksBoard:deleteBody"),
                confirmLabel: t("tasksBoard:deleteConfirm", { count }),
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
                  if (selectedId && ids.has(selectedId)) closeTaskPanel();
                  clearSelection();
                  await refresh();
                },
              });
            }}
            title={
              filteredTasks.length > 0
                ? filteredTasks.length === 1
                  ? t("tasksBoard:deleteAllShown", { count: filteredTasks.length })
                  : t("tasksBoard:deleteAllShownPlural", { count: filteredTasks.length })
                : t("tasksBoard:nothingToDelete")
            }
            aria-label={
              filteredTasks.length > 0
                ? t("tasksBoard:deleteAllAria")
                : t("tasksBoard:noTasksAria")
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
          )}

          <div className="h-3.5 w-px bg-border/60" />

          <NewWorkButton onCreate={openComposer} />
        </div>
      </header>

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
            {view !== "schedule" && boardExplainer.open === true && (
              <div className="px-4 pt-3">
                <ExplainerCard state={boardExplainer}>
                  <p>
                    Every task your team has run or has queued, in one place.
                    Kanban groups them by status; List is a flat, sortable
                    feed of the same tasks.
                  </p>
                  <p>
                    Click any task to open it. Use the filters in the header
                    to narrow by agent or trigger, and switch views any time.
                  </p>
                </ExplainerCard>
              </div>
            )}
            {view === "kanban" && (
              <KanbanView
                byLane={filteredByLane}
                agents={overview?.agents ?? []}
                agentsBySlug={agentsBySlug}
                selectedId={selectedId}
                selection={selection}
                now={now}
                onSelect={(id) => void openTaskById(id)}
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
                onSelect={(id) => void openTaskById(id)}
                onRefresh={refresh}
                density={density}
              />
            )}
            {view === "schedule" && (
              <ScheduleView
                cabinetPath={cabinetPath}
                onMutated={refresh}
                defaultAgentSlug={agentFilter || undefined}
                agents={
                  agentFilter
                    ? (overview?.agents ?? []).filter((a) => a.slug === agentFilter)
                    : overview?.agents ?? []
                }
                jobs={
                  agentFilter ? jobs.filter((j) => j.ownerAgent === agentFilter) : jobs
                }
                conversations={filteredConversations}
                onConversationClick={(id) => void openTaskById(id)}
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
                    enabled: agent.heartbeatEnabled !== false,
                  });
                }}
              />
            )}
          </main>
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
              <span className="absolute -end-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border border-border/60 bg-foreground text-[11px] font-semibold text-background shadow-md">
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
          if (!open) {
            setNewTaskInitialPrompt(undefined);
            setEditingDraft(null);
            setEditSeed(null);
          }
        }}
        cabinetPath={cabinetPath}
        agents={overview?.agents ?? []}
        initialMode={newTaskMode}
        initialPrompt={editingDraft ? editSeed?.prompt : newTaskInitialPrompt}
        initialAgentSlug={editingDraft ? editSeed?.agentSlug : undefined}
        initialRuntime={editingDraft ? editSeed?.runtime : undefined}
        editing={editingDraft}
        onStarted={(id) => {
          void refresh();
          void openTaskById(id);
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
  const { t } = useLocale();
  return (
    <div className="inline-flex h-7 items-stretch overflow-hidden rounded-md">
      <IconHint label={t("tasksBoard:createTask")} side="bottom">
        <button
          type="button"
          onClick={() => onCreate("now")}
          className="inline-flex items-center gap-1.5 bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          New Task
        </button>
      </IconHint>
      <div className="w-px bg-primary-foreground/20" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center bg-primary pl-1.5 pr-1 text-primary-foreground transition-colors hover:bg-primary/90"
          title={t("tasksBoard:moreNewTypes")}
          aria-label={t("tasksBoard:moreNewTypes")}
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
              <span className="text-[13px] font-medium">{t("tasksBoard:newTask")}</span>
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
              <span className="text-[13px] font-medium">{t("tasksBoard:newRoutine")}</span>
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
