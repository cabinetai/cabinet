"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { resolveAgentIcon } from "@/lib/agents/icon-catalog";
import { AgentAvatar, hasAgentAvatarImage } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";

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
 * Agent filter pill row — horizontally scrollable.
 * Returns null when no agents are in the cabinet.
 */
export function FilterBar({
  agents,
  agentFilter,
  onAgentChange,
}: {
  agents: CabinetAgentSummary[];
  agentFilter: string | null;
  onAgentChange: (slug: string | null) => void;
}) {
  if (agents.length === 0) return null;
  return (
    <div className="border-b border-border/60 px-4 py-2 text-[11px]">
      {/* Audit #133: hide the chunky native horizontal scrollbar — keeps
          the scroll behavior, drops the visible track that ate vertical
          space below the agent chips. */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="size-3" />
          Agents
        </span>
        <button
          type="button"
          onClick={() => onAgentChange(null)}
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 font-medium transition-colors",
            agentFilter === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          )}
        >
          All agents
        </button>
        {agents.map((agent) => {
          const active = agentFilter === agent.slug;
          const hasImage = hasAgentAvatarImage(agent);
          const tint = agent.color ? tintFromHex(agent.color) : getAgentColor(agent.slug);
          const Icon = resolveAgentIcon(agent.slug, agent.iconKey ?? null);
          return (
            <button
              key={agent.scopedId}
              type="button"
              onClick={() => onAgentChange(active ? null : agent.slug)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border py-0.5 font-medium transition-colors",
                hasImage ? "pl-0.5 pr-2" : "px-2",
                active ? "border-primary" : "border-transparent hover:border-border/60",
                hasImage && (active
                  ? "bg-muted text-foreground"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground")
              )}
              style={
                hasImage
                  ? undefined
                  : active
                    ? { backgroundColor: tint.bg, color: tint.text }
                    : { backgroundColor: tint.bg, color: tint.text, opacity: 0.65 }
              }
              title={
                agent.active
                  ? agent.displayName ?? agent.name
                  : `${agent.displayName ?? agent.name} (paused)`
              }
            >
              {hasImage ? (
                <AgentAvatar agent={agent} shape="circle" size="xs" />
              ) : (
                <Icon className="size-3" />
              )}
              {agent.displayName ?? agent.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Map a TriggerFilter to the underlying conversation trigger (undefined = all).
 */
export function triggerFromFilter(
  filter: TriggerFilter
): ConversationMeta["trigger"] | undefined {
  return filter === "all" ? undefined : filter;
}
