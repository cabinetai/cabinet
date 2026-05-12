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
  useState,
} from "react";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
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
    const onChange = () => void refresh();
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
    const anyActive = agents.some((a) => a.active);
    await fetch("/api/agents/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: anyActive ? "stop-all" : "start-all",
        cabinetPath: effectivePath,
      }),
    }).catch(() => {});
    await refresh();
  }, [agents, effectivePath, refresh]);

  const toggleAllHeartbeats = useCallback(async () => {
    const anyEnabled = agents.some(
      (a) => !!a.heartbeat && a.heartbeatEnabled !== false
    );
    await fetch("/api/agents/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: anyEnabled ? "pause-heartbeats" : "resume-heartbeats",
        cabinetPath: effectivePath,
      }),
    }).catch(() => {});
    await refresh();
  }, [agents, effectivePath, refresh]);

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
