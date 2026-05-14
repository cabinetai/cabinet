"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2, RotateCcw, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteConversation,
  reassignConversation,
  restartConversation,
  stopConversation,
} from "./board-actions";
import { ReassignMenu } from "./reassign-menu";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { TaskMeta, TaskStatus } from "@/types/tasks";
import { useLocale } from "@/i18n/use-locale";

/**
 * Hover-revealed action cluster for a task row/card. Shows Stop / Restart /
 * Delete as appropriate for the task's status. All clicks stopPropagation so
 * they don't also open the detail panel.
 */
export function RowActions({
  task,
  agents = [],
  onRefresh,
  className,
}: {
  task: TaskMeta;
  agents?: CabinetAgentSummary[];
  onRefresh?: () => Promise<void> | void;
  className?: string;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState<
    "stop" | "restart" | "delete" | "reassign" | null
  >(null);
  const visibility = visibilityFor(task.status);
  const canReassign = agents.length > 0 && task.status !== "archived";

  async function run(kind: "stop" | "restart" | "delete") {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "stop") {
        await stopConversation(task.id, task.cabinetPath);
      } else if (kind === "restart") {
        await restartConversation(task.id, task.cabinetPath);
      } else if (kind === "delete") {
        await deleteConversation(task.id, task.cabinetPath);
      }
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error(`[board] ${kind} failed`, err);
    } finally {
      setBusy(null);
    }
  }

  async function handleReassign(toSlug: string) {
    if (busy || toSlug === task.agentSlug) return;
    setBusy("reassign");
    try {
      await reassignConversation(task.id, toSlug, task.cabinetPath);
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error("[board] reassign failed", err);
    } finally {
      setBusy(null);
    }
  }

  if (
    !visibility.stop &&
    !visibility.restart &&
    !visibility.delete &&
    !canReassign
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5",
        "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {visibility.stop ? (
        <ActionButton
          title={t("rowActions:stop")}
          tone="destructive"
          onClick={(e) => {
            e.stopPropagation();
            void run("stop");
          }}
          disabled={!!busy}
          icon={busy === "stop" ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
        />
      ) : null}
      {visibility.restart ? (
        <ActionButton
          title={t("rowActions:restart")}
          tone="primary"
          onClick={(e) => {
            e.stopPropagation();
            void run("restart");
          }}
          disabled={!!busy}
          icon={busy === "restart" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
        />
      ) : null}
      {canReassign ? (
        <ReassignMenu
          agents={agents}
          currentSlug={task.agentSlug}
          onSelect={handleReassign}
          triggerClassName="inline-flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary disabled:opacity-50"
        >
          {busy === "reassign" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowRightLeft className="size-3.5" />
          )}
          <span className="sr-only">{t("rowActions:reassign")}</span>
        </ReassignMenu>
      ) : null}
      {visibility.delete ? (
        <ActionButton
          title={t("rowActionsPlus:delete")}
          tone="destructive"
          onClick={(e) => {
            e.stopPropagation();
            void run("delete");
          }}
          disabled={!!busy}
          icon={busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  disabled,
  icon,
  tone,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  icon: React.ReactNode;
  tone: "destructive" | "primary";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors disabled:opacity-50",
        tone === "destructive"
          ? "hover:bg-destructive/20 hover:text-destructive"
          : "hover:bg-primary/20 hover:text-primary"
      )}
    >
      {icon}
    </button>
  );
}

function visibilityFor(
  status: TaskStatus
): { stop: boolean; restart: boolean; delete: boolean } {
  switch (status) {
    case "running":
      return { stop: true, restart: false, delete: true };
    case "awaiting-input":
      return { stop: true, restart: true, delete: true };
    case "failed":
      return { stop: false, restart: true, delete: true };
    case "done":
    case "idle":
      return { stop: false, restart: true, delete: true };
    case "archived":
      return { stop: false, restart: false, delete: true };
  }
}
