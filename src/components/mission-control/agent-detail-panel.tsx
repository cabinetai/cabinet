"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Pause,
  Play,
  Target,
  Zap,
  FolderOpen,
  Brain,
  Clock,
  ExternalLink,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Code,
  Globe,
  RefreshCw,
  Pencil,
  MessageSquare,
  AlertTriangle,
  Terminal,
  Download,
  Trash2,
  Inbox,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GoalBar } from "./goal-bar";
import { EditAgentDialog } from "./edit-agent-dialog";
import { cronToHuman } from "@/lib/agents/cron-utils";
import type { GoalMetric, SlackMessage } from "@/types/agents";
import { useLocale } from "@/i18n/use-locale";

interface AgentDetail {
  name: string;
  emoji: string;
  role: string;
  slug: string;
  active: boolean;
  type: string;
  department: string;
  goals: GoalMetric[];
  channels: string[];
  lastHeartbeat?: string;
  heartbeat: string;
  body: string;
}

interface HeartbeatRecord {
  agentSlug: string;
  timestamp: string;
  duration: number;
  status: "completed" | "failed";
  summary: string;
}

interface WorkspaceFile {
  name: string;
  type: "file" | "directory";
  path: string;
  modified?: string;
}

// Unified activity item for the activity feed
interface ActivityItem {
  type: "heartbeat" | "slack";
  timestamp: string;
  heartbeat?: HeartbeatRecord;
  slack?: SlackMessage;
}

interface AgentTask {
  id: string;
  fromAgent: string;
  fromEmoji?: string;
  fromName?: string;
  toAgent: string;
  channel?: string;
  title: string;
  description: string;
  kbRefs: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: string;
}

interface AgentDetailPanelProps {
  slug: string;
  onClose: () => void;
  onNavigateToAgent?: (slug: string) => void;
  onOpenFile?: (path: string) => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatUptime(firstHeartbeatStr?: string): string {
  if (!firstHeartbeatStr) return "";
  const diff = Date.now() - new Date(firstHeartbeatStr).getTime();
  if (diff < 0) return "";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Up: ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `Up: ${hours}h ${mins}m`;
  return `Up: ${mins}m`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function currentPeriodLabel(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const weekNum = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
  return `W${weekNum}`;
}

function getFileIcon(name: string) {
  if (name.endsWith(".md")) return FileText;
  if (name.endsWith(".csv") || name.endsWith(".json")) return FileSpreadsheet;
  if (name.endsWith(".py") || name.endsWith(".ts") || name.endsWith(".js")) return Code;
  if (name.endsWith(".html")) return Globe;
  return FileText;
}

export function AgentDetailPanel({ slug, onClose, onNavigateToAgent, onOpenFile }: AgentDetailPanelProps) {
  const { t } = useLocale();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [history, setHistory] = useState<HeartbeatRecord[]>([]);
  const [slackMessages, setSlackMessages] = useState<SlackMessage[]>([]);
  const [memory, setMemory] = useState<string>("");
  const [memoryFiles, setMemoryFiles] = useState<Record<string, string>>({});
  const [activeMemoryTab, setActiveMemoryTab] = useState<string>("context.md");
  const [workspace, setWorkspace] = useState<WorkspaceFile[]>([]);
  const [goalHistory, setGoalHistory] = useState<Record<string, { current: number; target: number; period_start: string; period_end: string; history: { period: string; actual: number; target: number }[] }>>({});
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "heartbeats" | "messages">("all");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    try {
      // Load agent detail, workspace, and slack messages in parallel
      const [agentRes, wsRes, slackRes] = await Promise.all([
        fetch(`/api/agents/personas/${slug}`),
        fetch(`/api/agents/personas/${slug}/workspace`),
        // Fetch messages from all channels this agent participates in
        fetch(`/api/agents/slack?limit=100`),
      ]);

      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgent(data.persona || data);
        setHistory(data.history || []);
        setGoalHistory(data.goalHistory || {});
        // Extract memory files
        const memObj = data.memory || {};
        setMemoryFiles(memObj);
        setMemory(memObj["context.md"] || memObj["notes.md"] || "");
      }

      if (wsRes.ok) {
        const data = await wsRes.json();
        setWorkspace(data.files || []);
      }

      if (slackRes.ok) {
        const data = await slackRes.json();
        // Filter to only messages from this agent
        const agentMsgs = (data.messages || []).filter(
          (m: SlackMessage) => m.agent === slug
        );
        setSlackMessages(agentMsgs.slice(-20)); // Keep last 20
      }

      // Load task inbox for this agent
      try {
        const taskRes = await fetch(`/api/agents/tasks?agent=${slug}`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTasks(taskData.tasks || []);
        }
      } catch { /* ignore */ }

    } catch { /* ignore */ }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  // Pre-load last heartbeat output for the "Last Output" section
  useEffect(() => {
    if (history.length > 0) {
      const key = `hb-${history[0].timestamp}`;
      if (!sessionOutputs[key]) {
        fetch(`/api/agents/personas/${slug}?session=${encodeURIComponent(history[0].timestamp)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.output) {
              setSessionOutputs((prev) => ({ ...prev, [key]: d.output }));
            }
          })
          .catch(() => {});
      }
    }
  }, [history, slug, sessionOutputs]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleToggleActive = async () => {
    if (!agent) return;
    setToggling(true);
    try {
      await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      await loadAll();
    } catch { /* ignore */ } finally {
      setToggling(false);
    }
  };

  const [runningHeartbeat, setRunningHeartbeat] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRunHeartbeat = async () => {
    setRunningHeartbeat(true);
    const initialHistoryLen = history.length;
    try {
      // Auto-activate if paused
      if (agent && !agent.active) {
        await fetch(`/api/agents/personas/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle" }),
        });
      }
      await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      // Poll until a new heartbeat history entry appears
      const poll = setInterval(async () => {
        await loadAll();
      }, 3000);
      // Check for completion by watching history length
      const checkDone = setInterval(() => {
        if (history.length > initialHistoryLen) {
          clearInterval(poll);
          clearInterval(checkDone);
          setRunningHeartbeat(false);
          loadAll();
        }
      }, 1000);
      // Safety timeout: 5 minutes
      setTimeout(() => {
        clearInterval(poll);
        clearInterval(checkDone);
        setRunningHeartbeat(false);
        loadAll();
      }, 300000);
    } catch {
      setRunningHeartbeat(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/agents/personas/${slug}`, { method: "DELETE" });
      if (res.ok) {
        onClose();
      }
    } catch { /* ignore */ }
  };

  const statusDot = agent?.active ? (
    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
  ) : (
    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
  );

  const statusText = agent?.active ? "Live" : "Paused";

  // Compute health from recent heartbeat history
  const recentHistory = history.slice(0, 10);
  const healthStatus = (() => {
    if (recentHistory.length === 0) return null;
    const completed = recentHistory.filter((h) => h.status === "completed").length;
    const rate = completed / recentHistory.length;
    if (rate >= 0.9) return "healthy" as const;
    if (rate >= 0.7) return "warning" as const;
    return "critical" as const;
  })();

  return (
    <>
      {/* Edit Agent Dialog */}
      <EditAgentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        slug={slug}
        onSaved={() => {
          loadAll();
        }}
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[520px] max-w-[90vw] bg-background border-l border-border z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {loading || !agent ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{agent.emoji}</span>
                  <div>
                    <h2 className="text-[16px] font-semibold tracking-[-0.02em]">
                      {agent.name}
                    </h2>
                    <p className="text-[12px] text-muted-foreground/60">
                      {agent.department !== "general" && (
                        <span className="capitalize">{agent.department} &middot; </span>
                      )}
                      {agent.type === "lead" ? "Department Lead" : "Specialist"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={() => setEditDialogOpen(true)}
                    title={t("agentDetailPanel:editConfig")}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/agents/personas/${slug}/export`);
                        if (!res.ok) return;
                        const bundle = await res.json();
                        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${slug}-agent-bundle.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch { /* ignore */ }
                    }}
                    title={t("agentDetailPanel:exportBundle")}
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={onNavigateToAgent ? () => onNavigateToAgent(slug) : undefined}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Full View
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleToggleActive}
                    disabled={toggling}
                  >
                    {agent.active ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Status strip */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                <div className="flex items-center gap-1.5">
                  {statusDot}
                  <span className={agent.active ? "text-emerald-500" : ""}>{statusText}</span>
                </div>
                <span>&middot;</span>
                <span>Heartbeat: {cronToHuman(agent.heartbeat)}</span>
                <span>&middot;</span>
                <span>Last: {timeAgo(agent.lastHeartbeat)}</span>
                {history.length > 0 && (
                  <>
                    <span>&middot;</span>
                    <span>{formatUptime(history[history.length - 1]?.timestamp)}</span>
                  </>
                )}
                {healthStatus && (
                  <>
                    <span>&middot;</span>
                    <span className={cn(
                      "flex items-center gap-1",
                      healthStatus === "healthy" && "text-emerald-500",
                      healthStatus === "warning" && "text-amber-500",
                      healthStatus === "critical" && "text-red-500"
                    )}>
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        healthStatus === "healthy" && "bg-emerald-500",
                        healthStatus === "warning" && "bg-amber-500",
                        healthStatus === "critical" && "bg-red-500"
                      )} />
                      {healthStatus === "healthy" ? "Healthy" : healthStatus === "warning" ? "Degraded" : "Unhealthy"}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* GOALS */}
              {agent.goals.length > 0 && (
                <Section icon={Target} title={t("agentDetailPanel:goals")} action={
                  <span className="text-[10px] text-muted-foreground/50 font-medium tabular-nums">
                    Period: {currentPeriodLabel()}
                  </span>
                }>
                  <div className="space-y-3">
                    {agent.goals.map((g) => {
                      const gh = goalHistory[g.metric];
                      return (
                        <GoalBar
                          key={g.metric}
                          label={g.metric.replace(/_/g, " ")}
                          current={g.current}
                          target={g.target}
                          unit={g.unit}
                          floor={g.floor}
                          history={gh?.history}
                          periodStart={gh?.period_start}
                          periodEnd={gh?.period_end}
                        />
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* WORKSPACE */}
              <Section icon={FolderOpen} title={t("agentDetailPanel:workspace")} action={
                workspace.length > 0 ? (
                  <button
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                    onClick={() => onOpenFile?.(`/data/.agents/${slug}/workspace`)}
                  >
                    Open in KB
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                ) : undefined
              }>
                {workspace.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/50">
                    No workspace files yet. Agent will create files here when it runs.
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {workspace.map((f) => {
                      const Icon = f.type === "directory" ? FolderOpen : getFileIcon(f.name);
                      return (
                        <button
                          key={f.path}
                          onClick={() => onOpenFile?.(f.path)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                            <span className="text-[12px] truncate">{f.name}</span>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* TASK INBOX */}
              <Section icon={Inbox} title={`Task Inbox${tasks.length > 0 ? ` (${tasks.filter(t => t.status === "pending" || t.status === "in_progress").length})` : ""}`}>
                {tasks.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground/50">
                    No tasks. Other agents can assign tasks via TASK_CREATE.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((task) => {
                      const StatusIcon = task.status === "completed" ? CheckCircle2
                        : task.status === "failed" ? XCircle
                        : task.status === "in_progress" ? Loader2
                        : Circle;
                      const statusColor = task.status === "completed" ? "text-emerald-400"
                        : task.status === "failed" ? "text-red-400"
                        : task.status === "in_progress" ? "text-blue-400 animate-spin"
                        : "text-muted-foreground/50";
                      const priorityLabel = task.priority <= 1 ? "P0" : task.priority <= 2 ? "P1" : task.priority <= 3 ? "P2" : "P3";
                      const priorityColor = task.priority <= 1 ? "text-red-400 bg-red-500/10"
                        : task.priority <= 2 ? "text-amber-400 bg-amber-500/10"
                        : "text-muted-foreground/50 bg-muted/30";

                      return (
                        <div
                          key={task.id}
                          className="flex items-start gap-2 py-1.5 px-2 rounded-md bg-muted/20 hover:bg-muted/30 transition-colors"
                        >
                          <StatusIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", statusColor)} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-medium truncate">{task.title}</span>
                              <span className={cn("text-[9px] px-1 py-0 rounded font-medium", priorityColor)}>
                                {priorityLabel}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground/40">
                                from {task.fromEmoji || ""} {task.fromName || task.fromAgent}
                              </span>
                              <span className="text-[10px] text-muted-foreground/30">
                                {timeAgo(task.createdAt)}
                              </span>
                            </div>
                            {task.result && (
                              <p className="text-[11px] text-emerald-400/70 mt-1">
                                Result: {task.result}
                              </p>
                            )}
                          </div>
                          {task.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] px-1.5 text-primary/60 hover:text-primary"
                              onClick={async () => {
                                await fetch("/api/agents/tasks", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    action: "update",
                                    agent: slug,
                                    taskId: task.id,
                                    status: "in_progress",
                                  }),
                                });
                                loadAll();
                              }}
                            >
                              Start
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* LIVE TERMINAL */}
              <Section icon={Terminal} title={t("agentDetailPanelPlus:liveTerminal")} action={
                <div className="flex items-center gap-2">
                  {history.length > 0 && !runningHeartbeat && (
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {history[0]?.duration ? `${Math.round(history[0].duration)}s` : ""}
                    </span>
                  )}
                  {runningHeartbeat ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => {
                        // Kill the running heartbeat by toggling agent off
                        handleToggleActive();
                        setRunningHeartbeat(false);
                      }}
                    >
                      Kill
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                      onClick={handleRunHeartbeat}
                      disabled={runningHeartbeat}
                    >
                      <Play className="h-2.5 w-2.5 mr-1" />
                      Run
                    </Button>
                  )}
                </div>
              }>
                {runningHeartbeat ? (
                  <div className="rounded-lg bg-[#0a0a0a] border border-emerald-500/20 p-3 font-mono text-[11px] leading-relaxed">
                    <div className="flex items-center gap-2 text-emerald-400 mb-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-medium">{t("agentDetailPanelPlus:runningHeartbeat")}</span>
                    </div>
                    <div className="text-[#e5e5e5]/50 space-y-1">
                      <p>$ Loading persona &amp; memory...</p>
                      <p>$ Checking goals &amp; inbox...</p>
                      <p>$ Running agent jobs &amp; heartbeat...</p>
                      <p className="text-emerald-400/60 animate-pulse">&gt; Agent is working...</p>
                    </div>
                  </div>
                ) : history.length > 0 ? (
                  <div className="rounded-lg bg-[#0a0a0a] border border-border/30 p-3 font-mono text-[11px] leading-relaxed text-[#e5e5e5] max-h-[200px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          history[0].status === "completed" ? "bg-emerald-500" : "bg-red-500"
                        )} />
                        <span>{history[0].status === "completed" ? "Completed" : "Failed"}</span>
                        <span>&middot;</span>
                        <span>{timeAgo(history[0].timestamp)}</span>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-[#e5e5e5]/80 break-words">
                      {sessionOutputs[`hb-${history[0].timestamp}`] || history[0].summary || "No output captured."}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-lg bg-[#0a0a0a] border border-border/30 p-4 text-center">
                    <Terminal className="h-5 w-5 mx-auto text-muted-foreground/20 mb-2" />
                    <p className="text-[12px] text-muted-foreground/40 mb-3">
                      No output yet. Run a heartbeat to see agent activity.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1.5"
                      onClick={handleRunHeartbeat}
                    >
                      <Play className="h-3 w-3" />
                      Run Heartbeat
                    </Button>
                  </div>
                )}
              </Section>

              {/* MEMORY */}
              <Section icon={Brain} title={t("agentDetailPanelPlus:memory")} action={
                <button
                  className="text-[10px] text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
                  onClick={() => onOpenFile?.(`/data/.agents/${slug}/.memory`)}
                >
                  View All
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              }>
                {Object.keys(memoryFiles).length > 0 ? (
                  <div className="space-y-2">
                    {/* Memory file tabs */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {Object.keys(memoryFiles).map((file) => (
                        <button
                          key={file}
                          onClick={() => setActiveMemoryTab(file)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-md transition-colors",
                            activeMemoryTab === file
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30"
                          )}
                        >
                          {file.replace(".md", "")}
                        </button>
                      ))}
                    </div>
                    {/* Content */}
                    <div className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto rounded-md bg-muted/20 p-2">
                      {memoryFiles[activeMemoryTab]
                        ? memoryFiles[activeMemoryTab].slice(0, 1000) + (memoryFiles[activeMemoryTab].length > 1000 ? "\n..." : "")
                        : "(empty)"}
                    </div>
                  </div>
                ) : memory ? (
                  <div className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-6">
                    {memory.slice(0, 500)}
                    {memory.length > 500 && "..."}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground/50">
                    No memory yet. Agent will build memory over time.
                  </p>
                )}
              </Section>

              {/* RECENT ACTIVITY (interleaved heartbeats + slack messages) */}
              <Section icon={Clock} title={t("agentDetailPanelPlus:recentActivity")} action={
                <div className="flex items-center gap-1">
                  {(["all", "heartbeats", "messages"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded transition-colors capitalize",
                        activeTab === tab
                          ? "bg-muted text-foreground font-medium"
                          : "text-muted-foreground/50 hover:text-muted-foreground"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              }>
                {(() => {
                  // Build unified activity feed
                  const items: ActivityItem[] = [];
                  if (activeTab === "all" || activeTab === "heartbeats") {
                    for (const h of history) {
                      items.push({ type: "heartbeat", timestamp: h.timestamp, heartbeat: h });
                    }
                  }
                  if (activeTab === "all" || activeTab === "messages") {
                    for (const m of slackMessages) {
                      items.push({ type: "slack", timestamp: m.timestamp, slack: m });
                    }
                  }
                  // Sort by timestamp, most recent first
                  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  const visible = items.slice(0, 15);

                  if (visible.length === 0) {
                    return (
                      <p className="text-[12px] text-muted-foreground/50">
                        No activity yet.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-1">
                      {visible.map((item, i) => {
                        if (item.type === "heartbeat" && item.heartbeat) {
                          const h = item.heartbeat;
                          const itemKey = `hb-${h.timestamp}`;
                          const isExpanded = expandedItems.has(itemKey);
                          return (
                            <button
                              key={`hb-${i}`}
                              onClick={() => {
                                setExpandedItems((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(itemKey)) next.delete(itemKey);
                                  else {
                                    next.add(itemKey);
                                    // Fetch full session output if not cached
                                    if (!sessionOutputs[itemKey]) {
                                      fetch(`/api/agents/personas/${slug}?session=${encodeURIComponent(h.timestamp)}`)
                                        .then((r) => r.json())
                                        .then((d) => {
                                          if (d.output) {
                                            setSessionOutputs((prev) => ({ ...prev, [itemKey]: d.output }));
                                          }
                                        })
                                        .catch(() => {});
                                    }
                                  }
                                  return next;
                                });
                              }}
                              className="w-full text-left flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
                            >
                              <span className="text-[10px] text-muted-foreground/50 mt-0.5 w-12 text-right shrink-0 tabular-nums">
                                {timeAgo(h.timestamp)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <Terminal className="h-3 w-3 text-muted-foreground/40" />
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full shrink-0",
                                      h.status === "completed" ? "bg-emerald-500" : "bg-red-500"
                                    )}
                                  />
                                  <span className="text-[11px] font-medium">
                                    Heartbeat
                                  </span>
                                  <span className="text-[10px] text-muted-foreground/50">
                                    {formatDuration(h.duration)}
                                  </span>
                                  <ChevronRight className={cn(
                                    "h-3 w-3 text-muted-foreground/30 transition-transform ml-auto",
                                    isExpanded && "rotate-90"
                                  )} />
                                </div>
                                <p className={cn(
                                  "text-[11px] text-muted-foreground/70 leading-relaxed",
                                  isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"
                                )}>
                                  {isExpanded
                                    ? (sessionOutputs[itemKey] || h.summary)
                                    : h.summary.slice(0, 200)}
                                </p>
                              </div>
                            </button>
                          );
                        }

                        if (item.type === "slack" && item.slack) {
                          const m = item.slack;
                          const isAlert = m.type === "alert" || m.channel === "alerts";
                          const isReport = m.type === "report";
                          return (
                            <div
                              key={`msg-${i}`}
                              className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
                            >
                              <span className="text-[10px] text-muted-foreground/50 mt-0.5 w-12 text-right shrink-0 tabular-nums">
                                {timeAgo(m.timestamp)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  {isAlert ? (
                                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                                  ) : (
                                    <MessageSquare className="h-3 w-3 text-primary/40" />
                                  )}
                                  <span className="text-[11px] font-medium">
                                    #{m.channel}
                                  </span>
                                  {isReport && (
                                    <span className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary/60 font-medium">
                                      report
                                    </span>
                                  )}
                                  {isAlert && (
                                    <span className="text-[9px] px-1 py-0 rounded bg-amber-500/10 text-amber-600 font-medium">
                                      alert
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                                  {m.content.slice(0, 200)}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  );
                })()}
              </Section>

              {/* Delete zone */}
              <div className="px-5 py-4">
                {confirmDelete ? (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-[12px] text-red-400 mb-2">
                      Delete <strong>{agent.name}</strong>? This removes the agent file and cannot be undone.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-3 w-3" />
                        Yes, Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1 text-muted-foreground/40 hover:text-red-400"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Agent
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Reusable section component
function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="px-5 py-4 border-b border-border/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground/60" />
          <h3 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
