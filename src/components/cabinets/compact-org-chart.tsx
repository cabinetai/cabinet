"use client";

import { Clock3, FolderOpen, FolderTree, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { cronToShortLabel } from "@/lib/agents/cron-utils";
import { sortOrgAgents, startCase } from "./cabinet-utils";
import { useLocale } from "@/i18n/use-locale";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
} from "@/types/cabinets";

const CONNECTOR_COLOR = "rgba(139, 94, 60, 0.26)";
const ROOT_FILL = "rgba(139, 94, 60, 0.1)";
const ROOT_BORDER = "rgba(139, 94, 60, 0.2)";

export function CompactOrgChart({
  cabinetName,
  agents,
  jobs,
  childCabinets,
  onAgentClick,
  onAgentSend,
  onChildCabinetClick,
}: {
  cabinetName: string;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  childCabinets: CabinetOverview["children"];
  onAgentClick?: (agent: CabinetAgentSummary) => void;
  onAgentSend?: (agent: CabinetAgentSummary) => void;
  onChildCabinetClick?: (cabinet: CabinetOverview["children"][number]) => void;
}) {
  const { t } = useLocale();
  const allAgents = [...agents].sort(sortOrgAgents);
  const grouped = Object.entries(
    allAgents.reduce<Record<string, CabinetAgentSummary[]>>((acc, agent) => {
      const dept = agent.department || "general";
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(agent);
      return acc;
    }, {})
  )
    .sort(([l], [r]) => {
      if (l === "executive") return -1;
      if (r === "executive") return 1;
      if (l === "general") return 1;
      if (r === "general") return -1;
      return startCase(l).localeCompare(startCase(r));
    })
    .map(([dept, deptAgents]) => ({
      dept,
      label: startCase(dept),
      agents: deptAgents.sort(sortOrgAgents),
    }));
  const groupedRows = grouped.reduce<typeof grouped[]>((rows, group, index) => {
    const rowIndex = Math.floor(index / 4);
    if (!rows[rowIndex]) rows[rowIndex] = [];
    rows[rowIndex].push(group);
    return rows;
  }, []);

  function jobsForAgent(agent: CabinetAgentSummary) {
    return jobs.filter((job) => {
      if (job.ownerScopedId) return job.ownerScopedId === agent.scopedId;
      return job.ownerAgent === agent.slug && job.cabinetPath === agent.cabinetPath;
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      {allAgents.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">{t("cabinetsExtras:noAgentsConfigured")}</p>
      ) : (
        <div className="min-w-[720px] px-2">
          <div className="flex justify-center">
            <div
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5"
              style={{ backgroundColor: ROOT_FILL, borderColor: ROOT_BORDER }}
            >
              <FolderTree className="h-4 w-4 shrink-0 text-[rgb(139,94,60)]" />
              <div>
                <p className="text-sm font-semibold text-foreground">{cabinetName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {agents.length} visible agent{agents.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>

          {groupedRows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`}>
              <VerticalConnector height={20} />
              <HorizontalBranch count={row.length} />
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((group) => (
                  <div key={group.dept} className="flex flex-col items-center">
                    <div
                      className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5"
                      style={{
                        backgroundColor: "rgba(139, 94, 60, 0.05)",
                        borderColor: "rgba(139, 94, 60, 0.16)",
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[rgb(139,94,60)]" />
                      <span className="text-xs font-medium text-foreground">{group.label}</span>
                    </div>
                    <VerticalConnector height={10} />
                    <div className="flex w-full flex-col items-center gap-2">
                      {group.agents.map((agent) => {
                        const agentJobs = jobsForAgent(agent);
                        return (
                          <div key={agent.scopedId} className="flex w-full flex-col items-center gap-1.5">
                            <div className="flex w-full max-w-[220px] items-stretch gap-1.5">
                              <button
                                type="button"
                                onClick={() => onAgentClick?.(agent)}
                                className={cn(
                                  "flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left transition-colors",
                                  onAgentClick && "hover:bg-muted/30"
                                )}
                                style={{ borderColor: "rgba(139, 94, 60, 0.14)" }}
                              >
                                <span className="text-base leading-none">{agent.emoji || "🤖"}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[12px] font-medium text-foreground">
                                    {agent.name}
                                  </p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {agent.role}
                                    {agent.inherited ? ` · ${agent.cabinetName}` : ""}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full shrink-0",
                                    agent.active ? "bg-emerald-500" : "bg-muted-foreground/30"
                                  )}
                                />
                              </button>

                              {onAgentSend ? (
                                <button
                                  type="button"
                                  onClick={() => onAgentSend(agent)}
                                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground transition-colors hover:bg-muted/30"
                                  style={{ borderColor: "rgba(139, 94, 60, 0.14)" }}
                                  aria-label={`Open chat with ${agent.name}`}
                                  title={`Open chat with ${agent.name}`}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>

                            {agentJobs.length > 0 ? (
                              <div className="flex w-full flex-col items-center gap-1">
                                {agentJobs.map((job) => (
                                  <div
                                    key={job.scopedId}
                                    className="flex w-full max-w-[182px] items-center gap-1.5 rounded-lg border bg-muted/15 px-2.5 py-1.5"
                                    style={{ borderColor: "rgba(139, 94, 60, 0.12)" }}
                                  >
                                    <Clock3 className="h-3 w-3 shrink-0 text-[rgb(139,94,60)]" />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-[10px] font-medium text-foreground">
                                        {job.name}
                                      </p>
                                      <p className="truncate text-[9px] text-muted-foreground">
                                        {cronToShortLabel(job.schedule)}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {childCabinets.length > 0 ? (
            <div className="mt-8">
              <div className="flex flex-wrap gap-3">
                {childCabinets.map((child) => (
                  <button
                    key={child.path}
                    type="button"
                    onClick={() => onChildCabinetClick?.(child)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left transition-colors",
                      onChildCabinetClick && "hover:bg-muted/30"
                    )}
                    style={{ borderColor: "rgba(139, 94, 60, 0.14)" }}
                  >
                    <FolderTree className="h-3.5 w-3.5 shrink-0 text-[rgb(139,94,60)]" />
                    <div>
                      <p className="text-[12px] font-medium text-foreground">{child.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        depth {child.cabinetDepth ?? 1}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function VerticalConnector({ height = 18 }: { height?: number }) {
  return (
    <div
      className="mx-auto w-px"
      style={{ height, backgroundColor: CONNECTOR_COLOR }}
    />
  );
}

function HorizontalBranch({ count }: { count: number }) {
  if (count <= 1) return <VerticalConnector height={14} />;

  const edgeInset = count <= 2 ? 25 : count <= 3 ? 16.67 : 12.5;
  const spacing = count <= 1 ? 0 : (100 - edgeInset * 2) / (count - 1);

  return (
    <div className="relative mx-5 h-4">
      <div
        className="absolute top-0 h-px"
        style={{
          left: `${edgeInset}%`,
          right: `${edgeInset}%`,
          backgroundColor: CONNECTOR_COLOR,
        }}
      />
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="absolute top-0 w-px"
          style={{
            left: `${edgeInset + index * spacing}%`,
            height: 16,
            backgroundColor: CONNECTOR_COLOR,
          }}
        />
      ))}
    </div>
  );
}
