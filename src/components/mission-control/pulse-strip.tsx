"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import {
  Bot,
  Play,
  Target,
  AlertTriangle,
  DollarSign,
  Activity,
  X,
  Loader2,
} from "lucide-react";

interface PulseMetrics {
  totalAgents: number;
  activeAgents: number;
  runningPlays: number;
  playsThisWeek?: number;
  goalsOnTrack: number;
  totalGoals: number;
  alerts: number;
  estimatedCost?: number; // Estimated daily cost in dollars
}

interface TickerMessage {
  emoji: string;
  text: string;
  time: string;
}

interface RunningAgent {
  slug: string;
  name: string;
  emoji: string;
  startedAt?: string;
}

interface CostEntry {
  agent: string;
  emoji: string;
  heartbeats: number;
  cost: number;
}

interface PulseStripProps {
  metrics: PulseMetrics;
  onAlertClick?: () => void;
  onGoalClick?: () => void;
  onPlaybookClick?: () => void;
  onAgentClick?: (slug: string) => void;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  status,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  status?: "ok" | "warning" | "critical";
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      className={cn(
        "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-muted/30 min-w-0",
        onClick && "hover:bg-muted/50 transition-colors cursor-pointer"
      )}
      onClick={onClick}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0",
          status === "critical" ? "text-red-500" :
          status === "warning" ? "text-amber-500" :
          status === "ok" ? "text-emerald-500" :
          "text-muted-foreground"
        )}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "text-[13px] sm:text-[15px] font-semibold tabular-nums leading-none",
            status === "critical" && "text-red-500",
            status === "warning" && "text-amber-500",
            status === "ok" && "text-emerald-500"
          )}
        >
          {value}
        </p>
        <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 truncate">
          {subValue || label}
        </p>
      </div>
    </Wrapper>
  );
}

// Popover panel for pulse strip metric details
function PulsePopover({
  title,
  icon: Icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 mx-4 mt-1 bg-background border border-border rounded-xl shadow-lg z-30 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold">{title}</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 py-3 max-h-[240px] overflow-y-auto">{children}</div>
    </div>
  );
}

export function PulseStrip({ metrics, onAlertClick, onGoalClick, onPlaybookClick, onAgentClick }: PulseStripProps) {
  const { t } = useLocale();
  const goalStatus = metrics.totalGoals === 0 ? "ok" :
    metrics.goalsOnTrack / metrics.totalGoals >= 0.7 ? "ok" :
    metrics.goalsOnTrack / metrics.totalGoals >= 0.4 ? "warning" : "critical";

  // Live activity ticker — shows latest agent action
  const [ticker, setTicker] = useState<TickerMessage | null>(null);
  // Popover states
  const [showRunning, setShowRunning] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostEntry[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(false);

  const loadTicker = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/slack?limit=10");
      if (!res.ok) return;
      const data = await res.json();
      const msgs = (data.messages || []).filter(
        (m: { agent: string }) => m.agent !== "human" && m.agent !== "system"
      );
      if (msgs.length > 0) {
        const latest = msgs[msgs.length - 1];
        const timeStr = new Date(latest.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setTicker({
          emoji: latest.emoji || "🤖",
          text: `${latest.displayName || latest.agent}: ${latest.content?.slice(0, 80)}`,
          time: timeStr,
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTicker();
    const handleRefresh = () => loadTicker();
    window.addEventListener("cabinet:slack-refresh", handleRefresh);
    const interval = setInterval(loadTicker, 15000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("cabinet:slack-refresh", handleRefresh);
    };
  }, [loadTicker]);

  const loadRunningAgents = useCallback(async () => {
    setLoadingPanel(true);
    try {
      const res = await fetch("/api/agents/personas");
      if (!res.ok) return;
      const data = await res.json();
      const personas = data.personas || [];
      const running = personas
        .filter((p: { running?: boolean; slug: string }) => p.running && p.slug !== "editor")
        .map((p: { slug: string; name: string; emoji?: string; lastHeartbeat?: string }) => ({
          slug: p.slug,
          name: p.name,
          emoji: p.emoji || "🤖",
          startedAt: p.lastHeartbeat,
        }));
      setRunningAgents(running);
    } catch { /* ignore */ } finally {
      setLoadingPanel(false);
    }
  }, []);

  const loadCostBreakdown = useCallback(async () => {
    setLoadingPanel(true);
    try {
      const res = await fetch("/api/agents/personas");
      if (!res.ok) return;
      const data = await res.json();
      const personas = data.personas || [];
      const costPerHeartbeat = 0.15;
      const entries: CostEntry[] = personas
        .filter((p: { slug: string }) => p.slug !== "editor")
        .map((p: { slug: string; name: string; emoji?: string; heartbeatsUsed?: number }) => ({
          agent: p.name,
          emoji: p.emoji || "🤖",
          heartbeats: p.heartbeatsUsed || 0,
          cost: (p.heartbeatsUsed || 0) * costPerHeartbeat,
        }))
        .filter((e: CostEntry) => e.heartbeats > 0)
        .sort((a: CostEntry, b: CostEntry) => b.cost - a.cost);
      setCostBreakdown(entries);
    } catch { /* ignore */ } finally {
      setLoadingPanel(false);
    }
  }, []);

  const handleRunningClick = () => {
    setShowCost(false);
    setShowRunning(!showRunning);
    if (!showRunning) loadRunningAgents();
  };

  const handleCostClick = () => {
    setShowRunning(false);
    setShowCost(!showCost);
    if (!showCost) loadCostBreakdown();
  };

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="border-b border-border/50 relative">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 px-3 sm:px-4 py-2">
        <MetricCard
          icon={Bot}
          label={t("agents:pulseStrip.agents")}
          value={metrics.totalAgents}
          subValue={`${metrics.activeAgents} active`}
          status={
            metrics.activeAgents > 0 ? "ok" :
            metrics.totalAgents > 0 ? "warning" :
            undefined
          }
        />
        <MetricCard
          icon={Play}
          label={t("agents:pulseStrip.running")}
          value={metrics.runningPlays}
          subValue="running now"
          onClick={handleRunningClick}
          status={metrics.runningPlays > 0 ? "ok" : undefined}
        />
        <MetricCard
          icon={Target}
          label={t("agents:pulseStrip.goals")}
          value={`${metrics.goalsOnTrack}/${metrics.totalGoals}`}
          subValue="goals on track"
          status={goalStatus}
          onClick={onGoalClick}
        />
        <MetricCard
          icon={AlertTriangle}
          label={t("agents:pulseStrip.alerts")}
          value={metrics.alerts}
          subValue="pending alerts"
          status={metrics.alerts >= 3 ? "critical" : metrics.alerts > 0 ? "warning" : "ok"}
          onClick={onAlertClick}
        />
        <MetricCard
          icon={DollarSign}
          label={t("agents:pulseStrip.cost")}
          value={metrics.estimatedCost !== undefined && metrics.estimatedCost > 0
            ? `$${metrics.estimatedCost.toFixed(2)}`
            : "$0"}
          subValue={metrics.estimatedCost !== undefined && metrics.estimatedCost > 0 ? "est. today" : "today"}
          onClick={handleCostClick}
        />
      </div>

      {/* Running plays popover */}
      {showRunning && (
        <PulsePopover title={t("agents:pulseStrip.runningPlays")} icon={Play} onClose={() => setShowRunning(false)}>
          {loadingPanel ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
            </div>
          ) : runningAgents.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/50 py-2">{t("agents:pulseStrip.noRunning")}</p>
          ) : (
            <div className="space-y-2">
              {runningAgents.map((a) => (
                <button
                  key={a.slug}
                  onClick={() => { onAgentClick?.(a.slug); setShowRunning(false); }}
                  className="w-full flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors text-left"
                >
                  <span className="text-sm">{a.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      Started {a.startedAt ? formatTimeAgo(a.startedAt) : "just now"}
                    </p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </button>
              ))}
            </div>
          )}
        </PulsePopover>
      )}

      {/* Cost breakdown popover */}
      {showCost && (
        <PulsePopover title={t("agents:pulseStrip.costBreakdown")} icon={DollarSign} onClose={() => setShowCost(false)}>
          {loadingPanel ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
            </div>
          ) : costBreakdown.length === 0 ? (
            <div className="py-2">
              <p className="text-[12px] text-muted-foreground/50">{t("agents:pulseStrip.noUsage")}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Cost is estimated at ~$0.15 per heartbeat/play execution.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/40 mb-2">
                Estimated at ~$0.15 per heartbeat. Actual costs vary by prompt length.
              </p>
              {costBreakdown.map((entry) => {
                const totalCost = costBreakdown.reduce((s, e) => s + e.cost, 0);
                const pct = totalCost > 0 ? (entry.cost / totalCost) * 100 : 0;
                return (
                  <div key={entry.agent} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{entry.emoji}</span>
                        <span className="font-medium">{entry.agent}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground/60">
                        <span className="tabular-nums">{entry.heartbeats} runs</span>
                        <span className="font-medium text-foreground tabular-nums">${entry.cost.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/50 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[12px] font-medium">
                <span>{t("agents:pulseStrip.totalEstimated")}</span>
                <span className="tabular-nums">${costBreakdown.reduce((s, e) => s + e.cost, 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </PulsePopover>
      )}

      {/* Activity ticker */}
      {ticker && (
        <div className="flex items-center gap-2 px-4 py-1 text-[11px] text-muted-foreground/60 border-t border-border/30 bg-muted/10">
          <Activity className="h-3 w-3 text-emerald-500/50 shrink-0 animate-pulse" />
          <span className="truncate">
            <span>{ticker.emoji} </span>
            <span>{ticker.text}</span>
          </span>
          <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums ml-auto">
            {ticker.time}
          </span>
        </div>
      )}
    </div>
  );
}
