"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Maximize2, Minimize2, X } from "lucide-react";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { AgentPill } from "./agent-pill";
import { StatusIcon, deriveCardState } from "./status-icon";
import { setConversationMuted } from "./board-actions";
import type { LaneKey } from "./lane-rules";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";

/**
 * Slide-out right panel. Renders a thin agent/title chrome at the top and
 * embeds the existing TaskConversationPage in compact variant so the same
 * Chat / Artifacts / Diff / Logs surface that `/tasks/[id]` shows works
 * identically inside the board.
 */
export function DetailPanel({
  task,
  lane,
  agent,
  onClose,
  onRefresh,
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}) {
  const fullscreen = useAppStore((s) => s.taskPanelFullscreen);
  const toggleFullscreen = useAppStore((s) => s.toggleTaskPanelFullscreen);
  const setFullscreen = useAppStore((s) => s.setTaskPanelFullscreen);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (fullscreen) {
        setFullscreen(false);
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fullscreen, setFullscreen]);

  const state = deriveCardState(task, lane);
  const [muting, setMuting] = useState(false);
  const muted = !!task.muted;

  async function toggleMuted() {
    if (muting) return;
    setMuting(true);
    try {
      await setConversationMuted(task.id, !muted, task.cabinetPath);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error("[board] mute toggle failed", err);
    } finally {
      setMuting(false);
    }
  }

  return (
    <aside
      className={cn(
        "flex flex-col bg-background transition-all duration-150 ease-out",
        fullscreen
          ? "fixed inset-0 z-50"
          : "absolute inset-y-0 right-0 z-20 w-[460px] border-l border-border/70 shadow-xl"
      )}
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-5 py-3">
        <StatusIcon state={state} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AgentPill agent={agent} slug={task.agentSlug ?? "editor"} />
          </div>
          <h2 className="mt-1 truncate text-[13.5px] font-semibold leading-snug text-foreground">
            {task.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={fullscreen ? "Exit fullscreen" : "Enlarge"}
        >
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          type="button"
          onClick={toggleMuted}
          disabled={muting}
          className={cn(
            "rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
            muted && "text-foreground"
          )}
          // Audit #069: the original "Mute / Unmute" copy looked like a
          // global preference. Clarify that the toggle scopes to *this
          // task* only — future runs of this conversation skip the Just
          // Finished lane and land directly in Archive.
          title={
            muted
              ? "Unmute this task — its done runs will resurface in Just Finished again"
              : "Mute this task — its done runs go straight to Archive"
          }
          aria-label={
            muted ? "Unmute this task" : "Mute this task — auto-archive done runs"
          }
        >
          {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Close (Esc)"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        <TaskConversationPage
          taskId={task.id}
          variant="compact"
          returnContext={{
            type: "task",
            taskId: task.id,
            cabinetPath: task.cabinetPath,
          }}
        />
      </div>
    </aside>
  );
}
