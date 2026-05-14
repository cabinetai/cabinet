"use client";

import { Clock3, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import { useLocale } from "@/i18n/use-locale";

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface AgentConversationInfo {
  title: string;
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
}

export function AgentStatusCard({
  agent,
  jobs,
  latestConversation,
  onClick,
  onSend,
}: {
  agent: CabinetAgentSummary;
  jobs: CabinetJobSummary[];
  latestConversation?: AgentConversationInfo | null;
  onClick?: () => void;
  onSend?: () => void;
}) {
  const { t } = useLocale();
  const isRunning = latestConversation?.status === "running";
  const jobCount = jobs.length;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-background transition-all",
        "hover:shadow-sm",
        isRunning
          ? "border-emerald-500/30 animate-cabinet-card-glow"
          : agent.active
          ? "border-border/70 hover:border-border"
          : "border-border/50 opacity-75 hover:opacity-100"
      )}
    >
      {/* Clickable card body */}
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 flex-col px-3.5 pb-2 pt-3 text-left"
      >
        {/* Header: emoji + name + status */}
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{agent.emoji || "🤖"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{agent.name}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                isRunning
                  ? "bg-emerald-500 animate-pulse"
                  : agent.active
                  ? "bg-emerald-500"
                  : "bg-amber-500/70"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium",
                isRunning
                  ? "text-emerald-500"
                  : agent.active
                  ? "text-emerald-500/80"
                  : "text-amber-500/70"
              )}
            >
              {isRunning ? "Running" : agent.active ? "Idle" : "Paused"}
            </span>
          </div>
        </div>

        {/* Role */}
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {agent.role}
          {agent.inherited ? ` · ${agent.cabinetName}` : ""}
        </p>

        {/* Current task / last conversation */}
        <div className="mt-2.5 min-h-[20px]">
          {latestConversation ? (
            <p className="truncate text-[11px] italic text-muted-foreground/80">
              &ldquo;{latestConversation.title}&rdquo;
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/40">{t("cabinetsExtras:noRecentActivity")}</p>
          )}
        </div>
      </button>

      {/* Footer: time + jobs + send */}
      <div className="flex items-center gap-2 border-t border-border/40 px-3.5 py-2">
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {latestConversation ? timeAgo(latestConversation.startedAt) : "—"}
        </span>

        {jobCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Clock3 className="h-2.5 w-2.5" />
            {jobCount}
          </span>
        )}

        {agent.taskCount > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {agent.taskCount} task{agent.taskCount === 1 ? "" : "s"}
          </span>
        )}

        <div className="flex-1" />

        {onSend && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSend();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all group-hover:opacity-100 hover:bg-muted/50 hover:text-foreground"
            aria-label={`Send task to ${agent.name}`}
            title={`Send task to ${agent.name}`}
          >
            <Send className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
