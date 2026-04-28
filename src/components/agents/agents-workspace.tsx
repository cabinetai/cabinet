"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  Copy,
  Clock3,
  Crown,
  HeartPulse,
  Library,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationSessionView } from "@/components/agents/conversation-session-view";
import { OrgChartModal } from "@/components/cabinets/org-chart-modal";
import {
  NewRoutineDialog,
  type NewRoutineDialogAgent,
} from "@/components/agents/new-routine-dialog";
import { HeartbeatDialog } from "@/components/agents/heartbeat-dialog";
import { ScheduleView } from "@/components/tasks/board/schedule-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { HeartbeatRow, RoutineRow } from "@/components/agents/schedule-row";
import {
  appendConversationCabinetPath,
} from "@/lib/agents/conversation-identity";
import { cronToHuman } from "@/lib/agents/cron-utils";
import { SchedulePicker } from "@/components/mission-control/schedule-picker";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { openArtifactPath } from "@/lib/navigation/open-artifact-path";
import { createConversation } from "@/lib/agents/conversation-client";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import type { JobLibraryTemplate } from "@/lib/jobs/job-library";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
  CabinetOverview,
  CabinetVisibilityMode,
} from "@/types/cabinets";
import type { ConversationDetail, ConversationMeta } from "@/types/conversations";
import type { JobConfig } from "@/types/jobs";
import type { AgentListItem, ProviderInfo } from "@/types/agents";
import { flattenTree } from "@/lib/tree-utils";
import { DepthDropdown } from "@/components/cabinets/depth-dropdown";
import { ComposerInput } from "@/components/composer/composer-input";
import { NewTaskButton } from "@/components/composer/new-task-button";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  StartWorkDialog,
  WhenChip,
  type StartWorkMode,
} from "@/components/composer/start-work-dialog";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import {
  formatAdapterOptionLabel,
  getAdapterOptionsForProvider,
  getDefaultAdapterTypeForProviderInfo,
  resolveAdapterTypeForProvider,
} from "@/lib/agents/adapter-options";

type MainPanelMode = "composer" | "conversation" | "settings";
type SettingsTarget = "directory" | string | null;

interface PersonaResponse {
  persona: AgentListItem;
}

interface AgentTemplate {
  slug: string;
  name: string;
  emoji: string;
  type: string;
  department: string;
  role: string;
  description: string;
}

interface NewAgentDraft {
  name: string;
  slug: string;
  emoji: string;
  role: string;
  heartbeat: string;
  provider: string;
  adapterType?: string;
  department: string;
  type: string;
  workspace: string;
  body: string;
  active: boolean;
}

const TRIGGER_LABELS: Record<ConversationMeta["trigger"], string> = {
  manual: "Manual",
  job: "Job",
  heartbeat: "Heartbeat",
  agent: "Agent",
};

const TASK_CARD_TRIGGER_STYLES: Record<ConversationMeta["trigger"], string> = {
  manual: "bg-sky-500/12 text-sky-400 ring-1 ring-sky-500/20",
  job: "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/20",
  heartbeat: "bg-pink-500/12 text-pink-400 ring-1 ring-pink-500/20",
  agent: "bg-violet-500/12 text-violet-400 ring-1 ring-violet-500/20",
};

const STATUS_TAG_STYLES: Record<string, string> = {
  running: "bg-emerald-500/12 text-emerald-500 ring-1 ring-emerald-500/20",
  completed: "bg-emerald-500/12 text-emerald-500 ring-1 ring-emerald-500/20",
  failed: "bg-destructive/12 text-destructive ring-1 ring-destructive/20",
  cancelled: "bg-muted text-muted-foreground ring-1 ring-border",
};

const AGENT_EMOJI_OPTIONS = [
  "🤖",
  "👑",
  "📝",
  "📣",
  "📊",
  "🎨",
  "🚀",
  "🧠",
  "⚡",
  "🔧",
  "💼",
  "🔍",
];

const DEFAULT_NEW_AGENT: NewAgentDraft = {
  name: "",
  slug: "",
  emoji: "🤖",
  role: "",
  heartbeat: "0 */4 * * *",
  provider: "claude-code",
  department: "general",
  type: "specialist",
  workspace: "workspace",
  body: "",
  active: true,
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function startCase(value: string | undefined, fallback = "Not set"): string {
  if (!value) return fallback;
  const words = value
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length === 0) return fallback;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function rankAgentType(type?: string): number {
  if (type === "lead") return 0;
  if (type === "specialist") return 1;
  if (type === "support") return 2;
  return 3;
}

function sortOrgAgents(a: AgentListItem, b: AgentListItem): number {
  const typeRank = rankAgentType(a.type) - rankAgentType(b.type);
  if (typeRank !== 0) return typeRank;
  if ((b.runningCount || 0) !== (a.runningCount || 0)) {
    return (b.runningCount || 0) - (a.runningCount || 0);
  }
  if ((b.active ? 1 : 0) !== (a.active ? 1 : 0)) {
    return (b.active ? 1 : 0) - (a.active ? 1 : 0);
  }
  return a.name.localeCompare(b.name);
}

function findChiefAgent(agents: AgentListItem[]): AgentListItem | null {
  const bySlug = agents.find((agent) => agent.slug.toLowerCase() === "ceo");
  if (bySlug) return bySlug;

  const byName = agents.find((agent) => agent.name.trim().toLowerCase() === "ceo");
  if (byName) return byName;

  const byRole = agents.find((agent) =>
    agent.role.toLowerCase().includes("chief executive")
  );
  if (byRole) return byRole;

  return agents.find((agent) => agent.type === "lead") || null;
}

function isAgentWorking(agent: Pick<AgentListItem, "active" | "runningCount">): boolean {
  return !!agent.active || (agent.runningCount || 0) > 0;
}

function ActivityBeacon({
  active,
  title = "Working",
}: {
  active: boolean;
  title?: string;
}) {
  if (!active) return null;

  return (
    <span
      title={title}
      aria-label={title}
      className="relative inline-flex h-3.5 w-3.5 shrink-0"
    >
      <span className="absolute -inset-1 rounded-full border border-emerald-400/25 animate-ping [animation-duration:2.4s]" />
      <span className="absolute inset-0 rounded-full border border-emerald-400/40" />
      <span className="absolute inset-[3px] rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

function TriggerIcon({
  trigger,
  className,
}: {
  trigger: ConversationMeta["trigger"];
  className?: string;
}) {
  if (trigger === "manual") {
    return <Bot className={cn("h-3 w-3", className)} />;
  }

  if (trigger === "job") {
    return <Clock3 className={cn("h-3 w-3", className)} />;
  }

  return <HeartPulse className={cn("h-3 w-3", className)} />;
}

function blankJobDraft(
  agentSlug: string,
  provider = "claude-code",
  adapterType?: string
): JobConfig {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    enabled: true,
    schedule: "0 9 * * 1-5",
    provider,
    adapterType,
    agentSlug,
    prompt: "",
    timeout: 600,
    createdAt: now,
    updatedAt: now,
  };
}

export function AgentsWorkspace({
  selectedAgentSlug,
  selectedScope = "all",
  cabinetPath,
}: {
  selectedAgentSlug?: string | null;
  selectedScope?: "all" | "agent";
  cabinetPath?: string;
}) {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [mode, setMode] = useState<MainPanelMode>("composer");
  const [activeAgentSlug, setActiveAgentSlug] = useState<string | null>(
    selectedScope === "agent" ? selectedAgentSlug || null : null
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversationCabinetPath, setSelectedConversationCabinetPath] = useState<
    string | undefined
  >(undefined);
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>(null);
  const [settingsAgentCabinetPath, setSettingsAgentCabinetPath] = useState<string | undefined>(undefined);
  const [settingsPersona, setSettingsPersona] = useState<AgentListItem | null>(null);
  const [settingsBody, setSettingsBody] = useState("");
  const [settingsJobs, setSettingsJobs] = useState<JobConfig[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [defaultProvider, setDefaultProvider] = useState("claude-code");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDraft, setJobDraft] = useState<JobConfig | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [newAgentDraft, setNewAgentDraft] = useState<NewAgentDraft>(DEFAULT_NEW_AGENT);
  const [settingsBodyHtml, setSettingsBodyHtml] = useState("");
  const [settingsEditorDraft, setSettingsEditorDraft] = useState<AgentListItem | null>(null);
  const [settingsEditorBody, setSettingsEditorBody] = useState("");
  const [settingsEditorBodyHtml, setSettingsEditorBodyHtml] = useState("");
  const [settingsBodyMode, setSettingsBodyMode] = useState<"write" | "preview">("preview");
  const [settingsEditorOpen, setSettingsEditorOpen] = useState(false);
  const [customAgentDialogOpen, setCustomAgentDialogOpen] = useState(false);
  const [, setNewJobDialogOpen] = useState(false);
  const [, setLibraryDialogOpen] = useState(false);
  const [conversationDetailsOpen, setConversationDetailsOpen] = useState(false);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const [libraryTemplates, setLibraryTemplates] = useState<JobLibraryTemplate[]>([]);
  const [addAgentDialogOpen, setAddAgentDialogOpen] = useState(false);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [agentFlowError, setAgentFlowError] = useState<string | null>(null);
  const [loadingAgentTemplates, setLoadingAgentTemplates] = useState(false);
  const [addingAgentSlug, setAddingAgentSlug] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [quickSendAgent, setQuickSendAgent] = useState<string | null>(null);
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState<StartWorkMode>("recurring");
  const [handoffAgentSlug, setHandoffAgentSlug] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [agentJobsMap, setAgentJobsMap] = useState<Record<string, JobConfig[]>>({});
  const [orgChartJobDialog, setOrgChartJobDialog] = useState<{
    agentSlug: string;
    agentName: string;
    cabinetPath?: string;
    draft: JobConfig;
  } | null>(null);
  const [orgChartHeartbeatDialog, setOrgChartHeartbeatDialog] = useState<{
    agentSlug: string;
    agentName: string;
    cabinetPath?: string;
    heartbeat: string;
    active: boolean;
  } | null>(null);
  const [orgChartJobRunning, setOrgChartJobRunning] = useState(false);
  const [orgChartJobSaving, setOrgChartJobSaving] = useState(false);
  const [orgChartHeartbeatRunning, setOrgChartHeartbeatRunning] = useState(false);
  const [orgChartHeartbeatSaving, setOrgChartHeartbeatSaving] = useState(false);
  const lastSavedSettingsRef = useRef<string | null>(null);
  const treeNodes = useTreeStore((state) => state.nodes);
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const [orgChartOpen, setOrgChartOpen] = useState(false);
  const [scheduleFullscreen, setScheduleFullscreen] = useState(false);
  const [newRoutineIsNew, setNewRoutineIsNew] = useState(false);
  const [routineDialog, setRoutineDialog] = useState<{
    agent: NewRoutineDialogAgent;
    existingJob?: JobConfig;
  } | null>(null);
  const [heartbeatDialog, setHeartbeatDialog] = useState<{
    agent: NewRoutineDialogAgent;
    initialHeartbeat?: string;
    initialActive?: boolean;
  } | null>(null);
  const [cabinetJobs, setCabinetJobs] = useState<CabinetJobSummary[]>([]);
  const [cabinetChildren, setCabinetChildren] = useState<CabinetOverview["children"]>([]);
  const cabinetVisibilityModes = useAppStore((state) => state.cabinetVisibilityModes);
  const setCabinetVisibilityMode = useAppStore((state) => state.setCabinetVisibilityMode);
  const effectiveCabinetPath = cabinetPath || ROOT_CABINET_PATH;
  const cabinetVisibilityMode =
    cabinetVisibilityModes[effectiveCabinetPath] || "own";
  const effectiveVisibilityMode: CabinetVisibilityMode = cabinetVisibilityMode;

  const allPages = flattenTree(treeNodes);
  const settingsAgentSlug =
    settingsTarget && settingsTarget !== "directory" ? settingsTarget : null;

  // Build mentionable items for composer
  const mentionItems: MentionableItem[] = [
    ...agents.map((a) => ({
      type: "agent" as const,
      id: a.slug,
      label: a.name,
      sublabel: a.role || "",
      icon: a.emoji,
    })),
    ...allPages.map((p) => ({
      type: "page" as const,
      id: p.path,
      label: p.title,
      sublabel: p.path,
    })),
  ];

  // Shared composer hook for agent workspace panel and quick-send popup
  const submitTargetRef = useRef<string>("editor");
  const stagingClientUuid = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`,
    []
  );
  const attachments = useComposerAttachments({
    cabinetPath: effectiveCabinetPath,
    clientAttachmentId: stagingClientUuid,
  });
  const composer = useComposer({
    items: mentionItems,
    attachments,
    stagingClientUuid,
    onSubmit: async ({
      message,
      mentionedPaths: paths,
      attachmentPaths,
      stagingClientUuid: turnStagingUuid,
    }) => {
      const targetAgentSlug = submitTargetRef.current;
      const data = await createConversation({
        agentSlug: targetAgentSlug,
        userMessage: message,
        mentionedPaths: paths,
        attachmentPaths,
        stagingClientUuid: turnStagingUuid,
        cabinetPath: effectiveCabinetPath,
        ...taskRuntime,
      });
      const conversation = data.conversation as ConversationMeta;
      setQuickSendAgent(null);
      setActiveAgentSlug(targetAgentSlug);
      setSection(buildAgentSection(targetAgentSlug, effectiveCabinetPath));
      setSelectedConversationId(conversation.id);
      setSelectedConversationCabinetPath(conversation.cabinetPath || effectiveCabinetPath);
      setMode("conversation");
      await refreshConversations();
    },
  });

  const enabledCliProviders = providers.filter(
    (provider) => isAgentProviderSelectable(provider) && provider.enabled
  );
  const cliProviders = providers.filter(isAgentProviderSelectable);
  const selectableCliProviders = enabledCliProviders.length > 0
    ? enabledCliProviders
    : cliProviders.length > 0
      ? cliProviders
      : [
          {
            id: defaultProvider || "claude-code",
            name: defaultProvider || "claude-code",
            type: "cli",
            enabled: true,
            available: true,
          } as ProviderInfo,
        ];
  const newAgentAdapterOptions = getAdapterOptionsForProvider(
    providers,
    newAgentDraft.provider || defaultProvider,
    defaultProvider
  );
  const settingsEditorAdapterOptions = getAdapterOptionsForProvider(
    providers,
    settingsEditorDraft?.provider || defaultProvider,
    defaultProvider
  );
  const jobDraftAdapterOptions = getAdapterOptionsForProvider(
    providers,
    jobDraft?.provider || settingsPersona?.provider || defaultProvider,
    defaultProvider
  );

  async function refreshProviders() {
    try {
      const response = await fetch("/api/agents/providers");
      if (!response.ok) return;
      const data = await response.json();
      const nextProviders = (data.providers || []) as ProviderInfo[];
      const nextDefaultProvider = data.defaultProvider || "claude-code";
      setProviders(nextProviders);
      setDefaultProvider(nextDefaultProvider);
      setNewAgentDraft((current) => {
        const nextProvider = current.provider || nextDefaultProvider;
        return {
          ...current,
          provider: nextProvider,
          adapterType: resolveAdapterTypeForProvider(
            nextProviders,
            nextProvider,
            current.adapterType,
            nextDefaultProvider
          ),
        };
      });
      setSettingsEditorDraft((current) => {
        if (!current) return current;
        const nextProvider = current.provider || nextDefaultProvider;
        return {
          ...current,
          provider: nextProvider,
        };
      });
      setJobDraft((current) => {
        if (!current) return current;
        const nextProvider = current.provider || nextDefaultProvider;
        return {
          ...current,
          provider: nextProvider,
        };
      });
    } catch {
      // Ignore transient startup/network failures.
    }
  }

  async function refreshAgents() {
    try {
      if (effectiveCabinetPath) {
        const data = await fetchCabinetOverviewClient(
          effectiveCabinetPath,
          effectiveVisibilityMode
        );
        const cabinetAgents = (data.agents || []).map((a) => ({
          scopedId: a.scopedId,
          name: a.name,
          slug: a.slug,
          emoji: a.emoji || "🤖",
          role: a.role || "",
          active: a.active,
          type: a.type,
          department: a.department,
          heartbeat: a.heartbeat || "",
          jobCount: a.jobCount || 0,
          runningCount: 0,
          cabinetPath: a.cabinetPath,
          cabinetName: a.cabinetName,
          scope: a.scope,
          displayName: a.displayName,
          iconKey: a.iconKey,
          color: a.color,
          avatar: a.avatar,
          avatarExt: a.avatarExt,
        })) as AgentListItem[];
        setAgents(cabinetAgents);
        setCabinetJobs((data.jobs || []) as CabinetJobSummary[]);
        setCabinetChildren((data.children || []) as CabinetOverview["children"]);
        return;
      }

      const response = await fetch("/api/agents/personas");
      if (!response.ok) return;
      const data = await response.json();
      const personas = (data.personas || []) as AgentListItem[];

      const sorted = personas.sort((a, b) => {
        if (a.slug === "editor") return -1;
        if (b.slug === "editor") return 1;
        return a.name.localeCompare(b.name);
      });
      setAgents(sorted);
    } catch {
      // Ignore transient startup/network failures.
    }
  }

  async function refreshConversations() {
    try {
      const params = new URLSearchParams();
      if (activeAgentSlug) params.set("agent", activeAgentSlug);
      if (effectiveCabinetPath) {
        params.set("cabinetPath", effectiveCabinetPath);
        if (effectiveVisibilityMode !== "own") {
          params.set("visibilityMode", effectiveVisibilityMode);
        }
      }
      params.set("limit", "200");

      const response = await dedupFetch(
        `/api/agents/conversations?${params.toString()}`,
        undefined,
        { ttlMs: 1500 }
      );
      if (response.ok) {
        const data = await response.json();
        setConversations((data.conversations || []) as ConversationMeta[]);
      }
    } catch {
      // Ignore transient startup/network failures.
    }
  }

  async function deleteConversation(id: string, cabinetPath?: string) {
    try {
      const target = conversations.find(
        (conversation) =>
          conversation.id === id &&
          (conversation.cabinetPath || "") === (cabinetPath || "")
      );
      const response = await fetch(
        appendConversationCabinetPath(
          `/api/agents/conversations/${encodeURIComponent(id)}`,
          target?.cabinetPath
        ),
        { method: "DELETE" }
      );
      if (!response.ok) return;
      setConversations((prev) =>
        prev.filter(
          (conversation) =>
            !(
              conversation.id === id &&
              (conversation.cabinetPath || "") === (target?.cabinetPath || "")
            )
        )
      );
      if (
        selectedConversationId === id &&
        (selectedConversationCabinetPath || "") === (target?.cabinetPath || "")
      ) {
        setSelectedConversationId(null);
        setSelectedConversationCabinetPath(undefined);
        setSelectedConversation(null);
        setMode("composer");
      }
    } catch {
      // Ignore transient failures.
    }
  }

  async function refreshLibrary() {
    const response = await fetch("/api/jobs/library");
    if (!response.ok) return;
    const data = await response.json();
    setLibraryTemplates((data.templates || []) as JobLibraryTemplate[]);
  }

  async function refreshSettings(
    agentSlug: string,
    options?: { resetJobEditor?: boolean },
    cabinetPathOverride?: string
  ) {
    const resetJobEditor = options?.resetJobEditor ?? true;

    const resolvedCabinetPath = cabinetPathOverride ?? effectiveCabinetPath;
    const cabinetQuery = resolvedCabinetPath
      ? `?cabinetPath=${encodeURIComponent(resolvedCabinetPath)}`
      : "";
    const [personaResponse, jobsResponse] = await Promise.all([
      fetch(`/api/agents/personas/${agentSlug}${cabinetQuery}`),
      fetch(`/api/agents/${agentSlug}/jobs${cabinetQuery}`),
    ]);

    if (personaResponse.ok) {
      const data = (await personaResponse.json()) as PersonaResponse;
      setSettingsPersona(data.persona);
      setSettingsBody(data.persona.body || "");
      lastSavedSettingsRef.current = JSON.stringify({
        name: data.persona.name || "",
        emoji: data.persona.emoji || "",
        role: data.persona.role || "",
        department: data.persona.department || "",
        type: data.persona.type || "",
        heartbeat: data.persona.heartbeat || "",
        provider: data.persona.provider || "",
        adapterType: data.persona.adapterType || "",
        workspace: data.persona.workspace || "",
        body: data.persona.body || "",
      });
      // Auto-open edit dialog for agents that haven't completed initial setup
      if (!data.persona.setupComplete) {
        handleSettingsEditorOpenChange(true);
      }
    }

    if (jobsResponse.ok) {
      const data = await jobsResponse.json();
      setSettingsJobs((data.jobs || []) as JobConfig[]);
    } else {
      setSettingsJobs([]);
    }
    if (resetJobEditor) {
      setSelectedJobId(null);
      setJobDraft(null);
      setNewJobDialogOpen(false);
      setLibraryDialogOpen(false);
    }
  }

  useEffect(() => {
    void refreshConversations();
  }, [activeAgentSlug]);

  useEffect(() => {
    void refreshLibrary();
    void refreshProviders();
  }, []);

  useEffect(() => {
    void refreshAgents();
  }, [conversations]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshConversations();
      void refreshAgents();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeAgentSlug]);

  // Re-fetch when cabinet visibility mode changes (separate effect to keep dep array sizes stable)
  useEffect(() => {
    void refreshConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveVisibilityMode]);

  // Fetch jobs for all agents in parallel for the org chart display
  useEffect(() => {
    const slugs = agents;
    if (slugs.length === 0) return;
    void Promise.all(
      slugs.map((a) => {
        const jobCabinetPath = a.cabinetPath || effectiveCabinetPath;
        const query = jobCabinetPath
          ? `?cabinetPath=${encodeURIComponent(jobCabinetPath)}`
          : "";
        return fetch(`/api/agents/${a.slug}/jobs${query}`)
          .then((r) => (r.ok ? r.json() : { jobs: [] }))
          .then((d) => [a.slug, (d.jobs || []) as JobConfig[]] as const)
          .catch(() => [a.slug, [] as JobConfig[]] as const);
      })
    ).then((entries) => {
      setAgentJobsMap(Object.fromEntries(entries));
    });
  }, [agents]);

  useEffect(() => {
    const pendingConvId = section.conversationId || null;
    setActiveAgentSlug(selectedScope === "agent" ? selectedAgentSlug || null : null);
    setSelectedConversationId(pendingConvId);
    setSelectedConversationCabinetPath(pendingConvId ? section.cabinetPath : undefined);
    setSelectedConversation(null);
    setSettingsTarget(selectedScope === "agent" ? selectedAgentSlug || null : null);
    if (pendingConvId) {
      setMode("conversation");
    } else {
      setMode(selectedScope === "agent" && selectedAgentSlug ? "settings" : "composer");
    }
  }, [section.cabinetPath, section.conversationId, selectedAgentSlug, selectedScope]);

  function buildAgentSection(agentSlug: string, agentCabinetPath?: string) {
    const scopedPath = agentCabinetPath || ROOT_CABINET_PATH;
    return {
      type: "agent" as const,
      slug: agentSlug,
      cabinetPath: scopedPath,
      agentScopedId: `${scopedPath}::agent::${agentSlug}`,
    };
  }

  function buildAgentsSection(nextCabinetPath?: string) {
    return {
      type: "agents" as const,
      cabinetPath: nextCabinetPath || ROOT_CABINET_PATH,
    };
  }

  function openAgentWorkspace(target: AgentListItem | string) {
    const targetAgent =
      typeof target === "string"
        ? agents.find((agent) => agent.slug === target) || null
        : target;
    const agentSlug = typeof target === "string" ? target : target.slug;
    const agentCabinetPath =
      targetAgent?.cabinetPath || effectiveCabinetPath;

    setActiveAgentSlug(agentSlug);
    setSelectedConversationId(null);
    setSelectedConversationCabinetPath(undefined);
    setSelectedConversation(null);
    setSettingsTarget(agentSlug);
    setSettingsAgentCabinetPath(agentCabinetPath);
    setMode("settings");
    setSection(buildAgentSection(agentSlug, agentCabinetPath));
  }

  function openAgentComposer(agentSlug: string) {
    composer.reset();
    setQuickSendAgent(agentSlug);
    requestAnimationFrame(() => {
      composer.textareaRef.current?.focus();
    });
  }

  // Listen for notification toast clicks to open a specific conversation
  useEffect(() => {
    function handler(event: Event) {
      const { conversationId, agentSlug, cabinetPath: conversationCabinetPath } = (event as CustomEvent).detail as {
        conversationId: string;
        agentSlug: string;
        cabinetPath?: string;
      };
      setActiveAgentSlug(agentSlug);
      setSettingsTarget(agentSlug);
      setSelectedConversationId(conversationId);
      setSelectedConversationCabinetPath(conversationCabinetPath);
      setMode("conversation");
      setSection(buildAgentSection(agentSlug, conversationCabinetPath));
      void refreshConversations();
    }
    window.addEventListener("cabinet:open-conversation", handler);
    return () => window.removeEventListener("cabinet:open-conversation", handler);
  }, [setSection]);

  useEffect(() => {
    if (mode === "settings" && settingsAgentSlug) {
      void refreshSettings(settingsAgentSlug, { resetJobEditor: true }, settingsAgentCabinetPath);
    }
  }, [mode, settingsAgentSlug, settingsAgentCabinetPath]);

  useEffect(() => {
    if (!settingsAgentSlug) {
      setJobDraft(null);
      return;
    }

    if (!selectedJobId) {
      setJobDraft(null);
      return;
    }

    if (selectedJobId === "__new__") return;

    const existingJob = settingsJobs.find((job) => job.id === selectedJobId);
    if (existingJob) {
      setJobDraft({ ...existingJob });
      return;
    }

    setSelectedJobId(null);
    setJobDraft(null);
  }, [settingsAgentSlug, settingsJobs, selectedJobId]);

  useEffect(() => {
    if (mode !== "settings" || !settingsAgentSlug) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch("/api/ai/render-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: settingsBody }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          setSettingsBodyHtml(data?.html || "");
        })
        .catch(() => {
          setSettingsBodyHtml("");
        });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [mode, settingsAgentSlug, settingsBody]);

  useEffect(() => {
    if (!settingsEditorOpen || !settingsPersona) {
      return;
    }

    setSettingsEditorDraft({ ...settingsPersona });
    setSettingsEditorBody(settingsBody);
    setSettingsEditorBodyHtml(settingsBodyHtml);
    setSettingsBodyMode("preview");
  }, [settingsAgentSlug, settingsBody, settingsBodyHtml, settingsEditorOpen, settingsPersona]);

  useEffect(() => {
    if (!settingsEditorOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch("/api/ai/render-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: settingsEditorBody }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          setSettingsEditorBodyHtml(data?.html || "");
        })
        .catch(() => {
          setSettingsEditorBodyHtml("");
        });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [settingsAgentSlug, settingsEditorBody, settingsEditorOpen]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversation(null);
      return;
    }
  }, [selectedConversationCabinetPath, selectedConversationId, conversations]);

  useEffect(() => {
    const handler = () => { openAddAgentDialog(); };
    window.addEventListener("cabinet:open-add-agent", handler);
    return () => window.removeEventListener("cabinet:open-add-agent", handler);
  }, []);

  function openAgentSettings(agentSlug: string) {
    // Editing now lives on the detail page (`AgentDetailV2`). Route there.
    const targetAgent = agents.find((a) => a.slug === agentSlug);
    const agentCabinetPath = targetAgent?.cabinetPath || effectiveCabinetPath;
    setSection(buildAgentSection(agentSlug, agentCabinetPath));
  }

  function handleSettingsEditorOpenChange(open: boolean) {
    setSettingsEditorOpen(open);
    if (open) {
      setAgentFlowError(null);
    }
    if (!open) {
      // Mark setupComplete on close so the dialog doesn't auto-open again
      if (settingsAgentSlug && settingsPersona && !settingsPersona.setupComplete) {
        setSettingsPersona({ ...settingsPersona, setupComplete: true });
        fetch(`/api/agents/personas/${settingsAgentSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setupComplete: true, cabinetPath: effectiveCabinetPath }),
        }).catch(() => {});
      }
      setSettingsEditorDraft(null);
      setSettingsEditorBody("");
      setSettingsEditorBodyHtml("");
      setSettingsBodyMode("preview");
    }
  }

  function handleCustomAgentDialogOpenChange(open: boolean) {
    setCustomAgentDialogOpen(open);
    if (!open) {
      setNewAgentDraft({
        ...DEFAULT_NEW_AGENT,
        provider: defaultProvider || DEFAULT_NEW_AGENT.provider,
        adapterType: getDefaultAdapterTypeForProviderInfo(
          providers,
          defaultProvider || DEFAULT_NEW_AGENT.provider,
          defaultProvider
        ),
      });
      setAgentFlowError(null);
    }
  }

  function openCustomAgentDialog() {
    setAddAgentDialogOpen(false);
    setNewAgentDraft({
      ...DEFAULT_NEW_AGENT,
      provider: defaultProvider || DEFAULT_NEW_AGENT.provider,
      adapterType: getDefaultAdapterTypeForProviderInfo(
        providers,
        defaultProvider || DEFAULT_NEW_AGENT.provider,
        defaultProvider
      ),
    });
    setAgentFlowError(null);
    setCustomAgentDialogOpen(true);
  }

  async function openAddAgentDialog() {
    setAgentFlowError(null);
    if (mode !== "settings") {
      setMode("settings");
      if (!settingsTarget) {
        setSettingsTarget("directory");
      }
    }
    setAddAgentDialogOpen(true);
    if (agentTemplates.length === 0) {
      setLoadingAgentTemplates(true);
      try {
        const res = await fetch("/api/agents/library");
        if (!res.ok) {
          setAgentFlowError(
            await readErrorMessage(res, "Unable to load the agent library right now.")
          );
          return;
        }
        const data = await res.json();
        setAgentTemplates(data.templates || []);
      } catch {
        setAgentFlowError("Unable to load the agent library right now.");
      } finally {
        setLoadingAgentTemplates(false);
      }
    }
  }

  async function addAgentFromTemplate(template: AgentTemplate) {
    setAgentFlowError(null);
    setAddingAgentSlug(template.slug);
    try {
      const res = await fetch(`/api/agents/library/${template.slug}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinetPath: effectiveCabinetPath }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          // Agent already exists — just open its settings
          setAddAgentDialogOpen(false);
          await refreshAgents();
          setSection(buildAgentSection(template.slug, effectiveCabinetPath));
          openAgentSettings(template.slug);
          await refreshSettings(template.slug);
          handleSettingsEditorOpenChange(true);
          return;
        }
        setAgentFlowError(
          await readErrorMessage(res, `Unable to add ${template.name} right now.`)
        );
        return;
      }
      setAddAgentDialogOpen(false);
      await refreshAgents();
      setSection(buildAgentSection(template.slug, effectiveCabinetPath));
      openAgentSettings(template.slug);
      await refreshSettings(template.slug);
      handleSettingsEditorOpenChange(true);
    } catch {
      setAgentFlowError(`Unable to add ${template.name} right now.`);
    } finally {
      setAddingAgentSlug(null);
    }
  }

  async function saveAgentSettings() {
    if (!settingsAgentSlug || !settingsEditorDraft) {
      handleSettingsEditorOpenChange(false);
      return;
    }

    setAgentFlowError(null);
    const nextSnapshot = JSON.stringify({
      name: settingsEditorDraft.name || "",
      emoji: settingsEditorDraft.emoji || "",
      role: settingsEditorDraft.role || "",
      department: settingsEditorDraft.department || "",
      type: settingsEditorDraft.type || "",
      heartbeat: settingsEditorDraft.heartbeat || "",
      provider: settingsEditorDraft.provider || "",
      adapterType: settingsEditorDraft.adapterType || "",
      workspace: settingsEditorDraft.workspace || "",
      body: settingsEditorBody,
    });
    const needsSetupCompletion = settingsEditorDraft.setupComplete !== true;

    setSavingSettings(true);
    try {
      const payload =
        nextSnapshot === lastSavedSettingsRef.current
          ? { setupComplete: true }
          : {
              ...JSON.parse(nextSnapshot),
              setupComplete: true,
            };
      const response = await fetch(`/api/agents/personas/${settingsAgentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, cabinetPath: effectiveCabinetPath }),
      });
      if (!response.ok) {
        setAgentFlowError(
          await readErrorMessage(response, "Unable to save this agent right now.")
        );
        return;
      }
      if (!needsSetupCompletion || nextSnapshot !== lastSavedSettingsRef.current) {
        lastSavedSettingsRef.current = nextSnapshot;
      }
      setSettingsPersona({ ...settingsEditorDraft, setupComplete: true });
      setSettingsBody(settingsEditorBody);
      await refreshAgents();
      await refreshSettings(settingsAgentSlug, { resetJobEditor: false });
      handleSettingsEditorOpenChange(false);
    } catch {
      setAgentFlowError("Unable to save this agent right now.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleAgentActive() {
    if (!settingsAgentSlug) return;
    await fetch(`/api/agents/personas/${settingsAgentSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", cabinetPath: effectiveCabinetPath }),
    });
    await refreshAgents();
    await refreshSettings(settingsAgentSlug, { resetJobEditor: false });
  }

  async function runHeartbeatNow() {
    if (!settingsAgentSlug) return;
    const response = await fetch(`/api/agents/personas/${settingsAgentSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", cabinetPath: effectiveCabinetPath }),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.sessionId) {
      setActiveAgentSlug(settingsAgentSlug);
      setSection(buildAgentSection(settingsAgentSlug, effectiveCabinetPath));
      setSettingsTarget(null);
      setSelectedConversationId(data.sessionId as string);
      setSelectedConversationCabinetPath(effectiveCabinetPath);
      setMode("conversation");
      await refreshConversations();
    }
  }

  function startNewJobDraft() {
    if (!settingsAgentSlug) return;
    setSelectedJobId("__new__");
    setJobDraft(
      blankJobDraft(
        settingsAgentSlug,
        settingsPersona?.provider || defaultProvider || "claude-code",
        resolveAdapterTypeForProvider(
          providers,
          settingsPersona?.provider || defaultProvider || "claude-code",
          settingsPersona?.adapterType,
          defaultProvider
        )
      )
    );
    setNewJobDialogOpen(true);
  }

  function openJob(jobId: string) {
    setSelectedJobId(jobId);
    setNewJobDialogOpen(true);
  }

  function applyLibraryTemplate(template: JobLibraryTemplate) {
    if (!settingsAgentSlug) return;
    setSelectedJobId("__new__");
    setJobDraft({
      ...blankJobDraft(
        settingsAgentSlug,
        settingsPersona?.provider || defaultProvider || "claude-code",
        resolveAdapterTypeForProvider(
          providers,
          settingsPersona?.provider || defaultProvider || "claude-code",
          settingsPersona?.adapterType,
          defaultProvider
        )
      ),
      id: template.id,
      name: template.name,
      schedule: template.schedule,
      prompt: template.prompt,
      timeout: template.timeout || 600,
    });
    setLibraryDialogOpen(false);
    setNewJobDialogOpen(true);
  }

  function closeNewJobDialog() {
    setNewJobDialogOpen(false);
    setSelectedJobId(null);
    setJobDraft(null);
  }

  // Open the shared NewRoutineDialog for a specific agent. Create vs edit
  // is controlled by whether `existingJob` is passed. rAF defers past the
  // DropdownMenu close so base-ui focus-lock doesn't cancel the dialog open.
  function openRoutineDialog(agent: AgentListItem, existingJob?: JobConfig) {
    const next: { agent: NewRoutineDialogAgent; existingJob?: JobConfig } = {
      agent: {
        slug: agent.slug,
        name: agent.name,
        role: agent.role,
        cabinetPath: agent.cabinetPath || effectiveCabinetPath,
        provider: agent.provider,
        adapterType: agent.adapterType,
      },
      existingJob,
    };
    requestAnimationFrame(() => setRoutineDialog(next));
  }

  // Back-compat alias used by the Add-routine / Add-scheduled-job buttons.
  function openNewRoutineFor(agent: AgentListItem) {
    openRoutineDialog(agent);
  }

  async function saveJob() {
    if (!settingsAgentSlug || !jobDraft) return;
    const isNew = selectedJobId === "__new__" || !selectedJobId;
    const endpoint = isNew
      ? `/api/agents/${settingsAgentSlug}/jobs`
      : `/api/agents/${settingsAgentSlug}/jobs/${selectedJobId}`;
    const method = isNew ? "POST" : "PUT";
    setSavingJob(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...jobDraft,
          id: jobDraft.id || undefined,
          cabinetPath: effectiveCabinetPath,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      const nextJob = (data.job || jobDraft) as JobConfig;
      await refreshSettings(settingsAgentSlug, { resetJobEditor: false });
      setSelectedJobId(nextJob.id);
      if (isNew) {
        setNewJobDialogOpen(false);
      }
    } finally {
      setSavingJob(false);
    }
  }

  async function deleteJob(jobId: string) {
    if (!settingsAgentSlug) return;
    setDeletingJobId(jobId);
    try {
      const params = new URLSearchParams();
      if (effectiveCabinetPath) {
        params.set("cabinetPath", effectiveCabinetPath);
      }
      await fetch(`/api/agents/${settingsAgentSlug}/jobs/${jobId}${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "DELETE",
      });
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
        setJobDraft(null);
      }
      await refreshSettings(settingsAgentSlug, { resetJobEditor: false });
    } finally {
      setDeletingJobId(null);
    }
  }

  async function toggleJob(job: JobConfig) {
    if (!settingsAgentSlug) return;
    await fetch(`/api/agents/${settingsAgentSlug}/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", cabinetPath: effectiveCabinetPath }),
    });
    await refreshSettings(settingsAgentSlug, { resetJobEditor: false });
    await refreshConversations();
  }

  // List-row handlers for the workspace Routines/Heartbeats sections.
  // These operate across agents (not just the currently-open settings pane)
  // and update `agentJobsMap` / `agents` locally so the UI stays snappy.
  async function listRunRoutine(agent: AgentListItem, job: JobConfig) {
    const cabinetPath = agent.cabinetPath || effectiveCabinetPath;
    await fetch(`/api/agents/${agent.slug}/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", cabinetPath }),
    });
    await refreshConversations();
  }

  async function listToggleRoutine(agent: AgentListItem, job: JobConfig) {
    const cabinetPath = agent.cabinetPath || effectiveCabinetPath;
    const res = await fetch(`/api/agents/${agent.slug}/jobs/${job.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", cabinetPath }),
    });
    if (!res.ok) return;
    setAgentJobsMap((prev) => ({
      ...prev,
      [agent.slug]: (prev[agent.slug] || []).map((j) =>
        j.id === job.id ? { ...j, enabled: !j.enabled } : j
      ),
    }));
  }

  async function listDeleteRoutine(agent: AgentListItem, job: JobConfig) {
    const cabinetPath = agent.cabinetPath || effectiveCabinetPath;
    const query = cabinetPath ? `?cabinetPath=${encodeURIComponent(cabinetPath)}` : "";
    const res = await fetch(`/api/agents/${agent.slug}/jobs/${job.id}${query}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setAgentJobsMap((prev) => ({
      ...prev,
      [agent.slug]: (prev[agent.slug] || []).filter((j) => j.id !== job.id),
    }));
  }

  async function listRunHeartbeat(agent: AgentListItem) {
    const cabinetPath = agent.cabinetPath || effectiveCabinetPath;
    await fetch(`/api/agents/personas/${agent.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", cabinetPath }),
    });
    await refreshConversations();
  }

  async function listToggleHeartbeat(agent: AgentListItem) {
    const cabinetPath = agent.cabinetPath || effectiveCabinetPath;
    const nextActive = !agent.active;
    const res = await fetch(`/api/agents/personas/${agent.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heartbeat: agent.heartbeat || "",
        active: nextActive,
        cabinetPath,
      }),
    });
    if (!res.ok) return;
    setAgents((prev) =>
      prev.map((a) => (a.slug === agent.slug ? { ...a, active: nextActive } : a))
    );
  }

  async function runJob(jobId: string) {
    if (!settingsAgentSlug) return;
    setRunningJobId(jobId);
    try {
      const response = await fetch(`/api/agents/${settingsAgentSlug}/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath: effectiveCabinetPath }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.run?.id) {
        setActiveAgentSlug(settingsAgentSlug);
        setSection(buildAgentSection(settingsAgentSlug, effectiveCabinetPath));
        setSettingsTarget(null);
        setSelectedConversationId(data.run.id as string);
        setSelectedConversationCabinetPath(effectiveCabinetPath);
        setMode("conversation");
        await refreshConversations();
      }
    } finally {
      setRunningJobId(null);
    }
  }

  async function runOrgChartJob() {
    if (!orgChartJobDialog) return;
    const { agentSlug, cabinetPath, draft } = orgChartJobDialog;
    setOrgChartJobRunning(true);
    try {
      const response = await fetch(`/api/agents/${agentSlug}/jobs/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.run?.id) {
        setOrgChartJobDialog(null);
        setActiveAgentSlug(agentSlug);
        setSection(buildAgentSection(agentSlug, cabinetPath));
        setSelectedConversationId(data.run.id as string);
        setSelectedConversationCabinetPath(cabinetPath);
        setMode("conversation");
        await refreshConversations();
      }
    } finally {
      setOrgChartJobRunning(false);
    }
  }

  async function saveOrgChartJob() {
    if (!orgChartJobDialog) return;
    const { agentSlug, cabinetPath, draft } = orgChartJobDialog;
    const isCreating = newRoutineIsNew || !draft.id;
    setOrgChartJobSaving(true);
    try {
      const query = cabinetPath ? `?cabinetPath=${encodeURIComponent(cabinetPath)}` : "";
      const url = isCreating
        ? `/api/agents/${agentSlug}/jobs${query}`
        : `/api/agents/${agentSlug}/jobs/${draft.id}${query}`;
      const response = await fetch(url, {
        method: isCreating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) return;
      let savedDraft = draft;
      if (isCreating) {
        try {
          const data = await response.json();
          if (data?.job) savedDraft = data.job;
        } catch {
          // fall back to draft
        }
      }
      setOrgChartJobDialog(null);
      setNewRoutineIsNew(false);
      setAgentJobsMap((prev) => ({
        ...prev,
        [agentSlug]: isCreating
          ? [...(prev[agentSlug] || []), savedDraft]
          : (prev[agentSlug] || []).map((j) =>
              j.id === draft.id ? savedDraft : j
            ),
      }));
    } finally {
      setOrgChartJobSaving(false);
    }
  }

  async function runOrgChartHeartbeat() {
    if (!orgChartHeartbeatDialog) return;
    const { agentSlug, cabinetPath } = orgChartHeartbeatDialog;
    setOrgChartHeartbeatRunning(true);
    try {
      const response = await fetch(`/api/agents/personas/${agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", cabinetPath }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.sessionId) {
        setOrgChartHeartbeatDialog(null);
        setActiveAgentSlug(agentSlug);
        setSection(buildAgentSection(agentSlug, cabinetPath));
        setSelectedConversationId(data.sessionId as string);
        setSelectedConversationCabinetPath(cabinetPath);
        setMode("conversation");
        await refreshConversations();
      }
    } finally {
      setOrgChartHeartbeatRunning(false);
    }
  }

  async function saveOrgChartHeartbeat() {
    if (!orgChartHeartbeatDialog) return;
    const { agentSlug, cabinetPath, heartbeat, active } = orgChartHeartbeatDialog;
    setOrgChartHeartbeatSaving(true);
    try {
      const response = await fetch(`/api/agents/personas/${agentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heartbeat, active, cabinetPath }),
      });
      if (!response.ok) return;
      setOrgChartHeartbeatDialog(null);
      await refreshAgents();
    } finally {
      setOrgChartHeartbeatSaving(false);
    }
  }

  async function createAgent() {
    const slug = slugify(newAgentDraft.slug || newAgentDraft.name);
    if (!newAgentDraft.name.trim() || !newAgentDraft.role.trim() || !slug) return;

    setAgentFlowError(null);
    if (agents.some((agent) => agent.slug === slug)) {
      handleCustomAgentDialogOpenChange(false);
      setSection(buildAgentSection(slug, effectiveCabinetPath));
      openAgentSettings(slug);
      await refreshSettings(slug);
      handleSettingsEditorOpenChange(true);
      return;
    }

    setCreatingAgent(true);
    try {
      const response = await fetch("/api/agents/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: newAgentDraft.name.trim(),
          role: newAgentDraft.role.trim(),
          emoji: newAgentDraft.emoji,
          department: newAgentDraft.department,
          type: newAgentDraft.type,
          heartbeat: newAgentDraft.heartbeat,
          workspace: newAgentDraft.workspace || "workspace",
          provider: newAgentDraft.provider,
          adapterType: newAgentDraft.adapterType,
          budget: 100,
          active: newAgentDraft.active,
          workdir: "/data",
          focus: [],
          tags: [newAgentDraft.department],
          channels:
            newAgentDraft.department === "general"
              ? ["general"]
              : [newAgentDraft.department, "general"],
          body:
            newAgentDraft.body.trim() ||
            `You are ${newAgentDraft.name.trim()}. ${newAgentDraft.role.trim()}`,
          cabinetPath: effectiveCabinetPath,
        }),
      });

      if (!response.ok) {
        setAgentFlowError(
          await readErrorMessage(response, "Unable to create this agent right now.")
        );
        return;
      }
      handleCustomAgentDialogOpenChange(false);
      await refreshAgents();
      setSection(buildAgentSection(slug, effectiveCabinetPath));
      openAgentSettings(slug);
      await refreshSettings(slug);
      handleSettingsEditorOpenChange(true);
    } catch {
      setAgentFlowError("Unable to create this agent right now.");
    } finally {
      setCreatingAgent(false);
    }
  }

  async function deleteAgent() {
    if (!settingsAgentSlug) return;
    setDeletingAgent(true);
    try {
      const params = new URLSearchParams();
      if (effectiveCabinetPath) {
        params.set("cabinetPath", effectiveCabinetPath);
      }
      const response = await fetch(
        `/api/agents/personas/${settingsAgentSlug}${params.toString() ? `?${params.toString()}` : ""}`,
        {
        method: "DELETE",
        }
      );
      if (!response.ok) return;
      if (activeAgentSlug === settingsAgentSlug) {
        setActiveAgentSlug(null);
        setSection(buildAgentsSection(effectiveCabinetPath));
      }
      setSelectedConversationId(null);
      setSelectedConversationCabinetPath(undefined);
      setSelectedConversation(null);
      setSettingsTarget("directory");
      setSettingsAgentCabinetPath(undefined);
      setSettingsPersona(null);
      setSettingsBody("");
      handleSettingsEditorOpenChange(false);
      setSettingsJobs([]);
      setSelectedJobId(null);
      setJobDraft(null);
      await refreshAgents();
      await refreshConversations();
    } finally {
      setDeletingAgent(false);
    }
  }

  const selectedConversationMeta = conversations.find(
    (conversation) =>
      conversation.id === selectedConversationId &&
      (conversation.cabinetPath || "") === (selectedConversationCabinetPath || "")
  );
  const activeSelectedConversation =
    selectedConversation &&
    selectedConversationMeta &&
    selectedConversation.meta.id === selectedConversationMeta.id &&
    (selectedConversation.meta.cabinetPath || "") ===
      (selectedConversationMeta.cabinetPath || "")
      ? selectedConversation
      : null;
  const activeConversationMeta =
    activeSelectedConversation?.meta || selectedConversationMeta || null;
  const settingsAgent = settingsAgentSlug
    ? agents.find((agent) => agent.slug === settingsAgentSlug) || null
    : null;
  const selectedConversationDebugText = activeConversationMeta
    ? [
        `Conversation ID: ${activeConversationMeta.id}`,
        `Title: ${activeConversationMeta.title}`,
        `Agent: ${activeConversationMeta.agentSlug}`,
        `Trigger: ${activeConversationMeta.trigger}`,
        `Status: ${activeConversationMeta.status}`,
        `Job ID: ${activeConversationMeta.jobId || "Not available"}`,
        `Job name: ${activeConversationMeta.jobName || "Not available"}`,
        `Started at: ${formatTimestamp(activeConversationMeta.startedAt)}`,
        `Completed at: ${formatTimestamp(activeConversationMeta.completedAt)}`,
        `Exit code: ${activeConversationMeta.exitCode ?? "Not available"}`,
        `Prompt path: ${activeConversationMeta.promptPath}`,
        `Transcript path: ${activeConversationMeta.transcriptPath}`,
        `Mentioned paths: ${activeConversationMeta.mentionedPaths.join(", ") || "None"}`,
        `Artifact paths: ${activeConversationMeta.artifactPaths.join(", ") || "None"}`,
      ].join("\n")
    : "";
  const groupedAgentTemplates = Object.entries(
    agentTemplates.reduce<Record<string, AgentTemplate[]>>((acc, template) => {
      const department = template.department || "general";
      if (!acc[department]) acc[department] = [];
      acc[department].push(template);
      return acc;
    }, {})
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([department, templates]) => [
      department,
      [...templates].sort((left, right) => left.name.localeCompare(right.name)),
    ] as const);
  const settingsDirty = !!settingsEditorDraft && JSON.stringify({
    name: settingsEditorDraft.name || "",
    emoji: settingsEditorDraft.emoji || "",
    role: settingsEditorDraft.role || "",
    department: settingsEditorDraft.department || "",
    type: settingsEditorDraft.type || "",
    heartbeat: settingsEditorDraft.heartbeat || "",
    provider: settingsEditorDraft.provider || "",
    adapterType: settingsEditorDraft.adapterType || "",
    workspace: settingsEditorDraft.workspace || "",
    body: settingsEditorBody,
  }) !== lastSavedSettingsRef.current;
  const canSaveSettings = !!settingsEditorDraft && (
    settingsDirty || settingsEditorDraft.setupComplete !== true
  );
  const chiefAgent = findChiefAgent(agents);
  const orgRoot = chiefAgent || {
    name: "CEO",
    slug: "__ceo_fallback__",
    emoji: "👑",
    role: "Executive lead not configured yet",
    department: "executive",
    type: "lead",
    active: false,
    runningCount: 0,
  };
  const orgAgents = agents
    .filter((agent) => agent.slug !== orgRoot.slug)
    .sort(sortOrgAgents);
  const groupedOrgAgents = Object.entries(
    orgAgents.reduce<Record<string, AgentListItem[]>>((acc, agent) => {
      const department = agent.department || "general";
      if (!acc[department]) {
        acc[department] = [];
      }
      acc[department].push(agent);
      return acc;
    }, {})
  )
    .sort(([left], [right]) => {
      if (left === "general") return 1;
      if (right === "general") return -1;
      return startCase(left).localeCompare(startCase(right));
    })
    .map(([department, departmentAgents]) => ({
      department,
      label: startCase(department, "General"),
      agents: departmentAgents.sort(sortOrgAgents),
    }));
  const orgAgentCount = orgAgents.length + (chiefAgent ? 1 : 0);
  const activeOrgCount =
    orgAgents.filter((agent) => agent.active || (agent.runningCount || 0) > 0).length +
    (orgRoot.active || (orgRoot.runningCount || 0) > 0 ? 1 : 0);

  // Flat list of every job across every agent, paired with its owner — drives
  // the Schedules > Jobs table on the workspace page.
  const allJobs = useMemo(() => {
    const list: Array<{ job: JobConfig; agent: AgentListItem }> = [];
    for (const agent of agents) {
      for (const job of agentJobsMap[agent.slug] || []) {
        list.push({ job, agent });
      }
    }
    // Sort alphabetically by agent name, then job name.
    list.sort((a, b) => {
      const byAgent = a.agent.name.localeCompare(b.agent.name);
      if (byAgent !== 0) return byAgent;
      return a.job.name.localeCompare(b.job.name);
    });
    return list;
  }, [agents, agentJobsMap]);

  // Adapt the workspace's `AgentListItem[]` to the `CabinetAgentSummary[]` shape
  // expected by the cabinet-page-shared `ActivityFeed` and `OrgChartModal`.
  // Missing fields get safe defaults — the consumers only read identity
  // (slug, name, emoji, color, iconKey) and a handful of optionals.
  const cabinetAgentsView: CabinetAgentSummary[] = useMemo(
    () =>
      agents.map((a) => ({
        scopedId: a.scopedId ?? `${a.cabinetPath || effectiveCabinetPath}::agent::${a.slug}`,
        name: a.name,
        slug: a.slug,
        emoji: a.emoji,
        role: a.role,
        active: a.active,
        department: a.department,
        type: a.type,
        heartbeat: a.heartbeat,
        workspace: a.workspace,
        jobCount: a.jobCount ?? 0,
        taskCount: 0,
        cabinetPath: a.cabinetPath || effectiveCabinetPath,
        cabinetName: a.cabinetName || "",
        cabinetDepth: 0,
        inherited: false,
        displayName: a.displayName,
        iconKey: a.iconKey,
        color: a.color,
        avatar: a.avatar,
        avatarExt: a.avatarExt,
      })),
    [agents, effectiveCabinetPath]
  );

  function renderOrgChartHeader() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h3 className="text-[15px] font-semibold">Your Team Org Chart</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
              <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Agents
              </span>
              <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold text-background">
                {orgAgentCount}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5">
              <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Departments
              </span>
              <span className="rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                {groupedOrgAgents.length}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5">
              <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Active
              </span>
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                {activeOrgCount}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DepthDropdown
            mode={effectiveVisibilityMode}
            onChange={(mode) => {
              if (effectiveCabinetPath) {
                setCabinetVisibilityMode(effectiveCabinetPath, mode);
              }
            }}
          />
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={openAddAgentDialog}>
            <Plus className="h-3.5 w-3.5" />
            Add agent
          </Button>
        </div>
      </div>
    );
  }

  function renderOrganizationChart() {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-[30px] bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.55)_1px,transparent_0)] [background-size:22px_22px] p-4 sm:p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => {
                  if (chiefAgent) {
                    openAgentWorkspace(chiefAgent.slug);
                  }
                }}
                disabled={!chiefAgent}
                className={cn(
                  "group relative w-full max-w-lg overflow-hidden rounded-[26px] px-4 py-4 text-left transition",
                  chiefAgent
                    ? "bg-primary/[0.08] hover:-translate-y-0.5 hover:bg-primary/[0.11]"
                    : "bg-card"
                )}
              >
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <ActivityBeacon active={isAgentWorking(orgRoot)} />
                  {chiefAgent ? (
                    <div
                      role="button"
                      tabIndex={0}
                      title={`Send task to ${orgRoot.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openAgentComposer(chiefAgent.slug);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          event.preventDefault();
                          openAgentComposer(chiefAgent.slug);
                        }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/70 text-primary opacity-0 transition-all hover:bg-primary/10 group-hover:opacity-100"
                    >
                      <Send className="h-4 w-4" />
                    </div>
                  ) : null}
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/70 text-primary">
                    <Crown className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-background/75 text-[26px]">
                    {orgRoot.emoji || "👑"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-2 rounded-full bg-background/72 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                      <Crown className="h-3 w-3" />
                      CEO
                    </div>
                    <h5 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-foreground">
                      {orgRoot.name}
                    </h5>
                    <p className="mt-0.5 text-[13px] text-foreground/85">
                      {orgRoot.role || "Chief Executive Officer"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {orgRoot.heartbeat && chiefAgent ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrgChartHeartbeatDialog({
                          agentSlug: chiefAgent.slug,
                          agentName: chiefAgent.name,
                          cabinetPath: chiefAgent.cabinetPath,
                          heartbeat: orgRoot.heartbeat!,
                          active: orgRoot.active,
                        });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setOrgChartHeartbeatDialog({ agentSlug: chiefAgent.slug, agentName: chiefAgent.name, cabinetPath: chiefAgent.cabinetPath, heartbeat: orgRoot.heartbeat!, active: orgRoot.active }); } }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-background/72 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-pink-500/15 hover:text-pink-300"
                    >
                      <HeartPulse className="h-2.5 w-2.5 text-pink-400" />
                      {cronToHuman(orgRoot.heartbeat)}
                    </div>
                  ) : null}
                  {(agentJobsMap[orgRoot.slug] || []).slice(0, 3).map((job) => (
                    <div
                      key={job.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (chiefAgent) setOrgChartJobDialog({ agentSlug: chiefAgent.slug, agentName: chiefAgent.name, cabinetPath: chiefAgent.cabinetPath, draft: { ...job } });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); if (chiefAgent) setOrgChartJobDialog({ agentSlug: chiefAgent.slug, agentName: chiefAgent.name, cabinetPath: chiefAgent.cabinetPath, draft: { ...job } }); } }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-background/72 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-300"
                    >
                      <Clock3 className="h-2.5 w-2.5 text-emerald-400" />
                      {job.name}
                    </div>
                  ))}
                  {(agentJobsMap[orgRoot.slug] || []).length > 3 ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{(agentJobsMap[orgRoot.slug] || []).length - 3} more
                    </span>
                  ) : null}
                </div>
              </button>

              <div className="mt-3 hidden h-12 w-full max-w-4xl md:block">
                <div className="relative mx-auto h-7 w-px overflow-visible">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-primary/[0.03] via-primary/[0.11] to-primary/[0.025]" />
                  <div className="absolute inset-x-[-3px] inset-y-0 rounded-full bg-gradient-to-b from-primary/0 via-primary/[0.07] to-primary/0 blur-[4px]" />
                </div>
                <div className="relative mx-auto h-px w-[82%] overflow-visible rounded-full">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/0 via-primary/[0.11] to-primary/0" />
                  <div className="absolute inset-x-[10%] inset-y-[-3px] rounded-full bg-gradient-to-r from-transparent via-primary/[0.06] to-transparent blur-[5px]" />
                </div>
              </div>
            </div>

            {groupedOrgAgents.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {groupedOrgAgents.map((group) => {
                  const leadCount = group.agents.filter((agent) => agent.type === "lead").length;

                  return (
                    <div key={group.department} className="relative pt-3">
                      <div className="absolute left-1/2 top-0 hidden h-3 w-px -translate-x-1/2 overflow-visible md:block">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-primary/[0.03] via-primary/[0.1] to-primary/[0.025]" />
                        <div className="absolute inset-x-[-3px] inset-y-0 rounded-full bg-gradient-to-b from-primary/0 via-primary/[0.06] to-primary/0 blur-[4px]" />
                      </div>
                      <section className="relative h-full rounded-[26px] bg-primary/[0.08] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h5 className="text-[16px] font-semibold tracking-[-0.03em] text-foreground">
                              {group.label}
                            </h5>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {group.agents.length} {group.agents.length === 1 ? "agent" : "agents"}
                            </p>
                          </div>
                          {leadCount > 0 ? (
                            <div className="rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                              {`${leadCount} lead`}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 space-y-2.5">
                          {group.agents.map((agent) => (
                            <button
                              key={agent.cabinetPath ? `${agent.cabinetPath}::${agent.slug}` : agent.slug}
                              type="button"
                              onClick={() => openAgentWorkspace(agent.slug)}
                              className="group w-full rounded-2xl bg-background/72 p-3 text-left transition hover:-translate-y-0.5 hover:bg-background/84"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/78 text-[22px]">
                                  {agent.emoji || "🤖"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-[13px] font-semibold text-foreground">
                                          {agent.name}
                                        </p>
                                        <ActivityBeacon active={isAgentWorking(agent)} />
                                      </div>
                                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                                        {agent.role || "Role not set"}
                                      </p>
                                    </div>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      title={`Send task to ${agent.name}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openAgentComposer(agent.slug);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.stopPropagation();
                                          event.preventDefault();
                                          openAgentComposer(agent.slug);
                                        }
                                      }}
                                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all hover:bg-primary/10 group-hover:opacity-100"
                                    >
                                      <Send className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    {agent.heartbeat ? (
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOrgChartHeartbeatDialog({ agentSlug: agent.slug, agentName: agent.name, cabinetPath: agent.cabinetPath, heartbeat: agent.heartbeat!, active: agent.active });
                                        }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setOrgChartHeartbeatDialog({ agentSlug: agent.slug, agentName: agent.name, cabinetPath: agent.cabinetPath, heartbeat: agent.heartbeat!, active: agent.active }); } }}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-background/76 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-pink-500/15 hover:text-pink-300"
                                      >
                                        <HeartPulse className="h-2.5 w-2.5 text-pink-400" />
                                        {cronToHuman(agent.heartbeat)}
                                      </div>
                                    ) : null}
                                    {(agentJobsMap[agent.slug] || []).slice(0, 2).map((job) => (
                                      <div
                                        key={job.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOrgChartJobDialog({ agentSlug: agent.slug, agentName: agent.name, cabinetPath: agent.cabinetPath, draft: { ...job } });
                                        }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setOrgChartJobDialog({ agentSlug: agent.slug, agentName: agent.name, cabinetPath: agent.cabinetPath, draft: { ...job } }); } }}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-background/76 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-300"
                                      >
                                        <Clock3 className="h-2.5 w-2.5 text-emerald-400" />
                                        {job.name}
                                      </div>
                                    ))}
                                    {(agentJobsMap[agent.slug] || []).length > 2 ? (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{(agentJobsMap[agent.slug] || []).length - 2} more
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[26px] bg-card p-6 text-center text-[13px] text-muted-foreground">
                Add more agents to start populating departments under the CEO.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderSettingsComposerPanel(agentSlug: string) {
    const panelAgent = agents.find((agent) => agent.slug === agentSlug) || null;
    submitTargetRef.current = agentSlug;

    return (
      <ComposerInput
        composer={composer}
        attachments={attachments}
        placeholder={`Ask ${panelAgent?.name || agentSlug} to work on something. Type @ to mention pages or agents.`}
        submitLabel="Start"
        variant="card"
        items={mentionItems}
        autoFocus
        topRightOverlay={
          <WhenChip
            mode="now"
            onChange={(next) => {
              if (next === "now") return;
              setHandoffAgentSlug(agentSlug);
              setHandoffMode(next);
              setHandoffOpen(true);
            }}
          />
        }
        actionsStart={
          <TaskRuntimePicker
            value={taskRuntime}
            onChange={setTaskRuntime}
          />
        }
      />
    );
  }

  async function copyConversationDetails() {
    if (!selectedConversationDebugText) return;
    await navigator.clipboard.writeText(selectedConversationDebugText);
    setDetailsCopied(true);
    window.setTimeout(() => setDetailsCopied(false), 1500);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === "conversation" && activeConversationMeta ? (
          <div className="flex h-full min-h-0 flex-col">
            <Dialog open={conversationDetailsOpen} onOpenChange={setConversationDetailsOpen}>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <div className="flex items-center justify-between gap-3 pr-10">
                    <DialogTitle>Job Details</DialogTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => void copyConversationDetails()}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {detailsCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </DialogHeader>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground">
                    {selectedConversationDebugText}
                  </pre>
                </div>
              </DialogContent>
            </Dialog>
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">
                  {agents.find((agent) => agent.slug === activeConversationMeta.agentSlug)?.emoji || "🤖"}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-[15px] font-semibold">{activeConversationMeta.title}</h3>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => openAgentSettings(activeConversationMeta.agentSlug)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Bot className="h-2.5 w-2.5" />
                      {activeConversationMeta.agentSlug}
                    </button>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        TASK_CARD_TRIGGER_STYLES[activeConversationMeta.trigger]
                      )}
                    >
                      <TriggerIcon trigger={activeConversationMeta.trigger} className="h-2.5 w-2.5" />
                      {TRIGGER_LABELS[activeConversationMeta.trigger]}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_TAG_STYLES[activeConversationMeta.status] || "bg-muted text-muted-foreground ring-1 ring-border"
                      )}
                    >
                      {activeConversationMeta.status}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {activeConversationMeta.trigger === "job" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-[11px] text-muted-foreground"
                      onClick={() => openAgentSettings(activeConversationMeta.agentSlug)}
                    >
                      <Settings className="h-3 w-3" />
                      Settings
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-muted-foreground"
                    onClick={() => setConversationDetailsOpen(true)}
                  >
                    <Copy className="h-3 w-3" />
                    Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      void deleteConversation(
                        activeConversationMeta.id,
                        activeConversationMeta.cabinetPath
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ConversationSessionView
                conversation={activeConversationMeta}
                onDetailChange={setSelectedConversation}
                onOpenArtifact={(artifactPath) => {
                  void openArtifactPath(
                    artifactPath,
                    effectiveCabinetPath
                      ? {
                          type: "page",
                          cabinetPath: effectiveCabinetPath,
                        }
                      : { type: "page" }
                  );
                }}
                waitingLabel="Waiting for conversation detail..."
              />
            </div>
          </div>
        ) : mode === "settings" ? (
          <div className="flex h-full min-h-0 flex-col">

            {settingsTarget === "directory" || !settingsTarget ? (
              <div className="border-b border-border px-5 py-4">
                {renderOrgChartHeader()}
              </div>
            ) : null}
            {settingsPersona ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{settingsAgent?.emoji || "🤖"}</span>
                      <h3 className="text-[15px] font-semibold">
                        {settingsAgent?.name || "Agent settings"}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => handleSettingsEditorOpenChange(true)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Edit agent
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={runHeartbeatNow}>
                        <Zap className="h-3.5 w-3.5" />
                        Run heartbeat
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={toggleAgentActive}>
                        {settingsPersona.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {settingsPersona.active ? "Pause" : "Activate"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-wrap gap-2">
                    <div className="overflow-hidden rounded-lg bg-muted/60 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Role</div>
                      <div className="min-w-0 break-words text-[12px] leading-tight text-foreground line-clamp-2">
                        {settingsPersona.role || "Not set"}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-muted/60 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Department</div>
                      <div className="min-w-0 break-words text-[12px] leading-tight text-foreground line-clamp-2">
                        {settingsPersona.department || "Not set"}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-muted/60 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Type</div>
                      <div className="min-w-0 break-words text-[12px] leading-tight text-foreground line-clamp-2">
                        {settingsPersona.type || "Not set"}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-muted/60 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Heartbeat</div>
                      <div className="min-w-0 break-words text-[12px] leading-tight text-foreground line-clamp-2">
                        {settingsPersona.heartbeat ? cronToHuman(settingsPersona.heartbeat) : "Not set"}
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-muted/60 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5">Workspace</div>
                      <div className="min-w-0 break-all font-mono text-[12px] leading-tight text-foreground line-clamp-2">
                        {settingsPersona.workspace || "Not set"}
                      </div>
                    </div>
                  </div>
                </div>

                <Dialog open={settingsEditorOpen} onOpenChange={handleSettingsEditorOpenChange}>
                  <DialogContent className="sm:max-w-5xl">
                    <DialogHeader className="gap-1">
                      <DialogTitle>Edit Agent</DialogTitle>
                      <DialogDescription>
                        Review the live agent, make your changes here, and save when you are ready.
                      </DialogDescription>
                      {agentFlowError ? (
                        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {agentFlowError}
                        </p>
                      ) : null}
                    </DialogHeader>
                    {settingsEditorDraft ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                              Instructions
                            </span>
                            <div className="flex rounded-lg bg-muted/60 p-0.5">
                              <button
                                type="button"
                                onClick={() => setSettingsBodyMode("write")}
                                className={cn(
                                  "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                                  settingsBodyMode === "write"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Write
                              </button>
                              <button
                                type="button"
                                onClick={() => setSettingsBodyMode("preview")}
                                className={cn(
                                  "rounded-md px-2.5 py-1 text-[11px] transition-colors",
                                  settingsBodyMode === "preview"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Preview
                              </button>
                            </div>
                          </div>
                          {settingsBodyMode === "write" ? (
                            <textarea
                              value={settingsEditorBody}
                              onChange={(event) => setSettingsEditorBody(event.target.value)}
                              className="h-[60vh] w-full resize-none rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                              placeholder="Write markdown for this agent's instructions."
                            />
                          ) : (
                            <div className="h-[60vh] overflow-auto rounded-lg bg-muted/60 px-3 py-3">
                              {settingsEditorBodyHtml ? (
                                <div
                                  className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-base prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-p:text-foreground/85 prose-li:text-[12px] prose-li:text-foreground/85 prose-a:text-foreground prose-code:text-[11px] prose-code:text-foreground prose-code:bg-background prose-code:px-1 prose-code:rounded prose-pre:bg-background prose-pre:border-0 prose-pre:text-foreground prose-strong:text-foreground"
                                  dangerouslySetInnerHTML={{ __html: settingsEditorBodyHtml }}
                                />
                              ) : settingsEditorBody.trim() ? (
                                <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                                  {settingsEditorBody}
                                </pre>
                              ) : (
                                <div className="text-[12px] text-muted-foreground">
                                  Nothing to preview yet.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid content-start gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Name</span>
                            <input
                              value={settingsEditorDraft.name || ""}
                              onChange={(event) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, name: event.target.value })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                            />
                          </label>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Role</span>
                            <input
                              value={settingsEditorDraft.role || ""}
                              onChange={(event) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, role: event.target.value })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                            />
                          </label>
                          <div className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Heartbeat</span>
                            <SchedulePicker
                              value={settingsEditorDraft.heartbeat || "0 */4 * * *"}
                              onChange={(cron) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, heartbeat: cron })
                              }
                            />
                          </div>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Department</span>
                            <input
                              value={settingsEditorDraft.department || ""}
                              onChange={(event) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, department: event.target.value })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                            />
                          </label>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Type</span>
                            <input
                              value={settingsEditorDraft.type || ""}
                              onChange={(event) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, type: event.target.value })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                            />
                          </label>
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                            <span>Provider</span>
                            <select
                              value={settingsEditorDraft.provider || defaultProvider}
                              onChange={(event) =>
                                setSettingsEditorDraft({
                                  ...settingsEditorDraft,
                                  provider: event.target.value,
                                  adapterType: resolveAdapterTypeForProvider(
                                    providers,
                                    event.target.value,
                                    undefined,
                                    defaultProvider
                                  ),
                                })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:bg-muted"
                            >
                              {selectableCliProviders.map((provider) => (
                                <option key={provider.id} value={provider.id}>
                                  {provider.name}{provider.available ? "" : " (not installed)"}
                                </option>
                              ))}
                            </select>
                          </label>
                          {settingsEditorAdapterOptions.length > 0 ? (
                            <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                              <span>Runtime</span>
                              <select
                                value={
                                  settingsEditorDraft.adapterType ||
                                  getDefaultAdapterTypeForProviderInfo(
                                    providers,
                                    settingsEditorDraft.provider || defaultProvider,
                                    defaultProvider
                                  ) ||
                                  ""
                                }
                                onChange={(event) =>
                                  setSettingsEditorDraft({
                                    ...settingsEditorDraft,
                                    adapterType: event.target.value,
                                  })
                                }
                                className="w-full rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:bg-muted"
                              >
                                {settingsEditorAdapterOptions.map((adapter) => (
                                  <option key={adapter.type} value={adapter.type}>
                                    {formatAdapterOptionLabel(adapter)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label className="space-y-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                            <span>Workspace</span>
                            <input
                              value={settingsEditorDraft.workspace || ""}
                              onChange={(event) =>
                                setSettingsEditorDraft({ ...settingsEditorDraft, workspace: event.target.value })
                              }
                              className="w-full rounded-lg bg-muted/60 px-3 py-2 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:bg-muted"
                            />
                          </label>
                          <div className="space-y-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:col-span-2">
                            <span>Avatar</span>
                            <div className="flex flex-wrap gap-2">
                              {AGENT_EMOJI_OPTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() =>
                                    setSettingsEditorDraft({ ...settingsEditorDraft, emoji })
                                  }
                                  className={cn(
                                    "rounded-lg border px-3 py-2 text-lg transition-colors",
                                    settingsEditorDraft.emoji === emoji
                                      ? "border-primary bg-primary/10"
                                      : "border-border hover:bg-accent/40"
                                  )}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-destructive"
                          onClick={deleteAgent}
                          disabled={deletingAgent}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingAgent ? "Removing..." : "Remove agent"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void saveAgentSettings()}
                          disabled={savingSettings || deletingAgent || !canSaveSettings}
                        >
                          <Save className="h-3.5 w-3.5" />
                          {savingSettings ? "Saving..." : settingsEditorDraft.setupComplete ? "Save" : "Continue"}
                        </Button>
                      </div>
                    </div>
                    ) : (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Loading agent editor...
                      </div>
                    )}
                  </DialogContent>
                </Dialog>


                <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-3 overflow-hidden">
                  {/* Left: Instructions (read-only, scrollable) */}
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <h4 className="text-[13px] font-semibold">Instructions</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => handleSettingsEditorOpenChange(true)}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="px-4 py-3">
                        {settingsBodyHtml ? (
                          <div
                            className="prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-foreground prose-h1:text-base prose-h2:text-[13px] prose-h3:text-[12px] prose-p:text-[12px] prose-p:text-foreground/85 prose-li:text-[12px] prose-li:text-foreground/85 prose-a:text-foreground prose-code:text-[11px] prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-pre:bg-muted prose-pre:border-0 prose-pre:text-foreground prose-strong:text-foreground"
                            dangerouslySetInnerHTML={{ __html: settingsBodyHtml }}
                          />
                        ) : settingsBody.trim() ? (
                          <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                            {settingsBody}
                          </pre>
                        ) : (
                          <div className="text-[12px] text-muted-foreground">
                            No instructions yet. Click Edit to add them.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Right: Jobs */}
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <h4 className="text-[13px] font-semibold" title="Per-agent recurring prompts">
                        Jobs
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={startNewJobDraft}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New job
                      </Button>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-1">
                        {settingsJobs.length === 0 ? (
                          <div className="px-3 py-6 text-[12px] text-muted-foreground">
                            No jobs yet. Start from scratch or use a library template.
                          </div>
                        ) : (
                          settingsJobs.map((job) => (
                            <div
                              key={job.id}
                              className="flex items-center gap-3 rounded-lg border-b border-border/50 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-accent/20"
                            >
                              <button
                                onClick={() => openJob(job.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 shrink-0 rounded-full",
                                      job.enabled ? "bg-green-500" : "bg-muted-foreground/30"
                                    )}
                                  />
                                  <span className="truncate text-[12px] font-medium">{job.name}</span>
                                </div>
                                <div className="mt-0.5 pl-3.5 text-[11px] text-muted-foreground">
                                  {cronToHuman(job.schedule)}
                                </div>
                              </button>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  onClick={() => void runJob(job.id)}
                                  disabled={runningJobId === job.id}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-primary"
                                  title="Run now"
                                >
                                  {runningJobId === job.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Zap className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => void toggleJob(job)}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                  title={job.enabled ? "Pause" : "Enable"}
                                >
                                  {job.enabled ? (
                                    <Pause className="h-3.5 w-3.5" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => void deleteJob(job.id)}
                                  disabled={deletingJobId === job.id}
                                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                                  title="Delete"
                                >
                                  {deletingJobId === job.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                <div className="shrink-0">
                  {settingsAgentSlug ? renderSettingsComposerPanel(settingsAgentSlug) : null}
                </div>
              </div>
            ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 p-5">
                {settingsTarget === "directory" || !settingsTarget ? (
                  renderOrganizationChart()
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading settings...
                  </div>
                )}
              </div>
            </ScrollArea>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {/* Tight header row: name + counts + scope pills + Org chart + Add agent + refresh. */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-background/95 px-4 py-2.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <h1 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
                  Agents
                </h1>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]">
                  <span className="font-semibold tabular-nums text-foreground">{orgAgentCount}</span>
                  <span className="text-muted-foreground">agents</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]">
                  <span className="font-semibold tabular-nums text-foreground">{activeOrgCount}</span>
                  <span className="text-muted-foreground">active</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px]">
                  <span className="font-semibold tabular-nums text-foreground">{groupedOrgAgents.length}</span>
                  <span className="text-muted-foreground">depts</span>
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <DepthDropdown
                  mode={effectiveVisibilityMode}
                  onChange={(mode) => {
                    if (effectiveCabinetPath) {
                      setCabinetVisibilityMode(effectiveCabinetPath, mode);
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => setOrgChartOpen(true)}
                  disabled={agents.length === 0}
                >
                  <Network className="size-3.5" />
                  Org chart
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={openAddAgentDialog}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add agent
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    void refreshAgents();
                    void refreshConversations();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <NewTaskButton />
              </div>
            </div>

            {/* Main column: team view + schedules. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6">
                {/* Intro */}
                <div className="space-y-4">
                  <h1 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[44px]">
                    This is your AI team.
                  </h1>
                  <p className="max-w-3xl text-[17px] leading-[1.55] text-muted-foreground">
                    A small crew of agents that{" "}
                    <span className="font-semibold text-foreground">
                      work for you around the clock
                    </span>
                    . Each agent has a role, a personality, and a memory. They{" "}
                    <span className="font-semibold text-foreground">
                      wake up on schedule
                    </span>
                    ,{" "}
                    <span className="font-semibold text-foreground">
                      check in while you sleep
                    </span>
                    , and{" "}
                    <span className="font-semibold text-foreground">
                      ship work into your knowledge base
                    </span>{" "}
                    — no prompting from you required.
                  </p>
                  <p className="max-w-3xl text-[15px] leading-[1.6] text-muted-foreground">
                    On this page you can{" "}
                    <span className="font-semibold text-foreground">meet your team</span>,{" "}
                    <span className="font-semibold text-foreground">set up routines</span>{" "}
                    you want them to run every day or every hour, and{" "}
                    <span className="font-semibold text-foreground">check in</span>{" "}
                    on what they've been doing. The sidebar on the right shows
                    everything live.
                  </p>
                </div>

                {/* Agents grid */}
                <section className="space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
                      Meet the team
                    </h2>
                    <p className="max-w-3xl text-[14px] leading-6 text-muted-foreground">
                      Each card is a specialist. Click one to open its profile
                      and edit its name, role, and the instructions that shape
                      how it thinks and works.
                    </p>
                    <p className="text-[12px] text-muted-foreground/80">
                      {orgAgentCount} on the team
                    </p>
                  </div>

                  {agents.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-[12px] text-muted-foreground">
                      No agents yet. Use <span className="font-medium text-foreground">Add agent</span> above to bring one in.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {agents.map((agent) => {
                        const hbCount = agent.heartbeat ? 1 : 0;
                        const jobCount = agent.jobCount || 0;
                        return (
                          <button
                            key={agent.scopedId ?? (agent.cabinetPath ? `${agent.cabinetPath}::${agent.slug}` : agent.slug)}
                            type="button"
                            onClick={() => openAgentSettings(agent.slug)}
                            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 text-left transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-start gap-3">
                              <AgentAvatar agent={agent} shape="circle" size="lg" />
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-[13px] font-semibold text-foreground">
                                  {agent.name}
                                </h3>
                                {agent.role ? (
                                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                                    {agent.role}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={cn(
                                  "mt-1.5 inline-flex size-2 shrink-0 rounded-full",
                                  agent.active
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/30"
                                )}
                                title={agent.active ? "Active" : "Paused"}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                              {agent.scope === "global" ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-300"
                                  title="Shared across all cabinets"
                                >
                                  Global
                                </span>
                              ) : null}
                              {hbCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5">
                                  <HeartPulse className="size-2.5 text-pink-400" />
                                  Heartbeat
                                </span>
                              ) : null}
                              {jobCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5">
                                  <Clock3 className="size-2.5 text-emerald-400" />
                                  {jobCount} {jobCount === 1 ? "job" : "jobs"}
                                </span>
                              ) : null}
                              {agent.department ? (
                                <span className="inline-flex rounded-full bg-muted/40 px-2 py-0.5">
                                  {startCase(agent.department)}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Schedules */}
                <section className="space-y-5">
                  <div className="space-y-2">
                    <h2 className="text-[24px] font-semibold tracking-tight text-foreground sm:text-[28px]">
                      Routines & heartbeats
                    </h2>
                    <p className="max-w-3xl text-[14px] leading-6 text-muted-foreground">
                      <span className="font-semibold text-foreground">Routines</span>{" "}
                      are scheduled jobs — things you want an agent to do every
                      day or every hour. Write the prompt once, pick a schedule,
                      and the agent runs it on its own. Think: "every weekday at
                      9am, summarize yesterday's activity."
                    </p>
                    <p className="max-w-3xl text-[14px] leading-6 text-muted-foreground">
                      A{" "}
                      <span className="font-semibold text-foreground">heartbeat</span>{" "}
                      is the{" "}
                      <span className="font-semibold text-foreground">
                        living brain of an agent
                      </span>{" "}
                      — a special built-in routine that wakes the agent up on
                      its own rhythm, shows it the room, and lets it decide
                      what to work on next. One heartbeat per agent. No prompt
                      required — the agent figures it out.
                    </p>
                  </div>

                  {/* Big Add Routine CTA */}
                  <div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(
                          "inline-flex h-12 items-center gap-2.5 rounded-xl bg-foreground px-5 text-[15px] font-semibold text-background shadow-sm transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
                        )}
                        disabled={agents.length === 0}
                      >
                        <Clock3 className="size-4.5" />
                        Add routine
                        <ChevronDown className="size-4 opacity-70" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-[360px] overflow-y-auto scrollbar-thin p-1">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Assign to
                        </div>
                        {agents.map((agent) => (
                          <DropdownMenuItem
                            key={agent.scopedId ?? (agent.cabinetPath ? `${agent.cabinetPath}::${agent.slug}` : agent.slug)}
                            onClick={() => openNewRoutineFor(agent)}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
                          >
                            <AgentAvatar agent={agent} shape="circle" size="md" />
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span className="truncate text-[12px] font-medium text-foreground">
                                {agent.name}
                              </span>
                              <span className="truncate text-[10px] text-muted-foreground">
                                {agent.role || agent.slug}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <p className="mt-2 text-[12px] text-muted-foreground/80">
                      Pick which agent runs this routine, then set the prompt
                      and schedule.
                    </p>
                  </div>

                  {/* Team schedule board — embed the existing ScheduleView */}
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[16px] font-semibold tracking-tight text-foreground">
                        Team schedule
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-[11px]"
                        onClick={() => setScheduleFullscreen(true)}
                        title="Expand schedule"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Expand
                      </Button>
                    </div>
                    <p className="max-w-3xl text-[12px] text-muted-foreground">
                      What's coming up across every agent — flip between
                      calendar and list, or expand to full screen.
                    </p>
                    <div className="flex h-[460px] min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
                      <ScheduleView
                        agents={cabinetAgentsView}
                        jobs={cabinetJobs}
                        conversations={conversations}
                        onConversationClick={(id) => {
                          const conv = conversations.find((c) => c.id === id);
                          if (!conv) return;
                          setSelectedConversationId(conv.id);
                          setSelectedConversationCabinetPath(conv.cabinetPath);
                          setMode("conversation");
                        }}
                        onJobClick={(job, agent) => {
                          const existing = (agentJobsMap[agent.slug] || []).find(
                            (j) => j.id === job.id
                          );
                          setRoutineDialog({
                            agent: {
                              slug: agent.slug,
                              name: agent.name,
                              role: agent.role,
                              cabinetPath: agent.cabinetPath || effectiveCabinetPath,
                            },
                            existingJob: existing || undefined,
                          });
                        }}
                        onHeartbeatClick={(agent) => {
                          setHeartbeatDialog({
                            agent: {
                              slug: agent.slug,
                              name: agent.name,
                              role: agent.role,
                              cabinetPath: agent.cabinetPath || effectiveCabinetPath,
                            },
                            initialHeartbeat: agent.heartbeat || "0 9 * * 1-5",
                            initialActive: agent.active,
                          });
                        }}
                      />
                    </div>
                  </div>

                  {/* Jobs */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <h3 className="inline-flex items-center gap-2 text-[16px] font-semibold tracking-tight text-foreground">
                        <Clock3 className="size-4 text-emerald-400" />
                        Routines
                        <span className="text-[12px] font-normal text-muted-foreground">
                          ({allJobs.length})
                        </span>
                      </h3>
                      <p className="text-[12px] text-muted-foreground">
                        Every routine this team runs on a schedule. Click any
                        row to edit its prompt, schedule, or pause it.
                      </p>
                    </div>
                    {allJobs.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                        No routines yet. Use{" "}
                        <span className="font-semibold text-foreground">
                          Add routine
                        </span>{" "}
                        above to create your first one.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                        {allJobs.map(({ job, agent: owner }) => (
                          <li key={`${owner.slug}:${job.id}`}>
                            <RoutineRow
                              agent={owner}
                              job={job}
                              onEdit={() => openRoutineDialog(owner, { ...job })}
                              onRun={() => listRunRoutine(owner, job)}
                              onToggle={() => listToggleRoutine(owner, job)}
                              onDelete={() => listDeleteRoutine(owner, job)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Heartbeats */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="inline-flex items-center gap-2 text-[16px] font-semibold tracking-tight text-foreground">
                          <HeartPulse className="size-4 text-pink-400" />
                          Heartbeats
                          <span className="text-[12px] font-normal text-muted-foreground">
                            ({agents.filter((a) => !!a.heartbeat).length})
                          </span>
                        </h3>
                        <p className="text-[12px] text-muted-foreground">
                          One self-directed check-in per agent. Click a row to
                          change its rhythm or pause it.
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-background px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                          )}
                          disabled={agents.length === 0}
                          title="Heartbeats are configured on each agent's page"
                        >
                          <HeartPulse className="size-3.5 text-pink-400" />
                          Configure heartbeat
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="max-h-[320px] overflow-y-auto scrollbar-thin p-1">
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Open agent page
                          </div>
                          {agents.map((agent) => (
                            <DropdownMenuItem
                              key={agent.scopedId ?? (agent.cabinetPath ? `${agent.cabinetPath}::${agent.slug}` : agent.slug)}
                              onClick={() => openAgentSettings(agent.slug)}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
                            >
                              <AgentAvatar agent={agent} shape="circle" size="md" />
                              <span className="flex min-w-0 flex-col leading-tight">
                                <span className="truncate text-[12px] font-medium text-foreground">
                                  {agent.name}
                                </span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {agent.heartbeat
                                    ? `Current: ${cronToHuman(agent.heartbeat)}`
                                    : "No heartbeat yet"}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {agents.filter((a) => !!a.heartbeat).length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
                        No heartbeats yet. Click{" "}
                        <span className="font-semibold text-foreground">
                          Configure heartbeat
                        </span>{" "}
                        above to set one on an agent's page.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                        {agents
                          .filter((a) => !!a.heartbeat)
                          .map((agent) => (
                            <li key={agent.scopedId ?? (agent.cabinetPath ? `${agent.cabinetPath}::${agent.slug}` : agent.slug)}>
                              <HeartbeatRow
                                agent={agent}
                                onEdit={() =>
                                  setHeartbeatDialog({
                                    agent: {
                                      slug: agent.slug,
                                      name: agent.name,
                                      role: agent.role,
                                      cabinetPath:
                                        agent.cabinetPath || effectiveCabinetPath,
                                    },
                                    initialHeartbeat: agent.heartbeat!,
                                    initialActive: agent.active,
                                  })
                                }
                                onRun={() => listRunHeartbeat(agent)}
                                onToggle={() => listToggleHeartbeat(agent)}
                              />
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Org chart fullscreen modal — same component the cabinet page uses. */}
      <OrgChartModal
        open={orgChartOpen}
        onOpenChange={setOrgChartOpen}
        cabinetName={effectiveCabinetPath || "Cabinet"}
        agents={cabinetAgentsView}
        jobs={cabinetJobs}
        childCabinets={cabinetChildren}
        onAgentClick={(agent) => {
          setOrgChartOpen(false);
          openAgentSettings(agent.slug);
        }}
        onAgentSend={(agent) => {
          setOrgChartOpen(false);
          openAgentSettings(agent.slug);
        }}
        onChildCabinetClick={() => {
          setOrgChartOpen(false);
        }}
      />

      {/* Fullscreen team schedule */}
      <Dialog open={scheduleFullscreen} onOpenChange={setScheduleFullscreen}>
        <DialogContent className="h-[94vh] max-h-none w-[96vw] max-w-none overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-border/70 px-6 py-4">
            <DialogTitle className="text-[14px] font-semibold tracking-tight">
              Team schedule
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setScheduleFullscreen(false)}
              title="Exit fullscreen"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          </DialogHeader>
          <div className="h-[calc(94vh-64px)]">
            <ScheduleView
              agents={cabinetAgentsView}
              jobs={cabinetJobs}
              conversations={conversations}
              onConversationClick={(id) => {
                const conv = conversations.find((c) => c.id === id);
                if (!conv) return;
                setSelectedConversationId(conv.id);
                setSelectedConversationCabinetPath(conv.cabinetPath);
                setMode("conversation");
                setScheduleFullscreen(false);
              }}
              onJobClick={(job, agent) => {
                const existing = (agentJobsMap[agent.slug] || []).find(
                  (j) => j.id === job.id
                );
                setScheduleFullscreen(false);
                setRoutineDialog({
                  agent: {
                    slug: agent.slug,
                    name: agent.name,
                    role: agent.role,
                    cabinetPath: agent.cabinetPath || effectiveCabinetPath,
                  },
                  existingJob: existing || undefined,
                });
              }}
              onHeartbeatClick={(agent) => {
                setScheduleFullscreen(false);
                setHeartbeatDialog({
                  agent: {
                    slug: agent.slug,
                    name: agent.name,
                    role: agent.role,
                    cabinetPath: agent.cabinetPath || effectiveCabinetPath,
                  },
                  initialHeartbeat: agent.heartbeat || "0 9 * * 1-5",
                  initialActive: agent.active,
                });
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Consolidated routine editor — used by every "Add routine" button and
          every click-to-edit on a job across this page. */}
      <NewRoutineDialog
        open={routineDialog !== null}
        onOpenChange={(next) => {
          if (!next) setRoutineDialog(null);
        }}
        agent={routineDialog?.agent ?? { slug: "", name: "" }}
        existingJob={routineDialog?.existingJob}
        onSaved={(saved) => {
          const ownerSlug = routineDialog?.agent.slug;
          if (ownerSlug) {
            setAgentJobsMap((prev) => {
              const current = prev[ownerSlug] || [];
              const next = current.some((j) => j.id === saved.id)
                ? current.map((j) => (j.id === saved.id ? saved : j))
                : [...current, saved];
              return { ...prev, [ownerSlug]: next };
            });
          }
          setRoutineDialog(null);
        }}
        onDeleted={(deletedId) => {
          const ownerSlug = routineDialog?.agent.slug;
          if (ownerSlug) {
            setAgentJobsMap((prev) => ({
              ...prev,
              [ownerSlug]: (prev[ownerSlug] || []).filter((j) => j.id !== deletedId),
            }));
          }
          setRoutineDialog(null);
        }}
        onToggled={(toggled) => {
          const ownerSlug = routineDialog?.agent.slug;
          if (!ownerSlug) return;
          setAgentJobsMap((prev) => ({
            ...prev,
            [ownerSlug]: (prev[ownerSlug] || []).map((j) =>
              j.id === toggled.id ? { ...j, enabled: toggled.enabled } : j
            ),
          }));
        }}
      />


      {/* Add agent dialogs (browse library + custom) — root-level so the
          header 'Add agent' button can open them from any mode. */}
      <Dialog open={addAgentDialogOpen} onOpenChange={setAddAgentDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader className="gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Library className="h-4 w-4" />
                  <DialogTitle>Browse Agent Library</DialogTitle>
                </div>
                <DialogDescription>
                  Bring in a predefined agent, or open a custom editor and make your own.
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={openCustomAgentDialog}
              >
                <Settings className="h-3.5 w-3.5" />
                Edit your own agent
              </Button>
            </div>
            {agentFlowError ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {agentFlowError}
              </p>
            ) : null}
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="flex flex-col gap-6 pr-2">
              {loadingAgentTemplates ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading the agent library...
                </div>
              ) : groupedAgentTemplates.length > 0 ? (
                groupedAgentTemplates.map(([department, templates]) => (
                  <div key={department} className="flex flex-col gap-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {department}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {templates.map((template) => (
                        <div
                          key={template.slug}
                          className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{template.emoji || "🤖"}</span>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-[13px] font-semibold">
                                {template.name}
                              </h4>
                              <p className="mt-1 text-[11px] text-foreground/85">
                                {template.role || "No role summary yet"}
                              </p>
                              {template.description ? (
                                <p className="mt-2 line-clamp-3 text-[11px] text-muted-foreground">
                                  {template.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => addAgentFromTemplate(template)}
                            disabled={addingAgentSlug === template.slug}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {addingAgentSlug === template.slug ? "Bringing in..." : "Bring in"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                  No predefined agents are available right now. Use &ldquo;Edit your own
                  agent&rdquo; to create one from scratch.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={customAgentDialogOpen} onOpenChange={handleCustomAgentDialogOpenChange}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader className="gap-1">
            <DialogTitle>Edit your own agent</DialogTitle>
            <DialogDescription>
              Create a custom agent from scratch, then fine-tune it in the same popup flow.
            </DialogDescription>
            {agentFlowError ? (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {agentFlowError}
              </p>
            ) : null}
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="grid gap-4 pr-2 md:grid-cols-2">
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Name</span>
                <input
                  value={newAgentDraft.name}
                  onChange={(event) =>
                    setNewAgentDraft((current) => {
                      const nextName = event.target.value;
                      const currentDerivedSlug = slugify(current.name);
                      return {
                        ...current,
                        name: nextName,
                        slug:
                          !current.slug || current.slug === currentDerivedSlug
                            ? slugify(nextName)
                            : current.slug,
                      };
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                  placeholder="Editor"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Slug</span>
                <input
                  value={newAgentDraft.slug}
                  onChange={(event) =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      slug: slugify(event.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground"
                  placeholder="editor"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Role</span>
                <input
                  value={newAgentDraft.role}
                  onChange={(event) =>
                    setNewAgentDraft({ ...newAgentDraft, role: event.target.value })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                  placeholder="Product writing agent"
                />
              </label>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <span>Heartbeat</span>
                <SchedulePicker
                  value={newAgentDraft.heartbeat || "0 */4 * * *"}
                  onChange={(cron) =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      heartbeat: cron,
                    })
                  }
                />
              </div>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Department</span>
                <input
                  value={newAgentDraft.department}
                  onChange={(event) =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      department: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Type</span>
                <input
                  value={newAgentDraft.type}
                  onChange={(event) =>
                    setNewAgentDraft({ ...newAgentDraft, type: event.target.value })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                />
              </label>
              <label className="space-y-1 text-[11px] text-muted-foreground">
                <span>Provider</span>
                <select
                  value={newAgentDraft.provider}
                  onChange={(event) =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      provider: event.target.value,
                      adapterType: resolveAdapterTypeForProvider(
                        providers,
                        event.target.value,
                        undefined,
                        defaultProvider
                      ),
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                >
                  {selectableCliProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}{provider.available ? "" : " (not installed)"}
                    </option>
                  ))}
                </select>
              </label>
              {newAgentAdapterOptions.length > 0 ? (
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>Runtime</span>
                  <select
                    value={
                      newAgentDraft.adapterType ||
                      getDefaultAdapterTypeForProviderInfo(
                        providers,
                        newAgentDraft.provider,
                        defaultProvider
                      ) ||
                      ""
                    }
                    onChange={(event) =>
                      setNewAgentDraft({
                        ...newAgentDraft,
                        adapterType: event.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                  >
                    {newAgentAdapterOptions.map((adapter) => (
                      <option key={adapter.type} value={adapter.type}>
                        {formatAdapterOptionLabel(adapter)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="space-y-1 text-[11px] text-muted-foreground md:col-span-2">
                <span>Workspace</span>
                <input
                  value={newAgentDraft.workspace}
                  onChange={(event) =>
                    setNewAgentDraft({
                      ...newAgentDraft,
                      workspace: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground"
                  placeholder="workspace"
                />
              </label>
              <div className="space-y-2 text-[11px] text-muted-foreground md:col-span-2">
                <span>Avatar</span>
                <div className="flex flex-wrap gap-2">
                  {AGENT_EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        setNewAgentDraft({
                          ...newAgentDraft,
                          emoji,
                        })
                      }
                      className={cn(
                        "rounded-lg border px-3 py-2 text-lg transition-colors",
                        newAgentDraft.emoji === emoji
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent/40"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <label className="space-y-1 text-[11px] text-muted-foreground md:col-span-2">
                <span>Instructions</span>
                <textarea
                  value={newAgentDraft.body}
                  onChange={(event) =>
                    setNewAgentDraft({ ...newAgentDraft, body: event.target.value })
                  }
                  className="min-h-[240px] w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                  placeholder="Define how this agent should work inside Cabinet and the KB."
                />
              </label>
            </div>
          </ScrollArea>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={newAgentDraft.active}
                onChange={(event) =>
                  setNewAgentDraft({
                    ...newAgentDraft,
                    active: event.target.checked,
                  })
                }
              />
              Start active
            </label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleCustomAgentDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => void createAgent()}
                disabled={creatingAgent || !newAgentDraft.name.trim() || !newAgentDraft.role.trim()}
              >
                {creatingAgent ? "Creating..." : "Create agent"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Org chart — heartbeat popup */}
      {/* Consolidated heartbeat editor — every heartbeat click on this page
          opens this shared dialog. */}
      <HeartbeatDialog
        open={heartbeatDialog !== null}
        onOpenChange={(next) => {
          if (!next) setHeartbeatDialog(null);
        }}
        agent={heartbeatDialog?.agent ?? { slug: "", name: "" }}
        initialHeartbeat={heartbeatDialog?.initialHeartbeat}
        initialActive={heartbeatDialog?.initialActive}
        onSaved={() => {
          setHeartbeatDialog(null);
          void refreshAgents();
        }}
        onToggledActive={(nextActive) => {
          const targetSlug = heartbeatDialog?.agent.slug;
          if (!targetSlug) return;
          setAgents((prev) =>
            prev.map((a) =>
              a.slug === targetSlug ? { ...a, active: nextActive } : a
            )
          );
        }}
      />

      {/* Quick Send popup */}
      {quickSendAgent ? (() => {
        const targetAgent = agents.find((a) => a.slug === quickSendAgent) || null;
        submitTargetRef.current = quickSendAgent;
        const closeQuickSend = () => {
          setQuickSendAgent(null);
          composer.reset();
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
              onClick={closeQuickSend}
            />
            <div className="relative z-10 w-full max-w-xl">
              <ComposerInput
                composer={composer}
                attachments={attachments}
                placeholder={`Ask ${targetAgent?.name || quickSendAgent} to work on something. Type @ to mention pages or agents.`}
                submitLabel="Send"
                variant="card"
                items={mentionItems}
                autoFocus
                minHeight="120px"
                maxHeight="300px"
                actionsStart={
                  <TaskRuntimePicker
                    value={taskRuntime}
                    onChange={setTaskRuntime}
                  />
                }
                header={
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-[22px]">
                      {targetAgent?.emoji || "\uD83E\uDD16"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">
                        {targetAgent?.name || quickSendAgent}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {targetAgent?.role || "Agent"}
                      </p>
                    </div>
                    <WhenChip
                      mode="now"
                      onChange={(next) => {
                        if (next === "now") return;
                        setHandoffAgentSlug(quickSendAgent);
                        setHandoffMode(next);
                        setHandoffOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      onClick={closeQuickSend}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                }
              />
            </div>
          </div>
        );
      })() : null}

      <StartWorkDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        cabinetPath={effectiveCabinetPath}
        agents={cabinetAgentsView}
        initialMode={handoffMode}
        initialPrompt={composer.input}
        initialAgentSlug={handoffAgentSlug ?? undefined}
        onStarted={(conversationId, conversationCabinetPath) => {
          composer.reset();
          setQuickSendAgent(null);
          setHandoffAgentSlug(null);
          setSection({
            type: "task",
            taskId: conversationId,
            cabinetPath: conversationCabinetPath || effectiveCabinetPath,
          });
        }}
      />
    </div>
  );
}

