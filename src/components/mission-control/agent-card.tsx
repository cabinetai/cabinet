"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Pause, Play, Loader2, Inbox } from "lucide-react";
import { GoalBar } from "./goal-bar";
import type { GoalMetric } from "@/types/agents";
import { useLocale } from "@/i18n/use-locale";

interface AgentCardProps {
  name: string;
  emoji: string;
  role: string;
  slug: string;
  active: boolean;
  running?: boolean;
  type: string;
  goals: GoalMetric[];
  lastHeartbeat?: string;
  nextHeartbeat?: string;
  lastAction?: string;
  pendingTasks?: number;
  onClick?: () => void;
  onToggle?: () => void;
  onRun?: () => Promise<void>;
}

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

function formatCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "soon";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function StatusIndicator({ active, running, lastHeartbeat, nextHeartbeat, onToggle }: { active: boolean; running?: boolean; lastHeartbeat?: string; nextHeartbeat?: string; onToggle?: () => void }) {
  const { t } = useLocale();
  if (running) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-500">
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
        Running
      </span>
    );
  }

  if (!active) {
    return (
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] text-amber-500/80",
          onToggle && "hover:text-emerald-500 cursor-pointer transition-colors"
        )}
        onClick={onToggle ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
        title={onToggle ? "Click to activate" : undefined}
      >
        <Pause className="h-2.5 w-2.5" />
        Paused
      </span>
    );
  }

  const handleClick = onToggle ? (e: React.MouseEvent) => { e.stopPropagation(); onToggle(); } : undefined;

  // Active: check if recently ran (within last 30 min)
  if (lastHeartbeat) {
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    if (diff < 30 * 60 * 1000) {
      return (
        <span
          className={cn("flex items-center gap-1 text-[10px] text-emerald-500", onToggle && "hover:text-amber-500 cursor-pointer transition-colors")}
          onClick={handleClick}
          title={onToggle ? "Click to pause" : undefined}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          Live
        </span>
      );
    }
  }

  // Show next heartbeat countdown if available
  if (nextHeartbeat) {
    const nextTime = new Date(nextHeartbeat).getTime();
    if (nextTime > Date.now()) {
      return (
        <span
          className={cn("flex items-center gap-1 text-[10px] text-muted-foreground/60", onToggle && "hover:text-amber-500 cursor-pointer transition-colors")}
          onClick={handleClick}
          title={onToggle ? "Click to pause" : undefined}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500/60 shrink-0" />
          Next: {formatCountdown(nextHeartbeat)}
        </span>
      );
    }
  }

  return (
    <span
      className={cn("flex items-center gap-1 text-[10px] text-emerald-500/60", onToggle && "hover:text-amber-500 cursor-pointer transition-colors")}
      onClick={handleClick}
      title={onToggle ? "Click to pause" : undefined}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500/60 shrink-0" />
      Idle
    </span>
  );
}

export function AgentCard({
  name,
  emoji,
  role,
  active,
  running,
  type,
  goals,
  slug,
  lastHeartbeat,
  nextHeartbeat,
  lastAction,
  pendingTasks,
  onClick,
  onToggle,
  onRun,
}: AgentCardProps) {
  const { t } = useLocale();
  const [runLoading, setRunLoading] = useState(false);

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (runLoading || running || !onRun) return;
    setRunLoading(true);
    try {
      await onRun();
    } finally {
      setRunLoading(false);
    }
  };

  return (
    <button
      onClick={onClick}
      data-agent-card
      className={cn(
        "w-full text-left p-2 rounded-lg border border-border/50 hover:border-border transition-colors group",
        "hover:bg-accent/30",
        type === "lead" && "border-primary/20 bg-primary/[0.02]"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium truncate">{name}</span>
            <StatusIndicator active={active} running={running} lastHeartbeat={lastHeartbeat} nextHeartbeat={nextHeartbeat} onToggle={onToggle} />
            {pendingTasks && pendingTasks > 0 ? (
              <span className="flex items-center gap-0.5 text-[9px] text-blue-400/80 bg-blue-500/10 px-1 py-0 rounded">
                <Inbox className="h-2.5 w-2.5" />
                {pendingTasks}
              </span>
            ) : null}
          </div>
        </div>
        {/* Quick run button — visible on hover */}
        {onRun && !running && (
          <span
            onClick={handleRun}
            className={cn(
              "shrink-0 p-1 rounded-md transition-all",
              runLoading
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 hover:bg-emerald-500/10"
            )}
            title={t("agentCard:runHeartbeat")}
          >
            {runLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
            ) : (
              <Play className="h-3 w-3 text-emerald-500" />
            )}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {timeAgo(lastHeartbeat)}
        </span>
      </div>

      {goals.length > 0 && (
        <div className="space-y-0.5">
          {goals.slice(0, 3).map((g) => (
            <GoalBar
              key={g.metric}
              label={g.metric.replace(/_/g, " ")}
              current={g.current}
              target={g.target}
              unit={g.unit}
              floor={g.floor}
              compact
            />
          ))}
        </div>
      )}

      {lastAction && (
        <p className="text-[10px] text-muted-foreground/50 truncate mt-1 italic leading-tight">
          &ldquo;{lastAction}&rdquo;
        </p>
      )}
    </button>
  );
}
