"use client";

import { useMemo, useState } from "react";
import { Clock3, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { LockedSwitch } from "@/components/ui/locked-switch";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import { useAgentsDemo } from "../store";
import { FilterChip, ListShell } from "../list-shell";
import { TabExplainer } from "../tab-explainer";

export default function RoutinesTab() {
  const { loading, agents, jobs, toggleJobEnabled } = useAgentsDemo();
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "firing" | "off" | "locked">("all");

  const agentBySlug = useMemo(() => {
    const m = new Map<string, CabinetAgentSummary>();
    for (const a of agents) m.set(a.slug, a);
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const owner = agentBySlug.get(job.ownerAgent || "");
      const masterOn = owner?.active ?? false;
      const firing = masterOn && job.enabled;
      const locked = !masterOn;

      if (agentFilter !== "all" && job.ownerAgent !== agentFilter) return false;
      if (statusFilter === "firing" && !firing) return false;
      if (statusFilter === "off" && (locked || job.enabled)) return false;
      if (statusFilter === "locked" && !locked) return false;
      if (q) {
        const hay = [job.name, owner?.name, owner?.role]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, agentBySlug, query, agentFilter, statusFilter]);

  const stats = useMemo(() => {
    let firing = 0;
    let off = 0;
    let locked = 0;
    for (const job of jobs) {
      const masterOn = agentBySlug.get(job.ownerAgent || "")?.active ?? false;
      if (!masterOn) locked++;
      else if (job.enabled) firing++;
      else off++;
    }
    return { firing, off, locked };
  }, [jobs, agentBySlug]);

  const agentOptions = useMemo(
    () => [
      { value: "all" as const, label: "All agents" },
      ...agents
        .filter((a) => jobs.some((j) => j.ownerAgent === a.slug))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({ value: a.slug, label: a.name })),
    ],
    [agents, jobs]
  );

  return (
    <ListShell
      explainer={
        <TabExplainer
          id="routines"
          ariaLabel="About routines"
          body={
            <>
              <p>
                A routine is a recurring task you give an agent. Write it
                once, pick when it should run, and your agent handles it on
                schedule — like <em>&ldquo;every weekday at 9am, summarize
                yesterday&rsquo;s work.&rdquo;</em>
              </p>
              <p>
                Switch a routine off to pause it without losing the prompt.
                If the agent itself is stopped, its routines wait until you
                start it again.
              </p>
            </>
          }
        />
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
        </>
      }
      query={query}
      setQuery={setQuery}
      searchPlaceholder="Search by routine name or agent"
      filters={
        <>
          <FilterChip
            value={agentFilter}
            onChange={(v) => setAgentFilter(v as string | "all")}
            options={agentOptions}
          />
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
        </>
      }
      loading={loading}
      empty={{
        title: "No routines here.",
        hint:
          jobs.length === 0
            ? "Add a routine on any agent's page to see it here."
            : "Try clearing a filter.",
      }}
    >
      {filtered.length === 0 ? (
        []
      ) : (
        <ul className="divide-y divide-border/60">
          {filtered.map((job) => {
            const owner = agentBySlug.get(job.ownerAgent || "");
            return (
              <li key={job.scopedId}>
                <RoutineRow
                  job={job}
                  owner={owner}
                  onToggle={() => toggleJobEnabled(job)}
                  onOpen={() => {
                    if (owner) window.location.hash = `#/a/${owner.slug}`;
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </ListShell>
  );
}

function RoutineRow({
  job,
  owner,
  onToggle,
  onOpen,
}: {
  job: CabinetJobSummary;
  owner: CabinetAgentSummary | undefined;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const masterOn = owner?.active ?? false;
  const firing = masterOn && job.enabled;
  const locked = !masterOn;
  const schedule = job.schedule ? cronToHuman(job.schedule) : "";

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
      <Clock3
        className={cn(
          "size-3.5 shrink-0",
          firing ? "text-emerald-500" : "text-muted-foreground/40"
        )}
      />
      {owner ? (
        <AgentAvatar
          agent={owner}
          shape="circle"
          size="sm"
          className={cn(!firing && "saturate-50 opacity-60")}
        />
      ) : (
        <div className="size-5 shrink-0 rounded-full bg-muted/40" />
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold",
            firing ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {job.name || "(untitled routine)"}
        </span>
        {owner ? (
          <span
            className={cn(
              "truncate text-[11.5px]",
              firing ? "text-muted-foreground" : "text-muted-foreground/60"
            )}
          >
            · {owner.name}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "whitespace-nowrap text-[11px] tabular-nums",
          firing ? "text-muted-foreground" : "text-muted-foreground/60"
        )}
      >
        {schedule}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
        }}
        disabled
        title="Run now (demo: not wired)"
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed"
      >
        <Play className="size-3.5" />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <LockedSwitch
          checked={job.enabled}
          onCheckedChange={onToggle}
          locked={locked}
          tooltip="This agent is stopped. Start it on the Agents tab to enable its routines."
          ariaLabel={
            job.enabled
              ? `Disable routine ${job.name}`
              : `Enable routine ${job.name}`
          }
        />
      </div>
    </div>
  );
}
