"use client";

import { useEffect, useMemo, useState } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { isLegacyAdapterType } from "@/lib/agents/adapters/legacy-ids";
import type { ConversationMeta } from "@/types/conversations";
import type { TaskMeta } from "@/types/tasks";

function normalizeConversation(meta: ConversationMeta): TaskMeta {
  return conversationMetaToTaskMeta(meta);
}

// "Done, recently" = idle or done whose last activity landed within this window.
const DONE_FRESH_MS = 60 * 60 * 1000; // 1 hour

// Audit #132: progressive disclosure for the sidebar tasks list.
// - INITIAL_VISIBLE rows show on first paint (clean, scannable).
// - "Show older" reveals one PAGE_STEP more rows at a time, fading them
//   in with the same stagger animation as the initial load.
// - Once the locally-cached pool is exhausted, the button refetches with
//   a higher limit until ABSOLUTE_CAP. Beyond that, the user is nudged
//   to the full Tasks board.
const INITIAL_VISIBLE = 20;
const PAGE_STEP = 20;
const ABSOLUTE_CAP = 100;

/**
 * Minimal agent shape the sidebar passes down. We only need the slug + the
 * optional hex color so running tasks inherit their owner's personality tint.
 */
interface SidebarAgentRef {
  slug: string;
  color?: string;
}

function isRecentlyDone(task: TaskMeta, now: number): boolean {
  if (task.status !== "done" && task.status !== "idle") return false;
  const last = task.lastActivityAt || task.completedAt || task.startedAt;
  if (!last) return false;
  return now - new Date(last).getTime() < DONE_FRESH_MS;
}

function resolveAgentColor(
  slug: string,
  agents: SidebarAgentRef[]
): string {
  const explicit = agents.find((a) => a.slug === slug)?.color;
  if (explicit) return tintFromHex(explicit).text;
  return getAgentColor(slug).text;
}

export function RecentTasks({
  active,
  padStyle,
  itemClass,
  cabinetPath,
  agents = [],
}: {
  active: boolean;
  padStyle: React.CSSProperties;
  itemClass: (active: boolean) => string;
  cabinetPath?: string;
  agents?: SidebarAgentRef[];
}) {
  const setSection = useAppStore((s) => s.setSection);
  const activeTaskId = useAppStore((s) =>
    s.section.type === "task" ? s.section.taskId : undefined
  );
  const [tasks, setTasks] = useState<TaskMeta[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // How many rows the user wants visible. Bumps by PAGE_STEP on "Show older".
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  // How many rows we ask the API for. Bumps when visibleCount exceeds the
  // current pool so we don't show "Show older" with no actual older rows.
  const [fetchLimit, setFetchLimit] = useState(INITIAL_VISIBLE + PAGE_STEP);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadTasks = async () => {
      const params = new URLSearchParams({ limit: String(fetchLimit) });
      if (cabinetPath) params.set("cabinetPath", cabinetPath);
      try {
        // Audit #104: use dedupFetch with a small TTL so sibling consumers
        // mounting on the same tick (board, agents-workspace) coalesce to
        // one underlying network request when their query strings match.
        const res = await dedupFetch(
          `/api/agents/conversations?${params.toString()}`,
          { cache: "no-store" },
          { ttlMs: 1500 }
        );
        const data = await res.json();
        if (cancelled) return;
        const convos = Array.isArray(data.conversations) ? data.conversations : [];
        // API sorts by startedAt DESC. Re-sort by lastActivityAt ?? startedAt
        // so actively-streaming conversations outrank freshly-created idle
        // ones. Audit #132: keep the full ranked pool so "Show older" can
        // reveal more rows without re-fetching every time.
        const ranked = convos
          .map(normalizeConversation)
          .sort((a: TaskMeta, b: TaskMeta) => {
            const ta = new Date(
              a.lastActivityAt ?? a.completedAt ?? a.startedAt ?? 0
            ).getTime();
            const tb = new Date(
              b.lastActivityAt ?? b.completedAt ?? b.startedAt ?? 0
            ).getTime();
            return tb - ta;
          });
        setTasks(ranked);
      } catch {
        if (!cancelled) setTasks([]);
      }
    };

    void loadTasks();

    // Auto-refresh via the global conversation SSE. Debounce so a burst of
    // messages (common during a run) collapses into one reload instead of N.
    const es = new EventSource("/api/agents/conversations/events");
    let reloadTimer: number | null = null;
    const scheduleReload = () => {
      if (reloadTimer !== null) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadTasks();
      }, 200);
    };
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as { type: string };
        if (event.type === "ping") return;
        scheduleReload();
      } catch {
        // ignore
      }
    };

    // Tick once a minute so "fresh done" green dots fade back to muted without
    // waiting for the next SSE event.
    const tick = setInterval(() => setNow(Date.now()), 60_000);

    return () => {
      cancelled = true;
      es.close();
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      clearInterval(tick);
    };
  }, [active, cabinetPath, fetchLimit]);

  // Reset visibility when the user changes cabinet — they're switching
  // contexts and probably want to see the fresh top-of-list, not their
  // "Show older" expansion from the previous cabinet.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    setFetchLimit(INITIAL_VISIBLE + PAGE_STEP);
  }, [cabinetPath]);

  const agentColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      map.set(a.slug, resolveAgentColor(a.slug, agents));
    }
    return map;
  }, [agents]);

  if (!active) return null;

  if (tasks === null) {
    return (
      <div
        className="px-3 py-1 text-[11px] text-muted-foreground/60"
        style={padStyle}
      >
        Loading…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className="px-3 py-1 text-[11px] text-muted-foreground/60"
        style={padStyle}
      >
        No tasks yet.
      </div>
    );
  }

  const visibleTasks = tasks.slice(0, visibleCount);
  // "Show older" appears when there's more local pool to reveal OR the API
  // could return more (we haven't hit the absolute cap yet).
  const hasMoreLocal = tasks.length > visibleCount;
  const couldFetchMore = visibleCount >= fetchLimit && fetchLimit < ABSOLUTE_CAP;
  const showLoadMore = hasMoreLocal || couldFetchMore;

  const handleShowOlder = () => {
    const nextVisible = Math.min(visibleCount + PAGE_STEP, ABSOLUTE_CAP);
    setVisibleCount(nextVisible);
    // If the next reveal would empty the pool, raise the fetch limit so
    // the next render can actually show more rows. Capped at ABSOLUTE_CAP.
    if (nextVisible >= fetchLimit && fetchLimit < ABSOLUTE_CAP) {
      setFetchLimit(Math.min(fetchLimit + PAGE_STEP, ABSOLUTE_CAP));
    }
  };

  return (
    <>
      {visibleTasks.map((task, index) => {
        const isActive = activeTaskId === task.id;
        const fresh = isRecentlyDone(task, now);
        const slugForColor = task.agentSlug || "editor";
        const agentTint =
          agentColorMap.get(slugForColor) || resolveAgentColor(slugForColor, agents);

        // Pick the dot variant and color. Running → agent color, pulsing.
        // Needs reply → amber, solid. Failed → red. Done (recent) → green.
        // Older idle/done → muted.
        let dotClass = "bg-muted-foreground/35";
        let dotStyle: React.CSSProperties | undefined;
        let dotPulseColor: string | undefined;
        let tooltip = task.title;

        if (task.status === "running") {
          dotClass = "";
          dotStyle = { backgroundColor: agentTint };
          dotPulseColor = agentTint;
          tooltip = `${task.title} — running`;
        } else if (task.status === "awaiting-input") {
          dotClass = "bg-amber-500";
          tooltip = `${task.title} — needs reply`;
        } else if (task.status === "failed") {
          dotClass = "bg-red-500";
          tooltip = `${task.title} — failed`;
        } else if (task.status === "archived") {
          dotClass = "bg-muted-foreground/20";
        } else if (fresh) {
          dotClass = "bg-emerald-500";
          tooltip = `${task.title} — just finished`;
        }

        return (
          <button
            key={task.id}
            onClick={() =>
              setSection({
                type: "task",
                taskId: task.id,
                cabinetPath: task.cabinetPath,
              })
            }
            className={cn(
              itemClass(isActive),
              "animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
            )}
            style={{
              ...padStyle,
              animationDelay: `${Math.min(index, 12) * 22}ms`,
              animationFillMode: "backwards",
            }}
            title={tooltip}
          >
            <span className="relative mt-[1px] inline-flex size-1.5 shrink-0">
              {dotPulseColor && (
                <span
                  className="absolute inset-0 rounded-full animate-ping opacity-70"
                  style={{ backgroundColor: dotPulseColor }}
                />
              )}
              <span
                className={cn(
                  "relative inline-block size-1.5 rounded-full",
                  dotClass
                )}
                style={dotStyle}
              />
            </span>
            <span className="truncate">{task.title}</span>
            {isLegacyAdapterType(task.adapterType) && (
              <Terminal
                className="ml-auto size-2.5 shrink-0 text-emerald-500"
                aria-label="Terminal (PTY) mode"
              />
            )}
          </button>
        );
      })}
      {showLoadMore && (
        <button
          key="show-older"
          type="button"
          onClick={handleShowOlder}
          className={cn(
            itemClass(false),
            "text-muted-foreground/70 hover:text-foreground",
            "animate-in fade-in slide-in-from-top-1 duration-200 ease-out"
          )}
          style={{
            ...padStyle,
            // Stagger the button just after the last visible row.
            animationDelay: `${Math.min(visibleTasks.length, 12) * 22}ms`,
            animationFillMode: "backwards",
          }}
          title="Reveal more older tasks"
        >
          <span className="size-1.5 shrink-0" aria-hidden />
          <span>Show older</span>
        </button>
      )}
    </>
  );
}
