"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { DepthDropdown } from "./depth-dropdown";
import { sortOrgAgents, startCase } from "./cabinet-utils";
import { AgentStatusCard } from "./agent-status-card";
import type { AgentConversationInfo } from "./agent-status-card";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
  CabinetVisibilityMode,
} from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";

interface AgentStatusGridProps {
  cabinetPath: string;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  children: CabinetOverview["children"];
  visibilityMode: CabinetVisibilityMode;
  onVisibilityChange: (mode: CabinetVisibilityMode) => void;
  onAgentClick?: (agent: CabinetAgentSummary) => void;
  onAgentSend?: (agent: CabinetAgentSummary) => void;
  onChildCabinetClick?: (cabinet: CabinetOverview["children"][number]) => void;
}

export function AgentStatusGrid({
  cabinetPath,
  agents,
  jobs,
  children,
  visibilityMode,
  onVisibilityChange,
  onAgentClick,
  onAgentSend,
  onChildCabinetClick,
}: AgentStatusGridProps) {
  const [conversationMap, setConversationMap] = useState<
    Map<string, AgentConversationInfo>
  >(new Map());

  // Fetch latest conversation per agent
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ cabinetPath, limit: "30" });
      if (visibilityMode !== "own") params.set("visibilityMode", visibilityMode);
      const res = await fetch(`/api/agents/conversations?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const convs = (data.conversations || []) as ConversationMeta[];

      // Build map: one entry per agent slug (latest conversation)
      const map = new Map<string, AgentConversationInfo>();
      for (const conv of convs) {
        const key = conv.agentSlug;
        if (!map.has(key)) {
          map.set(key, {
            title: conv.title,
            status: conv.status,
            startedAt: conv.startedAt,
          });
        }
      }
      setConversationMap(map);
    } catch {
      // ignore
    }
  }, [cabinetPath, visibilityMode]);

  useEffect(() => {
    void fetchConversations();
    const iv = setInterval(() => void fetchConversations(), 8000);
    return () => clearInterval(iv);
  }, [fetchConversations]);

  const sorted = useMemo(() => [...agents].sort(sortOrgAgents), [agents]);

  // Group by department
  const grouped = useMemo(() => {
    const groups: { dept: string; label: string; agents: CabinetAgentSummary[] }[] = [];
    const deptMap = new Map<string, CabinetAgentSummary[]>();
    for (const agent of sorted) {
      const dept = agent.department || "general";
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(agent);
    }

    const entries = Array.from(deptMap.entries()).sort(([a], [b]) => {
      if (a === "executive") return -1;
      if (b === "executive") return 1;
      if (a === "general") return 1;
      if (b === "general") return -1;
      return startCase(a).localeCompare(startCase(b));
    });

    for (const [dept, deptAgents] of entries) {
      groups.push({ dept, label: startCase(dept), agents: deptAgents });
    }
    return groups;
  }, [sorted]);

  function jobsForAgent(agent: CabinetAgentSummary): CabinetJobSummary[] {
    return jobs.filter((job) => {
      if (job.ownerScopedId) return job.ownerScopedId === agent.scopedId;
      return job.ownerAgent === agent.slug && job.cabinetPath === agent.cabinetPath;
    });
  }

  const hasDepartments = grouped.length > 1 || (grouped.length === 1 && grouped[0].dept !== "general");

  return (
    <div className="space-y-5">
      {/* Section header with depth filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">
          Agents
        </h2>
        <DepthDropdown mode={visibilityMode} onChange={onVisibilityChange} />
      </div>

      {/* Agent cards grid */}
      {sorted.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No agents configured for this cabinet yet.
        </p>
      ) : hasDepartments ? (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.dept}>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/50">
                {group.label}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.agents.map((agent) => (
                  <AgentStatusCard
                    key={agent.scopedId}
                    agent={agent}
                    jobs={jobsForAgent(agent)}
                    latestConversation={conversationMap.get(agent.slug) || null}
                    onClick={() => onAgentClick?.(agent)}
                    onSend={() => onAgentSend?.(agent)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((agent) => (
            <AgentStatusCard
              key={agent.scopedId}
              agent={agent}
              jobs={jobsForAgent(agent)}
              latestConversation={conversationMap.get(agent.slug) || null}
              onClick={() => onAgentClick?.(agent)}
              onSend={() => onAgentSend?.(agent)}
            />
          ))}
        </div>
      )}

      {/* Child cabinets */}
      {children.length > 0 && (
        <div className="flex flex-wrap gap-2.5 pt-2">
          {children.map((child) => (
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
      )}
    </div>
  );
}
