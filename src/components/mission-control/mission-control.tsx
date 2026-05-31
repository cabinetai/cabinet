"use client";

import { useState, useEffect, useCallback } from "react";
import { Gauge, Plus, RefreshCw, Zap, MessageSquare, Loader2, BookOpen, Power, Pause, PlayCircle, FolderOpen, Upload, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { PulseStrip } from "./pulse-strip";
import { DepartmentCard } from "./department-card";
import { AgentCard } from "./agent-card";
import { SlackPanel } from "./slack-panel";
import { CreateAgentDialog } from "./create-agent-dialog";
import { AgentDetailPanel } from "./agent-detail-panel";
import { GoalBar } from "./goal-bar";
import { WorkspaceGallery } from "./workspace-gallery";
import type { GoalMetric } from "@/types/agents";
import { useLocale } from "@/i18n/use-locale";

interface AgentSummary {
  name: string;
  emoji: string;
  role: string;
  slug: string;
  active: boolean;
  running?: boolean;
  type: string;
  department: string;
  goals: GoalMetric[];
  lastHeartbeat?: string;
  nextHeartbeat?: string;
  lastAction?: string;
  pendingTasks?: number;
}

interface DepartmentGroup {
  name: string;
  agents: AgentSummary[];
}

export function MissionControl() {
  const { t } = useLocale();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [nlOpen, setNlOpen] = useState(false);
  const [nlInput, setNlInput] = useState("");
  const [nlGenerating, setNlGenerating] = useState(false);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [showGoalSummary, setShowGoalSummary] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerToggling, setSchedulerToggling] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [confirmStart, setConfirmStart] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const [gridExpanded, setGridExpanded] = useState(false);
  const setSection = useAppStore((s) => s.setSection);
  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);

  // Load company name from config
  useEffect(() => {
    dedupFetch("/api/agents/config")
      .then((r) => r.json())
      .then((d) => {
        const name = d.company?.name || d.company || "";
        if (name && typeof name === "string") setCompanyName(name);
      })
      .catch(() => {});
  }, []);

  const loadAgents = useCallback(async () => {
    try {
      const [agentRes, alertsRes] = await Promise.all([
        fetch("/api/agents/personas"),
        fetch("/api/agents/slack?channel=alerts&limit=100"),
      ]);
      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgents(
          (data.personas || []).map((p: Record<string, unknown>) => ({
            name: p.name as string,
            emoji: (p.emoji as string) || "🤖",
            role: (p.role as string) || "",
            slug: p.slug as string,
            active: p.active as boolean,
            type: (p.type as string) || "specialist",
            department: (p.department as string) || "general",
            goals: (p.goals as GoalMetric[]) || [],
            lastHeartbeat: p.lastHeartbeat as string | undefined,
            nextHeartbeat: p.nextHeartbeat as string | undefined,
          }))
        );
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlertCount((data.messages || []).length);
      }

      // Fetch task counts per agent
      try {
        const taskRes = await fetch("/api/agents/tasks?all=true&status=pending");
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          const counts: Record<string, number> = {};
          for (const t of taskData.tasks || []) {
            counts[t.toAgent] = (counts[t.toAgent] || 0) + 1;
          }
          setAgents((prev) =>
            prev.map((a) => ({ ...a, pendingTasks: counts[a.slug] || 0 }))
          );
        }
      } catch { /* ignore */ }

      // Fetch scheduler status
      const schedRes = await fetch("/api/agents/scheduler");
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        setSchedulerRunning(schedData.status === "running");
        setScheduledCount(schedData.scheduledAgents?.length || 0);
      }

      // Fetch last actions from #general channel
      const generalRes = await fetch("/api/agents/slack?channel=general&limit=50");
      if (generalRes.ok) {
        const data = await generalRes.json();
        const msgs = data.messages || [];
        const lastActions: Record<string, string> = {};
        for (const msg of msgs) {
          if (msg.agent && msg.agent !== "human" && msg.agent !== "system") {
            lastActions[msg.agent] = msg.content?.slice(0, 100) || "";
          }
        }
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            lastAction: lastActions[a.slug] || undefined,
          }))
        );
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    loadAgents();

    // SSE events are received by app-shell's single subscription and
    // re-dispatched as `cabinet:agents/<event>` window events so we can
    // listen here without opening a second EventSource to the same endpoint.
    const handleAgentStatus = (e: Event) => {
      const statuses = (e as CustomEvent).detail as {
        slug: string;
        active: boolean;
        running?: boolean;
        lastHeartbeat?: string;
        nextHeartbeat?: string;
      }[];
      setAgents((prev) =>
        prev.map((a) => {
          const s = statuses.find((st) => st.slug === a.slug);
          if (!s) return a;
          return {
            ...a,
            active: s.active,
            running: s.running,
            lastHeartbeat: s.lastHeartbeat,
            nextHeartbeat: s.nextHeartbeat,
          };
        })
      );
    };
    const handlePulse = (e: Event) => {
      const pulse = (e as CustomEvent).detail as { scheduledAgents: number };
      setSchedulerRunning(pulse.scheduledAgents > 0);
      setScheduledCount(pulse.scheduledAgents);
    };
    const handleResponding = (e: Event) => {
      const agents = (e as CustomEvent).detail;
      window.dispatchEvent(
        new CustomEvent("cabinet:agent-responding", { detail: agents })
      );
    };
    const handleSlack = (e: Event) => {
      window.dispatchEvent(new CustomEvent("cabinet:slack-refresh"));
      const data = (e as CustomEvent).detail as {
        channel?: string;
        preview?: string;
        agentEmoji?: string;
        agentName?: string;
        hasHumanMention?: boolean;
      };
      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        if (data.channel === "alerts" && data.preview) {
          new Notification("Cabinet Alert", {
            body: `${data.agentEmoji || "⚠️"} ${data.agentName || "Agent"}: ${data.preview}`,
            icon: "/favicon.ico",
            tag: `cabinet-alert-${Date.now()}`,
          });
        } else if (data.hasHumanMention && data.preview) {
          new Notification("Agent needs your attention", {
            body: `${data.agentEmoji || "🤖"} ${data.agentName || "Agent"} in #${data.channel}: ${data.preview}`,
            icon: "/favicon.ico",
            tag: `cabinet-mention-${Date.now()}`,
          });
        }
      }
    };

    window.addEventListener("cabinet:agents/agent_status", handleAgentStatus);
    window.addEventListener("cabinet:agents/pulse", handlePulse);
    window.addEventListener("cabinet:agents/agent_responding", handleResponding);
    window.addEventListener("cabinet:agents/slack_activity", handleSlack);

    // Fallback: still poll every 30s as a safety net
    const interval = setInterval(loadAgents, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("cabinet:agents/agent_status", handleAgentStatus);
      window.removeEventListener("cabinet:agents/pulse", handlePulse);
      window.removeEventListener("cabinet:agents/agent_responding", handleResponding);
      window.removeEventListener("cabinet:agents/slack_activity", handleSlack);
    };
  }, [loadAgents]);

  // Listen for Cmd+N create agent shortcut
  useEffect(() => {
    const handler = () => setCreateOpen(true);
    window.addEventListener("cabinet:create-agent", handler);
    return () => window.removeEventListener("cabinet:create-agent", handler);
  }, []);

  // Escape key closes confirmation dialog
  useEffect(() => {
    if (!confirmStart) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmStart(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmStart]);

  // Group agents by department — "general" agents are standalone
  // Filter out system agents (Editor Agent) from Mission Control
  const mcAgents = agents.filter((a) => a.slug !== "editor");
  const departments: DepartmentGroup[] = [];
  const standaloneAgents: AgentSummary[] = [];
  const deptMap = new Map<string, AgentSummary[]>();
  for (const agent of mcAgents) {
    const dept = agent.department || "general";
    if (dept === "general") {
      standaloneAgents.push(agent);
    } else {
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(agent);
    }
  }
  for (const [name, deptAgents] of deptMap) {
    departments.push({ name, agents: deptAgents });
  }
  departments.sort((a, b) => a.name.localeCompare(b.name));

  // Compute pulse metrics (exclude system agents like Editor)
  const allGoals = mcAgents.flatMap((a) => a.goals);
  const goalsWithData = allGoals.filter((g) => g.target > 0 && g.current > 0);
  const goalsOnTrack = goalsWithData.filter((g) => g.current / g.target >= 0.4).length;

  const pulseMetrics = {
    totalAgents: mcAgents.length,
    activeAgents: mcAgents.filter((a) => a.active).length,
    runningPlays: mcAgents.filter((a) => a.running).length,
    playsThisWeek: 0,
    goalsOnTrack,
    totalGoals: goalsWithData.length > 0 ? goalsWithData.length : allGoals.length,
    alerts: alertCount,
    estimatedCost: 0,
  };

  const handleSchedulerToggle = async () => {
    if (!schedulerRunning && !confirmStart) {
      setConfirmStart(true);
      return;
    }
    setConfirmStart(false);
    setSchedulerToggling(true);
    try {
      const action = schedulerRunning ? "stop-all" : "start-all";
      await fetch("/api/agents/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await loadAgents();
    } catch { /* ignore */ } finally {
      setSchedulerToggling(false);
    }
  };

  const handleAgentToggle = async (slug: string, currentlyActive: boolean) => {
    try {
      await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      await loadAgents();
    } catch { /* ignore */ }
  };

  const handleAgentClick = (slug: string) => {
    setDetailSlug(slug);
  };

  const handleAgentRun = async (slug: string) => {
    try {
      // Activate if paused
      const agent = mcAgents.find(a => a.slug === slug);
      if (agent && !agent.active) {
        await fetch(`/api/agents/personas/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle" }),
        });
      }
      // Trigger heartbeat
      await fetch(`/api/agents/personas/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
      });
      await loadAgents();
    } catch { /* ignore */ }
  };

  const handleNlCreate = async () => {
    if (!nlInput.trim()) return;
    setNlGenerating(true);
    try {
      // Use headless AI to generate agent config from description
      const res = await fetch("/api/agents/headless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: `You are a Cabinet Agent creator. Based on the following description, generate a JSON object for creating a new agent. Return ONLY valid JSON, no other text.

Description: "${nlInput.trim()}"

Return JSON with these fields:
{
  "name": "Agent Name",
  "slug": "agent-name",
  "role": "Brief role description",
  "emoji": "single emoji",
  "department": "marketing|sales|engineering|research|operations|content|support|general",
  "type": "specialist|lead",
  "body": "You are [Name]. [2-3 sentence persona description with personality and goals]"
}

Choose an appropriate department. Pick a descriptive emoji. Make the body a compelling persona prompt.`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const output = data.output || "";
        // Extract JSON from output
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const config = JSON.parse(jsonMatch[0]);
          // Create the agent
          const createRes = await fetch("/api/agents/personas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: config.slug || config.name.toLowerCase().replace(/\s+/g, "-"),
              name: config.name,
              role: config.role || "",
              emoji: config.emoji || "🤖",
              department: config.department || "general",
              type: config.type || "specialist",
              heartbeat: "0 */4 * * *",
              budget: 200,
              active: false,
              workdir: "/data",
              channels: [config.department === "general" ? "general" : config.department, "general"],
              tags: [config.department || "general"],
              focus: [],
              body: config.body || `You are ${config.name}. ${config.role}`,
            }),
          });

          if (createRes.ok) {
            setNlOpen(false);
            setNlInput("");
            loadAgents();
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setNlGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <Gauge className="h-8 w-8 mx-auto text-muted-foreground/40 animate-pulse" />
          <p className="text-[13px] text-muted-foreground">
            Loading Mission Control...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-border shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="h-5 w-5 text-primary shrink-0 hidden sm:block" />
          <div className="min-w-0">
            <h1 className="text-[14px] sm:text-[15px] font-semibold tracking-[-0.02em] truncate">
              {companyName ? `${companyName}` : "Cabinet"}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground/60 hidden sm:block">
              {companyName ? "Company OS" : "Your Company OS"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <Button
            variant={schedulerRunning ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7 text-[12px] gap-1 sm:gap-1.5",
              schedulerRunning && "bg-emerald-600 hover:bg-emerald-700 text-white"
            )}
            onClick={handleSchedulerToggle}
            disabled={schedulerToggling}
          >
            {schedulerToggling ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : schedulerRunning ? (
              <Pause className="h-3 w-3" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">
              {schedulerToggling
                ? "..."
                : schedulerRunning
                  ? `Running (${scheduledCount})`
                  : "Start Team"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px] gap-1.5 hidden md:flex"
            onClick={loadAgents}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px] gap-1.5 hidden sm:flex"
            onClick={() => setShowGallery(!showGallery)}
          >
            <FolderOpen className="h-3 w-3" />
            <span className="hidden md:inline">{t("agents:missionControl.gallery")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px] gap-1.5 hidden sm:flex"
            onClick={() => setSection({ type: "agents" })}
          >
            <BookOpen className="h-3 w-3" />
            <span className="hidden md:inline">Jobs</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-[12px] gap-1 sm:gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">{t("agents:missionControl.newAgent")}</span>
          </Button>
        </div>
      </div>

      {/* Pulse Strip */}
      <PulseStrip
        metrics={pulseMetrics}
        onAlertClick={() => {
          // Scroll to slack panel and switch to alerts channel
          window.dispatchEvent(new CustomEvent("cabinet:switch-slack-channel", { detail: "alerts" }));
        }}
        onGoalClick={() => setShowGoalSummary(!showGoalSummary)}
        onPlaybookClick={() => setSection({ type: "agents" })}
        onAgentClick={handleAgentClick}
      />

      {/* Goal Summary (toggle via pulse strip click) */}
      {showGoalSummary && (
        <div className="px-4 py-3 border-b border-border bg-muted/10 space-y-3 max-h-[200px] overflow-y-auto shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-muted-foreground">{t("agents:missionControl.allGoals")}</h3>
            <button
              onClick={() => setShowGoalSummary(false)}
              className="text-[10px] text-muted-foreground/50 hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {mcAgents.filter((a) => a.goals.length > 0).map((agent) => (
              <div key={agent.slug} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{agent.emoji}</span>
                  <span className="text-[11px] font-medium truncate">{agent.name}</span>
                </div>
                {agent.goals.map((g) => (
                  <GoalBar
                    key={g.metric}
                    label={g.metric.replace(/_/g, " ")}
                    current={g.current}
                    target={g.target}
                    unit={g.unit}
                    floor={g.floor}
                    compact
                  />
                ))}
              </div>
            ))}
            {mcAgents.filter((a) => a.goals.length > 0).length === 0 && (
              <p className="text-[11px] text-muted-foreground/50 col-span-full">{t("agents:missionControl.noGoals")}</p>
            )}
          </div>
        </div>
      )}

      {/* Main content area (agent grid + slack OR gallery) */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {showGallery ? (
          <WorkspaceGallery onClose={() => setShowGallery(false)} />
        ) : (
        <>
        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {departments.length === 0 && standaloneAgents.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Gauge className="h-12 w-12 mx-auto text-muted-foreground/20" />
              <div>
                <p className="text-[14px] font-medium text-muted-foreground">
                  No agents configured
                </p>
                <p className="text-[12px] text-muted-foreground/60">
                  Create your first agent to get started with Cabinet Agents.
                </p>
              </div>
              <Button variant="default" size="sm" className="text-[12px] gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3 w-3" />
                Create Agent
              </Button>
            </div>
          ) : (
            <>
            {/* Grid toolbar */}
            {departments.length >= 3 && (
              <div className="flex items-center justify-end mb-2">
                <button
                  onClick={() => setGridExpanded(!gridExpanded)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted/30"
                >
                  <ChevronsUpDown className="h-3 w-3" />
                  {gridExpanded ? "Collapse All" : "Expand All"}
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
              {departments.map((dept) => (
                <DepartmentCard
                  key={`${dept.name}-${gridExpanded ? "e" : "c"}`}
                  department={dept.name}
                  agents={dept.agents}
                  defaultCollapsed={!gridExpanded}
                  onAgentClick={handleAgentClick}
                  onAgentToggle={handleAgentToggle}
                  onAgentRun={handleAgentRun}
                  onViewWorkspace={(deptName) => {
                    // Find the lead agent for this department and navigate to its workspace
                    const lead = dept.agents.find((a) => a.type === "lead");
                    const slug = lead?.slug || dept.agents[0]?.slug;
                    if (slug) {
                      setSection({ type: "page" });
                      selectPage(`.agents/${slug}/workspace`);
                    }
                  }}
                />
              ))}

              {/* Standalone agents (no department) as individual cards */}
              {standaloneAgents.map((agent) => (
                <div key={agent.slug} className="border border-border rounded-xl overflow-hidden bg-card p-2">
                  <AgentCard
                    {...agent}
                    onClick={() => handleAgentClick(agent.slug)}
                    onToggle={() => handleAgentToggle(agent.slug, agent.active)}
                    onRun={() => handleAgentRun(agent.slug)}
                  />
                </div>
              ))}

              {/* Create Agent Card */}
              <div className="border border-dashed border-border/50 rounded-xl p-5 min-h-[120px] hover:border-primary/20 transition-colors">
                <div className="text-center space-y-3">
                  <Plus className="h-6 w-6 mx-auto text-muted-foreground/30" />
                  <p className="text-[14px] font-medium text-muted-foreground/70">
                    Create Agent
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="flex-1 max-w-[120px] py-2 px-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/[0.03] transition-colors text-center"
                    >
                      <Zap className="h-4 w-4 mx-auto mb-1 text-amber-500/60" />
                      <p className="text-[11px] font-medium text-muted-foreground">{t("agents:missionControl.fromScratch")}</p>
                    </button>
                    <button
                      onClick={() => {
                        setNlInput("");
                        setNlOpen(true);
                      }}
                      className="flex-1 max-w-[120px] py-2 px-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/[0.03] transition-colors text-center"
                    >
                      <MessageSquare className="h-4 w-4 mx-auto mb-1 text-primary/60" />
                      <p className="text-[11px] font-medium text-muted-foreground">{t("agents:missionControl.describeIt")}</p>
                    </button>
                    <button
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".json";
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          try {
                            const text = await file.text();
                            const bundle = JSON.parse(text);
                            const res = await fetch("/api/agents/import", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(bundle),
                            });
                            if (res.ok) {
                              loadAgents();
                            }
                          } catch { /* ignore */ }
                        };
                        input.click();
                      }}
                      className="flex-1 max-w-[120px] py-2 px-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/[0.03] transition-colors text-center"
                    >
                      <Upload className="h-4 w-4 mx-auto mb-1 text-cyan-500/60" />
                      <p className="text-[11px] font-medium text-muted-foreground">{t("agents:missionControl.import")}</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </>
          )}
        </div>

        {/* Agent Slack */}
        <SlackPanel
          height={220}
          onOpenFile={(filePath) => {
            const dataIdx = filePath.indexOf("/data/");
            if (dataIdx !== -1) {
              const relPath = filePath.slice(dataIdx + 6);
              setSection({ type: "page" });
              selectPage(relPath);
              loadPage(relPath);
            }
          }}
        />
        </>
        )}
      </div>

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadAgents}
      />

      {/* Natural language agent creation dialog */}
      {nlOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label={t("agents:missionControl.closeDialog")}
            className="fixed inset-0 bg-black/40"
            onClick={() => !nlGenerating && setNlOpen(false)}
          />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-[440px] max-w-[90vw] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h2 className="text-[15px] font-semibold">{t("agents:missionControl.describeYourAgent")}</h2>
              <p className="text-[12px] text-muted-foreground/60 mt-1">
                Tell us what you need and we&apos;ll create the agent for you.
              </p>
            </div>
            <textarea
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              placeholder={t("agents:missionControl.describePlaceholder")}
              className="w-full h-28 text-[13px] bg-muted/30 border border-border/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
              disabled={nlGenerating}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleNlCreate();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/40">
                {nlGenerating ? "Generating agent..." : "Cmd+Enter to create"}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[12px]"
                  onClick={() => setNlOpen(false)}
                  disabled={nlGenerating}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-[12px] gap-1.5"
                  onClick={handleNlCreate}
                  disabled={!nlInput.trim() || nlGenerating}
                >
                  {nlGenerating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Agent"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm start dialog */}
      {confirmStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label={t("agents:missionControl.closeDialog")}
            className="fixed inset-0 bg-black/40"
            onClick={() => setConfirmStart(false)}
          />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-[380px] max-w-[90vw] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h2 className="text-[15px] font-semibold flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-emerald-500" />
                Start All Agents?
              </h2>
              <p className="text-[12px] text-muted-foreground/60 mt-2 leading-relaxed">
                This will activate <strong>{agents.filter((a) => !a.active).length} paused agents</strong> and schedule their heartbeats.
                Agents will begin running their configured CLI providers on their configured intervals, which may use API credits.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="text-[12px]" onClick={() => setConfirmStart(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-[12px] gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSchedulerToggle}
              >
                <Power className="h-3 w-3" />
                Start Team
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailSlug && (
        <AgentDetailPanel
          slug={detailSlug}
          onClose={() => setDetailSlug(null)}
          onNavigateToAgent={(slug) => {
            setDetailSlug(null);
            setSection({ type: "agent", slug });
          }}
          onOpenFile={(filePath) => {
            // Convert absolute path to relative KB path
            const dataIdx = filePath.indexOf("/data/");
            if (dataIdx !== -1) {
              const relPath = filePath.slice(dataIdx + 6); // strip "/data/"
              setDetailSlug(null);
              setSection({ type: "page" });
              selectPage(relPath);
              loadPage(relPath);
            }
          }}
        />
      )}
    </div>
  );
}
