"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar as CalendarIcon,
  Check,
  CheckCircle,
  CircleAlert,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Power,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Download,
  Inbox as InboxIcon,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import {
  AgentAvatar,
  getAgentDisplayName,
} from "@/components/agents/agent-avatar";
import { ICON_CATALOG, ICON_PICKER_KEYS } from "@/lib/agents/icon-catalog";
import { AVATAR_PRESETS } from "@/lib/agents/avatar-catalog";
import type { AgentPersona } from "@/lib/agents/persona-manager";
import type { AgentTask, ProviderInfo } from "@/types/agents";
import { isAgentProviderSelectable } from "@/lib/agents/provider-filters";
import type { ConversationMeta } from "@/types/conversations";
import type {
  CabinetAgentSummary,
  CabinetJobSummary,
} from "@/types/cabinets";
import { useAppStore } from "@/stores/app-store";
import { SkillAddDialog } from "@/components/skills/skill-add-dialog";
import { cronToHuman } from "@/lib/agents/cron-utils";
import { getAgentColor, tintFromHex } from "@/lib/agents/cron-compute";
import { ScheduleCalendar } from "@/components/cabinets/schedule-calendar";
import { NewRoutineDialog } from "@/components/agents/new-routine-dialog";
import type { JobConfig } from "@/types/jobs";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  StartWorkDialog,
  WhenChip,
  type StartWorkMode,
} from "@/components/composer/start-work-dialog";
import { ComposerInput } from "@/components/composer/composer-input";
import { AgentPicker } from "@/components/composer/agent-picker";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import { useTreeStore } from "@/stores/tree-store";
import { flattenTree } from "@/lib/tree-utils";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensions } from "@/components/editor/extensions";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { htmlToMarkdown } from "@/lib/markdown/to-markdown";

interface AgentJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  prompt: string;
}

function formatRelative(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

function triggerIcon(trigger: ConversationMeta["trigger"]) {
  switch (trigger) {
    case "job":
      return Briefcase;
    case "heartbeat":
      return Sparkles;
    default:
      return MessageSquare;
  }
}

function triggerLabel(trigger: ConversationMeta["trigger"]): string {
  switch (trigger) {
    case "job":
      return "Job";
    case "heartbeat":
      return "Heartbeat";
    default:
      return "Chat";
  }
}

function conversationDurationMs(convo: ConversationMeta): number {
  const start = new Date(convo.startedAt).getTime();
  const end = convo.completedAt
    ? new Date(convo.completedAt).getTime()
    : convo.lastActivityAt
      ? new Date(convo.lastActivityAt).getTime()
      : Date.now();
  return Math.max(0, end - start);
}

/* ─── Conversation status presentation ─── */
type ConversationDisplayStatus =
  | "running"
  | "awaiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "closed";

const CLOSED_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7d of no activity → auto-close

function displayStatus(c: ConversationMeta): ConversationDisplayStatus {
  if (c.archivedAt) return "closed";
  if (c.status === "running") {
    return c.awaitingInput ? "awaiting" : "running";
  }
  if (c.status === "failed") return "failed";
  if (c.status === "cancelled") return "cancelled";
  // completed
  const last = new Date(c.lastActivityAt || c.completedAt || c.startedAt).getTime();
  if (Date.now() - last > CLOSED_AFTER_MS) return "closed";
  return "completed";
}

function statusPresentation(s: ConversationDisplayStatus) {
  switch (s) {
    case "running":
      return {
        icon: Loader2,
        iconClass: "text-primary animate-spin",
        label: "Working",
        labelClass: "text-primary",
      };
    case "awaiting":
      return {
        icon: HelpCircle,
        iconClass: "text-amber-500",
        label: "Needs reply",
        labelClass: "text-amber-600 dark:text-amber-400",
      };
    case "completed":
      return {
        icon: CheckCircle,
        iconClass: "text-green-500",
        label: "Done",
        labelClass: "text-muted-foreground",
      };
    case "failed":
      return {
        icon: XCircle,
        iconClass: "text-red-500",
        label: "Failed",
        labelClass: "text-red-500",
      };
    case "cancelled":
      return {
        icon: XCircle,
        iconClass: "text-muted-foreground/50",
        label: "Cancelled",
        labelClass: "text-muted-foreground",
      };
    case "closed":
      return {
        icon: Archive,
        iconClass: "text-muted-foreground/40",
        label: "Closed",
        labelClass: "text-muted-foreground/70",
      };
  }
}

/* ─── Artifact helpers ─── */
interface Artifact {
  path: string;
  ts: string;
  conversationId: string;
  conversationTitle: string;
}

function iconForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["md", "mdx", "txt"].includes(ext)) return FileText;
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"].includes(ext))
    return ImageIcon;
  if (["csv", "xlsx", "xls", "numbers", "tsv"].includes(ext))
    return FileSpreadsheet;
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "json",
      "yaml",
      "yml",
      "html",
      "css",
      "py",
      "go",
      "rs",
      "sh",
    ].includes(ext)
  )
    return FileCode;
  return FileIcon;
}

function splitPath(path: string): { dir: string; file: string } {
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop() || path;
  const dir = parts.join("/");
  return { dir, file };
}

/* ─── Status ─── */
type AgentStatus = "working" | "ready" | "paused";

function computeStatus(
  persona: AgentPersona,
  conversations: ConversationMeta[]
): AgentStatus {
  if (!persona.active) return "paused";
  const hasRunning = conversations.some((c) => c.status === "running");
  return hasRunning ? "working" : "ready";
}

/* ─── Schedule adapters ─── */
function personaToCabinetAgent(persona: AgentPersona): CabinetAgentSummary {
  const cabinetPath = persona.cabinetPath || ".";
  return {
    scopedId: `${cabinetPath}::agent::${persona.slug}`,
    name: persona.name,
    slug: persona.slug,
    emoji: persona.emoji || "🤖",
    role: persona.role,
    active: persona.active,
    department: persona.department,
    type: persona.type,
    heartbeat: persona.heartbeat,
    workspace: persona.workspace,
    jobCount: 0,
    taskCount: 0,
    cabinetPath,
    cabinetName: "",
    cabinetDepth: 0,
    inherited: false,
    displayName: persona.displayName,
    iconKey: persona.iconKey,
    color: persona.color,
    avatar: persona.avatar,
    avatarExt: persona.avatarExt,
  };
}

function jobToCabinetJob(job: AgentJob, persona: AgentPersona): CabinetJobSummary {
  const cabinetPath = persona.cabinetPath || ".";
  return {
    scopedId: `${cabinetPath}::job::${job.id}`,
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    schedule: job.schedule,
    prompt: job.prompt,
    ownerAgent: persona.slug,
    ownerScopedId: `${cabinetPath}::agent::${persona.slug}`,
    cabinetPath,
    cabinetName: "",
    cabinetDepth: 0,
    inherited: false,
  };
}

function aggregateArtifacts(conversations: ConversationMeta[]): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const c of conversations) {
    const ts = c.lastActivityAt || c.completedAt || c.startedAt;
    for (const path of c.artifactPaths || []) {
      const existing = map.get(path);
      if (!existing || new Date(ts).getTime() > new Date(existing.ts).getTime()) {
        map.set(path, {
          path,
          ts,
          conversationId: c.id,
          conversationTitle: c.title || c.summary || "Untitled",
        });
      }
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
  );
}

/* ─── Section shell ─── */
function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-6 py-6 border-b border-border/40">
      <header className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] font-medium">{title}</h2>
          {meta && (
            <span className="text-[11px] text-muted-foreground">{meta}</span>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/* ─── Status chip ─── */
function StatusChip({
  status,
  color,
  onClick,
}: {
  status: AgentStatus;
  color: string;
  onClick?: () => void;
}) {
  const label = status === "working" ? "Working" : status === "ready" ? "Ready" : "Paused";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-[12.5px] font-medium transition-colors",
        onClick && "hover:border-border hover:bg-accent/40 cursor-pointer",
        status === "paused" && "text-muted-foreground"
      )}
      style={status !== "paused" ? { color } : undefined}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {status === "working" && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ backgroundColor: color, opacity: 0.6 }}
          />
        )}
        <span
          className={cn(
            "relative inline-block h-1.5 w-1.5 rounded-full",
            status === "paused" && "bg-muted-foreground/40"
          )}
          style={status !== "paused" ? { backgroundColor: color } : undefined}
        />
      </span>
      {label}
    </button>
  );
}

/* ─── Top action bar ─── */
function TopBar({
  persona,
  status,
  scheduleOpen,
  onBack,
  onToggleSchedule,
  onToggleActive,
  onToggleCanDispatch,
  onExport,
  onDelete,
}: {
  persona: AgentPersona;
  status: AgentStatus;
  scheduleOpen: boolean;
  onBack: () => void;
  onToggleSchedule: () => void;
  onToggleActive: () => void;
  onToggleCanDispatch: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const palette = persona.color
    ? tintFromHex(persona.color)
    : getAgentColor(persona.slug);

  return (
    <div className="flex items-center justify-between px-6 pt-4">
      <nav className="flex items-center gap-1 text-[12px] text-muted-foreground -ml-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Agents
        </button>
        <span aria-hidden>/</span>
        <span className="px-2 py-1 font-medium text-foreground">{persona.name}</span>
      </nav>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={scheduleOpen ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1.5 text-[12px]"
                onClick={onToggleSchedule}
              >
                {scheduleOpen ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <CalendarIcon className="h-3.5 w-3.5" />
                )}
                {scheduleOpen ? "Close schedule" : "Schedule"}
              </Button>
            }
          />
          <TooltipContent>
            {scheduleOpen
              ? "Return to the profile view"
              : "See past and upcoming runs for this agent"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onToggleActive}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
                  persona.active
                    ? "border-border hover:bg-accent/40"
                    : "border-dashed border-border/60 text-muted-foreground hover:bg-accent/30"
                )}
                style={persona.active ? { color: palette.text } : undefined}
              >
                <Power className="h-3.5 w-3.5" />
                {persona.active ? "Active" : "Stopped"}
              </button>
            }
          />
          <TooltipContent>
            {persona.active
              ? "Stop this agent — pauses heartbeat and all scheduled jobs. Manual chats still work."
              : "Resume this agent — re-enables heartbeat and scheduled jobs."}
          </TooltipContent>
        </Tooltip>

        {(() => {
          const canDispatch =
            typeof persona.canDispatch === "boolean"
              ? persona.canDispatch
              : persona.type === "lead";
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onToggleCanDispatch}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-7 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
                      canDispatch
                        ? "border-border hover:bg-accent/40"
                        : "border-dashed border-border/60 text-muted-foreground hover:bg-accent/30"
                    )}
                    style={canDispatch ? { color: palette.text } : undefined}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {canDispatch ? "Can dispatch" : "No dispatch"}
                  </button>
                }
              />
              <TooltipContent>
                <div className="max-w-[260px] space-y-1.5">
                  <div>
                    {canDispatch
                      ? "Can hand off work to teammates. You approve each handoff before it runs."
                      : "Let this agent hand off work to teammates. You approve each handoff before it runs."}
                  </div>
                  <div className="text-muted-foreground">
                    Try:{" "}
                    <span className="italic">
                      &ldquo;Launch 5 research tasks — one per top
                      competitor — each on its own task.&rdquo;
                    </span>
                  </div>
                  {canDispatch && (
                    <div className="text-muted-foreground">Click to turn off.</div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })()}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={onToggleCanDispatch}>
              <span className="mr-2 inline-flex size-4 items-center justify-center font-mono text-[11px]">
                {(
                  typeof persona.canDispatch === "boolean"
                    ? persona.canDispatch
                    : persona.type === "lead"
                )
                  ? "✓"
                  : ""}
              </span>
              Can assign tasks to other team members
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExport}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Export persona
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-500 focus:text-red-500 focus:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete agent
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* palette ref to suppress unused var warning when active */}
      <span className="hidden" aria-hidden style={{ color: palette.text }}>
        {status}
      </span>
    </div>
  );
}

/* ─── AvatarEditorPopover ─── */
const COLOR_PRESETS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#f59e0b", "#22c55e", "#14b8a6", "#06b6d4", "#64748b",
  "#f43f5e", "#6366f1",
];

function AvatarEditorPopover({
  persona,
  onSaveFields,
  onApplyOptimistic,
  onClose,
}: {
  persona: AgentPersona;
  onSaveFields: (fields: Record<string, string>) => void;
  /** Apply state change locally without an extra API call (used after upload/delete which handle their own write). */
  onApplyOptimistic: (fields: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"icon" | "avatar">("icon");
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (persona.cabinetPath) form.append("cabinetPath", persona.cabinetPath);
    try {
      const res = await fetch(`/api/agents/personas/${persona.slug}/avatar`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        onApplyOptimistic({ avatar: "custom", avatarExt: data.ext });
        onClose();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const qs = persona.cabinetPath
      ? `?cabinet=${encodeURIComponent(persona.cabinetPath)}`
      : "";
    await fetch(`/api/agents/personas/${persona.slug}/avatar${qs}`, { method: "DELETE" });
    onApplyOptimistic({ avatar: "", avatarExt: "" });
    onClose();
  };

  const palette = persona.color ? tintFromHex(persona.color) : getAgentColor(persona.slug);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-2 z-50 w-72 rounded-xl border border-border bg-popover shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {(["icon", "avatar"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2 text-[12px] font-medium transition-colors relative",
              tab === t
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "icon" ? "Icon & Color" : "Avatar"}
          </button>
        ))}
      </div>

      {tab === "icon" ? (
        <div className="p-3 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Icon</p>
            <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto pr-1">
              {ICON_PICKER_KEYS.map((key) => {
                const IconComp = ICON_CATALOG[key];
                const isSelected = persona.iconKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    onClick={() => onSaveFields({ iconKey: key, avatar: "" })}
                    className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-md transition-all",
                      isSelected
                        ? "ring-2 ring-offset-1 ring-primary"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    )}
                    style={isSelected ? { backgroundColor: palette.bg, color: palette.text } : undefined}
                  >
                    <IconComp className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Color</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {COLOR_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onSaveFields({ color: hex })}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                    persona.color === hex ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label
                title="Custom color"
                className="relative h-6 w-6 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-foreground/60 transition-colors overflow-hidden"
              >
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  value={persona.color || "#6366f1"}
                  onChange={(e) => onSaveFields({ color: e.target.value })}
                />
                <Plus className="h-3 w-3 text-muted-foreground pointer-events-none" />
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">Preset</p>
            <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto pr-1">
              {AVATAR_PRESETS.map((preset) => {
                const isSelected = persona.avatar === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    onClick={() => { onSaveFields({ avatar: preset.id, iconKey: "" }); onClose(); }}
                    className={cn(
                      "relative h-8 w-8 rounded-md overflow-hidden border-2 transition-all",
                      isSelected ? "border-primary" : "border-transparent hover:border-border"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.file} alt={preset.label} className="h-full w-full object-cover" />
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              Upload image
            </button>
            {persona.avatar && persona.avatar !== "none" && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="h-8 px-2.5 rounded-md border border-border text-[12px] text-muted-foreground hover:text-red-500 hover:border-red-300 transition-colors"
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/70">PNG, JPG, or SVG · max 1 MB</p>
        </div>
      )}
    </div>
  );
}

/* ─── Hero (identity only; top-bar handled separately) ─── */
function Hero({
  persona,
  status,
  onSaveFields,
  onApplyOptimistic,
}: {
  persona: AgentPersona;
  status: AgentStatus;
  onSaveFields: (fields: Record<string, string>) => void;
  onApplyOptimistic: (fields: Record<string, string>) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const palette = persona.color
    ? tintFromHex(persona.color)
    : getAgentColor(persona.slug);

  return (
    <div className="px-6 pt-5 pb-5">
      <div className="flex items-center gap-4">
        {/* Clickable avatar with edit hint */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEditorOpen((v) => !v)}
            className="group relative focus:outline-none"
            title="Edit icon, color, or avatar"
          >
            <AgentAvatar
              agent={{
                slug: persona.slug,
                cabinetPath: persona.cabinetPath,
                displayName: persona.displayName,
                iconKey: persona.iconKey,
                color: persona.color,
                avatar: persona.avatar,
                avatarExt: persona.avatarExt,
              }}
              size="lg"
              shape="square"
              className="!h-16 !w-16 !rounded-2xl [&>svg]:!h-7 [&>svg]:!w-7 transition-opacity group-hover:opacity-80"
            />
            <span className="absolute inset-0 flex items-center justify-center rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <Pencil className="h-5 w-5 text-white drop-shadow" />
            </span>
          </button>

          {editorOpen && (
            <AvatarEditorPopover
              persona={persona}
              onSaveFields={onSaveFields}
              onApplyOptimistic={onApplyOptimistic}
              onClose={() => setEditorOpen(false)}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight truncate">
              {getAgentDisplayName(persona) || persona.name}
            </h1>
            <StatusChip status={status} color={palette.text} />
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5 truncate flex items-center gap-2">
            <span>{persona.role}</span>
            {persona.department && (
              <>
                <span className="opacity-40">·</span>
                <span>{persona.department}</span>
              </>
            )}
            {persona.scope === "global" && (
              <>
                <span className="opacity-40">·</span>
                <span
                  className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300"
                  title="Shared across all cabinets — edits apply everywhere"
                >
                  Global
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Composer ─── */
// Thin wrapper around the shared `ComposerInput`. The only thing this adds
// over a raw ComposerInput callsite is the agent-scoped boilerplate —
// persona-tinted focus ring, agent-flavored suggestion chips, and the
// runtime picker seeded from the persona's default provider/model. Visual
// parity with the shared composer is preserved via `textareaClassName`
// (matches the original 14px / pt-3 pb-1 feel) and `focusTint` (the
// agent-colored ring).
function Composer({
  persona,
  onSubmit,
  submitting,
  onScheduleHandoff,
}: {
  persona: AgentPersona;
  onSubmit: (
    message: string,
    runtime: TaskRuntimeSelection,
    extras: {
      attachmentPaths: string[];
      mentionedSkills?: string[];
      stagingClientUuid?: string;
    }
  ) => void;
  submitting: boolean;
  onScheduleHandoff?: (
    mode: Exclude<StartWorkMode, "now">,
    message: string
  ) => void;
}) {
  const palette = persona.color
    ? tintFromHex(persona.color)
    : getAgentColor(persona.slug);
  const [runtime, setRuntime] = useState<TaskRuntimeSelection>(() => ({
    providerId: persona.provider || undefined,
    adapterType: persona.adapterType || undefined,
    model:
      (persona.adapterConfig?.model as string | undefined) || undefined,
    effort:
      (persona.adapterConfig?.effort as string | undefined) || undefined,
  }));

  const suggestions = useMemo(() => {
    const slug = persona.slug.toLowerCase();
    if (slug.includes("ceo")) return ["Set goals for the quarter", "Review team status", "Plan next initiative"];
    if (slug.includes("editor")) return ["Review this page", "Fix the grammar", "Summarize this doc"];
    if (slug.includes("cto") || slug.includes("dev"))
      return ["Review my PR", "Fix the build", "Plan the sprint"];
    if (slug.includes("copy")) return ["Write landing copy", "Rewrite in brand voice", "Draft an email"];
    if (slug.includes("market")) return ["Draft a blog post", "Plan next campaign", "Audit our content"];
    return ["Summarize recent work", "Propose next steps", "Draft an update"];
  }, [persona.slug]);

  const name = getAgentDisplayName(persona) || persona.name;

  const stagingClientUuid = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`,
    []
  );
  const attachments = useComposerAttachments({
    cabinetPath: persona.cabinetPath,
    clientAttachmentId: stagingClientUuid,
  });

  const skillItems = useSkillMentionItems({ cabinetPath: persona.cabinetPath });
  const treeNodes = useTreeStore((s) => s.nodes);
  const [otherAgents, setOtherAgents] = useState<
    Array<{ slug: string; name: string; role?: string; emoji?: string }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/personas")
      .then((r) => (r.ok ? r.json() : { personas: [] }))
      .then((data: { personas?: Array<{ slug: string; name: string; role?: string; emoji?: string }> }) => {
        if (cancelled) return;
        setOtherAgents((data.personas ?? []).filter((a) => a.slug !== persona.slug));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [persona.slug]);

  const mentionItems: MentionableItem[] = useMemo(
    () => [
      ...otherAgents.map((a) => ({
        type: "agent" as const,
        id: a.slug,
        label: a.name,
        sublabel: a.role ?? "",
        icon: a.emoji,
      })),
      ...skillItems,
      ...flattenTree(treeNodes).map((p) => ({
        type: "page" as const,
        id: p.path,
        label: p.title,
        sublabel: p.path,
      })),
    ],
    [otherAgents, skillItems, treeNodes],
  );

  const composer = useComposer({
    items: mentionItems,
    attachments,
    stagingClientUuid,
    onSubmit: async ({
      message,
      attachmentPaths,
      mentionedSkills,
      stagingClientUuid: turnStagingUuid,
    }) => {
      onSubmit(message, runtime, {
        attachmentPaths,
        mentionedSkills,
        stagingClientUuid: turnStagingUuid,
      });
    },
    disabled: submitting,
  });

  return (
    <div className="px-6 pb-5">
      <ComposerInput
        composer={composer}
        attachments={attachments}
        placeholder={`Ask ${name} something…`}
        submitLabel="Send"
        variant="card"
        minHeight="78px"
        maxHeight="320px"
        mentionDropdownPlacement="below"
        showKeyHint={false}
        textareaClassName="pt-3 pb-1 text-[14px] leading-relaxed"
        focusTint={{ borderColor: palette.text, ringColor: palette.bg }}
        disabled={submitting}
        topRightOverlay={
          onScheduleHandoff ? (
            <WhenChip
              mode="now"
              onChange={(next) => {
                if (next === "now") return;
                onScheduleHandoff(next, composer.input);
              }}
            />
          ) : undefined
        }
        actionsStart={
          <>
            <AgentPicker
              agents={[
                {
                  slug: persona.slug,
                  name: persona.name,
                  displayName: persona.displayName,
                  role: persona.role,
                  cabinetPath: persona.cabinetPath,
                  iconKey: persona.iconKey,
                  color: persona.color,
                  avatar: persona.avatar,
                  avatarExt: persona.avatarExt,
                },
              ]}
              selectedSlug={persona.slug}
              disabled
              disabledReason={`Locked to ${name} — this is their workspace`}
            />
            <TaskRuntimePicker value={runtime} onChange={setRuntime} />
          </>
        }
      />

      {/* Suggested prompts */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => composer.setInput(s)}
            className="text-[11px] text-muted-foreground hover:text-foreground rounded-full border border-border/60 px-2.5 py-1 hover:border-border transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Inbox (assigned AgentTasks) ─── */
function priorityChipClass(priority: number): string {
  // 1 = highest, 5 = lowest
  if (priority <= 1) return "bg-red-500/10 text-red-600 dark:text-red-400";
  if (priority === 2) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  if (priority === 3) return "bg-muted text-muted-foreground";
  return "bg-muted/50 text-muted-foreground";
}

function InboxSection({
  tasks,
  onStart,
  onOpenTask,
  startingTaskId,
}: {
  tasks: AgentTask[];
  onStart: (task: AgentTask) => void;
  onOpenTask: (task: AgentTask) => void;
  startingTaskId: string | null;
}) {
  if (tasks.length === 0) return null;
  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  if (pending.length === 0) return null;

  return (
    <Section
      title="Inbox"
      meta={`${pending.length} waiting`}
    >
      <ul className="space-y-0">
        {pending.slice(0, 5).map((t) => {
          const linked = !!t.linkedConversationId;
          const busy = startingTaskId === t.id;
          const fromLabel = t.fromName || t.fromAgent;
          return (
            <li
              key={t.id}
              className="flex items-start gap-3 px-2 py-2.5 -mx-2 rounded-md hover:bg-accent/40 transition-colors group"
            >
              <span className="mt-0.5 shrink-0">
                {t.status === "in_progress" ? (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                ) : (
                  <InboxIcon className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <button
                type="button"
                onClick={() => onOpenTask(t)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium truncate">
                    {t.title}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded shrink-0",
                      priorityChipClass(t.priority)
                    )}
                  >
                    P{t.priority}
                  </span>
                </div>
                {t.description && (
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                    {t.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-2">
                  <span>from {fromLabel}</span>
                  <span className="opacity-40">·</span>
                  <span>{formatRelative(t.createdAt)}</span>
                  {linked && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="text-primary">Running →</span>
                    </>
                  )}
                </p>
              </button>
              {!linked && t.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  onClick={() => onStart(t)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Start
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ─── Conversations ─── */
function ConversationsSection({
  conversations,
  onOpen,
  onSeeAll,
}: {
  conversations: ConversationMeta[];
  onOpen: (c: ConversationMeta) => void;
  onSeeAll?: () => void;
}) {
  const top = conversations.slice(0, 7);
  return (
    <Section
      title="Conversations"
      meta={`${conversations.length} total`}
      action={
        conversations.length > top.length && onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            See all <ArrowRight className="h-3 w-3" />
          </button>
        )
      }
    >
      {top.length === 0 ? (
        <p className="text-[12px] text-muted-foreground py-6 text-center">
          No conversations yet. Send a prompt above to start one.
        </p>
      ) : (
        <ul className="space-y-0">
          {top.map((c) => {
            const TriggerIcon = triggerIcon(c.trigger);
            const duration = conversationDurationMs(c);
            const title = (c.title || c.summary || "Untitled")
              .replace(/^---\s*\n/, "")
              .replace(/^#+\s*/, "")
              .trim();
            const ds = displayStatus(c);
            const sp = statusPresentation(ds);
            const Icon = sp.icon;
            const highlight = ds === "awaiting";
            const dim = ds === "closed" || ds === "cancelled";
            return (
              <li key={c.id}>
                <button
                  onClick={() => onOpen(c)}
                  className={cn(
                    "w-full flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-md transition-colors text-left group",
                    highlight
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-accent/40",
                    dim && "opacity-60 hover:opacity-100"
                  )}
                >
                  <span className="shrink-0">
                    <Icon className={cn("h-3.5 w-3.5", sp.iconClass)} />
                  </span>
                  <span className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-[13px] truncate">{title}</span>
                    {highlight && (
                      <span className={cn("text-[10px] font-medium uppercase tracking-wider shrink-0", sp.labelClass)}>
                        {sp.label}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-4 text-[11px] text-muted-foreground tabular-nums shrink-0">
                    <span className="inline-flex items-center gap-1">
                      <TriggerIcon className="h-3 w-3 opacity-70" />
                      <span>{triggerLabel(c.trigger)}</span>
                    </span>
                    <span className="w-14 text-right">
                      {formatRelative(c.lastActivityAt || c.startedAt)}
                    </span>
                    <span className="w-8 text-right">
                      {ds === "running" ? "—" : formatDuration(duration)}
                    </span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ─── Recent work (KB artifacts this agent touched) ─── */
function RecentWorkSection({
  artifacts,
  onOpenPath,
}: {
  artifacts: Artifact[];
  onOpenPath: (path: string) => void;
}) {
  const top = artifacts.slice(0, 5);
  return (
    <Section
      title="Recent work"
      meta={
        artifacts.length > 0
          ? `${artifacts.length} file${artifacts.length === 1 ? "" : "s"} touched`
          : undefined
      }
      action={
        artifacts.length > top.length && (
          <button className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            See all <ArrowRight className="h-3 w-3" />
          </button>
        )
      }
    >
      {top.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-[12px] text-muted-foreground">
            No edits yet — an edit is any file write this agent performs.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Run a task to see entries here. Past runs appear in Conversations below.
          </p>
        </div>
      ) : (
        <ul className="space-y-0">
          {top.map((a) => {
            const Icon = iconForPath(a.path);
            const { dir, file } = splitPath(a.path);
            return (
              <li key={a.path}>
                <button
                  onClick={() => onOpenPath(a.path)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-md hover:bg-accent/40 transition-colors text-left group"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-[13px] truncate">{file}</span>
                    {dir && (
                      <span className="text-[11px] text-muted-foreground/70 truncate font-mono">
                        {dir}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-14 text-right">
                    {formatRelative(a.ts)}
                  </span>
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ─── Schedule ─── */
function ScheduleSection({
  persona,
  jobs,
  onToggleJob,
  onRunJob,
  onAddRoutine,
  onEditRoutine,
  onRunHeartbeat,
  onToggleActive,
  onManage,
}: {
  persona: AgentPersona;
  jobs: AgentJob[];
  onToggleJob: (id: string) => void;
  onRunJob: (id: string) => void;
  onAddRoutine: () => void;
  onEditRoutine: (job: AgentJob) => void;
  onRunHeartbeat: () => void;
  onToggleActive: () => void;
  onManage: () => void;
}) {

  return (
    <Section
      title="Schedule"
      action={
        <button
          onClick={onManage}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </button>
      }
    >
      <ul className="space-y-0">
        {/* Heartbeat */}
        <li className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-md hover:bg-accent/30 transition-colors">
          <Zap className={cn("h-3.5 w-3.5 shrink-0", persona.active ? "text-amber-500" : "text-muted-foreground/40")} />
          <span className={cn("flex-1 text-[13px]", !persona.active && "text-muted-foreground/60")}>Heartbeat</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {cronToHuman(persona.heartbeat)}
          </span>
          <button
            onClick={onToggleActive}
            className={cn(
              "text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded transition-colors",
              persona.active
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            )}
            title={persona.active ? "Pause heartbeat (stops all scheduled jobs)" : "Resume heartbeat"}
          >
            {persona.active ? "on" : "off"}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={onRunHeartbeat}
            title="Run now"
            disabled={!persona.active}
          >
            <Play className="h-3 w-3" />
          </Button>
        </li>
        {/* Jobs */}
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-md hover:bg-accent/30 transition-colors"
          >
            <button
              type="button"
              onClick={() => onEditRoutine(job)}
              className="flex flex-1 items-center gap-3 text-left"
              title="Edit routine"
            >
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-[13px] truncate">{job.name}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {cronToHuman(job.schedule)}
              </span>
            </button>
            <button
              onClick={() => onToggleJob(job.id)}
              className={cn(
                "text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded transition-colors",
                job.enabled
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {job.enabled ? "on" : "off"}
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => onRunJob(job.id)}
              title="Run now"
            >
              <Play className="h-3 w-3" />
            </Button>
          </li>
        ))}
        {/* Add */}
        <li>
          <button
            onClick={onAddRoutine}
            className="w-full flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-md text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors text-left"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-[13px]">Add routine</span>
          </button>
        </li>
      </ul>
    </Section>
  );
}

/* ─── Details (compact field grid) ─── */
function Field({
  label,
  value,
  mono,
  readOnly,
  className,
  onSave,
}: {
  label: string;
  value: string;
  mono?: boolean;
  readOnly?: boolean;
  className?: string;
  onSave?: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
     
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (readOnly || !onSave) return;
    if (draft !== value) onSave(draft);
  };

  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)}>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </label>
      <input
        value={draft}
        readOnly={readOnly || !onSave}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "bg-muted/30 border border-transparent rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
          "hover:border-border/60",
          "focus:outline-none focus:border-border focus:bg-background focus:ring-1 focus:ring-primary/30",
          (readOnly || !onSave) &&
            "text-muted-foreground cursor-default hover:border-transparent",
          mono && "font-mono text-[12px]"
        )}
      />
    </div>
  );
}

function DetailsSection({
  persona,
  onSaveField,
  onSaveSkills,
}: {
  persona: AgentPersona;
  onSaveField: (field: string, value: string) => void;
  onSaveSkills: (slugs: string[]) => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  useEffect(() => {
    fetch("/api/agents/providers")
      .then((r) => r.json())
      .then((d) => setProviders((d.providers as ProviderInfo[]) ?? []))
      .catch(() => {});
  }, []);
  const selectableProviders = providers.filter(isAgentProviderSelectable);

  return (
    <Section title="Details">
      {persona.scope === "global" && (
        <div className="mb-3 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[12px] text-violet-200">
          <span className="font-medium">Editing global agent</span> — changes
          apply across every cabinet that uses this agent.
        </div>
      )}
      <div className="grid grid-cols-6 gap-x-3 gap-y-3">
        <Field
          label="Display name"
          value={persona.displayName || persona.name}
          className="col-span-3"
          onSave={(v) => onSaveField("displayName", v)}
        />
        <Field
          label="Role"
          value={persona.role}
          className="col-span-3"
          onSave={(v) => onSaveField("role", v)}
        />
        <Field
          label="Department"
          value={persona.department}
          className="col-span-2"
          onSave={(v) => onSaveField("department", v)}
        />
        <Field
          label="Type"
          value={persona.type}
          className="col-span-2"
          onSave={(v) => onSaveField("type", v)}
        />
        <Field
          label="Workspace"
          value={persona.workspace || "/"}
          className="col-span-2"
          mono
          onSave={(v) => onSaveField("workspace", v)}
        />
        <Field
          label="Tags"
          value={persona.tags.join(", ")}
          className="col-span-4"
          onSave={(v) => onSaveField("tags", v)}
        />
        <div className="col-span-2 flex flex-col gap-1 min-w-0">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Provider
          </label>
          <select
            value={persona.provider}
            onChange={(e) => onSaveField("provider", e.target.value)}
            className="bg-muted/30 border border-transparent rounded-md px-2.5 py-1.5 text-[12px] font-mono text-foreground outline-none transition-colors hover:border-border/60 focus:border-border focus:bg-background focus:ring-1 focus:ring-primary/30"
          >
            {selectableProviders.length === 0 ? (
              <option value={persona.provider}>{persona.provider}</option>
            ) : (
              selectableProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.available ? "" : " (not installed)"}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="col-span-6">
          <SkillsMultiSelect
            selected={persona.skills ?? []}
            recommended={persona.recommendedSkills ?? []}
            agentSlug={persona.slug}
            onChange={onSaveSkills}
          />
        </div>
      </div>
    </Section>
  );
}

interface SkillCatalogEntry {
  slug: string;
  name: string;
  description?: string;
  path: string;
}

function SkillsMultiSelect({
  selected,
  recommended,
  agentSlug,
  onChange,
}: {
  selected: string[];
  recommended: Array<{ key: string; source?: string }>;
  agentSlug: string;
  onChange: (slugs: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<SkillCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState<string | null>(null);

  const refreshCatalog = useCallback(async (signal?: AbortSignal): Promise<SkillCatalogEntry[]> => {
    const res = await fetch("/api/agents/skills?origins=linked,legacy", { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { skills: SkillCatalogEntry[] };
    return data.skills || [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const skills = await refreshCatalog(ctrl.signal);
        if (!cancelled) setCatalog(skills);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshCatalog]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const catalogKeys = useMemo(() => new Set(catalog.map((c) => c.slug)), [catalog]);
  const toggle = (slug: string) => {
    if (selectedSet.has(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  };

  // Suggestions: recommendedSkills minus what's already attached.
  // - In catalog → "Attach" (one-click append to skills array).
  // - Not in catalog but has source → "Install + attach".
  // - Not in catalog and no source → hidden (can't act on it).
  const suggestions = useMemo(
    () =>
      recommended
        .filter((r) => !selectedSet.has(r.key))
        .filter((r) => catalogKeys.has(r.key) || !!r.source),
    [recommended, selectedSet, catalogKeys]
  );

  const handleInstalled = useCallback(
    async (key: string) => {
      // The dialog has finished a successful import + attach. Refresh the
      // catalog so the new entry appears as a regular chip, and reflect the
      // new attachment in local state.
      const next = await refreshCatalog();
      setCatalog(next);
      if (!selectedSet.has(key)) onChange([...selected, key]);
      setInstallSource(null);
    },
    [refreshCatalog, selected, selectedSet, onChange]
  );

  // Slugs the persona lists that don't exist in the catalog — still render
  // them as chips so the user sees them and can remove them.
  const orphanSlugs = selected.filter((slug) =>
    !catalog.some((entry) => entry.slug === slug)
  );

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          useAppStore.getState().setSection({ type: "settings", slug: "skills" })
        }
        className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        title="Open Settings → Skills"
      >
        Skills →
      </button>
      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading catalog…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          Failed to load catalog: {error}
        </div>
      ) : catalog.length === 0 && selected.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          No skills detected. Add one from{" "}
          <span className="font-medium text-foreground">Settings &rarr; Skills</span>, or drop a{" "}
          <code className="rounded bg-muted px-1 py-0.5">SKILL.md</code> into{" "}
          <code className="rounded bg-muted px-1 py-0.5">.agents/skills/&lt;name&gt;/</code>.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {catalog.map((entry) => {
            const isOn = selectedSet.has(entry.slug);
            return (
              <button
                key={entry.slug}
                type="button"
                onClick={() => toggle(entry.slug)}
                title={entry.description || entry.name}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                  isOn
                    ? "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
                    : "border-border bg-background text-muted-foreground hover:border-border/70 hover:text-foreground"
                )}
              >
                {isOn ? (
                  <Check className="size-3" />
                ) : (
                  <Sparkles className="size-3 text-muted-foreground/60" />
                )}
                {entry.name}
                <span className="ml-0.5 font-mono text-[10.5px] opacity-60">
                  {entry.slug}
                </span>
              </button>
            );
          })}
          {orphanSlugs.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => toggle(slug)}
              title="Not found in catalog — click to remove"
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[12.5px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
              <CircleAlert className="size-3" />
              {slug}
              <span className="ml-0.5 font-mono text-[10.5px] opacity-60">orphan</span>
            </button>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Suggested for this role
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((rec) => {
              const installed = catalogKeys.has(rec.key);
              if (installed) {
                return (
                  <button
                    key={rec.key}
                    type="button"
                    onClick={() => toggle(rec.key)}
                    title="Recommended for this role — click to attach"
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-violet-500/40 bg-violet-500/5 px-2.5 py-1 text-[12.5px] font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/15"
                  >
                    <Sparkles className="size-3" />
                    {rec.key}
                    <span className="ml-0.5 text-[10.5px] opacity-70">attach</span>
                  </button>
                );
              }
              return (
                <button
                  key={rec.key}
                  type="button"
                  onClick={() => rec.source && setInstallSource(rec.source)}
                  title={`Recommended but not installed — click to preview & install from ${rec.source}`}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 bg-muted/40 px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:bg-muted/70"
                >
                  <Download className="size-3" />
                  {rec.key}
                  <span className="ml-0.5 text-[10.5px] opacity-70">
                    not installed
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {installSource !== null && (
        <SkillAddDialog
          open
          onOpenChange={(o) => {
            if (!o) setInstallSource(null);
          }}
          initialSource={installSource}
          attachToAgents={[agentSlug]}
          onImported={handleInstalled}
        />
      )}
    </div>
  );
}

/* ─── Schedule view (full calendar) ─── */
function ScheduleView({
  persona,
  jobs,
  conversations,
  onEventClick,
  onClose,
}: {
  persona: AgentPersona;
  jobs: AgentJob[];
  conversations: ConversationMeta[];
  onEventClick: (c: ConversationMeta) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const cabinetAgent = useMemo(() => personaToCabinetAgent(persona), [persona]);
  const cabinetJobs = useMemo(
    () => jobs.map((j) => jobToCabinetJob(j, persona)),
    [jobs, persona]
  );

  const shift = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (mode === "day") d.setDate(d.getDate() + dir);
    else if (mode === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/40">
        <div className="flex items-center gap-1">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "text-[12px] px-2.5 py-1 rounded capitalize",
                mode === m
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => shift(-1)}
          >
            ←
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => shift(1)}
          >
            →
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ScheduleCalendar
          mode={mode}
          anchor={anchor}
          agents={[cabinetAgent]}
          jobs={cabinetJobs}
          manualConversations={conversations}
          onEventClick={(e) => {
            if (e.sourceType === "manual" && e.conversationId) {
              const c = conversations.find((x) => x.id === e.conversationId);
              if (c) onEventClick(c);
            }
          }}
          onDayClick={(d) => {
            setMode("day");
            setAnchor(d);
          }}
        />
      </div>
      {/* Inert reference to onClose for future ESC shortcut */}
      <button type="button" className="sr-only" onClick={onClose}>
        close schedule
      </button>
    </div>
  );
}

/* ─── Persona editor (markdown viewer / editor, no section chrome) ─── */
function PersonaEditor({
  persona,
  onSave,
}: {
  persona: AgentPersona;
  onSave: (body: string) => Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const loadingRef = useRef(false);

  const editor = useEditor({
    extensions: editorExtensions,
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none",
          "prose prose-sm dark:prose-invert max-w-none",
          "prose-headings:font-semibold",
          "prose-h1:text-[16px] prose-h2:text-[14px] prose-h3:text-[13px]",
          "prose-p:text-[13px] prose-li:text-[13px]",
          "prose-code:text-[12px] prose-code:bg-muted prose-code:px-1 prose-code:rounded",
          "prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border",
          "prose-strong:text-foreground",
          "min-h-[220px]"
        ),
      },
    },
    onUpdate: () => {
      if (loadingRef.current) return;
      setDirty(true);
    },
  });

  // Load persona body into the editor when it changes externally and we aren't mid-edit.
  useEffect(() => {
    let cancelled = false;
    if (!editor) return;
    if (dirty) return;
    const md = persona.body || "";
    (async () => {
      const html = md.trim() ? await markdownToHtml(md) : "";
      if (cancelled || !editor) return;
      loadingRef.current = true;
      editor.commands.setContent(html, { emitUpdate: false });
      loadingRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, persona.body, dirty]);

  const handleSave = async () => {
    if (!editor || !dirty) return;
    const html = editor.getHTML();
    const md = htmlToMarkdown(html);
    if (md === (persona.body || "")) {
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(md);
      setSavedAt(Date.now());
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!editor) return;
    const md = persona.body || "";
    const html = md.trim() ? await markdownToHtml(md) : "";
    loadingRef.current = true;
    editor.commands.setContent(html, { emitUpdate: false });
    loadingRef.current = false;
    setDirty(false);
  };

  // ⌘↵ save, Esc revert — scoped to the editor DOM only.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape" && dirty) {
        e.preventDefault();
        handleDiscard();
      }
    };
    dom.addEventListener("keydown", handler);
    return () => dom.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, dirty]);

  return (
    <div className="px-6 pt-8 pb-12 border-t border-border/40">
      <div className="flex items-center justify-between mb-3 h-7">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          Persona instructions
        </span>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-[11px] text-muted-foreground italic">
              Unsaved changes
            </span>
          ) : savedAt ? (
            <span className="text-[11px] text-muted-foreground">Saved</span>
          ) : null}
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1.5"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            Save
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-muted/10 px-4 py-3 focus-within:border-border focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/30 transition-colors">
        <EditorContent editor={editor} />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/70">
        ⌘↵ to save · Esc to revert · / for commands
      </p>
    </div>
  );
}

/* ─── Main ─── */
export function AgentDetailV2({
  slug,
  cabinetPath,
  onBack,
  onOpenConversation,
  onSeeAllConversations,
}: {
  slug: string;
  /** Cabinet the agent lives in. Required to resolve personas outside the
   *  root cabinet — if omitted, the API falls back to the root ("."). */
  cabinetPath?: string;
  onBack?: () => void;
  onOpenConversation?: (c: ConversationMeta) => void;
  onSeeAllConversations?: () => void;
}) {
  const [persona, setPersona] = useState<AgentPersona | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [inboxTasks, setInboxTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [routineEditJob, setRoutineEditJob] = useState<JobConfig | null>(null);

  // Schedule handoff — lets the user convert the current composer draft into
  // a recurring routine or heartbeat by opening StartWorkDialog seeded with
  // the draft + this agent.
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState<StartWorkMode>("recurring");
  const [handoffPrompt, setHandoffPrompt] = useState("");

  const effectiveCabinetPath = persona?.cabinetPath ?? cabinetPath;

  const refresh = useCallback(async () => {
    try {
      const cabinetQuery = cabinetPath
        ? `?cabinetPath=${encodeURIComponent(cabinetPath)}`
        : "";
      const agentConvosQuery =
        `agent=${encodeURIComponent(slug)}&limit=50` +
        (cabinetPath ? `&cabinetPath=${encodeURIComponent(cabinetPath)}` : "");
      const tasksQuery =
        `agent=${encodeURIComponent(slug)}` +
        (cabinetPath ? `&cabinetPath=${encodeURIComponent(cabinetPath)}` : "");
      const [personaRes, convoRes, jobsRes, tasksRes] = await Promise.all([
        fetch(`/api/agents/personas/${slug}${cabinetQuery}`),
        fetch(`/api/agents/conversations?${agentConvosQuery}`),
        fetch(`/api/agents/${slug}/jobs${cabinetQuery}`),
        fetch(`/api/agents/tasks?${tasksQuery}`),
      ]);
      if (personaRes.ok) {
        const data = await personaRes.json();
        setPersona(data.persona);
      }
      if (convoRes.ok) {
        const data = await convoRes.json();
        setConversations(data.conversations || []);
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setInboxTasks(data.tasks || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [slug, cabinetPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleComposerSubmit = useCallback(
    async (
      message: string,
      runtime: TaskRuntimeSelection,
      extras: {
        attachmentPaths: string[];
        mentionedSkills?: string[];
        stagingClientUuid?: string;
      }
    ) => {
      if (!persona) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/agents/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMessage: message,
            agentSlug: persona.slug,
            cabinetPath: persona.cabinetPath,
            source: "manual",
            providerId: runtime.providerId,
            adapterType: runtime.adapterType,
            model: runtime.model,
            effort: runtime.effort,
            attachmentPaths: extras.attachmentPaths,
            mentionedSkills: extras.mentionedSkills,
            stagingClientUuid: extras.stagingClientUuid,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.conversation && onOpenConversation) {
            onOpenConversation(data.conversation);
          } else {
            await refresh();
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [persona, refresh, onOpenConversation]
  );

  const toggleJob = useCallback(
    async (id: string) => {
      await fetch(`/api/agents/${slug}/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      refresh();
    },
    [slug, refresh]
  );

  const runJob = useCallback(
    async (id: string) => {
      await fetch(`/api/agents/${slug}/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      refresh();
    },
    [slug, refresh]
  );

  const runHeartbeat = useCallback(async () => {
    const body: Record<string, unknown> = { action: "run" };
    if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
    await fetch(`/api/agents/personas/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
  }, [slug, refresh, effectiveCabinetPath]);

  const startInboxTask = useCallback(
    async (task: AgentTask) => {
      if (!persona) return;
      setStartingTaskId(task.id);
      try {
        const prompt =
          task.description?.trim()
            ? `${task.title}\n\n${task.description}`
            : task.title;
        const res = await fetch("/api/agents/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userMessage: prompt,
            agentSlug: persona.slug,
            cabinetPath: persona.cabinetPath,
            source: "manual",
            mentionedPaths: task.kbRefs || [],
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const conversation: ConversationMeta | undefined = data?.conversation;
        if (conversation) {
          await fetch("/api/agents/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              agent: task.toAgent,
              taskId: task.id,
              status: "in_progress",
              cabinetPath: task.cabinetPath,
              linkedConversationId: conversation.id,
              linkedConversationCabinetPath: conversation.cabinetPath,
              startedAt: new Date().toISOString(),
            }),
          });
          if (onOpenConversation) onOpenConversation(conversation);
          else await refresh();
        }
      } finally {
        setStartingTaskId(null);
        refresh();
      }
    },
    [persona, onOpenConversation, refresh]
  );

  const openInboxTask = useCallback(
    (task: AgentTask) => {
      if (task.linkedConversationId) {
        const convo = conversations.find(
          (c) => c.id === task.linkedConversationId
        );
        if (convo && onOpenConversation) {
          onOpenConversation(convo);
          return;
        }
      }
      // No linked run yet — start it.
      startInboxTask(task);
    },
    [conversations, onOpenConversation, startInboxTask]
  );

  const handleExport = useCallback(() => {
    // Stream the persona file via the existing export route; browser handles download.
    window.open(`/api/agents/personas/${slug}/export`, "_blank");
  }, [slug]);

  const handleDelete = useCallback(async () => {
    if (!persona) return;
    const name = getAgentDisplayName(persona) || persona.name || slug;
    const confirmed = await confirmDialog({
      title: `Delete agent "${name}"?`,
      message:
        "Removes the persona file and scheduled jobs. Past conversations stay on disk.",
      confirmText: "Delete agent",
      destructive: true,
    });
    if (!confirmed) return;
    const qs = effectiveCabinetPath
      ? `?cabinetPath=${encodeURIComponent(effectiveCabinetPath)}`
      : "";
    const res = await fetch(`/api/agents/personas/${slug}${qs}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (onBack) onBack();
      else history.back();
    } else {
      showError("Delete failed. Check the console for details.");
    }
  }, [persona, slug, onBack, effectiveCabinetPath]);

  const toggleActive = useCallback(async () => {
    setTogglingActive(true);
    const body: Record<string, unknown> = { action: "toggle" };
    if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
    await fetch(`/api/agents/personas/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setTogglingActive(false);
    refresh();
  }, [slug, refresh, effectiveCabinetPath]);

  const toggleCanDispatch = useCallback(async () => {
    if (!persona) return;
    const current =
      typeof persona.canDispatch === "boolean"
        ? persona.canDispatch
        : persona.type === "lead";
    setPersona((prev) => (prev ? { ...prev, canDispatch: !current } : prev));
    const body: Record<string, unknown> = { canDispatch: !current };
    if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
    await fetch(`/api/agents/personas/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
  }, [persona, slug, refresh, effectiveCabinetPath]);

  const saveField = useCallback(
    async (field: string, value: string) => {
      // Optimistic update so UI responds instantly (avatar, icon, color, etc.)
      if (field !== "tags") {
        setPersona((prev) => prev ? { ...prev, [field]: value } : prev);
      }
      const body: Record<string, unknown> = { [field]: value };
      if (field === "tags") {
        body.tags = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
      await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      refresh();
    },
    [slug, refresh, effectiveCabinetPath]
  );

  const applyOptimistic = useCallback(
    (fields: Record<string, string>) => {
      setPersona((prev) => prev ? { ...prev, ...fields } : prev);
    },
    []
  );

  const saveFields = useCallback(
    async (fields: Record<string, string>) => {
      // Optimistic update — apply immediately so the avatar changes at once
      setPersona((prev) => prev ? { ...prev, ...fields } : prev);
      const body: Record<string, unknown> = { ...fields };
      if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
      const res = await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Only re-fetch on failure to revert — success means server already matches
      if (!res.ok) refresh();
    },
    [slug, refresh, effectiveCabinetPath]
  );

  const saveSkills = useCallback(
    async (slugs: string[]) => {
      const body: Record<string, unknown> = { skills: slugs };
      if (effectiveCabinetPath) body.cabinetPath = effectiveCabinetPath;
      await fetch(`/api/agents/personas/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      refresh();
    },
    [slug, refresh, effectiveCabinetPath]
  );

  const artifacts = useMemo(
    () => aggregateArtifacts(conversations),
    [conversations]
  );

  if (loading || !persona) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const handleOpenConversation = (c: ConversationMeta) => {
    if (onOpenConversation) {
      onOpenConversation(c);
    } else {
      // demo fallback: log + full page nav (if inside main shell this is overridden)
      console.log("open conversation", c);
    }
  };

  const handleOpenPath = (path: string) => {
    // Open the KB page in the main app shell using the canonical URL form
    // (audit #121). Pages with no explicit cabinet context resolve under
    // the root cabinet (`.`).
    const cabinet = persona.cabinetPath || ".";
    const cleanPath = path.replace(/^\/+/, "");
    const hash = `#/cabinet/${encodeURIComponent(cabinet)}/data/${encodeURIComponent(cleanPath)}`;
    window.location.assign(`/${hash}`);
  };

  const status = computeStatus(persona, conversations);

  return (
    <TooltipProvider>
      <div className="h-full w-full flex flex-col overflow-hidden">
        {/* Top bar stays pinned */}
        <div className="shrink-0">
          <TopBar
            persona={persona}
            status={status}
            scheduleOpen={scheduleOpen}
            onBack={onBack || (() => history.back())}
            onToggleSchedule={() => setScheduleOpen((v) => !v)}
            onToggleActive={togglingActive ? () => {} : toggleActive}
            onToggleCanDispatch={toggleCanDispatch}
            onExport={handleExport}
            onDelete={handleDelete}
          />
        </div>
        {scheduleOpen ? (
          <ScheduleView
            persona={persona}
            jobs={jobs}
            conversations={conversations}
            onEventClick={handleOpenConversation}
            onClose={() => setScheduleOpen(false)}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-[840px] w-full flex flex-col">
              <Hero persona={persona} status={status} onSaveFields={saveFields} onApplyOptimistic={applyOptimistic} />
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <Composer
                  persona={persona}
                  onSubmit={handleComposerSubmit}
                  submitting={submitting}
                  onScheduleHandoff={(mode, message) => {
                    setHandoffMode(mode);
                    setHandoffPrompt(message);
                    setHandoffOpen(true);
                  }}
                />
              </div>
              <InboxSection
                tasks={inboxTasks}
                onStart={startInboxTask}
                onOpenTask={openInboxTask}
                startingTaskId={startingTaskId}
              />
              <ConversationsSection
                conversations={conversations}
                onOpen={handleOpenConversation}
                onSeeAll={onSeeAllConversations}
              />
              <RecentWorkSection
                artifacts={artifacts}
                onOpenPath={handleOpenPath}
              />
              <ScheduleSection
                persona={persona}
                jobs={jobs}
                onToggleJob={toggleJob}
                onRunJob={runJob}
                onAddRoutine={() => {
                  setRoutineEditJob(null);
                  setRoutineDialogOpen(true);
                }}
                onEditRoutine={(job) => {
                  setRoutineEditJob(job as unknown as JobConfig);
                  setRoutineDialogOpen(true);
                }}
                onRunHeartbeat={runHeartbeat}
                onToggleActive={togglingActive ? () => {} : toggleActive}
                onManage={() => setScheduleOpen(true)}
              />
              <DetailsSection
                persona={persona}
                onSaveField={saveField}
                onSaveSkills={saveSkills}
              />
              <PersonaEditor
                persona={persona}
                onSave={(body) => saveField("body", body)}
              />
            </div>
          </div>
        )}
        <NewRoutineDialog
          open={routineDialogOpen}
          onOpenChange={setRoutineDialogOpen}
          agent={{
            slug: persona.slug,
            name: persona.name,
            role: persona.role,
            cabinetPath: persona.cabinetPath || cabinetPath,
            provider: persona.provider,
            adapterType: persona.adapterType,
            iconKey: persona.iconKey ?? null,
            color: persona.color ?? null,
          }}
          existingJob={routineEditJob}
          onSaved={() => {
            setRoutineEditJob(null);
            void refresh();
          }}
          onDeleted={() => {
            setRoutineEditJob(null);
            void refresh();
          }}
        />

        <StartWorkDialog
          open={handoffOpen}
          onOpenChange={setHandoffOpen}
          cabinetPath={effectiveCabinetPath || ""}
          agents={[
            {
              scopedId: `${persona.cabinetPath || effectiveCabinetPath || ""}::agent::${persona.slug}`,
              name: persona.name,
              slug: persona.slug,
              emoji: persona.emoji,
              role: persona.role,
              active: persona.active,
              department: persona.department,
              type: persona.type,
              heartbeat: persona.heartbeat,
              workspace: persona.workspace,
              jobCount: 0,
              taskCount: 0,
              cabinetPath: persona.cabinetPath || effectiveCabinetPath || "",
              cabinetName: "",
              cabinetDepth: 0,
              inherited: false,
              displayName: persona.displayName,
              iconKey: persona.iconKey,
              color: persona.color,
              avatar: persona.avatar,
              avatarExt: persona.avatarExt,
            },
          ]}
          initialMode={handoffMode}
          initialPrompt={handoffPrompt}
          initialAgentSlug={persona.slug}
          onStarted={() => {
            setHandoffOpen(false);
            void refresh();
          }}
        />
      </div>
    </TooltipProvider>
  );
}
