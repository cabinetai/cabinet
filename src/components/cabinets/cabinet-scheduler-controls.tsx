"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { useLocale } from "@/i18n/use-locale";

export function CabinetSchedulerControls({
  cabinetPath,
  ownAgents,
  onRefresh,
}: {
  cabinetPath: string;
  ownAgents: CabinetAgentSummary[];
  onRefresh: () => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeOwn = ownAgents.filter((a) => a.active);
  const anyActive = activeOwn.length > 0;
  const allActive = activeOwn.length === ownAgents.length && ownAgents.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function schedulerAction(action: "start-all" | "stop-all") {
    setBusy(true);
    try {
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cabinetPath }),
      });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  async function restart() {
    setBusy(true);
    try {
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-all", cabinetPath }),
      });
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-all", cabinetPath }),
      });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  }

  if (ownAgents.length === 0) return null;

  const splitBase =
    "inline-flex items-center border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <div className="relative flex items-center gap-2.5" ref={menuRef}>
      {/* Live status indicator */}
      {anyActive && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      )}

      {/* Split button group */}
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={busy}
          onClick={() => void schedulerAction(anyActive ? "stop-all" : "start-all")}
          title={
            anyActive
              ? `Stop all ${activeOwn.length} active agent(s) — pauses their heartbeats and cron jobs. Only this cabinet, not sub-cabinets.`
              : `Activate all ${ownAgents.length} agent(s) — starts their heartbeats and cron jobs on schedule. Only this cabinet, not sub-cabinets.`
          }
          className={cn(splitBase, "gap-2 rounded-l-md border-r-0 px-3 py-1.5 text-sm font-medium")}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : anyActive ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {anyActive ? "Stop All" : "Start All"}
        </button>

        {/* Dropdown toggle */}
        <button
          type="button"
          disabled={busy}
          onClick={() => setMenuOpen((o) => !o)}
          className={cn(splitBase, "rounded-r-md border-l border-border/60 px-2 py-1.5")}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dropdown menu */}
      {menuOpen ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-border bg-popover shadow-lg">
          <div className="py-1.5">
            {!allActive ? (
              <button
                type="button"
                onClick={() => void schedulerAction("start-all")}
                disabled={busy}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t("cabinetScheduler:startAll")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("cabinetScheduler:startAllSubtitle")}</p>
                </div>
              </button>
            ) : null}
            {anyActive ? (
              <button
                type="button"
                onClick={() => void schedulerAction("stop-all")}
                disabled={busy}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{t("cabinetScheduler:stopAll")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("cabinetScheduler:stopAllSubtitle")}</p>
                </div>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void restart()}
              disabled={busy}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
            >
              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("schedulerPlus:restartAll")}</p>
                <p className="text-[11px] text-muted-foreground">{t("schedulerPlus:restartSubtitle")}</p>
              </div>
            </button>
          </div>
          <div className="border-t border-border/60 px-3 py-2.5">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {activeOwn.length}/{ownAgents.length} own agents active.
              Only this cabinet — sub-cabinet agents are not affected.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
