"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  OptaleCommandActionFilter,
  OptaleCommandView,
} from "@/components/optale/command-workspace-types";

const FILTERS: Array<{
  id: OptaleCommandActionFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "command", label: "Command" },
  { id: "agent_proposal", label: "Proposals" },
  { id: "review", label: "Review" },
  { id: "scheduling", label: "Scheduling" },
  { id: "governance", label: "Governance" },
];

const COMMAND_VIEW_SEARCH_PLACEHOLDERS: Record<OptaleCommandView, string> = {
  actions: "Search actions and queues",
  runs: "Search runs",
  policy: "Search policy decisions",
  lineage: "Search lineage edges",
  audit: "Search audit events",
};

export function OptaleCommandToolbar({
  activeView,
  activeFilter,
  counts,
  showDiagnostics = true,
  search,
  onActiveFilterChange,
  onSearchChange,
}: {
  activeView: OptaleCommandView;
  activeFilter: OptaleCommandActionFilter;
  showDiagnostics?: boolean;
  counts: {
    actions: number;
    queues: number;
    runs: number;
    policy: number;
    lineage: number;
    audit: number;
  };
  search: string;
  onActiveFilterChange: (filter: OptaleCommandActionFilter) => void;
  onSearchChange: (value: string) => void;
}) {
  const countItems = showDiagnostics
    ? [
        ["Actions", counts.actions],
        ["Queues", counts.queues],
        ["Runs", counts.runs],
        ["Policy", counts.policy],
        ["Lineage", counts.lineage],
        ["Audit", counts.audit],
      ]
    : [["Review Queues", counts.queues]];
  const placeholder = showDiagnostics
    ? COMMAND_VIEW_SEARCH_PLACEHOLDERS[activeView]
    : "Search review queues";

  return (
    <section className="border-b border-border/70 px-6 py-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {countItems.map(([label, value]) => (
            <div
              key={label}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold text-foreground">
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="h-9 pl-8"
          />
        </div>
      </div>
      {activeView === "actions" && showDiagnostics ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onActiveFilterChange(filter.id)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeFilter === filter.id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
