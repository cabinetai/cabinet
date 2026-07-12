"use client";

import { Bot, CircleHelp, Clock3, HeartPulse, type LucideIcon } from "lucide-react";
import { TelegramMark } from "@/components/integrations/telegram-mark";
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { resolveTriggerBadge, type TriggerIconKind } from "./trigger-badge";
import { AgentPill } from "./agent-pill";
import { RowActions } from "./row-actions";
import { SelectCheckbox } from "./select-checkbox";
import { StatusIcon, deriveCardState } from "./status-icon";

/**
 * Flat scrolling list — mirrors the Agents workspace task list style.
 * Status icon · agent pill · title · trigger chip · relative time.
 * No lane grouping; sort is newest-first across everything.
 */
function relTime(fromIso: string | undefined, now: number): string {
  if (!fromIso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TRIGGER_ICONS: Record<
  Exclude<TriggerIconKind, "telegram">,
  LucideIcon
> = {
  bot: Bot,
  clock: Clock3,
  heartbeat: HeartPulse,
  unknown: CircleHelp,
};

function TriggerBadge({ trigger }: { trigger: TaskMeta["trigger"] }) {
  const style = resolveTriggerBadge(trigger);
  if (!style) return null;
  const Icon = style.icon === "telegram" ? null : TRIGGER_ICONS[style.icon];
  return (
    <span
      title={style.label}
      aria-label={style.label}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full",
        style.className
      )}
    >
      {Icon ? (
        <Icon className="size-2.75" />
      ) : (
        <TelegramMark className="size-3" />
      )}
    </span>
  );
}

export function ListView({
  tasks,
  agents,
  agentsBySlug,
  selectedId,
  selection,
  onToggleSelection,
  now,
  onSelect,
  onRefresh,
  density = "comfortable",
}: {
  /**
   * Flat ordered list of tasks (pre-sorted: running first, then newest-first).
   * Lane-bucketed byLane is NOT used here; pass in the flat list directly.
   */
  tasks: TaskMeta[];
  /** Full cabinet agent list — used for the Reassign dropdown in row actions. */
  agents?: CabinetAgentSummary[];
  agentsBySlug: Map<string, CabinetAgentSummary>;
  selectedId: string | null;
  /** Multi-select set (audit #068) — shared with the Kanban board. */
  selection?: Set<string>;
  onToggleSelection?: (id: string) => void;
  now: number;
  onSelect: (id: string) => void;
  onRefresh?: () => Promise<void> | void;
  density?: "compact" | "comfortable";
  /** Kept in the type for API symmetry even though unused today. */
  _lane?: LaneKey;
}) {
  return (
    // Audit #057: escalating symmetric percentage padding stranded rows in wide
    // empty gutters on xl/2xl. A centered max-width column keeps line length
    // sane without wasting the sheet's horizontal space at every breakpoint.
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto px-4">
      {tasks.length === 0 ? (
        <div className="flex h-full items-center justify-center p-8 text-[13px] text-muted-foreground">
          No tasks match these filters.
        </div>
      ) : (
        <ul className="mx-auto w-full max-w-5xl divide-y divide-border/60">
          {tasks.map((task) => {
            const agent = agentsBySlug.get(task.agentSlug ?? "");
            const lastActivity = task.lastActivityAt ?? task.startedAt;
            // Reuse deriveCardState's status mapping — pass a rough lane hint
            // based on status so the icon color matches what users see on the
            // kanban cards. Without a true lane context, "archive" is the
            // safe default for the tie-breaker branches inside deriveCardState.
            const state = deriveCardState(task, "archive");
            const isSelected = selectedId === task.id;
            const isChecked = selection?.has(task.id) ?? false;
            return (
              <li key={task.id} className="group/card group relative">
                {onToggleSelection ? (
                  <SelectCheckbox
                    selected={isChecked}
                    onToggle={() => onToggleSelection(task.id)}
                    className="absolute start-1.5 top-1/2 z-20 -translate-y-1/2"
                  />
                ) : null}
                {onRefresh ? (
                  <RowActions
                    task={task}
                    agents={agents}
                    onRefresh={onRefresh}
                    className="absolute end-3 top-1/2 z-10 -translate-y-1/2"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    // Audit #068: ⌘/Ctrl/Shift-click toggles selection (parity
                    // with the Kanban board); a plain click opens the task.
                    if (onToggleSelection && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                      onToggleSelection(task.id);
                    } else {
                      onSelect(task.id);
                    }
                  }}
                  className={cn(
                    // pe reserves a fixed gutter for the hover action cluster
                    // (audit #056) instead of the old magic end-[300px] offset.
                    "relative flex w-full items-center gap-3 ps-6 pe-24 text-start transition-colors",
                    density === "compact" ? "py-1.5" : "py-2.5",
                    isChecked
                      ? "bg-sky-500/10"
                      : isSelected
                        ? "bg-primary/5"
                        : "hover:bg-accent/35"
                  )}
                >
                  {isSelected ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary"
                    />
                  ) : null}
                  <StatusIcon state={state} />
                  <span className="flex-1 truncate text-[13px] font-medium text-foreground">
                    {task.title}
                  </span>
                  <AgentPill agent={agent} slug={task.agentSlug ?? "editor"} size="sm" />
                  <TriggerBadge trigger={task.trigger} />
                  <span className="w-20 shrink-0 text-end text-[10.5px] tabular-nums text-muted-foreground">
                    {relTime(lastActivity, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
