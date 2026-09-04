"use client";

import { Bot, PanelRight, ListTodo } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/app-store";
import { useTaskRail } from "@/components/tasks/rail/task-rail-context";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";

/**
 * Combined sidebars / panels toggle dropdown menu ([Panels ▾]) displayed in top bars.
 * Consolidates Sidebar A (AI Panel) and Sidebar B (Tasks Rail).
 */
export function PanelsDropdown({ className }: { className?: string }) {
  const { t } = useLocale();
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);
  const toggleTaskPanelCompose = useAppStore((s) => s.toggleTaskPanelCompose);
  const section = useAppStore((s) => s.section);
  const selectedPath = useAppStore((s) => s.taskPanelComposeContext?.pinnedPagePath);

  const taskRailOpen = useAppStore((s) => s.taskRailOpen);
  const toggleTaskRail = useAppStore((s) => s.toggleTaskRail);

  const { runningCount, flash } = useTaskRail();

  const handleToggleAiPanel = () => {
    toggleTaskPanelCompose(
      section.type === "page" && selectedPath
        ? {
            source: "editor",
            pinnedPagePath: selectedPath,
            defaultAgentSlug: "editor",
          }
        : undefined
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={t("common:panels.menuTitle", "Side panels")}
        title={t("common:panels.menuTitle", "Side panels")}
        className={cn(
          "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground cursor-pointer",
          (taskRailOpen || taskPanelOpen) && "bg-accent text-foreground",
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={handleToggleAiPanel}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-foreground/70" />
            <span>{taskPanelOpen ? "Close AI panel" : "Open AI panel"}</span>
          </div>
          {taskPanelOpen && (
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={toggleTaskRail}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <ListTodo className="size-4 text-foreground/70" />
            <span>{taskRailOpen ? "Hide tasks rail" : "Show tasks rail"}</span>
          </div>
          {runningCount > 0 ? (
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : taskRailOpen ? (
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
