"use client";

/**
 * Shared client context for the V2 /agents page. Owns:
 *   - agents + jobs (fetched from cabinet overview)
 *   - cabinet scope (visibility mode)
 *   - dialog state (heartbeat, routine, new-agent, org-chart, agent-picker)
 *   - toggle / bulk handlers wired to the production endpoints
 *
 * Single mount point for the whole tab tree.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { showError, showInfo, showSuccess } from "@/lib/ui/toast";
import { useAppStore } from "@/stores/app-store";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
  CabinetVisibilityMode,
} from "@/types/cabinets";
import type { JobConfig } from "@/types/jobs";
import type { NewRoutineDialogAgent } from "@/components/agents/new-routine-dialog";

export interface HeartbeatDialogState {
  agent: NewRoutineDialogAgent;
  initialHeartbeat?: string;
  initialEnabled?: boolean;
}

export interface RoutineDialogState {
  agent: NewRoutineDialogAgent;
  existingJob?: Partial<JobConfig>;
  /** True when this is a fresh routine, not an edit. */
  isNew?: boolean;
}

interface AgentsContextValue {
  cabinetPath: string;
  loading: boolean;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];

  visibilityMode: CabinetVisibilityMode;
  setVisibilityMode: (mode: CabinetVisibilityMode) => void;

  refresh: () => Promise<void>;

  // Per-row toggles — write-through to the API + optimistic update
  toggleAgentActive: (agent: CabinetAgentSummary) => Promise<void>;
  toggleHeartbeatEnabled: (agent: CabinetAgentSummary) => Promise<void>;
  toggleJobEnabled: (job: CabinetJobSummary) => Promise<void>;

  // Bulk
  toggleAllHeartbeats: () => Promise<void>;
  /** Flip every agent on/off via the scheduler `start-all` / `stop-all`
   *  action. When any agent is currently active, this stops all of them
   *  (which also gates their heartbeats and routines via PR #77). When
   *  none are active, this starts all. */
  toggleAllAgentsActive: () => Promise<void>;
  /** True while the master start-all / stop-all request is in flight.
   *  Used by the MasterToggle to disable the Switch and avoid double
   *  submits during the optimistic-update window. */
  bulkToggleInFlight: boolean;

  // Dialog openers
  heartbeatDialog: HeartbeatDialogState | null;
  setHeartbeatDialog: (s: HeartbeatDialogState | null) => void;
  routineDialog: RoutineDialogState | null;
  setRoutineDialog: (s: RoutineDialogState | null) => void;
  newAgentOpen: boolean;
  setNewAgentOpen: (open: boolean) => void;
  orgChartOpen: boolean;
  setOrgChartOpen: (open: boolean) => void;
}

const Ctx = createContext<AgentsContextValue | null>(null);

export function AgentsContextProvider({
  cabinetPath,
  children,
}: {
  cabinetPath?: string;
  children: React.ReactNode;
}) {
  const effectivePath = cabinetPath || ROOT_CABINET_PATH;

  const visibilityMode = useAppStore(
    (s) => s.cabinetVisibilityModes[effectivePath] ?? "own"
  );
  const setCabinetVisibilityMode = useAppStore(
    (s) => s.setCabinetVisibilityMode
  );
  const setVisibilityMode = useCallback(
    (mode: CabinetVisibilityMode) => {
      setCabinetVisibilityMode(effectivePath, mode);
    },
    [effectivePath, setCabinetVisibilityMode]
  );

  const [agents, setAgents] = useState<CabinetAgentSummary[]>([]);
  const [jobs, setJobs] = useState<CabinetJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkToggleInFlight, setBulkToggleInFlight] = useState(false);
  // Daemon writes during a bulk toggle fire `cabinet:agents/agent_status`
  // events. Each one would normally trigger refresh(), which races with
  // the optimistic update and brings back mid-flight (still-active) state,
  // causing the switch to flicker back to ON. This ref lets the event
  // listener short-circuit while a bulk op is in flight.
  const bulkInFlightRef = useRef(false);

  const [heartbeatDialog, setHeartbeatDialog] =
    useState<HeartbeatDialogState | null>(null);
  const [routineDialog, setRoutineDialog] =
    useState<RoutineDialogState | null>(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [orgChartOpen, setOrgChartOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = (await fetchCabinetOverviewClient(
        effectivePath,
        visibilityMode
      )) as CabinetOverview | null;
      if (!data) {
        setAgents([]);
        setJobs([]);
        return;
      }
      setAgents(data.agents || []);
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  }, [effectivePath, visibilityMode]);

  // Initial fetch + refetch whenever the scope changes
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Refetch when other parts of the app touch agents/jobs
  useEffect(() => {
    const onChange = () => {
      if (bulkInFlightRef.current) return;
      void refresh();
    };
    window.addEventListener("cabinet:agents/agent_status", onChange);
    window.addEventListener("cabinet:conversation-completed", onChange);
    return () => {
      window.removeEventListener("cabinet:agents/agent_status", onChange);
      window.removeEventListener("cabinet:conversation-completed", onChange);
    };
  }, [refresh]);

  const toggleAgentActive = useCallback(
    async (agent: CabinetAgentSummary) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.slug === agent.slug ? { ...a, active: !a.active } : a
        )
      );
      await fetch(`/api/agents/personas/${agent.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          cabinetPath: agent.cabinetPath || effectivePath,
        }),
      }).catch(() => {});
    },
    [effectivePath]
  );

  const toggleHeartbeatEnabled = useCallback(
    async (agent: CabinetAgentSummary) => {
      const next = agent.heartbeatEnabled === false;
      setAgents((prev) =>
        prev.map((a) =>
          a.slug === agent.slug ? { ...a, heartbeatEnabled: next } : a
        )
      );
      await fetch(`/api/agents/personas/${agent.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heartbeat: agent.heartbeat || "",
          heartbeatEnabled: next,
          cabinetPath: agent.cabinetPath || effectivePath,
        }),
      }).catch(() => {});
    },
    [effectivePath]
  );

  const toggleJobEnabled = useCallback(
    async (job: CabinetJobSummary) => {
      const next = !job.enabled;
      setJobs((prev) =>
        prev.map((j) =>
          j.scopedId === job.scopedId ? { ...j, enabled: next } : j
        )
      );
      const ownerSlug = job.ownerAgent || "";
      if (!ownerSlug) return;
      await fetch(`/api/agents/${ownerSlug}/jobs/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          cabinetPath: job.cabinetPath || effectivePath,
          enabled: next,
        }),
      }).catch(() => {});
    },
    [effectivePath]
  );

  const toggleAllAgentsActive = useCallback(async () => {
    if (bulkToggleInFlight) return;
    const turningOff = agents.some((a) => a.active);
    // Only flip the agents that actually need to change. Targets is
    // also the list we'll write per-agent — bypassing the scheduler
    // bulk endpoint, which filters by a single cabinetPath and silently
    // skips agents in sibling cabinets / global scope (the bug that
    // made the optimistic update revert on refresh).
    const targets = turningOff
      ? agents.filter((a) => a.active)
      : agents.filter((a) => !a.active);
    const affectedCount = targets.length;
    if (affectedCount === 0) return;

    const previousAgents = agents;
    bulkInFlightRef.current = true;
    setBulkToggleInFlight(true);
    setAgents((prev) => prev.map((a) => ({ ...a, active: !turningOff })));
    showInfo(
      turningOff
        ? `Pausing ${affectedCount} ${affectedCount === 1 ? "agent" : "agents"}…`
        : `Starting ${affectedCount} ${affectedCount === 1 ? "agent" : "agents"}…`
    );

    try {
      const results = await Promise.allSettled(
        targets.map((agent) =>
          fetch(`/api/agents/personas/${agent.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              active: !turningOff,
              cabinetPath: agent.cabinetPath || effectivePath,
            }),
          }).then((res) => {
            if (!res.ok) throw new Error(`${agent.slug} ${res.status}`);
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      bulkInFlightRef.current = false;
      await refresh();
      if (failed === 0) {
        showSuccess(
          turningOff
            ? `Team paused. Running tasks will finish on their own — nothing new fires until you switch the team back on.`
            : `Team active. Heartbeats and routines will fire on their next scheduled tick.`
        );
      } else if (failed === affectedCount) {
        setAgents(previousAgents);
        showError(
          `Couldn't ${turningOff ? "pause" : "start"} the team. Check that the daemon is running and try again.`
        );
      } else {
        showError(
          `${failed} of ${affectedCount} agents couldn't be ${turningOff ? "paused" : "started"} — the rest were updated.`
        );
      }
    } catch {
      setAgents(previousAgents);
      showError(
        `Couldn't reach the agent scheduler. Try again, or check that the daemon is running.`
      );
    } finally {
      bulkInFlightRef.current = false;
      setBulkToggleInFlight(false);
    }
  }, [agents, bulkToggleInFlight, effectivePath, refresh]);

  const toggleAllHeartbeats = useCallback(async () => {
    if (bulkToggleInFlight) return;
    const withHeartbeat = agents.filter((a) => !!a.heartbeat);
    const anyEnabled = withHeartbeat.some((a) => a.heartbeatEnabled !== false);
    // Same scope-mismatch fix as toggleAllAgentsActive — write each
    // persona directly with its own cabinetPath rather than going
    // through the scheduler bulk endpoint.
    const targets = anyEnabled
      ? withHeartbeat.filter((a) => a.heartbeatEnabled !== false)
      : withHeartbeat.filter((a) => a.heartbeatEnabled === false);
    const affectedCount = targets.length;
    if (affectedCount === 0) return;

    const previousAgents = agents;
    bulkInFlightRef.current = true;
    setBulkToggleInFlight(true);
    setAgents((prev) =>
      prev.map((a) =>
        !!a.heartbeat ? { ...a, heartbeatEnabled: !anyEnabled } : a
      )
    );
    showInfo(
      anyEnabled
        ? `Pausing ${affectedCount} ${affectedCount === 1 ? "heartbeat" : "heartbeats"}…`
        : `Resuming ${affectedCount} ${affectedCount === 1 ? "heartbeat" : "heartbeats"}…`
    );

    try {
      const results = await Promise.allSettled(
        targets.map((agent) =>
          fetch(`/api/agents/personas/${agent.slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              heartbeat: agent.heartbeat || "",
              heartbeatEnabled: !anyEnabled,
              cabinetPath: agent.cabinetPath || effectivePath,
            }),
          }).then((res) => {
            if (!res.ok) throw new Error(`${agent.slug} ${res.status}`);
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      bulkInFlightRef.current = false;
      await refresh();
      if (failed === 0) {
        showSuccess(
          anyEnabled
            ? `Heartbeats paused. Agents stay online for manual work; their scheduled check-ins resume when you switch this back on.`
            : `Heartbeats resumed. Each agent fires on its next scheduled tick.`
        );
      } else if (failed === affectedCount) {
        setAgents(previousAgents);
        showError(
          `Couldn't ${anyEnabled ? "pause" : "resume"} heartbeats. Check that the daemon is running and try again.`
        );
      } else {
        showError(
          `${failed} of ${affectedCount} heartbeats couldn't be ${anyEnabled ? "paused" : "resumed"} — the rest were updated.`
        );
      }
    } catch {
      setAgents(previousAgents);
      showError(
        `Couldn't reach the agent scheduler. Try again, or check that the daemon is running.`
      );
    } finally {
      bulkInFlightRef.current = false;
      setBulkToggleInFlight(false);
    }
  }, [agents, bulkToggleInFlight, effectivePath, refresh]);

  const value = useMemo<AgentsContextValue>(
    () => ({
      cabinetPath: effectivePath,
      loading,
      agents,
      jobs,
      visibilityMode,
      setVisibilityMode,
      refresh,
      toggleAgentActive,
      toggleHeartbeatEnabled,
      toggleJobEnabled,
      toggleAllHeartbeats,
      toggleAllAgentsActive,
      bulkToggleInFlight,
      heartbeatDialog,
      setHeartbeatDialog,
      routineDialog,
      setRoutineDialog,
      newAgentOpen,
      setNewAgentOpen,
      orgChartOpen,
      setOrgChartOpen,
    }),
    [
      effectivePath,
      loading,
      agents,
      jobs,
      visibilityMode,
      setVisibilityMode,
      refresh,
      toggleAgentActive,
      toggleHeartbeatEnabled,
      toggleJobEnabled,
      toggleAllHeartbeats,
      toggleAllAgentsActive,
      bulkToggleInFlight,
      heartbeatDialog,
      routineDialog,
      newAgentOpen,
      orgChartOpen,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAgentsContext must be used inside AgentsContextProvider");
  }
  return ctx;
}
