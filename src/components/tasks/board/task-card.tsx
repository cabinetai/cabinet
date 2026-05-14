"use client";

import { HeartPulse, MessageCircleQuestion, ShieldCheck, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isLegacyAdapterType } from "@/lib/agents/adapters/legacy-ids";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { useProviderIcons } from "@/hooks/use-provider-icons";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { LaneKey } from "./lane-rules";
import { AgentPill } from "./agent-pill";
import { RowActions } from "./row-actions";
import { StatusIcon, deriveCardState } from "./status-icon";
import { useLocale } from "@/i18n/use-locale";

function relTime(fromIso: string | undefined, now: number): string {
  if (!fromIso) return "";
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TaskCard({
  task,
  lane,
  agent,
  agents,
  isActive,
  now,
  onClick,
  onRefresh,
  density = "comfortable",
}: {
  task: TaskMeta;
  lane: LaneKey;
  agent: CabinetAgentSummary | undefined;
  /** Full agent list for the reassign dropdown inside RowActions. */
  agents?: CabinetAgentSummary[];
  isActive: boolean;
  now: number;
  onClick: (e?: React.MouseEvent) => void;
  onRefresh?: () => Promise<void> | void;
  density?: "compact" | "comfortable";
}) {
  const { t } = useLocale();
  const state = deriveCardState(task, lane);
  const lastActivity = task.lastActivityAt ?? task.startedAt;
  const isTerminal = isLegacyAdapterType(task.adapterType);
  const groupSize = task.groupSize && task.groupSize > 1 ? task.groupSize : 0;

  const compact = density === "compact";
  const providerIcons = useProviderIcons();
  const providerIcon = task.providerId ? providerIcons.get(task.providerId) : null;
  const modelName =
    typeof task.adapterConfig?.model === "string" ? task.adapterConfig.model : undefined;
  return (
    <div className="group relative w-full">
      {onRefresh ? (
        <RowActions
          task={task}
          agents={agents}
          onRefresh={onRefresh}
          className={cn(
            "absolute z-10",
            compact ? "right-1.5 top-1.5" : "right-2 top-2"
          )}
        />
      ) : null}
    <button
      type="button"
      onClick={(e) => onClick(e)}
      // Audit #065: without an explicit aria-label, the card's accessible
      // name concatenates the title + status icon + agent pill + provider
      // glyph + relative time + action buttons into one 50-word string.
      // Override with just the title; the metadata pieces remain
      // separately readable but no longer inflate the card's name.
      aria-label={task.title}
      className={cn(
        "relative w-full rounded-md border bg-card text-left transition-all",
        "hover:border-foreground/30 hover:shadow-sm",
        compact ? "px-2 py-1.5" : "p-3",
        isActive ? "border-foreground/50 shadow-sm" : "border-border/60",
        isTerminal &&
          "border-l-2 border-l-emerald-500/60 bg-[linear-gradient(to_right,rgba(16,185,129,0.035),transparent_30%)]"
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("shrink-0", compact ? "mt-px" : "mt-0.5")}>
          <StatusIcon state={state} />
        </span>
        <p
          title={task.title}
          className={cn(
            "flex-1 leading-snug text-foreground",
            compact ? "line-clamp-1 text-[12px] pr-14" : "line-clamp-2 text-[13px] pr-[88px]"
          )}
        >
          {task.title}
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10.5px] text-muted-foreground",
          compact ? "mt-1.5" : "mt-2.5"
        )}
      >
        <AgentPill
          agent={agent}
          slug={task.agentSlug ?? "editor"}
          size={compact ? "sm" : "md"}
        />
        {lane === "needs" && task.status === "awaiting-input" && (
          task.pendingActions && task.pendingActions.length > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600 dark:text-violet-400">
              <ShieldCheck className="size-2.5" />
              Approval
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
              <MessageCircleQuestion className="size-2.5" />
              Question
            </span>
          )
        )}
        {lane === "needs" && task.status === "failed" && (
          <span className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive opacity-75">
            Failed
          </span>
        )}
        {groupSize > 0 && (
          <span
            title={`${groupSize} heartbeat runs collapsed — showing the latest`}
            className="inline-flex items-center gap-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-pink-600 dark:text-pink-400"
          >
            <HeartPulse className="size-2.5" />+{groupSize - 1}
          </span>
        )}
        {!compact && providerIcon ? (
          <span
            className="inline-flex size-4 items-center justify-center rounded border border-border/60 bg-background/60"
            title={providerIcon.name}
          >
            <ProviderGlyph
              icon={providerIcon.icon}
              asset={providerIcon.iconAsset}
              className="size-3"
            />
          </span>
        ) : null}
        {!compact && modelName ? (
          <span className="truncate font-mono text-[10px] text-foreground/60">
            {modelName}
          </span>
        ) : null}
        {isTerminal && (
          <span
            title={t("taskCard:ptyMode")}
            className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
          >
            <Terminal className="size-2.5" />
            PTY
          </span>
        )}
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {relTime(lastActivity, now)}
        </span>
      </div>
    </button>
    </div>
  );
}
