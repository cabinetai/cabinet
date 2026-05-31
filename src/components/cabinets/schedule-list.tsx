"use client";

import { useMemo } from "react";
import { Clock3, HeartPulse, MessageSquare } from "lucide-react";
import { cronToHuman } from "@/lib/agents/cron-utils";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";

interface ScheduleListProps {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  /** Past manual conversations to interleave alongside scheduled items. */
  manualConversations?: ConversationMeta[];
  onJobClick?: (job: CabinetJobSummary, agent: CabinetAgentSummary) => void;
  onHeartbeatClick?: (agent: CabinetAgentSummary) => void;
  onManualClick?: (conversation: ConversationMeta) => void;
}

interface ListItem {
  type: "job" | "heartbeat" | "manual";
  id: string;
  name: string;
  /** Short secondary line — cron phrase or formatted start time. */
  schedule: string;
  /** Optional third-line description (summary of a manual conversation). */
  summary?: string;
  enabled: boolean;
  agentEmoji: string;
  agentName: string;
  agentSlug: string;
  jobRef?: CabinetJobSummary;
  agentRef?: CabinetAgentSummary;
  conversationRef?: ConversationMeta;
  /** Secondary timestamp (startedAt) for manual items, sort key. */
  sortKey?: number;
}

export function ScheduleList({
  agents,
  jobs,
  manualConversations,
  onJobClick,
  onHeartbeatClick,
  onManualClick,
}: ScheduleListProps) {
  const agentMap = useMemo(() => {
    const map = new Map<string, CabinetAgentSummary>();
    for (const a of agents) {
      map.set(a.scopedId, a);
      map.set(a.slug, a);
    }
    return map;
  }, [agents]);

  const items: ListItem[] = useMemo(() => {
    const result: ListItem[] = [];

    for (const job of jobs) {
      const owner = job.ownerScopedId
        ? agentMap.get(job.ownerScopedId)
        : job.ownerAgent
        ? agentMap.get(job.ownerAgent)
        : undefined;
      result.push({
        type: "job",
        id: job.scopedId,
        name: job.name,
        schedule: job.schedule,
        enabled: job.enabled,
        agentEmoji: owner?.emoji || "🤖",
        agentName: owner?.name || job.ownerAgent || "Unknown",
        agentSlug: owner?.slug || "",
        jobRef: job,
        agentRef: owner,
      });
    }

    for (const agent of agents) {
      if (!agent.heartbeat) continue;
      result.push({
        type: "heartbeat",
        id: `hb-${agent.scopedId}`,
        name: `${agent.name} heartbeat`,
        schedule: agent.heartbeat,
        enabled: agent.active,
        agentEmoji: agent.emoji || "🤖",
        agentName: agent.name,
        agentSlug: agent.slug,
        agentRef: agent,
      });
    }

    // Past manual conversations — sorted most-recent-first at the end of the
    // list since they're historical, not scheduled.
    if (manualConversations && manualConversations.length > 0) {
      const manualItems: ListItem[] = [];
      for (const convo of manualConversations) {
        if (convo.trigger !== "manual") continue;
        const startedAt = convo.startedAt ? new Date(convo.startedAt) : null;
        const owner = agentMap.get(convo.agentSlug);
        const label = convo.title || convo.summary || "Manual run";
        manualItems.push({
          type: "manual",
          id: `manual-${convo.id}`,
          name: label,
          schedule:
            startedAt && !Number.isNaN(startedAt.getTime())
              ? `ran ${startedAt.toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "manual run",
          summary:
            convo.summary && convo.summary !== label ? convo.summary : undefined,
          enabled: convo.status !== "cancelled" && convo.status !== "failed",
          agentEmoji: owner?.emoji || "💬",
          agentName: owner?.name || convo.agentSlug || "Manual",
          agentSlug: owner?.slug || convo.agentSlug || "editor",
          agentRef: owner,
          conversationRef: convo,
          sortKey: startedAt ? startedAt.getTime() : 0,
        });
      }
      manualItems.sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0));
      result.push(...manualItems);
    }

    return result;
  }, [agents, jobs, manualConversations, agentMap]);

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing scheduled or recorded yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60 bg-background">
      {items.map((item) => {
        const secondary =
          item.type === "manual" ? item.schedule : cronToHuman(item.schedule);
        const statusLabel =
          item.type === "manual"
            ? item.conversationRef?.status ?? "ran"
            : item.enabled
              ? "On"
              : "Off";
        const statusTone =
          item.type === "manual"
            ? item.conversationRef?.status === "failed"
              ? "bg-destructive/15 text-destructive"
              : item.conversationRef?.status === "running"
                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                : item.conversationRef?.status === "completed"
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-500"
                  : "bg-muted text-muted-foreground"
            : item.enabled
              ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-500"
              : "bg-muted text-muted-foreground";

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.type === "job" && item.jobRef && onJobClick) {
                const agent = item.agentRef ?? ({
                  slug: item.agentSlug,
                  name: item.agentName,
                  emoji: item.agentEmoji,
                } as CabinetAgentSummary);
                onJobClick(item.jobRef, agent);
              } else if (item.type === "heartbeat" && item.agentRef && onHeartbeatClick) {
                onHeartbeatClick(item.agentRef);
              } else if (item.type === "manual" && item.conversationRef && onManualClick) {
                onManualClick(item.conversationRef);
              }
            }}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
              "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              !item.enabled && item.type !== "manual" && "opacity-50"
            )}
          >
            {/* Type icon — sets the per-row category tone */}
            <span className="flex size-5 shrink-0 items-center justify-center">
              {item.type === "job" ? (
                <Clock3 className="h-3.5 w-3.5 text-emerald-500/80" />
              ) : item.type === "heartbeat" ? (
                <HeartPulse className="h-3.5 w-3.5 text-pink-500/80" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 text-sky-500/80" />
              )}
            </span>

            {/* Agent emoji */}
            <span className="text-sm leading-none shrink-0" aria-hidden="true">
              {item.agentEmoji}
            </span>

            {/* Title + summary on the same line */}
            <p className="min-w-0 flex-1 truncate text-[13px] leading-5">
              <span className="font-medium text-foreground">{item.name}</span>
              {item.summary ? (
                <span className="text-muted-foreground/90">
                  {" · "}
                  {item.summary}
                </span>
              ) : null}
            </p>

            {/* Secondary meta — agent + schedule/timestamp */}
            <span className="hidden shrink-0 text-[11px] text-muted-foreground md:inline">
              {item.agentName} · {secondary}
            </span>

            {/* Status chip */}
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                statusTone
              )}
            >
              {statusLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
