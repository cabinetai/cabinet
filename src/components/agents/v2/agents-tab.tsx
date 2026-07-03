"use client";

import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { startCase } from "@/components/cabinets/cabinet-utils";
import type { CabinetJobSummary } from "@/types/cabinets";
import { useLocale } from "@/i18n/use-locale";
import { useAgentsContext } from "./agents-context";
import { FilterChip, ListShell } from "./list-shell";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "./tab-explainer";
import { AgentRow } from "./agent-row";

export function AgentsTab() {
  const { t } = useLocale();
  const { loading, agents, jobs, toggleAgentActive, setOrgChartOpen } =
    useAgentsContext();
  const setSection = useAppStore((s) => s.setSection);
  const explainer = useExplainerState("agents");

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
        <ExplainerCard state={explainer}>
          <p>
            Your AI teammates. Each one has a specialty, a writer, a
            researcher, a planner. Click any agent to set them up or read
            what they&apos;ve been doing.
          </p>
          <p>
            The switch on each row is the agent&apos;s on / off button. When
            it&apos;s on, the agent does its scheduled work on its own. When
            it&apos;s off, nothing fires automatically, but you can still
            chat with the agent any time.
          </p>
        </ExplainerCard>
      }
      stats={
        <>
          <span className="tabular-nums text-foreground">{activeCount}</span>{" "}
          active
          {" · "}
          <span className="tabular-nums text-foreground">{departmentCount}</span>{" "}
          departments
          <ExplainerIcon state={explainer} ariaLabel="About your agents" />
        </>
      }
      query={query}
      setQuery={setQuery}
      searchPlaceholder="Search by name, role, or department"
      filters={
        <>
          <FilterChip
            ariaLabel="Filter by department"
            value={deptFilter}
            onChange={(v) => setDeptFilter(v as string | "all")}
            options={departments.map((d) => ({
              value: d,
              label: d === "all" ? "All departments" : startCase(d),
            }))}
          />
          <FilterChip
            ariaLabel="Filter by status"
            value={activeFilter}
            onChange={(v) => setActiveFilter(v as typeof activeFilter)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active only" },
              { value: "stopped", label: "Stopped only" },
            ]}
          />
        </>
      }
      trailingActions={
        <button
          type="button"
          onClick={() => setOrgChartOpen(true)}
          title={t("agents:workspace.openOrgChart")}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <Network className="size-3.5" />
          {t("agents:workspace.orgChart")}
        </button>
      }
      bare
      loading={loading}
      empty={{
        title:
          agents.length === 0
            ? "No agents yet. Click + New Agent to add one."
            : "No agents match your filters.",
        hint:
          agents.length > 0 && filtered.length === 0
            ? "Try clearing a filter."
            : undefined,
      }}
    >
      {filtered.length === 0 ? (
        []
      ) : (
        <div className="grid grid-cols-1 gap-3 pb-2 pt-0.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((agent) => (
            <AgentRow
              key={agent.scopedId}
              agent={agent}
              routines={jobsByAgent.get(agent.slug) || []}
              onToggleActive={() => toggleAgentActive(agent)}
              onOpen={() =>
                setSection({
                  type: "agent",
                  slug: agent.slug,
                  cabinetPath: agent.cabinetPath,
                  agentScopedId: agent.scopedId,
                })
              }
            />
          ))}
        </div>
      )}
    </ListShell>
  );
}
