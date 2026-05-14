"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildConversationInstanceKey } from "@/lib/agents/conversation-identity";
import { deriveStatus } from "@/lib/agents/conversation-to-task-view";
import { AgentPill } from "@/components/tasks/board/agent-pill";
import { StatusIcon, type CardState } from "@/components/tasks/board/status-icon";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { useProviderIcons } from "@/hooks/use-provider-icons";
import { formatRelative } from "./cabinet-utils";
import type { ConversationMeta } from "@/types/conversations";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { TaskStatus } from "@/types/tasks";
import { useLocale } from "@/i18n/use-locale";

interface ActivityFeedProps {
  cabinetPath: string;
  visibilityMode: string;
  agents: CabinetAgentSummary[];
  onOpen: (conv: ConversationMeta) => void;
  onOpenWorkspace: () => void;
  /** When set, narrow the feed to this agent's conversations. */
  agentSlug?: string;
  /** Optional handler — when set, the agent pill on each row becomes
   *  clickable and calls back with the row's agent slug. Used to drive
   *  the parent's filter state. */
  onAgentPillClick?: (slug: string) => void;
  /** Called when the user clicks the "Clear filter" chip. Only visible
   *  when `agentSlug` is set. */
  onClearAgentFilter?: () => void;
}

const TASK_STATUS_TO_CARD_STATE: Record<TaskStatus, CardState> = {
  running: "running",
  "awaiting-input": "ask",
  failed: "failed",
  done: "just-done",
  idle: "idle",
  archived: "idle",
};

export function ActivityFeed({
  cabinetPath,
  visibilityMode,
  agents,
  onOpen,
  onOpenWorkspace,
  agentSlug,
  onAgentPillClick,
  onClearAgentFilter,
}: ActivityFeedProps) {
  const { t } = useLocale();
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const providerIcons = useProviderIcons();

  const agentsBySlug = useMemo(() => {
    const m = new Map<string, CabinetAgentSummary>();
    for (const a of agents) m.set(a.slug, a);
    return m;
  }, [agents]);

  const filterAgent = agentSlug ? agentsBySlug.get(agentSlug) : undefined;

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ cabinetPath, limit: "20" });
      if (visibilityMode !== "own") params.set("visibilityMode", visibilityMode);
      if (agentSlug) params.set("agent", agentSlug);
      const res = await fetch(`/api/agents/conversations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setConversations((data.conversations || []) as ConversationMeta[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [cabinetPath, visibilityMode, agentSlug]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 6000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Pin running conversations to top
  const sorted = useMemo(() => {
    const running = conversations.filter((c) => c.status === "running");
    const rest = conversations.filter((c) => c.status !== "running");
    return [...running, ...rest];
  }, [conversations]);

  const runningCount = sorted.filter((c) => c.status === "running").length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[1.65rem] font-semibold tracking-tight text-foreground">
            Activity
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span>
              {loading ? "Loading..." : `${conversations.length} recent`}
            </span>
            {runningCount > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {runningCount} running
              </span>
            )}
            {agentSlug && onClearAgentFilter && (
              <button
                type="button"
                onClick={onClearAgentFilter}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10.5px] font-medium text-foreground transition-colors hover:bg-muted/70"
                title={t("cabinetsExtras:showAllAgents")}
              >
                <X className="size-2.5" />
                {filterAgent?.displayName ?? filterAgent?.name ?? agentSlug}
              </button>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-xs"
          onClick={onOpenWorkspace}
        >
          <Users className="h-3.5 w-3.5" />
          View all
        </Button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading activity...
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No conversations yet. Run a heartbeat or send a task to an agent.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {sorted.map((conv) => {
            const cardState = TASK_STATUS_TO_CARD_STATE[deriveStatus(conv)];
            const agent = agentsBySlug.get(conv.agentSlug);
            const providerIcon = conv.providerId
              ? providerIcons.get(conv.providerId)
              : null;
            const tokens = conv.tokens?.total ?? 0;
            const modelName =
              typeof conv.adapterConfig?.model === "string"
                ? conv.adapterConfig.model
                : undefined;
            return (
              <li key={buildConversationInstanceKey(conv)}>
                <button
                  type="button"
                  onClick={() => onOpen(conv)}
                  className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  {/* Row 1: [status] title (left) + time/glyph/tokens (right).
                      Summary sits below the title, indented under it (inside
                      the same min-w-0 column as the title). */}
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div className="pt-0.5">
                        <StatusIcon state={cardState} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-foreground">
                          {conv.title}
                        </p>
                        {conv.summary ? (
                          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                            {conv.summary}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">
                        {formatRelative(conv.lastActivityAt || conv.startedAt)}
                      </span>
                      {(providerIcon || modelName) && (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5"
                          title={[providerIcon?.name, modelName].filter(Boolean).join(" · ")}
                        >
                          {providerIcon ? (
                            <span className="inline-flex size-5 items-center justify-center rounded bg-background/80">
                              <ProviderGlyph
                                icon={providerIcon.icon}
                                asset={providerIcon.iconAsset}
                                className="size-4"
                              />
                            </span>
                          ) : null}
                          {modelName ? (
                            <span className="max-w-[140px] truncate font-mono text-[10.5px] text-foreground/80">
                              {modelName}
                            </span>
                          ) : null}
                        </span>
                      )}
                      {tokens > 0 ? (
                        <span className="font-mono tabular-nums text-muted-foreground/80">
                          {(tokens / 1000).toFixed(1)}k tok
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 2: agent pill on its own line. When the parent
                      provides `onAgentPillClick`, the pill becomes its own
                      button — wrapped in a span (not a nested <button>) so
                      the row's outer <button> stays valid HTML. */}
                  <div>
                    {onAgentPillClick ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAgentPillClick(conv.agentSlug);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          event.stopPropagation();
                          onAgentPillClick(conv.agentSlug);
                        }}
                        className="inline-block cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={`Filter by ${agent?.displayName ?? agent?.name ?? conv.agentSlug}`}
                      >
                        <AgentPill agent={agent} slug={conv.agentSlug} size="sm" />
                      </span>
                    ) : (
                      <AgentPill agent={agent} slug={conv.agentSlug} size="sm" />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
