"use client";

import { useEffect, useState } from "react";
import type { JobConfig } from "@/types/jobs";
import { useAppStore } from "@/stores/app-store";
import { NewRoutineDialog } from "@/components/agents/new-routine-dialog";
import { HeartbeatDialog } from "@/components/agents/heartbeat-dialog";
import { OrgChartModal } from "@/components/cabinets/org-chart-modal";
import { CreateAgentDialog } from "@/components/mission-control/create-agent-dialog";
import { AgentsContextProvider, useAgentsContext } from "./agents-context";
import { TabsLayout, type AgentsTabKey } from "./tabs-layout";
import { NewAgentDialog } from "./new-agent-dialog";

const ALL_TABS: readonly AgentsTabKey[] = [
  "agents",
  "routines",
  "heartbeats",
  "schedule",
  "channels",
];

function isTab(value: string | undefined): value is AgentsTabKey {
  return !!value && (ALL_TABS as readonly string[]).includes(value);
}

/**
 * V2 entry point for /agents. Mounts the shared context + all dialogs and
 * renders the tabbed layout. The `tab` prop is parsed by app-shell from the
 * hash route (e.g. `#/agents/routines`).
 */
export function AgentsWorkspaceV2({
  cabinetPath,
  tab,
  onTabChange,
}: {
  cabinetPath?: string;
  tab?: string;
  onTabChange: (next: AgentsTabKey) => void;
}) {
  const activeTab: AgentsTabKey = isTab(tab) ? tab : "agents";

  return (
    <AgentsContextProvider cabinetPath={cabinetPath}>
      <TabsLayout tab={activeTab} onTabChange={onTabChange} />
      <Dialogs />
    </AgentsContextProvider>
  );
}

/**
 * Mount point for all V2 dialogs. Reads state from the context and reuses
 * the same dialog components the rest of the app uses, so behavior is
 * identical to the cabinet view, tasks board, etc.
 */
function Dialogs() {
  const {
    cabinetPath,
    agents,
    jobs,
    refresh,
    heartbeatDialog,
    setHeartbeatDialog,
    routineDialog,
    setRoutineDialog,
    newAgentOpen,
    setNewAgentOpen,
    orgChartOpen,
    setOrgChartOpen,
  } = useAgentsContext();

  const setSection = useAppStore((s) => s.setSection);
  const [createFromScratchOpen, setCreateFromScratchOpen] = useState(false);

  // The sidebar / tree "New Agent" buttons dispatch this event instead of
  // reaching into the agents view directly. V2 owns the dialog, so it must
  // listen here (the legacy workspace had its own listener).
  useEffect(() => {
    const handler = () => setNewAgentOpen(true);
    window.addEventListener("cabinet:open-add-agent", handler);
    return () => window.removeEventListener("cabinet:open-add-agent", handler);
  }, [setNewAgentOpen]);

  // The org chart modal needs the cabinet's children too. For V2 we don't
  // expose child cabinets through the agents context, so refetch via the
  // overview here when the modal opens. Keeps the context lean.
  const [orgChartChildren, setOrgChartChildren] = useState<
    Parameters<typeof OrgChartModal>[0]["childCabinets"]
  >([]);
  // The org chart is titled with the room's display name, not its raw path
  // (#084). Sourced from the same overview fetch that loads its children.
  const [orgChartName, setOrgChartName] = useState<string>("Cabinet");
  useEffect(() => {
    if (!orgChartOpen) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/cabinets/overview?path=${encodeURIComponent(cabinetPath)}&visibility=own`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancel) {
          setOrgChartChildren(data.children || []);
          setOrgChartName(
            data.cabinet?.name ||
              (cabinetPath === "." ? "Cabinet" : cabinetPath)
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [orgChartOpen, cabinetPath]);

  return (
    <>
      <HeartbeatDialog
        open={heartbeatDialog !== null}
        onOpenChange={(next) => {
          if (!next) setHeartbeatDialog(null);
        }}
        agent={heartbeatDialog?.agent ?? { slug: "", name: "" }}
        initialHeartbeat={heartbeatDialog?.initialHeartbeat}
        initialEnabled={heartbeatDialog?.initialEnabled}
        onSaved={() => {
          setHeartbeatDialog(null);
          void refresh();
        }}
        onToggledEnabled={() => void refresh()}
      />

      <NewRoutineDialog
        open={routineDialog !== null}
        onOpenChange={(next) => {
          if (!next) setRoutineDialog(null);
        }}
        agent={routineDialog?.agent ?? { slug: "", name: "" }}
        existingJob={routineDialog?.existingJob as JobConfig | undefined}
        onSaved={() => {
          setRoutineDialog(null);
          void refresh();
        }}
        onDeleted={() => {
          setRoutineDialog(null);
          void refresh();
        }}
      />

      <NewAgentDialog
        open={newAgentOpen}
        onOpenChange={setNewAgentOpen}
        cabinetPath={cabinetPath}
        existingSlugs={new Set(agents.map((a) => a.slug))}
        onAdded={refresh}
        onCreateFromScratch={() => setCreateFromScratchOpen(true)}
      />

      <CreateAgentDialog
        open={createFromScratchOpen}
        onOpenChange={setCreateFromScratchOpen}
        cabinetPath={cabinetPath === "." ? undefined : cabinetPath}
        onCreated={() => {
          setCreateFromScratchOpen(false);
          void refresh();
        }}
      />

      <OrgChartModal
        open={orgChartOpen}
        onOpenChange={setOrgChartOpen}
        cabinetName={orgChartName}
        agents={agents}
        jobs={jobs}
        childCabinets={orgChartChildren}
        onAgentClick={(agent) =>
          setSection({
            type: "agent",
            slug: agent.slug,
            cabinetPath: agent.cabinetPath,
            agentScopedId: agent.scopedId,
          })
        }
        onAgentSend={(agent) =>
          setSection({
            type: "agent",
            slug: agent.slug,
            cabinetPath: agent.cabinetPath,
            agentScopedId: agent.scopedId,
          })
        }
        onChildCabinetClick={(child) =>
          setSection({
            type: "cabinet",
            cabinetPath: child.path,
          })
        }
      />
    </>
  );
}
