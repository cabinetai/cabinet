"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { conversationMetaToTaskMeta } from "@/lib/agents/conversation-to-task-view";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { useAppStore } from "@/stores/app-store";
import type { ConversationMeta } from "@/types/conversations";
import type { TaskMeta } from "@/types/tasks";
import type { CabinetAgentSummary } from "@/types/cabinets";

export interface RailItem {
  /** Raw meta — passed to setTaskPanelConversation to open the drawer. */
  meta: ConversationMeta;
  /** Derived UI shape (status, title, agent slug). */
  task: TaskMeta;
}

export interface TaskRailData {
  /** Live running / awaiting-input tasks, most-recent activity first. */
  running: RailItem[];
  /** Every other task (any cabinet), most-recent activity first. */
  rest: RailItem[];
  /** Number of running tasks (badge on the toggle button). */
  runningCount: number;
  /** True briefly after a running task finishes while the rail is closed. */
  flash: boolean;
  /** Tick so tooltips re-render relative timestamps. */
  now: number;
  /** Agent roster for real avatars, keyed by slug. */
  agentsBySlug: Map<string, CabinetAgentSummary>;
}

// Pull a generous pool of conversations across every cabinet — the rail
// shows whatever fits and clips the rest, so we never need to page.
const POOL_LIMIT = 60;
// How long the toggle button pulses after a task finishes off-screen.
const FLASH_MS = 4000;

function isRunning(task: TaskMeta): boolean {
  return task.status === "running" || task.status === "awaiting-input";
}

/**
 * Global data source for the right-edge task rail. Mirrors the sidebar
 * RecentTasks fetch/SSE pattern but stays mounted app-wide so running tasks
 * stay reachable from any section (Data / Agents / Tasks).
 */
export function useTaskRailData(): TaskRailData {
  const railOpen = useAppStore((s) => s.taskRailOpen);
  // Rooms v3: scope the rail to the active room (its top-level cabinet) so it
  // shows that room's recent tasks. An unscoped fetch now resolves to the empty
  // home container and the rail comes back blank.
  const sectionCabinetPath = useAppStore((s) => s.section.cabinetPath);
  const railRoom =
    (sectionCabinetPath || ROOT_CABINET_PATH).split("/")[0] || ROOT_CABINET_PATH;

  const [items, setItems] = useState<RailItem[]>([]);
  const [agentsBySlug, setAgentsBySlug] = useState<
    Map<string, CabinetAgentSummary>
  >(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);

  // Previous running-id set + a live mirror of railOpen, read inside the
  // load closure without retriggering the fetch effect.
  const prevRunningRef = useRef<Set<string>>(new Set());
  const railOpenRef = useRef(railOpen);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    railOpenRef.current = railOpen;
  }, [railOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadAgents = async () => {
      try {
        // Deduped + short-TTL cached, so calling it on each reload tick is
        // cheap and shared with the rest of the app.
        const overview = await fetchCabinetOverviewClient(railRoom, "all");
        if (cancelled || !overview) return;
        const map = new Map<string, CabinetAgentSummary>();
        for (const agent of overview.agents ?? []) map.set(agent.slug, agent);
        setAgentsBySlug(map);
      } catch {
        // Non-fatal — avatars fall back to the slug-derived glyph.
      }
    };

    const load = async () => {
      try {
        const res = await dedupFetch(
          `/api/agents/conversations?cabinetPath=${encodeURIComponent(railRoom)}&visibilityMode=all&limit=${POOL_LIMIT}`,
          { cache: "no-store" },
          { ttlMs: 1500 }
        );
        const data = await res.json();
        if (cancelled) return;
        const convos: ConversationMeta[] = Array.isArray(data.conversations)
          ? data.conversations
          : [];
        const next: RailItem[] = convos.map((meta) => ({
          meta,
          task: conversationMetaToTaskMeta(meta),
        }));

        // Detect tasks that finished while the rail was collapsed so the
        // toggle button can pulse the user back.
        const nextRunning = new Set(
          next.filter((i) => isRunning(i.task)).map((i) => i.task.id)
        );
        const finishedOffscreen =
          !railOpenRef.current &&
          [...prevRunningRef.current].some((id) => !nextRunning.has(id));
        prevRunningRef.current = nextRunning;
        if (finishedOffscreen) {
          setFlash(true);
          if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current);
          }
          flashTimerRef.current = window.setTimeout(
            () => setFlash(false),
            FLASH_MS
          );
        }

        setItems(next);
      } catch {
        if (!cancelled) setItems([]);
      }
    };

    void load();
    void loadAgents();

    // Live refresh on the shared conversation SSE, debounced so a burst of
    // turn events during a run collapses into one reload.
    const es = new EventSource("/api/agents/conversations/events");
    let reloadTimer: number | null = null;
    const scheduleReload = () => {
      if (reloadTimer !== null) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void load();
      }, 200);
    };
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as { type: string; taskId?: string };
        if (event.type === "ping") return;
        if (event.type === "task.deleted" && event.taskId) {
          setItems((prev) => prev.filter((item) => item.task.id !== event.taskId));
        }
        scheduleReload();
      } catch {
        // ignore malformed frames
      }
    };

    // Refresh relative timestamps in tooltips once a minute.
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => {
      cancelled = true;
      es.close();
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      window.clearInterval(tick);
    };
  }, [railRoom]);

  // Opening the rail means the user has "seen" the finished task, so the
  // pulse is suppressed immediately (derived, not stored — the underlying
  // timer still resets the raw flag).
  const effectiveFlash = flash && !railOpen;

  return useMemo(() => {
    const running = items
      .filter((i) => isRunning(i.task))
      .sort((a, b) => activityTs(b.task) - activityTs(a.task));

    // Everything else, across every cabinet, newest activity first. The
    // rail clips whatever doesn't fit (no scrollbar), so the freshest work
    // is always the part you actually see.
    const rest = items
      .filter((i) => !isRunning(i.task))
      .sort((a, b) => activityTs(b.task) - activityTs(a.task));

    return {
      running,
      rest,
      runningCount: running.length,
      flash: effectiveFlash,
      now,
      agentsBySlug,
    };
  }, [items, effectiveFlash, now, agentsBySlug]);
}

function activityTs(task: TaskMeta): number {
  return new Date(
    task.lastActivityAt ?? task.completedAt ?? task.startedAt ?? 0
  ).getTime();
}
