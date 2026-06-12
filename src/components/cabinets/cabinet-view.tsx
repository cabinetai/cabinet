"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderTree,
  Loader2,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HeaderActions } from "@/components/layout/header-actions";
import { VersionHistory } from "@/components/editor/version-history";
import { CabinetSchedulerControls } from "@/components/cabinets/cabinet-scheduler-controls";
import { CabinetTaskComposer } from "@/components/cabinets/cabinet-task-composer";
import {
  NewRoutineDialog,
  type NewRoutineDialogAgent,
} from "@/components/agents/new-routine-dialog";
import { HeartbeatDialog } from "@/components/agents/heartbeat-dialog";
import type { JobConfig } from "@/types/jobs";
import { ActivityFeed } from "@/components/cabinets/activity-feed";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import type { ConversationMeta } from "@/types/conversations";
import type {
  CabinetAgentSummary,
  CabinetOverview,
} from "@/types/cabinets";
import type { ScheduleEvent } from "@/lib/agents/cron-compute";
import { NextUpRuns } from "./next-up-runs";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { OrgChartModal } from "./org-chart-modal";

export function CabinetView({ cabinetPath }: { cabinetPath: string }) {
  const [overview, setOverview] = useState<CabinetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [requestedAgent, setRequestedAgent] = useState<CabinetAgentSummary | null>(null);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [routineDialog, setRoutineDialog] = useState<{
    agent: NewRoutineDialogAgent;
    existingJob?: Partial<JobConfig>;
    missedRun?: { scheduledAt: string };
  } | null>(null);
  const [heartbeatDialog, setHeartbeatDialog] = useState<{
    agent: NewRoutineDialogAgent;
    initialHeartbeat?: string;
    initialEnabled?: boolean;
    missedRun?: { scheduledAt: string };
  } | null>(null);

  const setSection = useAppStore((state) => state.setSection);
  const cabinetVisibilityModes = useAppStore((state) => state.cabinetVisibilityModes);
  const setCabinetVisibilityMode = useAppStore((state) => state.setCabinetVisibilityMode);
  const cabinetVisibilityMode = cabinetVisibilityModes[cabinetPath] || "own";
  const selectPage = useTreeStore((state) => state.selectPage);
  const loadPage = useEditorStore((state) => state.loadPage);

  const openCabinet = useCallback(
    (path: string) => {
      selectPage(path);
      void loadPage(path);
      setSection({ type: "cabinet", cabinetPath: path });
    },
    [loadPage, selectPage, setSection]
  );

  const openCabinetAgent = useCallback(
    (agent: CabinetAgentSummary) => {
      const targetCabinetPath = agent.cabinetPath || cabinetPath;
      setSection({
        type: "agent",
        slug: agent.slug,
        cabinetPath: targetCabinetPath,
        agentScopedId: agent.scopedId || `${targetCabinetPath}::agent::${agent.slug}`,
      });
    },
    [cabinetPath, setSection]
  );

  const openCabinetAgentsWorkspace = useCallback(() => {
    setSection({ type: "agents", cabinetPath });
  }, [cabinetPath, setSection]);

  const openConversation = useCallback(
    (conversation: ConversationMeta) => {
      const targetCabinetPath = conversation.cabinetPath || cabinetPath;
      setSection({
        type: "agent",
        slug: conversation.agentSlug,
        cabinetPath: targetCabinetPath,
        agentScopedId: `${targetCabinetPath}::agent::${conversation.agentSlug}`,
        conversationId: conversation.id,
      });
    },
    [cabinetPath, setSection]
  );

  const primeTaskComposer = useCallback((agent: CabinetAgentSummary) => {
    setRequestedAgent(agent);
    setComposerFocusRequest((current) => current + 1);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCabinetOverviewClient(
        cabinetPath,
        cabinetVisibilityMode,
        { force: true }
      );
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cabinetPath, cabinetVisibilityMode]);

  useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => void loadOverview(), 15000);
    const onFocus = () => void loadOverview();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadOverview]);

  // Tick `now` every minute so Next-up labels stay fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    dedupFetch("/api/agents/config")
      .then((response) => response.json())
      .then((data) => {
        const nextName = [
          data?.person?.name,
          data?.user?.name,
          data?.owner?.name,
          data?.company?.name,
          typeof data?.company === "string" ? data.company : null,
        ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
        if (nextName) setDisplayName(nextName);
      })
      .catch(() => {});
  }, []);

  const cabinetName =
    overview?.cabinet.name ||
    cabinetPath.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ||
    "Cabinet";
  const ownAgents = useMemo(
    () => (overview?.agents || []).filter((a) => a.cabinetDepth === 0),
    [overview?.agents]
  );
  const boardName = displayName || "there";
  const agentCount = overview?.agents.length ?? 0;
  const jobCount = overview?.jobs.length ?? 0;
  const heartbeatCount = useMemo(
    () => (overview?.agents || []).filter((a) => !!a.heartbeat).length,
    [overview?.agents]
  );

  function handleScheduleEventClick(event: ScheduleEvent) {
    if (event.sourceType === "job" && event.jobRef && event.agentRef) {
      setRoutineDialog({
        agent: {
          slug: event.agentRef.slug,
          name: event.agentRef.name,
          role: event.agentRef.role,
          cabinetPath: event.agentRef.cabinetPath || cabinetPath,
        },
        existingJob: {
          id: event.jobRef.id,
          name: event.jobRef.name,
          schedule: event.jobRef.schedule,
          prompt: event.jobRef.prompt || "",
          enabled: event.jobRef.enabled,
        },
      });
    } else if (event.sourceType === "heartbeat" && event.agentRef) {
      setHeartbeatDialog({
        agent: {
          slug: event.agentRef.slug,
          name: event.agentRef.name,
          role: event.agentRef.role,
          cabinetPath: event.agentRef.cabinetPath || cabinetPath,
        },
        initialHeartbeat: event.agentRef.heartbeat || "0 9 * * 1-5",
        initialEnabled: event.agentRef.heartbeatEnabled !== false,
      });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Header row ── */}
        <header
          className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/95 py-2.5 pe-4 ps-[calc(1rem+var(--sidebar-toggle-offset,0px))] transition-[padding] duration-200 sm:pe-6 sm:ps-[calc(1.5rem+var(--sidebar-toggle-offset,0px))]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate font-ui text-[14px] font-semibold tracking-tight text-foreground">
              {cabinetName}
            </h1>
            {loading && !overview ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CountPill label="agents" value={agentCount} />
            <CountPill label="jobs" value={jobCount} />
            <CountPill label="heartbeats" value={heartbeatCount} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DepthDropdown
              mode={cabinetVisibilityMode}
              onChange={(mode) => setCabinetVisibilityMode(cabinetPath, mode)}
            />

            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => setOrgChartOpen(true)}
              disabled={!overview || agentCount === 0}
            >
              <Network className="size-3.5" />
              Org chart
            </Button>

            <CabinetSchedulerControls
              cabinetPath={cabinetPath}
              ownAgents={ownAgents}
              onRefresh={() => void loadOverview()}
            />
            <VersionHistory path={cabinetPath === "." ? "index" : cabinetPath} />
            <HeaderActions />
          </div>
        </header>

        {/* ── Scrollable body ── */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            {error ? (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            ) : null}

            {/* Composer hero */}
            <section className="mb-8">
              <CabinetTaskComposer
                cabinetPath={cabinetPath}
                agents={overview?.agents || []}
                displayName={boardName}
                requestedAgent={requestedAgent}
                focusRequest={composerFocusRequest}
                onNavigate={(_agentSlug, agentCabinetPath, conversationId) =>
                  setSection({
                    type: "task",
                    taskId: conversationId,
                    cabinetPath: agentCabinetPath,
                  })
                }
              />
            </section>

            {/* Activity + Next-up runs */}
            <section className="grid gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ActivityFeed
                  cabinetPath={cabinetPath}
                  visibilityMode={cabinetVisibilityMode}
                  agents={overview?.agents || []}
                  onOpen={openConversation}
                  onOpenWorkspace={openCabinetAgentsWorkspace}
                />
              </div>
              <div>
                <NextUpRuns
                  agents={overview?.agents || []}
                  jobs={overview?.jobs || []}
                  now={now}
                  onEventClick={handleScheduleEventClick}
                />
                {(overview?.children?.length ?? 0) > 0 && (
                  <div className="mt-8 space-y-2">
                    <h2 className="text-[14px] font-semibold tracking-tight text-foreground">
                      Child cabinets
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {overview!.children.map((child) => (
                        <button
                          key={child.path}
                          type="button"
                          onClick={() => openCabinet(child.path)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60"
                          title={child.name}
                        >
                          <FolderTree className="size-3 shrink-0 text-muted-foreground" />
                          <span className="max-w-[160px] truncate">{child.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

      {/* ── Org chart modal ── */}
      <OrgChartModal
        open={orgChartOpen}
        onOpenChange={setOrgChartOpen}
        cabinetName={cabinetName}
        agents={overview?.agents || []}
        jobs={overview?.jobs || []}
        childCabinets={overview?.children || []}
        onAgentClick={(agent) => {
          setOrgChartOpen(false);
          openCabinetAgent(agent);
        }}
        onAgentSend={(agent) => {
          setOrgChartOpen(false);
          primeTaskComposer(agent);
        }}
        onChildCabinetClick={(child) => {
          setOrgChartOpen(false);
          openCabinet(child.path);
        }}
      />

      {/* ── Job dialog ── */}
      <NewRoutineDialog
        open={routineDialog !== null}
        onOpenChange={(next) => {
          if (!next) setRoutineDialog(null);
        }}
        agent={routineDialog?.agent ?? { slug: "", name: "" }}
        existingJob={routineDialog?.existingJob}
        missedRun={routineDialog?.missedRun}
        onSaved={() => {
          setRoutineDialog(null);
          void loadOverview();
        }}
        onDeleted={() => {
          setRoutineDialog(null);
          void loadOverview();
        }}
      />

      {/* ── Heartbeat dialog ── */}
      <HeartbeatDialog
        open={heartbeatDialog !== null}
        onOpenChange={(next) => {
          if (!next) setHeartbeatDialog(null);
        }}
        agent={heartbeatDialog?.agent ?? { slug: "", name: "" }}
        initialHeartbeat={heartbeatDialog?.initialHeartbeat}
        initialEnabled={heartbeatDialog?.initialEnabled}
        missedRun={heartbeatDialog?.missedRun}
        onSaved={() => {
          setHeartbeatDialog(null);
          void loadOverview();
        }}
      />
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]">
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

