"use client";

import { useState, type KeyboardEvent } from "react";
import { Calendar as CalendarIcon, HeartPulse, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { startCase } from "@/components/cabinets/cabinet-utils";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";

/** Compact row used in the Agents tab. */
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

  async function handleToggle() {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggleActive();
    } finally {
      setToggling(false);
    }
  }

  function handleActivate() {
    onOpen();
  }
  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKey}
      className="group flex h-10 items-center gap-3 px-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      <AgentAvatar
        agent={agent}
        shape="circle"
        size="sm"
        className={cn(!agent.active && "saturate-50 opacity-60")}
      />

      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold",
            agent.active ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {agent.name}
        </span>
        {agent.role ? (
          <span
            className={cn(
              "truncate text-[11.5px]",
              agent.active ? "text-muted-foreground" : "text-muted-foreground/60"
            )}
          >
            · {agent.role}
          </span>
        ) : null}
      </div>

      {agent.department ? (
        <span
          className={cn(
            "hidden whitespace-nowrap rounded-full bg-muted/40 px-2 py-0.5 text-[10px] sm:inline-flex",
            agent.active ? "text-muted-foreground" : "text-muted-foreground/60"
          )}
        >
          {startCase(agent.department)}
        </span>
      ) : null}

      <span
        className={cn(
          "hidden items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] sm:inline-flex",
          heartbeatOn
            ? "bg-pink-500/10 text-pink-600 dark:text-pink-400"
            : "bg-muted/40 text-muted-foreground/70"
        )}
        title={heartbeatOn ? `Heartbeat: ${heartbeatLabel}` : "Heartbeat off"}
      >
        <HeartPulse className="size-2.5" />
        {agent.heartbeat ? heartbeatLabel : "off"}
      </span>

      <span
        className={cn(
          "hidden items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] sm:inline-flex",
          routines.length > 0
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-muted/40 text-muted-foreground/70"
        )}
        title={
          routines.length === 0
            ? "No routines"
            : routinesOff > 0
              ? `${routines.length} routines · ${routinesOff} off`
              : `${routines.length} routines`
        }
      >
        <CalendarIcon className="size-2.5" />
        {routines.length === 0
          ? "0"
          : routinesOff > 0
            ? `${routines.length} · ${routinesOff} off`
            : `${routines.length}`}
      </span>

      {toggling ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />
      ) : null}

      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Switch
          checked={agent.active}
          onCheckedChange={() => void handleToggle()}
          disabled={toggling}
          aria-label={agent.active ? `Stop ${agent.name}` : `Start ${agent.name}`}
        />
      </div>
    </div>
  );
}
