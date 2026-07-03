"use client";

import { useState } from "react";
import { Calendar as CalendarIcon, HeartPulse, Loader2, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { startCase } from "@/components/cabinets/cabinet-utils";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";

/** Agent card used in the Agents tab grid. The name is the hero — it wraps to
 *  two lines instead of truncating to "Bid Strat…". Role, department and
 *  schedule are quiet supporting metadata below it. */
export function AgentRow({
  agent,
  routines,
  onToggleActive,
  onOpen,
}: {
  agent: CabinetAgentSummary;
  routines: CabinetJobSummary[];
  onToggleActive: () => void | Promise<void>;
  onOpen: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const heartbeatOn = agent.active && agent.heartbeatEnabled !== false;
  const heartbeatLabel = agent.heartbeat ? cronToHuman(agent.heartbeat) : "off";
  const routinesOff = routines.filter((r) => !r.enabled).length;
  const hasFooter =
    !agent.active ||
    !!agent.department ||
    !!agent.heartbeat ||
    routines.length > 0;

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggleActive();
    } finally {
      setToggling(false);
    }
  }

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div
      onClick={onOpen}
      className={cn(
        "group flex h-full cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all",
        "hover:shadow-md focus-within:ring-2 focus-within:ring-ring/60",
        agent.active
          ? "border-border/70 hover:border-border"
          : "border-border/50 opacity-70 hover:opacity-100"
      )}
    >
      {/* Header: avatar + name (hero, the "Open" affordance) + on/off switch.
          The name is the real interactive control — the outer div is only a
          pointer convenience — so no interactive-inside-interactive (#074). */}
      <div className="flex items-start gap-3">
        <AgentAvatar
          agent={agent}
          shape="circle"
          size="md"
          className={cn(!agent.active && "saturate-50")}
        />
        <button
          type="button"
          title={agent.name}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            "line-clamp-2 min-w-0 flex-1 text-left text-[14px] font-semibold leading-snug outline-none focus-visible:outline-none",
            agent.active ? "text-foreground" : "text-muted-foreground/80"
          )}
        >
          {agent.name}
        </button>
        <div
          className="flex shrink-0 items-center gap-2"
          onClick={stop}
          onKeyDown={stop}
        >
          {toggling ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
          ) : null}
          <Switch
            checked={agent.active}
            onCheckedChange={() => void handleToggle()}
            disabled={toggling}
            aria-label={agent.active ? `Stop ${agent.name}` : `Start ${agent.name}`}
          />
        </div>
      </div>

      {/* Role — supporting text, two-line clamp */}
      {agent.role ? (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {agent.role}
        </p>
      ) : null}

      {/* Footer: status + department + schedule + routines */}
      {hasFooter ? (
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        {/* Non-color cue for the stopped state (#076). */}
        {!agent.active ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            <Pause className="size-2.5" />
            Stopped
          </span>
        ) : null}

        {agent.department ? (
          <span className="whitespace-nowrap rounded-full bg-muted/50 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {startCase(agent.department)}
          </span>
        ) : null}

        {/* Only show the heartbeat chip when one is actually configured (#077). */}
        {agent.heartbeat ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              heartbeatOn
                ? "bg-pink-500/10 text-pink-600 dark:text-pink-400"
                : "bg-muted/50 text-muted-foreground/70"
            )}
            title={heartbeatOn ? `Heartbeat: ${heartbeatLabel}` : "Heartbeat off"}
          >
            <HeartPulse className="size-2.5" />
            {heartbeatLabel}
          </span>
        ) : null}

        {routines.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400"
            title={
              routinesOff > 0
                ? `${routines.length} routines · ${routinesOff} off`
                : `${routines.length} routines`
            }
          >
            <CalendarIcon className="size-2.5" />
            {routinesOff > 0
              ? `${routines.length} · ${routinesOff} off`
              : routines.length}
          </span>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
