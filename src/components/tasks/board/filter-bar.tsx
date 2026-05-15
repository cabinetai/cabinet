"use client";

import { Users, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import { AgentAvatar, hasAgentAvatarImage } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import { useLocale } from "@/i18n/use-locale";

export type TriggerFilter = "all" | "manual" | "job" | "heartbeat";

const TRIGGER_TONES: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-400 ring-pink-500/20",
};

export function TriggerChip({
  active,
  onClick,
  children,
  icon,
  tone,
  count,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "sky" | "emerald" | "pink";
  count?: React.ReactNode;
  title?: string;
}) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
        active
          ? tone
            ? cn("ring-1", TRIGGER_TONES[tone])
            : "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
      {children}
      {count != null && (
        <span
          className={cn(
            "ml-0.5 tabular-nums",
            active ? "opacity-75" : "opacity-60"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Agent filter dropdown — replaces the horizontally-scrolling pill row from
 * before audit #036. Renders a single trigger ("Agents: All" / "Agents:
 * Editor") that opens a list. Single-select preserves the existing
 * agentFilter API; "All agents" clears the filter.
 *
 * Returns null when no agents are in the cabinet.
 */
export function AgentFilterDropdown({
  agents,
  agentFilter,
  onAgentChange,
  className,
}: {
  agents: CabinetAgentSummary[];
  agentFilter: string | null;
  onAgentChange: (slug: string | null) => void;
  className?: string;
}) {
  const { t } = useLocale();
  if (agents.length === 0) return null;
  const selected = agentFilter
    ? agents.find((a) => a.slug === agentFilter) ?? null
    : null;
  const triggerLabel = selected
    ? selected.displayName ?? selected.name
    : t("tinyExtras:allAgents");
  const hasImage = selected ? hasAgentAvatarImage(selected) : false;
  const SelectedIcon = selected
    ? resolveAgentIcon(selected.slug, selected.iconKey ?? null)
    : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={t("tasksBoard:filterByAgent", { name: triggerLabel })}
        aria-label={t("tasksBoard:filterByAgent", { name: triggerLabel })}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2 text-[11px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground hover:border-border data-[popup-open]:bg-accent",
          selected && "border-primary/60",
          className
        )}
      >
        {selected ? (
          hasImage ? (
            <AgentAvatar agent={selected} shape="circle" size="xs" />
          ) : SelectedIcon ? (
            <SelectedIcon className="size-3" />
          ) : (
            <Users className="size-3" />
          )
        ) : (
          <Users className="size-3" />
        )}
        <span className="font-medium">{triggerLabel}</span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px] max-h-[60vh] overflow-y-auto">
        <DropdownMenuItem
          onClick={() => onAgentChange(null)}
          className="flex items-center justify-between gap-2 py-1.5"
        >
          <span className="flex items-center gap-2">
            <Users className="size-3.5 text-muted-foreground" />
            <span className="text-[12.5px]">{t("tinyExtras:allAgents")}</span>
          </span>
          {agentFilter === null && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        {agents.map((agent) => {
          const active = agentFilter === agent.slug;
          const agentHasImage = hasAgentAvatarImage(agent);
          const tint = agent.color
            ? tintFromHex(agent.color)
            : getAgentColor(agent.slug);
          const Icon = resolveAgentIcon(agent.slug, agent.iconKey ?? null);
          return (
            <DropdownMenuItem
              key={agent.scopedId}
              onClick={() => onAgentChange(agent.slug)}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="flex items-center gap-2">
                {agentHasImage ? (
                  <AgentAvatar agent={agent} shape="circle" size="xs" />
                ) : (
                  <span
                    className="inline-flex size-4 items-center justify-center rounded-full"
                    style={{ backgroundColor: tint.bg, color: tint.text }}
                  >
                    <Icon className="size-2.5" />
                  </span>
                )}
                <span
                  className={cn(
                    "text-[12.5px]",
                    !agent.active && "text-muted-foreground"
                  )}
                >
                  {agent.displayName ?? agent.name}
                  {!agent.active && (
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      (paused)
                    </span>
                  )}
                </span>
              </span>
              {active && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Backwards-compat alias for the audit #036 rename.
 * @deprecated Use AgentFilterDropdown instead.
 */
export const FilterBar = AgentFilterDropdown;

/**
 * Map a TriggerFilter to the underlying conversation trigger (undefined = all).
 */
export function triggerFromFilter(
  filter: TriggerFilter
): ConversationMeta["trigger"] | undefined {
  return filter === "all" ? undefined : filter;
}
