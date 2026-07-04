"use client";

import { PanelRight } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useTaskRail } from "@/components/tasks/rail/task-rail-context";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";

/**
 * The tasks-rail open/close toggle, styled as a top-bar icon button so it can
 * sit at the right end of each surface's toolbar (immediately after the primary
 * "New …" action) rather than tucked away in the status bar. A live green dot
 * (and a flash on new activity) surfaces running tasks the same way it did on
 * the old status-bar pill. Must render inside `TaskRailProvider`.
 */
export function TaskRailToggle({ className }: { className?: string }) {
  const { t } = useLocale();
  const taskRailOpen = useAppStore((s) => s.taskRailOpen);
  const toggleTaskRail = useAppStore((s) => s.toggleTaskRail);
  const { runningCount, flash } = useTaskRail();

  return (
    <button
      type="button"
      onClick={toggleTaskRail}
      aria-label={taskRailOpen ? t("taskRail:hide") : t("taskRail:show")}
      aria-pressed={taskRailOpen}
      title={
        runningCount > 0
          ? t("taskRail:toggleRunning", { count: runningCount })
          : taskRailOpen
            ? t("taskRail:hide")
            : t("taskRail:show")
      }
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground",
        taskRailOpen && "bg-accent text-foreground",
        flash && "animate-pulse !text-emerald-600 dark:!text-emerald-400",
        className
      )}
    >
      <PanelRight className="size-3.5" />
      {runningCount > 0 && (
        <span
          className="cabinet-task-heartbeat absolute -end-0.5 -top-0.5 inline-block size-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
