"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { LockedSwitch } from "@/components/ui/locked-switch";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { useAgentsContext } from "./agents-context";
import { FilterChip, ListShell } from "./list-shell";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "./tab-explainer";

export function HeartbeatsTab() {
  const {
    loading,
    agents,
    toggleHeartbeatEnabled,
    toggleAllHeartbeats,
    setHeartbeatDialog,
  } = useAgentsContext();
  const explainer = useExplainerState("heartbeats");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "firing" | "off" | "locked"
  >("all");

  const heartbeats = useMemo(
    () => agents.filter((a) => !!a.heartbeat),
    [agents]
  );

  const stats = useMemo(() => {
    let firing = 0;
    let off = 0;
    let locked = 0;
    for (const a of heartbeats) {
      const enabled = a.heartbeatEnabled !== false;
      if (!a.active) locked++;
      else if (enabled) firing++;
      else off++;
    }
    return { firing, off, locked };
  }, [heartbeats]);

  const anyEnabled = heartbeats.some((a) => a.heartbeatEnabled !== false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return heartbeats.filter((a) => {
      const enabled = a.heartbeatEnabled !== false;
      const firing = a.active && enabled;
      const locked = !a.active;
      if (statusFilter === "firing" && !firing) return false;
      if (statusFilter === "off" && (locked || enabled)) return false;
      if (statusFilter === "locked" && !locked) return false;
      if (q) {
        const hay = [a.name, a.role, a.department]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [heartbeats, query, statusFilter]);

  return (
    <ListShell
      explainer={
        <ExplainerCard state={explainer}>
          <p>
            A heartbeat is what makes your agent feel alive. Every time it
            ticks, the agent wakes up, looks around, and decides what to do
            next, no instructions needed. It&apos;s the difference between
            an agent that waits to be told and one that takes initiative.
          </p>
          <p>
            Pick a rhythm that fits the work, every few minutes for
            fast-moving things, once a day for quieter ones. Switch it off
            any time to give the agent a break without stopping it
            completely.
          </p>
        </ExplainerCard>
      }
      stats={
        <>
          <span className="tabular-nums text-foreground">{stats.firing}</span>{" "}
          firing
          {" · "}
          <span className="tabular-nums text-foreground">{stats.off}</span> off
          {" · "}
          <span className="tabular-nums text-foreground">{stats.locked}</span>{" "}
          locked
          <ExplainerIcon state={explainer} ariaLabel="About heartbeats" />
        </>
      }
      query={query}
      setQuery={setQuery}
      searchPlaceholder="Search by agent name or role"
      filters={
        <FilterChip
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
            { value: "all", label: "All states" },
            { value: "firing", label: "Firing" },
            { value: "off", label: "Off" },
            { value: "locked", label: "Locked (agent stopped)" },
          ]}
        />
      }
      trailingActions={
        heartbeats.length > 0 ? (
          <button
            type="button"
            onClick={() => void toggleAllHeartbeats()}
            title={anyEnabled ? "Pause every heartbeat" : "Resume every heartbeat"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Pause className="size-3.5" />
            {anyEnabled ? "Pause all" : "Resume all"}
          </button>
        ) : null
      }
      loading={loading}
      empty={{
        title:
          heartbeats.length === 0
            ? "No heartbeats configured yet."
            : "No heartbeats match your filters.",
        hint:
          heartbeats.length === 0
            ? "Open any agent and set a heartbeat schedule to see it here."
            : "Try clearing a filter.",
      }}
    >
      {filtered.length === 0 ? (
        []
      ) : (
        <ul className="divide-y divide-border/60">
          {filtered.map((agent) => (
            <li key={agent.scopedId}>
              <HeartbeatRow
                agent={agent}
                onToggle={() => toggleHeartbeatEnabled(agent)}
                onOpen={() =>
                  setHeartbeatDialog({
                    agent: {
                      slug: agent.slug,
                      name: agent.name,
                      role: agent.role,
                      cabinetPath: agent.cabinetPath,
                    },
                    initialHeartbeat: agent.heartbeat,
                    initialEnabled: agent.heartbeatEnabled !== false,
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </ListShell>
  );
}

function HeartbeatRow({
  agent,
  onToggle,
  onOpen,
}: {
  agent: CabinetAgentSummary;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const enabled = agent.heartbeatEnabled !== false;
  const firing = agent.active && enabled;
  const locked = !agent.active;
  const schedule = agent.heartbeat ? cronToHuman(agent.heartbeat) : "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex h-10 items-center gap-3 px-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      <HeartPulse
        className={cn(
          "size-3.5 shrink-0",
          firing ? "text-pink-500" : "text-muted-foreground/40"
        )}
      />
      <AgentAvatar
        agent={agent}
        shape="circle"
        size="sm"
        className={cn(!firing && "saturate-50 opacity-60")}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold",
            firing ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {agent.name}
        </span>
        <span
          className={cn(
            "truncate text-[11.5px]",
            firing ? "text-muted-foreground" : "text-muted-foreground/60"
          )}
        >
          · Heartbeat
        </span>
      </div>
      <span
        className={cn(
          "whitespace-nowrap text-[11px] tabular-nums",
          firing ? "text-muted-foreground" : "text-muted-foreground/60"
        )}
      >
        {schedule}
      </span>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <LockedSwitch
          checked={enabled}
          onCheckedChange={onToggle}
          locked={locked}
          tooltip="This agent is stopped. Start it on the Agents tab to enable the heartbeat."
          ariaLabel={
            enabled ? `Pause ${agent.name} heartbeat` : `Resume ${agent.name} heartbeat`
          }
        />
      </div>
    </div>
  );
}
