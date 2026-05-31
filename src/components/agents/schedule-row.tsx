"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, Loader2, Play, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { LockedSwitch } from "@/components/ui/locked-switch";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { AgentListItem } from "@/types/agents";
import type { JobConfig } from "@/types/jobs";
import { useLocale } from "@/i18n/use-locale";

const LOCKED_TOOLTIP =
  "This agent is stopped. Open the agent's page and start it to fire its routines.";

interface BaseRowProps {
  agent: AgentListItem;
  /** Visual dim — the row reads as "effectively off". */
  disabled: boolean;
  /** Switch position — defaults to !disabled so callers that don't split
   *  effective vs. switch state still work. */
  switchChecked?: boolean;
  /** Lock the Switch (master is off — child can't be toggled until master
   *  is back on). Renders gray + tooltip. */
  switchLocked?: boolean;
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
  switchChecked,
  switchLocked = false,
  title,
  subtitle,
  schedule,
  toggleVerb = "disable",
  onEdit,
  onRun,
  onToggle,
  onDelete,
}: BaseRowProps) {
  const { t } = useLocale();
  const isOn = switchChecked ?? !disabled;
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

  async function handleToggle() {
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

  const actionSlotWidth = onDelete ? "w-[64px]" : "w-[36px]";
  const toggleLabel = isOn
    ? toggleVerb === "pause" ? "Pause" : "Disable"
    : toggleVerb === "pause" ? "Resume" : "Enable";

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
          : "hover:bg-muted/40 focus-visible:bg-muted/40"
      )}
    >
      <AgentAvatar
        agent={agent}
        shape="circle"
        size="sm"
        className={cn(disabled && "saturate-50 opacity-60")}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span className={cn(
          "truncate text-[12.5px] font-semibold",
          disabled ? "text-muted-foreground/70" : "text-foreground"
        )}>
          {title}
        </span>
        <span className={cn(
          "truncate text-[11.5px]",
          disabled ? "text-muted-foreground/60" : "text-muted-foreground"
        )}>
          · {subtitle}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-500">
            <span>{t("scheduleRow:deleteQ")}</span>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex size-6 items-center justify-center rounded-md bg-red-500 text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              aria-label={t("scheduleRow:confirmDelete")}
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
              aria-label={t("scheduleRow:cancelDelete")}
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
              aria-label={t("scheduleRow:runNow")}
              title={t("scheduleRow:runNow")}
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
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
                aria-label={t("scheduleRowPlus:delete")}
                title={t("scheduleRowPlus:delete")}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        )}

        <span className={cn(
          "whitespace-nowrap text-[11px]",
          disabled ? "text-muted-foreground/60" : "text-muted-foreground"
        )}>
          {schedule ? cronToHuman(schedule) : ""}
        </span>
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <LockedSwitch
            checked={isOn}
            onCheckedChange={() => void handleToggle()}
            locked={switchLocked}
            tooltip={LOCKED_TOOLTIP}
            ariaLabel={toggleLabel}
          />
        </div>
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
  const { t } = useLocale();
  // Effective off when the agent is stopped or the job is disabled. The Switch
  // is locked while the agent is stopped — the user has to start the agent
  // before they can toggle children, mirroring the parent/child relationship.
  const effectiveOn = agent.active && job.enabled;
  return (
    <ScheduleRow
      agent={agent}
      disabled={!effectiveOn}
      switchChecked={job.enabled}
      switchLocked={!agent.active}
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
  /** Toggles `agent.heartbeatEnabled` only. The master `agent.active`
   *  switch is gated separately on the agent header / detail page. */
  onToggle: () => void | Promise<void>;
}) {
  const heartbeatOn = agent.heartbeatEnabled !== false;
  const effectiveOn = agent.active && heartbeatOn;
  return (
    <ScheduleRow
      agent={agent}
      // Visual dim when *effectively* off (master or per-heartbeat off);
      // the Switch is locked while the agent is stopped (same parent/child
      // gating used for routines).
      disabled={!effectiveOn}
      switchChecked={heartbeatOn}
      switchLocked={!agent.active}
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
