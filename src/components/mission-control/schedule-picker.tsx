"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { cronToHuman } from "@/lib/agents/cron-utils";
import { useLocale } from "@/i18n/use-locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "interval" | "daily" | "weekdays" | "weekly" | "monthly" | "custom";

interface PickerState {
  mode: Mode;
  hour: number;        // 1–12
  minute: number;      // 0 | 15 | 30 | 45
  period: "AM" | "PM";
  weekDays: number[];  // ISO: 1=Mon … 7=Sun
  monthDay: number;    // 1–28
  intervalCron: string;
  customCron: string;
  nlInput: string;
  nlParsing: boolean;
  nlError: string;
}

interface SchedulePickerProps {
  value: string;
  onChange: (cron: string) => void;
  onDone?: () => void;
  label?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVAL_PRESETS = [
  { label: "5m",  cron: "*/5 * * * *" },
  { label: "15m", cron: "*/15 * * * *" },
  { label: "30m", cron: "*/30 * * * *" },
  { label: "1h",  cron: "0 * * * *" },
  { label: "4h",  cron: "0 */4 * * *" },
];

// 1=Mon … 7=Sun matches WEEKDAY_LABELS index+1
const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const MODE_LABELS: Record<Mode, string> = {
  interval: "Interval",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom",
};

const MODES: Mode[] = ["interval", "daily", "weekdays", "weekly", "monthly", "custom"];

const DEFAULT_STATE: PickerState = {
  mode: "weekdays",
  hour: 9,
  minute: 0,
  period: "AM",
  weekDays: [1],
  monthDay: 1,
  intervalCron: "*/15 * * * *",
  customCron: "* * * * *",
  nlInput: "",
  nlParsing: false,
  nlError: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function h24toH12(h24: number): { hour: number; period: "AM" | "PM" } {
  if (h24 === 0) return { hour: 12, period: "AM" };
  if (h24 < 12) return { hour: h24, period: "AM" };
  if (h24 === 12) return { hour: 12, period: "PM" };
  return { hour: h24 - 12, period: "PM" };
}

function h12toH24(hour: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

// Normalize cron Sunday (0) to ISO Sunday (7)
function dowToIso(dow: number): number {
  return dow === 0 ? 7 : dow;
}

function cronToPickerState(cron: string): PickerState {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { ...DEFAULT_STATE, mode: "custom", customCron: cron };
  }

  const [min, hour, dom, month, dow] = parts;

  // Interval: */N * * * *
  if (min.startsWith("*/") && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    const preset = INTERVAL_PRESETS.find((p) => p.cron === cron) ?? INTERVAL_PRESETS[1];
    return { ...DEFAULT_STATE, mode: "interval", intervalCron: preset.cron };
  }
  // Interval: 0 * * * * or 0 */N * * *
  if (min === "0" && (hour === "*" || hour.startsWith("*/")) && dom === "*" && month === "*" && dow === "*") {
    const preset = INTERVAL_PRESETS.find((p) => p.cron === cron) ?? INTERVAL_PRESETS[3];
    return { ...DEFAULT_STATE, mode: "interval", intervalCron: preset.cron };
  }

  // Time-based patterns
  const minNum = parseInt(min, 10);
  const hourNum = parseInt(hour, 10);
  if (!isNaN(minNum) && !isNaN(hourNum) && !hour.includes("*") && !min.includes("*")) {
    const { hour: h12, period } = h24toH12(hourNum);
    const snappedMin = [0, 15, 30, 45].includes(minNum) ? minNum : 0;

    // Monthly: dom is a number, dow is *
    if (dom !== "*" && month === "*" && dow === "*") {
      const domNum = parseInt(dom, 10);
      if (!isNaN(domNum)) {
        return { ...DEFAULT_STATE, mode: "monthly", hour: h12, minute: snappedMin, period, monthDay: Math.min(domNum, 28) };
      }
    }

    if (dom === "*" && month === "*") {
      if (dow === "*") return { ...DEFAULT_STATE, mode: "daily", hour: h12, minute: snappedMin, period };
      if (dow === "1-5") return { ...DEFAULT_STATE, mode: "weekdays", hour: h12, minute: snappedMin, period };

      // Weekly: one or more comma-separated day numbers
      const days = dow
        .split(",")
        .map((d) => dowToIso(parseInt(d, 10)))
        .filter((d) => !isNaN(d) && d >= 1 && d <= 7);
      if (days.length > 0) {
        return { ...DEFAULT_STATE, mode: "weekly", hour: h12, minute: snappedMin, period, weekDays: days };
      }
    }
  }

  return { ...DEFAULT_STATE, mode: "custom", customCron: cron };
}

function pickerStateToCron(state: PickerState): string {
  const { mode, hour, minute, period, weekDays, monthDay, intervalCron, customCron } = state;
  const h24 = h12toH24(hour, period);

  switch (mode) {
    case "interval":  return intervalCron;
    case "daily":     return `${minute} ${h24} * * *`;
    case "weekdays":  return `${minute} ${h24} * * 1-5`;
    case "weekly": {
      const sorted = [...weekDays].sort((a, b) => a - b);
      return `${minute} ${h24} * * ${sorted.length ? sorted.join(",") : "1"}`;
    }
    case "monthly":   return `${minute} ${h24} ${monthDay} * *`;
    case "custom":    return customCron || "* * * * *";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SchedulePicker({ value, onChange, label }: SchedulePickerProps) {
  const { t } = useLocale();
  const [state, setState] = useState<PickerState>(() => cronToPickerState(value));
  const [showCron, setShowCron] = useState(false);
  const emittedCronRef = useRef(value);

  // Re-initialize when value changes externally (e.g., parent reset)
  useEffect(() => {
    if (value !== emittedCronRef.current) {
      setState(cronToPickerState(value));
      emittedCronRef.current = value;
    }
  }, [value]);

  // Emit cron whenever schedule-relevant state changes
  const currentCron = pickerStateToCron(state);
  useEffect(() => {
    if (currentCron && currentCron !== emittedCronRef.current) {
      emittedCronRef.current = currentCron;
      onChange(currentCron);
    }
  }, [currentCron, onChange]);

  const humanReadable = cronToHuman(currentCron);

  const update = (changes: Partial<PickerState>) => setState((s) => ({ ...s, ...changes }));

  const handleNLParse = async () => {
    if (!state.nlInput.trim() || state.nlParsing) return;
    update({ nlParsing: true, nlError: "" });
    try {
      const res = await fetch("/api/schedule/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: state.nlInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Could not parse schedule");
      }
      const { cron } = await res.json() as { cron: string };
      const parsedState = cronToPickerState(cron);
      const canonicalCron = pickerStateToCron(parsedState);
      emittedCronRef.current = canonicalCron;
      onChange(canonicalCron);
      setState({ ...parsedState, nlInput: "", nlParsing: false, nlError: "" });
    } catch (err) {
      update({
        nlParsing: false,
        nlError: err instanceof Error ? err.message : "Couldn't parse that. Try 'every weekday at 9am'.",
      });
    }
  };

  const showTimePicker = state.mode === "daily" || state.mode === "weekdays" || state.mode === "weekly" || state.mode === "monthly";

  return (
    <div className="space-y-3">
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
      )}

      {/* Natural language input */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            value={state.nlInput}
            onChange={(e) => update({ nlInput: e.target.value, nlError: "" })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleNLParse(); } }}
            placeholder='e.g. "every weekday at 9am"'
            className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-muted/20 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/35 text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleNLParse()}
          disabled={!state.nlInput.trim() || state.nlParsing}
          className="px-3 py-1.5 text-[11px] bg-muted/30 border border-border/40 rounded-lg hover:bg-muted/60 disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-colors"
        >
          {state.nlParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Parse"}
        </button>
      </div>
      {state.nlError && (
        <p className="text-[11px] text-destructive/70 -mt-1">{state.nlError}</p>
      )}

      {/* Frequency mode tabs */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{t("schedulePicker:frequency")}</p>
        <div className="flex flex-wrap gap-1">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update({ mode })}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-md border transition-colors",
                state.mode === mode
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Interval sub-presets */}
      {state.mode === "interval" && (
        <div className="flex flex-wrap gap-1">
          {INTERVAL_PRESETS.map((p) => (
            <button
              key={p.cron}
              type="button"
              onClick={() => update({ intervalCron: p.cron })}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-md border transition-colors",
                state.intervalCron === p.cron
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Time picker: At H:MM AM/PM */}
      {showTimePicker && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-5 shrink-0">At</span>
          <select
            value={state.hour}
            onChange={(e) => update({ hour: parseInt(e.target.value, 10) })}
            className="text-[12px] bg-muted/30 border border-border/40 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span className="text-muted-foreground/60 text-[12px] select-none">:</span>
          <select
            value={state.minute}
            onChange={(e) => update({ minute: parseInt(e.target.value, 10) })}
            className="text-[12px] bg-muted/30 border border-border/40 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
          <div className="flex rounded-md border border-border/40 overflow-hidden">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => update({ period: p })}
                className={cn(
                  "text-[11px] px-2.5 py-1 transition-colors",
                  state.period === p
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Weekly: day-of-week multi-picker */}
      {state.mode === "weekly" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-5 shrink-0">On</span>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((dayLabel, i) => {
              const dayNum = i + 1; // 1=Mon … 7=Sun
              const active = state.weekDays.includes(dayNum);
              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() =>
                    update({
                      weekDays: active
                        ? state.weekDays.filter((d) => d !== dayNum)
                        : [...state.weekDays, dayNum],
                    })
                  }
                  className={cn(
                    "text-[11px] w-7 h-7 rounded-md border transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {dayLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly: day-of-month picker */}
      {state.mode === "monthly" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">{t("schedulePicker:onDay")}</span>
          <select
            value={state.monthDay}
            onChange={(e) => update({ monthDay: parseInt(e.target.value, 10) })}
            className="text-[12px] bg-muted/30 border border-border/40 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground/60">of the month</span>
        </div>
      )}

      {/* Custom: raw cron input */}
      {state.mode === "custom" && (
        <input
          value={state.customCron}
          onChange={(e) => update({ customCron: e.target.value })}
          placeholder="* * * * *"
          className="w-full text-[12px] font-mono bg-muted/30 border border-border/50 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      {/* Human-readable summary */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg text-[12px]">
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium uppercase tracking-wide text-foreground">{humanReadable}</span>
      </div>

      {/* Cron expression (collapsible, hidden in custom mode where it's already shown) */}
      {state.mode !== "custom" && (
        <>
          <button
            type="button"
            onClick={() => setShowCron((s) => !s)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showCron && "rotate-180")} />
            {showCron ? "Hide" : "Show"} cron expression
          </button>
          {showCron && (
            <div className="text-[12px] font-mono bg-muted/30 border border-border/50 rounded-md px-3 py-1.5 text-muted-foreground select-all">
              {currentCron}
            </div>
          )}
        </>
      )}
    </div>
  );
}
