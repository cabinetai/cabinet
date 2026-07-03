"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DirIcon } from "@/components/ui/dir-icon";
import {
  ScheduleCalendar,
  type CalendarMode,
} from "@/components/cabinets/schedule-calendar";
import {
  ExplainerCard,
  ExplainerIcon,
  useExplainerState,
} from "@/components/agents/v2/tab-explainer";
import { useLocale } from "@/i18n/use-locale";
import { invalidateCabinetOverview } from "@/lib/cabinets/overview-client";
import { showError, showInfo, showSuccess } from "@/lib/ui/toast";
import { isoToCronExpression, isOneOffJob, rescheduleCron } from "@/lib/agents/one-off";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import type { JobConfig } from "@/types/jobs";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";

// Audit #064: user-facing copy for a failed Schedule action. Replaces the
// developer term "daemon" (which end users can't act on) with plain, actionable
// guidance. `action` is the specific "Couldn't …" clause per call site.
function serviceDownMessage(action: string): string {
  return `${action} — Cabinet's background service isn't responding. Make sure Cabinet is fully started, then try again.`;
}

type RepeatMode = "none" | "daily" | "weekly" | "custom";

interface CreateState {
  when: Date;
  title: string;
  agentSlug: string;
  repeat: RepeatMode;
  customCron: string;
  anchor?: { x: number; y: number };
}

type ContextTarget =
  | { kind: "event"; event: ScheduleEvent; x: number; y: number }
  | { kind: "empty"; date: Date; x: number; y: number };

/** Cron for the chosen Repeat mode. "none" → single-fire one-off cron. */
function cronForRepeat(repeat: RepeatMode, when: Date, customCron: string): string {
  const m = when.getMinutes();
  const h = when.getHours();
  if (repeat === "daily") return `${m} ${h} * * *`;
  if (repeat === "weekly") return `${m} ${h} * * ${when.getDay()}`;
  if (repeat === "custom") return customCron.trim();
  return isoToCronExpression(when);
}

/**
 * Canonical schedule calendar surface — the single component mounted by the
 * Tasks page, the Agents workspace, and the agent editor. Owns the toolbar
 * (prev / today / next + range label + day·week·month) and the Google-Calendar
 * style interactions (drag-to-move, click-to-create) on top of the shared
 * `ScheduleCalendar` engine, with optimistic updates so direct manipulation
 * feels instant.
 */
export interface ScheduleViewProps {
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  /** Past manual runs to paint as pills. Omit to hide. */
  conversations?: ConversationMeta[];
  /** Cabinet scope for mutations + cache invalidation. */
  cabinetPath: string;
  /** Show the dismissible explainer card. Default true. */
  showExplainer?: boolean;
  /** Fill the container edge-to-edge (agent editor) vs centered (tabs). */
  fullBleed?: boolean;
  /** Enable drag-to-move + click-to-create. Default true. */
  interactive?: boolean;
  /** Default agent for the "new task" popover (e.g. the editor's single agent). */
  defaultAgentSlug?: string;
  onConversationClick?: (id: string) => void;
  onJobClick?: (job: CabinetJobSummary, agent: CabinetAgentSummary) => void;
  onHeartbeatClick?: (agent: CabinetAgentSummary) => void;
  /** Fired after a successful create/move so the parent can refetch. */
  onMutated?: () => void;
}

function fmt(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function jobConfigToSummary(
  job: JobConfig,
  cabinetPath: string,
  template: Pick<CabinetJobSummary, "cabinetName" | "cabinetDepth">,
): CabinetJobSummary {
  const owner = job.ownerAgent || job.agentSlug || "";
  return {
    scopedId: `${cabinetPath}::job::${job.id}`,
    id: job.id,
    name: job.name,
    ownerAgent: owner,
    ownerScopedId: owner ? `${cabinetPath}::agent::${owner}` : undefined,
    enabled: job.enabled,
    schedule: job.schedule,
    prompt: job.prompt,
    oneShot: job.oneShot,
    runAfter: job.runAfter,
    exceptions: job.exceptions,
    since: job.since,
    until: job.until,
    cabinetPath,
    cabinetName: template.cabinetName,
    cabinetDepth: template.cabinetDepth,
    inherited: false,
  };
}

export function ScheduleView({
  agents,
  jobs,
  conversations = [],
  cabinetPath,
  showExplainer = true,
  fullBleed = false,
  interactive = true,
  defaultAgentSlug,
  onConversationClick,
  onJobClick,
  onHeartbeatClick,
  onMutated,
}: ScheduleViewProps) {
  const { t } = useLocale();
  const explainer = useExplainerState("schedule");
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  // ─── Optimistic state (Part B) ───
  const [patches, setPatches] = useState<Record<string, Partial<CabinetJobSummary>>>({});
  const [createdJobs, setCreatedJobs] = useState<CabinetJobSummary[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // Reconcile optimistic state once the server overview reflects it.
  useEffect(() => {
    setPatches((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const j of jobs) {
        const p = next[j.scopedId];
        if (!p) continue;
        const matches =
          (p.schedule === undefined || p.schedule === j.schedule) &&
          (p.runAfter === undefined || p.runAfter === j.runAfter) &&
          (p.since === undefined || p.since === j.since) &&
          (p.until === undefined || p.until === j.until) &&
          (p.exceptions === undefined ||
            JSON.stringify(p.exceptions) === JSON.stringify(j.exceptions ?? []));
        if (matches) {
          delete next[j.scopedId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setCreatedJobs((prev) => {
      const serverIds = new Set(jobs.map((j) => j.scopedId));
      const filtered = prev.filter((j) => !serverIds.has(j.scopedId));
      return filtered.length === prev.length ? prev : filtered;
    });
    // Once the server no longer returns a deleted job, stop tracking it.
    setDeletedIds((prev) => {
      if (prev.size === 0) return prev;
      const serverIds = new Set(jobs.map((j) => j.scopedId));
      const next = new Set([...prev].filter((id) => serverIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  const effectiveJobs = useMemo(() => {
    const base = jobs
      .filter((j) => !deletedIds.has(j.scopedId))
      .map((j) => (patches[j.scopedId] ? { ...j, ...patches[j.scopedId] } : j));
    const baseIds = new Set(base.map((j) => j.scopedId));
    const extra = createdJobs.filter((j) => !baseIds.has(j.scopedId));
    return [...base, ...extra];
  }, [jobs, patches, createdJobs, deletedIds]);

  const scheduledConversationsMap = useMemo(() => {
    const m = new Map<string, ConversationMeta>();
    for (const c of conversations) m.set(`${c.agentSlug}|${c.id}`, c);
    return m;
  }, [conversations]);

  const scheduleRefresh = useCallback(() => {
    invalidateCabinetOverview(cabinetPath);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    // Delay so the daemon's ~200ms file watcher settles before the forced
    // refetch returns the just-written value.
    refreshTimer.current = setTimeout(() => onMutated?.(), 450);
  }, [cabinetPath, onMutated]);

  const rollbackPatch = useCallback((scopedId: string) => {
    setPatches((prev) => {
      if (!prev[scopedId]) return prev;
      const next = { ...prev };
      delete next[scopedId];
      return next;
    });
  }, []);

  // ─── Mutations ───
  const performMove = useCallback(
    async (
      event: ScheduleEvent,
      newTime: Date,
      scope: "all" | "occurrence" | "following",
    ) => {
      const job = event.jobRef;
      if (!job) return;
      const owner = job.ownerAgent;
      if (!owner) {
        showError("This routine has no owner agent.");
        return;
      }
      const cp = job.cabinetPath || cabinetPath;
      const oneOff = isOneOffJob(job);

      if ((oneOff || scope === "occurrence") && newTime.getTime() < Date.now()) {
        showError("Pick a future time for a one-off task.");
        return;
      }

      // One-off task → just rewrite its instant.
      if (oneOff) {
        const cron = isoToCronExpression(newTime);
        const runAfter = newTime.toISOString();
        setPatches((p) => ({ ...p, [job.scopedId]: { schedule: cron, runAfter } }));
        try {
          const res = await fetch(`/api/agents/${owner}/jobs/${job.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", cabinetPath: cp, schedule: cron, runAfter }),
          });
          if (!res.ok) throw new Error();
          showSuccess(`Rescheduled to ${fmt(newTime)}.`);
          scheduleRefresh();
        } catch {
          rollbackPatch(job.scopedId);
          showError(serviceDownMessage("Couldn't reschedule"));
        }
        return;
      }

      // Recurring → "All events": rewrite the cron.
      if (scope === "all") {
        const changedDay = newTime.getDay() !== event.time.getDay();
        const cron = rescheduleCron(job.schedule, newTime, changedDay);
        setPatches((p) => ({ ...p, [job.scopedId]: { schedule: cron } }));
        try {
          const res = await fetch(`/api/agents/${owner}/jobs/${job.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", cabinetPath: cp, schedule: cron }),
          });
          if (!res.ok) throw new Error();
          showSuccess("Updated the whole series.");
          scheduleRefresh();
        } catch {
          rollbackPatch(job.scopedId);
          showError(serviceDownMessage("Couldn't update the series"));
        }
        return;
      }

      // Recurring → "This and following": cap the original series at the split
      // instant (`until`) and fork a new recurring series that starts there
      // (`since`) with the dropped cadence. The two halves partition the
      // timeline with no overlap; both bounds are enforced server-side.
      if (scope === "following") {
        const splitIso = event.time.toISOString();
        const changedDay = newTime.getDay() !== event.time.getDay();
        const cron = rescheduleCron(job.schedule, newTime, changedDay);
        const tempId = `series-${Date.now()}`;
        const tempScopedId = `${cp}::job::${tempId}`;
        const optimistic: CabinetJobSummary = {
          scopedId: tempScopedId,
          id: tempId,
          name: job.name,
          ownerAgent: owner,
          ownerScopedId: `${cp}::agent::${owner}`,
          enabled: true,
          schedule: cron,
          prompt: job.prompt,
          since: splitIso,
          cabinetPath: cp,
          cabinetName: job.cabinetName,
          cabinetDepth: job.cabinetDepth,
          inherited: false,
        };
        setPatches((p) => ({ ...p, [job.scopedId]: { until: splitIso } }));
        setCreatedJobs((c) => [...c, optimistic]);
        try {
          const [r1, r2] = await Promise.all([
            fetch(`/api/agents/${owner}/jobs/${job.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "update", cabinetPath: cp, until: splitIso }),
            }),
            fetch(`/api/agents/${owner}/jobs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                // Explicit unique id so the fork is a sibling, not a rewrite of
                // the series (whose id derives from its name).
                id: tempId,
                name: job.name,
                prompt: job.prompt || job.name,
                schedule: cron,
                since: splitIso,
                cabinetPath: cp,
              }),
            }),
          ]);
          if (!r1.ok || !r2.ok) throw new Error();
          const data = (await r2.json()) as { job?: JobConfig };
          if (data.job) {
            const real = jobConfigToSummary(data.job, cp, job);
            setCreatedJobs((c) =>
              c.map((j) => (j.scopedId === tempScopedId ? real : j)),
            );
          }
          showSuccess(`Moved this and following events to ${fmt(newTime)}.`);
          scheduleRefresh();
        } catch {
          rollbackPatch(job.scopedId);
          setCreatedJobs((c) => c.filter((j) => j.scopedId !== tempScopedId));
          showError(serviceDownMessage("Couldn't split the series"));
        }
        return;
      }

      // Recurring → "This occurrence": except the original slot + create a one-off.
      const exIso = event.time.toISOString();
      const newExceptions = [...(job.exceptions ?? []), exIso];
      const cron = isoToCronExpression(newTime);
      const runAfter = newTime.toISOString();
      const tempId = `oneoff-${Date.now()}`;
      const tempScopedId = `${cp}::job::${tempId}`;
      const optimistic: CabinetJobSummary = {
        scopedId: tempScopedId,
        id: tempId,
        name: job.name,
        ownerAgent: owner,
        ownerScopedId: `${cp}::agent::${owner}`,
        enabled: true,
        schedule: cron,
        prompt: job.prompt,
        oneShot: true,
        runAfter,
        cabinetPath: cp,
        cabinetName: job.cabinetName,
        cabinetDepth: job.cabinetDepth,
        inherited: false,
      };
      setPatches((p) => ({ ...p, [job.scopedId]: { exceptions: newExceptions } }));
      setCreatedJobs((c) => [...c, optimistic]);
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/agents/${owner}/jobs/${job.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", cabinetPath: cp, exceptions: newExceptions }),
          }),
          fetch(`/api/agents/${owner}/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Explicit unique id — without it the POST derives the id from
              // `name`, which here equals the recurring job's name and would
              // overwrite the series instead of creating a separate one-off.
              id: tempId,
              name: job.name,
              prompt: job.prompt || job.name,
              schedule: cron,
              oneShot: true,
              runAfter,
              cabinetPath: cp,
            }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error();
        const data = (await r2.json()) as { job?: JobConfig };
        if (data.job) {
          const real = jobConfigToSummary(data.job, cp, job);
          setCreatedJobs((c) =>
            c.map((j) => (j.scopedId === tempScopedId ? real : j)),
          );
        }
        showSuccess(`Moved this occurrence to ${fmt(newTime)}.`);
        scheduleRefresh();
      } catch {
        rollbackPatch(job.scopedId);
        setCreatedJobs((c) => c.filter((j) => j.scopedId !== tempScopedId));
        showError(serviceDownMessage("Couldn't move this occurrence"));
      }
    },
    [cabinetPath, rollbackPatch, scheduleRefresh],
  );

  // ─── Context-menu actions ───
  const runNow = useCallback(
    async (event: ScheduleEvent) => {
      const cp = event.jobRef?.cabinetPath || event.agentRef?.cabinetPath || cabinetPath;
      try {
        if (event.sourceType === "job" && event.jobRef?.ownerAgent) {
          const res = await fetch(`/api/agents/${event.jobRef.ownerAgent}/jobs/${event.jobRef.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run", cabinetPath: cp }),
          });
          if (!res.ok) throw new Error();
        } else if (event.sourceType === "heartbeat" && event.agentRef) {
          const res = await fetch(`/api/agents/personas/${event.agentRef.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run", cabinetPath: cp }),
          });
          if (!res.ok) throw new Error();
        } else {
          showInfo("This is a past run — open it to view the log.");
          return;
        }
        showSuccess(`Running ${event.label} now…`);
        scheduleRefresh();
      } catch {
        showError(serviceDownMessage("Couldn't start the run"));
      }
    },
    [cabinetPath, scheduleRefresh],
  );

  const toggleEnable = useCallback(
    async (event: ScheduleEvent) => {
      const job = event.jobRef;
      const agent = event.agentRef;
      const cp = job?.cabinetPath || agent?.cabinetPath || cabinetPath;
      try {
        if (event.sourceType === "job" && job?.ownerAgent) {
          setPatches((p) => ({ ...p, [job.scopedId]: { enabled: !job.enabled } }));
          const res = await fetch(`/api/agents/${job.ownerAgent}/jobs/${job.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "toggle", cabinetPath: cp }),
          });
          if (!res.ok) throw new Error();
          showSuccess(job.enabled ? "Disabled." : "Enabled.");
          scheduleRefresh();
        } else if (event.sourceType === "heartbeat" && agent) {
          const nextEnabled = agent.heartbeatEnabled === false;
          const res = await fetch(`/api/agents/personas/${agent.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              heartbeat: agent.heartbeat || "",
              heartbeatEnabled: nextEnabled,
              cabinetPath: cp,
            }),
          });
          if (!res.ok) throw new Error();
          showSuccess(nextEnabled ? "Heartbeat resumed." : "Heartbeat paused.");
          scheduleRefresh();
        }
      } catch {
        if (job) rollbackPatch(job.scopedId);
        showError(serviceDownMessage("Couldn't update"));
      }
    },
    [cabinetPath, rollbackPatch, scheduleRefresh],
  );

  const deleteJob = useCallback(
    async (event: ScheduleEvent) => {
      const job = event.jobRef;
      if (!job?.ownerAgent) return;
      const cp = job.cabinetPath || cabinetPath;
      setDeletedIds((prev) => new Set(prev).add(job.scopedId));
      setCreatedJobs((c) => c.filter((j) => j.scopedId !== job.scopedId));
      try {
        const res = await fetch(
          `/api/agents/${job.ownerAgent}/jobs/${job.id}?cabinetPath=${encodeURIComponent(cp)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error();
        showSuccess(`Deleted "${job.name}".`);
        scheduleRefresh();
      } catch {
        setDeletedIds((prev) => {
          const n = new Set(prev);
          n.delete(job.scopedId);
          return n;
        });
        showError(serviceDownMessage("Couldn't delete"));
      }
    },
    [cabinetPath, scheduleRefresh],
  );

  const duplicateJob = useCallback(
    async (event: ScheduleEvent) => {
      const job = event.jobRef;
      if (!job?.ownerAgent) return;
      const cp = job.cabinetPath || cabinetPath;
      const tempId = `${job.id}-copy-${Date.now()}`;
      const tempScopedId = `${cp}::job::${tempId}`;
      const copyName = `Copy of ${job.name}`;
      setCreatedJobs((c) => [
        ...c,
        { ...job, scopedId: tempScopedId, id: tempId, name: copyName },
      ]);
      try {
        const res = await fetch(`/api/agents/${job.ownerAgent}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: tempId,
            name: copyName,
            prompt: job.prompt || job.name,
            schedule: job.schedule,
            oneShot: job.oneShot,
            runAfter: job.runAfter,
            cabinetPath: cp,
          }),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { job?: JobConfig };
        if (data.job) {
          const real = jobConfigToSummary(data.job, cp, job);
          setCreatedJobs((c) => c.map((j) => (j.scopedId === tempScopedId ? real : j)));
        }
        showSuccess(`Duplicated "${job.name}".`);
        scheduleRefresh();
      } catch {
        setCreatedJobs((c) => c.filter((j) => j.scopedId !== tempScopedId));
        showError(serviceDownMessage("Couldn't duplicate"));
      }
    },
    [cabinetPath, scheduleRefresh],
  );

  const skipOccurrence = useCallback(
    async (event: ScheduleEvent) => {
      const job = event.jobRef;
      if (!job?.ownerAgent) return;
      const cp = job.cabinetPath || cabinetPath;
      const newExceptions = [...(job.exceptions ?? []), event.time.toISOString()];
      setPatches((p) => ({ ...p, [job.scopedId]: { exceptions: newExceptions } }));
      try {
        const res = await fetch(`/api/agents/${job.ownerAgent}/jobs/${job.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", cabinetPath: cp, exceptions: newExceptions }),
        });
        if (!res.ok) throw new Error();
        showSuccess(`Skipped the ${fmt(event.time)} run.`);
        scheduleRefresh();
      } catch {
        rollbackPatch(job.scopedId);
        showError(serviceDownMessage("Couldn't skip this occurrence"));
      }
    },
    [cabinetPath, rollbackPatch, scheduleRefresh],
  );

  const handleBlockedDrag = useCallback((message: string) => showInfo(message), []);

  const [moveConfirm, setMoveConfirm] = useState<{
    event: ScheduleEvent;
    newTime: Date;
  } | null>(null);

  const handleEventMove = useCallback(
    (event: ScheduleEvent, newTime: Date) => {
      if (!event.jobRef) return;
      // Same minute → no-op (avoids accidental micro-drags rewriting cron).
      if (Math.abs(newTime.getTime() - event.time.getTime()) < 60_000) return;
      if (isOneOffJob(event.jobRef)) {
        void performMove(event, newTime, "all");
        return;
      }
      setMoveConfirm({ event, newTime });
    },
    [performMove],
  );

  // ─── Create by marking ───
  const [createState, setCreateState] = useState<CreateState | null>(null);
  const [creating, setCreating] = useState(false);

  const openCreate = useCallback(
    (when: Date, anchor?: { x: number; y: number }, opts?: { recurring?: boolean }) => {
      if (agents.length === 0) {
        showError("Add an agent first, then schedule a task for it.");
        return;
      }
      const slug =
        defaultAgentSlug ||
        agents.find((a) => a.slug === "editor")?.slug ||
        agents[0].slug;
      setContextTarget(null);
      setCreateState({
        when,
        title: "",
        agentSlug: slug,
        repeat: opts?.recurring ? "weekly" : "none",
        customCron: isoToCronExpression(when),
        anchor,
      });
    },
    [agents, defaultAgentSlug],
  );

  const performCreate = useCallback(async () => {
    if (!createState) return;
    const { when, title, agentSlug, repeat, customCron } = createState;
    const oneOff = repeat === "none";
    if (oneOff && when.getTime() < Date.now()) {
      showError("Pick a future time.");
      return;
    }
    const cron = cronForRepeat(repeat, when, customCron);
    if (!cron || cron.trim().split(/\s+/).length < 5) {
      showError("That cron expression looks off. Use 5 fields, e.g. 0 9 * * 1-5.");
      return;
    }
    const agent = agents.find((a) => a.slug === agentSlug);
    const cp = agent?.cabinetPath || cabinetPath;
    const name = title.trim() || "Scheduled task";
    const runAfter = when.toISOString();
    const tempId = `oneoff-${Date.now()}`;
    const tempScopedId = `${cp}::job::${tempId}`;
    const optimistic: CabinetJobSummary = {
      scopedId: tempScopedId,
      id: tempId,
      name,
      ownerAgent: agentSlug,
      ownerScopedId: `${cp}::agent::${agentSlug}`,
      enabled: true,
      schedule: cron,
      prompt: name,
      oneShot: oneOff ? true : undefined,
      runAfter: oneOff ? runAfter : undefined,
      cabinetPath: cp,
      cabinetName: agent?.cabinetName ?? "",
      cabinetDepth: agent?.cabinetDepth ?? 0,
      inherited: false,
    };
    setCreating(true);
    setCreatedJobs((c) => [...c, optimistic]);
    setCreateState(null);
    try {
      const res = await fetch(`/api/agents/${agentSlug}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Explicit unique id so two tasks with the same title can't collide.
          id: tempId,
          name,
          prompt: name,
          schedule: cron,
          ...(oneOff ? { oneShot: true, runAfter } : {}),
          cabinetPath: cp,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { job?: JobConfig };
      if (data.job) {
        const real = jobConfigToSummary(data.job, cp, {
          cabinetName: optimistic.cabinetName,
          cabinetDepth: optimistic.cabinetDepth,
        });
        setCreatedJobs((c) =>
          c.map((j) => (j.scopedId === tempScopedId ? real : j)),
        );
      }
      showSuccess(
        oneOff
          ? `Scheduled "${name}" for ${fmt(when)}.`
          : `Created routine "${name}".`,
      );
      scheduleRefresh();
    } catch {
      setCreatedJobs((c) => c.filter((j) => j.scopedId !== tempScopedId));
      showError(serviceDownMessage("Couldn't create the task"));
    } finally {
      setCreating(false);
    }
  }, [agents, cabinetPath, createState, scheduleRefresh]);

  // ─── Navigation ───
  function navigate(direction: -1 | 0 | 1) {
    if (direction === 0) {
      setAnchor(new Date());
      return;
    }
    setAnchor((prev) => {
      const next = new Date(prev);
      if (mode === "day") next.setDate(next.getDate() + direction);
      else if (mode === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  const label = useMemo(() => {
    const monthOf = (d: Date) => d.toLocaleDateString(undefined, { month: "long" });
    if (mode === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (mode === "month") return `${monthOf(anchor)} ${anchor.getFullYear()}`;
    const s = new Date(anchor);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return s.getMonth() === e.getMonth()
      ? `${monthOf(s)} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${monthOf(s)} ${s.getDate()} – ${monthOf(e)} ${e.getDate()}`;
  }, [anchor, mode]);

  const handleEventClick = useCallback(
    (ev: ScheduleEvent) => {
      if (ev.sourceType === "manual" && ev.conversationId) {
        onConversationClick?.(ev.conversationId);
        return;
      }
      if (ev.sourceType === "job" && ev.jobRef && ev.agentRef) {
        onJobClick?.(ev.jobRef, ev.agentRef);
        return;
      }
      if (ev.sourceType === "heartbeat" && ev.agentRef) {
        onHeartbeatClick?.(ev.agentRef);
        return;
      }
    },
    [onConversationClick, onJobClick, onHeartbeatClick],
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto",
        fullBleed ? "px-4 pb-4 pt-3 sm:px-5" : "mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6",
      )}
    >
      {showExplainer && (
        <ExplainerCard state={explainer}>
          <p>{t("scheduleTab:explainer1")}</p>
          <p>{t("scheduleTab:explainer2")}</p>
        </ExplainerCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {showExplainer && (
            <ExplainerIcon state={explainer} ariaLabel={t("scheduleTab:aboutAria")} />
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Previous"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <DirIcon ltr={ChevronLeft} rtl={ChevronRight} className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(0)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              aria-label="Next"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <DirIcon ltr={ChevronRight} rtl={ChevronLeft} className="size-4" />
            </button>
          </div>
          <span className="text-[13px] font-medium text-foreground">{label}</span>
        </div>

        <div className="inline-flex shrink-0 items-center rounded-md border border-border/70 bg-background p-0.5">
          {(["day", "week", "month"] as CalendarMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card">
        <ScheduleCalendar
          mode={mode}
          anchor={anchor}
          agents={agents}
          jobs={effectiveJobs}
          manualConversations={conversations}
          scheduledConversations={scheduledConversationsMap}
          onEventClick={handleEventClick}
          onDayClick={(date) => {
            setMode("day");
            setAnchor(date);
          }}
          onEventMove={interactive ? handleEventMove : undefined}
          onCreateAt={interactive ? openCreate : undefined}
          onBlockedDrag={interactive ? handleBlockedDrag : undefined}
          onEventContextMenu={
            interactive
              ? (event, x, y) => setContextTarget({ kind: "event", event, x, y })
              : undefined
          }
          onEmptyContextMenu={
            interactive
              ? (date, x, y) => setContextTarget({ kind: "empty", date, x, y })
              : undefined
          }
        />
      </div>

      {contextTarget && (
        <CalendarContextMenu
          target={contextTarget}
          onClose={() => setContextTarget(null)}
          onOpen={(e) => handleEventClick(e)}
          onRunNow={(e) => void runNow(e)}
          onEdit={(e) => handleEventClick(e)}
          onDuplicate={(e) => void duplicateJob(e)}
          onSkipOccurrence={(e) => void skipOccurrence(e)}
          onToggleEnable={(e) => void toggleEnable(e)}
          onDelete={(e) => void deleteJob(e)}
          onCreate={(date, recurring) =>
            openCreate(date, { x: contextTarget.x, y: contextTarget.y }, { recurring })
          }
        />
      )}

      {moveConfirm && (
        <MoveConfirmDialog
          newTime={moveConfirm.newTime}
          onCancel={() => setMoveConfirm(null)}
          onChoose={(scope) => {
            const { event, newTime } = moveConfirm;
            setMoveConfirm(null);
            void performMove(event, newTime, scope);
          }}
        />
      )}

      {createState && (
        <CreateTaskDialog
          state={createState}
          agents={agents}
          creating={creating}
          onChange={setCreateState}
          onCancel={() => setCreateState(null)}
          onCreate={() => void performCreate()}
        />
      )}
    </div>
  );
}

/* ─── Move scope chooser (recurring drag) ─── */
function MoveConfirmDialog({
  newTime,
  onChoose,
  onCancel,
}: {
  newTime: Date;
  onChoose: (scope: "all" | "occurrence" | "following") => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <h2 className="text-[14px] font-semibold text-foreground">Move recurring task</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Reschedule to {fmt(newTime)}. Apply to which?
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onChoose("occurrence")}
          className="rounded-lg border border-border/70 px-3 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-muted/50"
        >
          This occurrence only
          <span className="block text-[11px] font-normal text-muted-foreground">
            Skip the original slot and add a one-off at the new time.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose("following")}
          className="rounded-lg border border-border/70 px-3 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-muted/50"
        >
          This and following events
          <span className="block text-[11px] font-normal text-muted-foreground">
            Keep earlier runs; move this one and every later one to the new time.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose("all")}
          className="rounded-lg border border-border/70 px-3 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-muted/50"
        >
          All events
          <span className="block text-[11px] font-normal text-muted-foreground">
            Change the schedule for the whole series.
          </span>
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </Overlay>
  );
}

/* ─── Create-task popover (anchored to the clicked slot) ─── */
const REPEAT_LABELS: Record<RepeatMode, string> = {
  none: "Once",
  daily: "Daily",
  weekly: "Weekly",
  custom: "Custom",
};

function whenLine(state: CreateState): string {
  const time = state.when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const weekday = state.when.toLocaleDateString(undefined, { weekday: "long" });
  switch (state.repeat) {
    case "daily":
      return `Every day at ${time}`;
    case "weekly":
      return `Every ${weekday} at ${time}`;
    case "custom":
      return `Cron: ${state.customCron || "…"}`;
    default:
      return `Runs once at ${fmt(state.when)}`;
  }
}

function CreateTaskDialog({
  state,
  agents,
  creating,
  onChange,
  onCreate,
  onCancel,
}: {
  state: CreateState;
  agents: CabinetAgentSummary[];
  creating: boolean;
  onChange: (s: CreateState) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <AnchoredPopover anchor={state.anchor} onClose={onCancel} width={300}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">New task</h2>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{whenLine(state)}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <textarea
        autoFocus
        value={state.title}
        onChange={(e) => onChange({ ...state, title: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onCreate();
        }}
        rows={2}
        placeholder="What should the agent do?"
        className="mt-2 w-full resize-none rounded-lg border border-border/70 bg-background px-3 py-2 text-[13px] outline-none focus:border-primary/60"
      />

      {agents.length > 1 && (
        <select
          value={state.agentSlug}
          onChange={(e) => onChange({ ...state, agentSlug: e.target.value })}
          className="mt-2 w-full rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/60"
        >
          {agents
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => (
              <option key={a.scopedId} value={a.slug}>
                {a.emoji} {a.name}
              </option>
            ))}
        </select>
      )}

      {/* Repeat control — once by default, with daily/weekly/custom. */}
      <div className="mt-2 flex items-center gap-1.5">
        <Repeat className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="inline-flex flex-1 items-center rounded-md border border-border/70 bg-background p-0.5">
          {(["none", "daily", "weekly", "custom"] as RepeatMode[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ ...state, repeat: r })}
              className={cn(
                "flex-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors",
                state.repeat === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {REPEAT_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {state.repeat === "custom" && (
        <input
          value={state.customCron}
          onChange={(e) => onChange({ ...state, customCron: e.target.value })}
          placeholder="0 9 * * 1-5"
          spellCheck={false}
          className="mt-2 w-full rounded-lg border border-border/70 bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary/60"
        />
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={onCreate}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? "Creating…" : state.repeat === "none" ? "Schedule task" : "Create routine"}
        </button>
      </div>
    </AnchoredPopover>
  );
}

/* ─── Right-click context menu ─── */
function CalendarContextMenu({
  target,
  onClose,
  onOpen,
  onRunNow,
  onEdit,
  onDuplicate,
  onSkipOccurrence,
  onToggleEnable,
  onDelete,
  onCreate,
}: {
  target: ContextTarget;
  onClose: () => void;
  onOpen: (e: ScheduleEvent) => void;
  onRunNow: (e: ScheduleEvent) => void;
  onEdit: (e: ScheduleEvent) => void;
  onDuplicate: (e: ScheduleEvent) => void;
  onSkipOccurrence: (e: ScheduleEvent) => void;
  onToggleEnable: (e: ScheduleEvent) => void;
  onDelete: (e: ScheduleEvent) => void;
  onCreate: (date: Date, recurring: boolean) => void;
}) {
  type Item = {
    icon: typeof Play;
    label: string;
    onClick: () => void;
    danger?: boolean;
  };
  const items: Item[] = [];

  if (target.kind === "empty") {
    items.push({ icon: Plus, label: "New task here", onClick: () => onCreate(target.date, false) });
    items.push({ icon: Repeat, label: "New recurring routine", onClick: () => onCreate(target.date, true) });
  } else {
    const ev = target.event;
    if (ev.sourceType === "manual") {
      items.push({ icon: ExternalLink, label: "Open log", onClick: () => onOpen(ev) });
    } else if (ev.sourceType === "heartbeat") {
      const enabled = ev.enabled && ev.agentRef?.heartbeatEnabled !== false;
      items.push({ icon: Play, label: "Run now", onClick: () => onRunNow(ev) });
      items.push({ icon: Pencil, label: "Edit heartbeat…", onClick: () => onEdit(ev) });
      items.push({ icon: Ban, label: enabled ? "Disable" : "Enable", onClick: () => onToggleEnable(ev) });
    } else {
      const recurring = ev.jobRef ? !isOneOffJob(ev.jobRef) : false;
      items.push({ icon: Play, label: "Run now", onClick: () => onRunNow(ev) });
      items.push({ icon: Pencil, label: "Edit…", onClick: () => onEdit(ev) });
      items.push({ icon: Copy, label: "Duplicate", onClick: () => onDuplicate(ev) });
      if (recurring) {
        items.push({ icon: SkipForward, label: "Skip this occurrence", onClick: () => onSkipOccurrence(ev) });
      }
      items.push({ icon: Ban, label: ev.enabled ? "Disable" : "Enable", onClick: () => onToggleEnable(ev) });
      items.push({ icon: Trash2, label: "Delete", onClick: () => onDelete(ev), danger: true });
    }
  }

  const MENU_W = 200;
  const left = Math.max(8, Math.min(target.x, window.innerWidth - MENU_W - 8));
  const top = Math.max(8, Math.min(target.y, window.innerHeight - items.length * 34 - 16));

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        style={{ position: "fixed", left, top, width: MENU_W }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onClose();
                it.onClick();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors",
                it.danger
                  ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  : "hover:bg-muted/60",
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-80" />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Anchored popover (positions near a point, clamped to the viewport) ─── */
function AnchoredPopover({
  anchor,
  onClose,
  children,
  width = 300,
}: {
  anchor?: { x: number; y: number };
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = anchor ? anchor.x + 12 : vw / 2 - width / 2;
  if (left + width + pad > vw) {
    left = anchor ? anchor.x - width - 12 : vw - width - pad;
  }
  left = Math.max(pad, Math.min(left, vw - width - pad));
  const top = Math.max(pad, Math.min(anchor ? anchor.y : 120, vh - 300));
  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        style={{ position: "fixed", left, top, width }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
