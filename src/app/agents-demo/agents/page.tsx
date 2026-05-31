"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, HeartPulse, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { startCase } from "@/components/cabinets/cabinet-utils";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import { useAgentsDemo } from "../store";
import { FilterChip, ListShell } from "../list-shell";
import { TabExplainer } from "../tab-explainer";

export default function AgentsTab() {
  const { loading, agents, jobs, toggleAgentActive } = useAgentsDemo();
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "stopped">(
    "all"
  );

  const jobsByAgent = useMemo(() => {
    const m = new Map<string, CabinetJobSummary[]>();
    for (const job of jobs) {
      const slug = job.ownerAgent || "";
      if (!slug) continue;
      const list = m.get(slug) || [];
      list.push(job);
      m.set(slug, list);
    }
    return m;
  }, [jobs]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) if (a.department) set.add(a.department);
    return ["all" as const, ...Array.from(set).sort()];
  }, [agents]);

  const activeCount = useMemo(
    () => agents.filter((a) => a.active).length,
    [agents]
  );
  const departmentCount = useMemo(
    () => new Set(agents.map((a) => a.department).filter(Boolean)).size,
    [agents]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (deptFilter !== "all" && a.department !== deptFilter) return false;
      if (activeFilter === "active" && !a.active) return false;
      if (activeFilter === "stopped" && a.active) return false;
      if (q) {
        const hay = [a.name, a.role, a.department]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [agents, query, deptFilter, activeFilter]);

  return (
    <ListShell
      explainer={
        <TabExplainer
          id="agents"
          ariaLabel="About your agents"
          body={
            <>
              <p>
                Your AI teammates. Each one has a specialty — a writer, a
                researcher, a planner. Click any agent to set them up or read
                what they&apos;ve been doing.
              </p>
              <p>
                The switch on each row is the agent&apos;s on / off button.
                When it&apos;s on, the agent does its scheduled work on its
                own. When it&apos;s off, nothing fires automatically — but
                you can still chat with the agent any time.
              </p>
            </>
          }
        />
      }
      stats={
        <>
          <span className="tabular-nums text-foreground">{activeCount}</span>{" "}
          active
          {" · "}
          <span className="tabular-nums text-foreground">{departmentCount}</span>{" "}
          departments
        </>
      }
      query={query}
      setQuery={setQuery}
      searchPlaceholder="Search by name, role, or department"
      filters={
        <>
          <FilterChip
            value={deptFilter}
            onChange={(v) => setDeptFilter(v as string | "all")}
            options={departments.map((d) => ({
              value: d,
              label: d === "all" ? "All departments" : startCase(d),
            }))}
          />
          <FilterChip
            value={activeFilter}
            onChange={(v) => setActiveFilter(v as typeof activeFilter)}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active only" },
              { value: "stopped", label: "Stopped only" },
            ]}
          />
        </>
      }
      trailingActions={
        <button
          type="button"
          title="Open org chart (demo: not wired)"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <Network className="size-3.5" />
          Org chart
        </button>
      }
      loading={loading}
      empty={{
        title: "No agents match your filters.",
        hint: agents.length > 0 ? "Try clearing a filter." : undefined,
      }}
    >
      {filtered.length === 0 ? (
        []
      ) : (
        <ul className="divide-y divide-border/60">
          {filtered.map((agent) => (
            <li key={agent.scopedId}>
              <AgentRow
                agent={agent}
                routines={jobsByAgent.get(agent.slug) || []}
                onToggleActive={() => toggleAgentActive(agent)}
                onOpen={() => {
                  window.location.hash = `#/a/${agent.slug}`;
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </ListShell>
  );
}

function AgentRow({
  agent,
  routines,
  onToggleActive,
  onOpen,
}: {
  agent: CabinetAgentSummary;
  routines: CabinetJobSummary[];
  onToggleActive: () => void;
  onOpen: () => void;
}) {
  const heartbeatOn = agent.active && agent.heartbeatEnabled !== false;
  const heartbeatLabel = agent.heartbeat ? cronToHuman(agent.heartbeat) : "off";
  const routinesOff = routines.filter((r) => !r.enabled).length;

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
      className="group flex h-10 items-center gap-3 px-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Switch
          checked={agent.active}
          onCheckedChange={onToggleActive}
          aria-label={agent.active ? `Stop ${agent.name}` : `Start ${agent.name}`}
        />
      </div>

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
    </div>
  );
}
