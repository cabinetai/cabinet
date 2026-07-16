"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GoalHistoryEntry {
  period: string;
  actual: number;
  target: number;
}

interface GoalBarProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  floor?: number;
  compact?: boolean;
  history?: GoalHistoryEntry[];
  periodStart?: string;
  periodEnd?: string;
}

function getStatus(current: number, target: number): "on-track" | "behind" | "critical" | "exceeded" {
  if (target === 0) return "on-track";
  if (current === 0) return "on-track"; // No progress yet — don't mark as critical
  const pct = current / target;
  if (pct >= 1) return "exceeded";
  if (pct >= 0.4) return "on-track";
  if (pct >= 0.2) return "behind";
  return "critical";
}

function formatPeriod(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function SparklineChart({ history, current, target }: { history: GoalHistoryEntry[]; current: number; target: number }) {
  // Build data points: historical + current period
  const points = [
    ...history.map((h) => ({ value: h.actual, target: h.target, label: formatPeriod(h.period) })),
    { value: current, target, label: "Now" },
  ];

  if (points.length < 2) {
    return (
      <div className="text-[11px] text-muted-foreground/50 py-2">
        Not enough data for trend chart yet.
      </div>
    );
  }

  const width = 280;
  const height = 60;
  const padding = { top: 4, right: 8, bottom: 16, left: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = points.flatMap((p) => [p.value, p.target]);
  const maxVal = Math.max(...allValues, 1);

  const xStep = chartW / (points.length - 1);

  const valuePath = points
    .map((p, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + chartH - (p.value / maxVal) * chartH;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  // Target line (horizontal dashed)
  const targetY = padding.top + chartH - (target / maxVal) * chartH;

  // Trend indicator
  const lastTwo = points.slice(-2);
  const trend = lastTwo.length === 2
    ? lastTwo[1].value > lastTwo[0].value ? "up" : lastTwo[1].value < lastTwo[0].value ? "down" : "flat"
    : "flat";

  return (
    <div className="mt-2">
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Target line */}
        <line
          x1={padding.left}
          y1={targetY}
          x2={width - padding.right}
          y2={targetY}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="3,3"
          strokeWidth={1}
        />
        <text
          x={width - padding.right}
          y={targetY - 3}
          textAnchor="end"
          className="fill-muted-foreground/30"
          fontSize={8}
        >
          target
        </text>

        {/* Value line */}
        <path
          d={valuePath}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />

        {/* Data points */}
        {points.map((p, i) => {
          const x = padding.left + i * xStep;
          const y = padding.top + chartH - (p.value / maxVal) * chartH;
          const isLast = i === points.length - 1;
          const pctOfTarget = p.target > 0 ? p.value / p.target : 0;
          const dotColor = isLast
            ? pctOfTarget >= 1 ? "text-blue-500" : pctOfTarget >= 0.4 ? "text-emerald-500" : pctOfTarget >= 0.2 ? "text-amber-500" : "text-red-500"
            : pctOfTarget >= 1 ? "text-blue-400" : "text-muted-foreground/40";
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={isLast ? 3 : 2} className={cn("fill-current", dotColor)} />
              {/* Period label */}
              <text
                x={x}
                y={height - 2}
                textAnchor="middle"
                className="fill-muted-foreground/40"
                fontSize={7}
              >
                {p.label}
              </text>
              {/* Value label on hover area */}
              <text
                x={x}
                y={y - 6}
                textAnchor="middle"
                className={cn("fill-muted-foreground/50", isLast && "fill-foreground/70 font-medium")}
                fontSize={isLast ? 9 : 8}
              >
                {p.value}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Trend summary */}
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/60">
        {trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-500" />}
        {trend === "down" && <TrendingDown className="h-3 w-3 text-amber-500" />}
        {trend === "flat" && <Minus className="h-3 w-3 text-muted-foreground/40" />}
        <span>
          {history.length > 0
            ? `${history.length} past period${history.length > 1 ? "s" : ""}: avg ${Math.round(history.reduce((s, h) => s + h.actual, 0) / history.length)}/${target}`
            : "First period, no historical data yet"}
        </span>
      </div>
    </div>
  );
}

export function GoalBar({ label, current, target, unit, floor, compact, history, periodStart, periodEnd }: GoalBarProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const status = getStatus(current, target);

  const barColor = {
    "on-track": "bg-emerald-500",
    behind: "bg-amber-500",
    critical: "bg-red-500",
    exceeded: "bg-blue-500",
  }[status];

  const statusLabel = {
    "on-track": "",
    behind: "behind",
    critical: "critical",
    exceeded: "ahead",
  }[status];

  const floorPct = floor && target > 0 ? Math.min((floor / target) * 100, 100) : 0;

  const hasHistory = history && history.length > 0;
  const isClickable = !compact && (hasHistory || current > 0);

  if (compact) {
    return (
      <div className="space-y-0">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground truncate">{label}</span>
          <span className="text-foreground tabular-nums ml-2">
            {current}/{target}
          </span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden relative">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
          {floorPct > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/50"
              style={{ left: `${floorPct}%` }}
              title={`Floor: ${floor}`}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={isClickable ? () => setExpanded(!expanded) : undefined}
        className={cn(
          "w-full text-left space-y-1",
          isClickable && "cursor-pointer hover:bg-muted/20 -mx-2 px-2 py-1 rounded-md transition-colors"
        )}
      >
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">{label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground tabular-nums font-medium">
              {current}/{target}
            </span>
            {unit && (
              <span className="text-muted-foreground/40 text-[10px]">{unit}</span>
            )}
            <span className="text-muted-foreground/60">{Math.round(pct)}%</span>
            {statusLabel && (
              <span
                className={cn(
                  "text-[10px] px-1 py-0.5 rounded",
                  status === "behind" && "bg-amber-500/10 text-amber-500",
                  status === "critical" && "bg-red-500/10 text-red-500",
                  status === "exceeded" && "bg-blue-500/10 text-blue-500"
                )}
              >
                {statusLabel}
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden relative">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
          {floorPct > 0 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/50"
              style={{ left: `${floorPct}%` }}
              title={`Floor: ${floor}`}
            />
          )}
        </div>
      </button>

      {/* Expanded trend chart */}
      {expanded && (
        <div className="px-2 pb-2 animate-in slide-in-from-top-1 duration-150">
          {periodStart && periodEnd && (
            <div className="text-[10px] text-muted-foreground/40 mt-1">
              Current period: {formatPeriod(periodStart)} to {formatPeriod(periodEnd)}
            </div>
          )}
          <SparklineChart
            history={history || []}
            current={current}
            target={target}
          />
        </div>
      )}
    </div>
  );
}
