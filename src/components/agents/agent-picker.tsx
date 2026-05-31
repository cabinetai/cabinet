"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Shared types ─── */

export interface SuggestedAgent {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  checked: boolean;
}

export interface LibraryTemplate {
  slug: string;
  name: string;
  emoji: string;
  role: string;
  department: string;
  type: string;
}

export const ALWAYS_CHECKED = new Set(["ceo", "editor"]);

/* ─── Department grouping ─── */

const DEPARTMENT_ORDER: [string, string][] = [
  ["leadership", "Leadership"],
  ["marketing", "Marketing"],
  ["engineering", "Engineering"],
  ["product", "Product & Design"],
  ["design", "Product & Design"],
  ["sales", "Business"],
  ["support", "Business"],
  ["analytics", "Business"],
  ["research", "Business"],
  ["finance", "Finance & Ops"],
  ["legal", "Finance & Ops"],
  ["hr", "Finance & Ops"],
];

function getDepartmentLabel(dept: string): string {
  const entry = DEPARTMENT_ORDER.find(([key]) => key === dept);
  return entry ? entry[1] : "Other";
}

export function groupByDepartment(
  agents: SuggestedAgent[],
  templates: LibraryTemplate[]
): [string, SuggestedAgent[]][] {
  const deptMap = new Map<string, string>();
  for (const t of templates) deptMap.set(t.slug, t.department);

  const groups = new Map<string, SuggestedAgent[]>();
  for (const agent of agents) {
    const label = getDepartmentLabel(deptMap.get(agent.slug) || "general");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(agent);
  }

  const labelOrder = Array.from(
    new Set(DEPARTMENT_ORDER.map(([, l]) => l))
  ).concat("Other");
  return labelOrder
    .filter((label) => groups.has(label))
    .map((label) => [label, groups.get(label)!]);
}

/* ─── Component ─── */

interface AgentPickerProps {
  agents: SuggestedAgent[];
  libraryTemplates: LibraryTemplate[];
  maxAgents?: number;
  onToggle: (slug: string) => void;
  alwaysChecked?: Set<string>;
  loading?: boolean;
  /** "scroll" = horizontal scroll (default, compact dialogs); "grid" = wrapping grid (fullscreen) */
  layout?: "scroll" | "grid";
}

export function AgentPicker({
  agents,
  libraryTemplates,
  maxAgents,
  onToggle,
  alwaysChecked = ALWAYS_CHECKED,
  loading = false,
  layout = "scroll",
}: AgentPickerProps) {
  const selectedCount = agents.filter((a) => a.checked).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {maxAgents != null && (
        <p className="text-[11px] font-medium text-muted-foreground text-center">
          Select agents{" "}
          <span
            className={cn(
              selectedCount >= maxAgents
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            ({selectedCount}/{maxAgents})
          </span>
        </p>
      )}
      <div className={cn(
        "gap-3 pb-2",
        layout === "grid"
          ? "flex flex-wrap"
          : "flex overflow-x-auto"
      )}>
        {groupByDepartment(agents, libraryTemplates).map(
          ([label, groupAgents]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-muted/30 p-3 shrink-0"
              style={{ width: 180 }}
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <div className="flex flex-col gap-1.5">
                {groupAgents.map((agent) => {
                  const isMandatory = alwaysChecked.has(agent.slug);
                  const atLimit =
                    maxAgents != null &&
                    selectedCount >= maxAgents &&
                    !agent.checked;
                  return (
                    <button
                      key={agent.slug}
                      onClick={() => onToggle(agent.slug)}
                      disabled={isMandatory || atLimit}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all",
                        agent.checked
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-background",
                        atLimit && "opacity-45 cursor-not-allowed",
                        isMandatory && "cursor-default"
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded border-[1.5px]",
                          agent.checked
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40 bg-transparent"
                        )}
                      >
                        {agent.checked && (
                          <Check className="size-2 text-primary-foreground" />
                        )}
                      </div>
                      <span className="text-xs">{agent.emoji}</span>
                      <p className="text-[11px] font-medium truncate text-foreground">
                        {agent.name}
                      </p>
                      {isMandatory && (
                        <span className="ms-auto text-[9px] font-medium uppercase tracking-wide shrink-0 text-muted-foreground">
                          Required
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
