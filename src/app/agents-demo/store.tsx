"use client";

/**
 * Shared client store for the /agents-demo redesign. Mounted at the layout
 * level so all four tab routes share one fetch + one source of truth for
 * toggles. Replace with the production store + Zustand wiring when this
 * lands in the real app shell.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
} from "@/types/cabinets";

interface DemoStore {
  loading: boolean;
  agents: CabinetAgentSummary[];
  jobs: CabinetJobSummary[];
  toggleAgentActive: (agent: CabinetAgentSummary) => Promise<void>;
  toggleHeartbeatEnabled: (agent: CabinetAgentSummary) => Promise<void>;
  toggleJobEnabled: (job: CabinetJobSummary) => Promise<void>;
}

const Ctx = createContext<DemoStore | null>(null);

export function AgentsDemoProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<CabinetAgentSummary[]>([]);
  const [jobs, setJobs] = useState<CabinetJobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/cabinets/overview?path=.&visibility=own");
        if (!res.ok) return;
        const data = (await res.json()) as CabinetOverview;
        if (cancel) return;
        setAgents(data.agents || []);
        setJobs(data.jobs || []);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const toggleAgentActive = useCallback(async (agent: CabinetAgentSummary) => {
    setAgents((prev) =>
      prev.map((a) => (a.slug === agent.slug ? { ...a, active: !a.active } : a))
    );
    await fetch(`/api/agents/personas/${agent.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle",
        cabinetPath: agent.cabinetPath || ".",
      }),
    }).catch(() => {});
  }, []);

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
          cabinetPath: agent.cabinetPath || ".",
        }),
      }).catch(() => {});
    },
    []
  );

  const toggleJobEnabled = useCallback(async (job: CabinetJobSummary) => {
    const next = !job.enabled;
    setJobs((prev) =>
      prev.map((j) => (j.scopedId === job.scopedId ? { ...j, enabled: next } : j))
    );
    const ownerSlug = job.ownerAgent || "";
    if (!ownerSlug) return;
    await fetch(`/api/agents/${ownerSlug}/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        cabinetPath: job.cabinetPath || ".",
        enabled: next,
      }),
    }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ loading, agents, jobs, toggleAgentActive, toggleHeartbeatEnabled, toggleJobEnabled }),
    [loading, agents, jobs, toggleAgentActive, toggleHeartbeatEnabled, toggleJobEnabled]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentsDemo(): DemoStore {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAgentsDemo must be used inside AgentsDemoProvider");
  }
  return ctx;
}
