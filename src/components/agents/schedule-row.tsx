"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Loader2, Play, Power, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { AgentListItem } from "@/types/agents";
import type { JobConfig } from "@/types/jobs";

interface BaseRowProps {
  agent: AgentListItem;
  disabled: boolean;
  title: string;
  subtitle: string;
  schedule: string;
  toggleVerb?: "pause" | "disable";
  onEdit: () => void;
  onRun: () => void | Promise<void>;
  onToggle: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

function ScheduleRow({
  agent,
  disabled,
  title,
  subtitle,
  schedule,
  toggleVerb = "disable",
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: BaseRowProps) {
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRun(e: MouseEvent) {
    e.stopPropagation();
    if (running) return;
    setRunning(true);
    try {
      await onRun();
    } finally {
      setRunning(false);
    }
  }

  async function handleToggle(e: MouseEvent) {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle();
    } finally {
      setToggling(false);
    }
  }

  async function handleConfirmDelete(e: MouseEvent) {
    e.stopPropagation();
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  function handleRowActivate() {
    if (confirming) return;
    onEdit();
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (confirming) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit();
    }
  }

  const actionSlotWidth = onDelete ? "w-[92px]" : "w-[64px]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowActivate}
      onKeyDown={handleKey}
      className={cn(
        "group relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors",
        confirming
          ? "bg-red-500/10"
          : "hover:bg-muted/40 focus-visible:bg-muted/40",
        disabled && !confirming && "opacity-60"
      )}
    >
      <AgentAvatar
        agent={agent}
        shape="circle"
        size="sm"
        className={cn(disabled && "saturate-50")}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span className="truncate text-[12.5px] font-semibold text-foreground">
          {title}
        </span>
        <span className="truncate text-[11.5px] text-muted-foreground">
          · {subtitle}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500">
            <span>Delete?</span>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex size-6 items-center justify-center rounded-md bg-red-500 text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              aria-label="Confirm delete"
            >
              {deleting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(false);
              }}
              className="inline-flex size-6 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-muted"
              aria-label="Cancel delete"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-end gap-0.5",
              actionSlotWidth
            )}
          >
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-60"
              aria-label="Run now"
              title="Run now"
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-60",
                disabled
                  ? "text-muted-foreground hover:text-emerald-500"
                  : "text-emerald-500 hover:text-muted-foreground"
              )}
              aria-label={disabled ? (toggleVerb === "pause" ? "Resume" : "Enable") : (toggleVerb === "pause" ? "Pause" : "Disable")}
              title={disabled ? (toggleVerb === "pause" ? "Resume" : "Enable") : (toggleVerb === "pause" ? "Pause" : "Disable")}
            >
              {toggling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Power className="size-3.5" />
              )}
            </button>
            {onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(true);
                }}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                aria-label="Delete"
                title="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        )}

        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          {schedule ? cronToHuman(schedule) : ""}
        </span>
        <span
          className={cn(
            "size-1.5 rounded-full",
            disabled ? "bg-muted-foreground/40" : "bg-emerald-500"
          )}
          aria-label={disabled ? "Disabled" : "Active"}
          title={disabled ? "Disabled" : "Active"}
        />
      </div>
    </div>
  );
}

export function RoutineRow({
  agent,
  job,
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: {
  agent: AgentListItem;
  job: JobConfig;
  onEdit: () => void;
  onRun: () => void | Promise<void>;
  onToggle: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  return (
    <ScheduleRow
      agent={agent}
      disabled={!job.enabled}
      title={job.name}
      subtitle={agent.name}
      schedule={job.schedule}
      onEdit={onEdit}
      onRun={onRun}
      onToggle={onToggle}
      onDelete={onDelete}
    />
  );
}

export function HeartbeatRow({
  agent,
  onEdit,
  onRun,
  onToggle,
}: {
  agent: AgentListItem;
  onEdit: () => void;
  onRun: () => void | Promise<void>;
  onToggle: () => void | Promise<void>;
}) {
  return (
    <ScheduleRow
      agent={agent}
      disabled={!agent.active}
      title={agent.name}
      subtitle="Heartbeat"
      schedule={agent.heartbeat || ""}
      toggleVerb="pause"
      onEdit={onEdit}
      onRun={onRun}
      onToggle={onToggle}
    />
  );
}
