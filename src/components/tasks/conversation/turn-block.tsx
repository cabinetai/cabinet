"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  GitBranch,
  Pencil,
  Pause,
  RotateCcw,
  Sparkles,
  User,
} from "lucide-react";
import {
  artifactPathToTreePath,
  inferPageTypeFromPath,
  pageTypeColor,
  pageTypeIcon,
} from "@/lib/ui/page-type-icons";
import { useAppStore, type SelectedSection } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { cn } from "@/lib/utils";
import type { Turn } from "@/types/tasks";
import { Markdown } from "./markdown";
import { TurnAttachments } from "./turn-attachments";
import { ConversationContentViewer } from "@/components/agents/conversation-content-viewer";
import {
  AgentAvatar,
  getAgentDisplayName,
  type AgentAvatarInput,
} from "@/components/agents/agent-avatar";
import { UserAvatar } from "@/components/layout/user-avatar";
import { EditUserAvatarDialog } from "@/components/settings/edit-user-avatar-dialog";
import { Button } from "@/components/ui/button";
import type { UserProfile } from "@/lib/user/profile-io";

export type TurnBlockAgent = AgentAvatarInput & { name?: string };
export type TurnBlockUser = Pick<
  UserProfile,
  "name" | "displayName" | "avatar" | "avatarExt" | "color"
>;

function computeRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function subscribeToTick(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

function RelativeTime({ iso }: { iso: string }) {
  const tick = useSyncExternalStore(
    subscribeToTick,
    () => Math.floor(Date.now() / 30_000),
    () => 0
  );
  const label = tick === 0 ? "\u00a0" : computeRelative(iso);
  return <span suppressHydrationWarning>{label}</span>;
}

const WORK_STAGES = [
  "Reading context",
  "Checking sources",
  "Running tools",
  "Reviewing evidence",
  "Drafting response",
  "Verifying output",
];

function PendingIndicator() {
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * WORK_STAGES.length)
  );
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const verbIv = setInterval(() => {
      setIdx((i) => (i + 1) % WORK_STAGES.length);
    }, 2400);
    const tickIv = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      clearInterval(verbIv);
      clearInterval(tickIv);
    };
  }, []);
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground/75">
        {WORK_STAGES[idx]}
      </span>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        <span className="size-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.3s] [animation-duration:1s]" />
        <span className="size-1 rounded-full bg-primary/70 animate-bounce [animation-delay:-0.15s] [animation-duration:1s]" />
        <span className="size-1 rounded-full bg-primary/70 animate-bounce [animation-duration:1s]" />
      </span>
      {elapsed > 2 ? (
        <span className="ml-1 font-mono text-[10.5px] tabular-nums opacity-60">
          {elapsed}s
        </span>
      ) : null}
    </div>
  );
}

function basename(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

function directory(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts.slice(0, -1).join(" / ");
}

/* eslint-disable react-hooks/static-components */
function KbArtifactRow({
  path,
  returnContext,
}: {
  path: string;
  returnContext?: SelectedSection;
}) {
  const pushSection = useAppStore((s) => s.pushSection);
  const focusPath = useTreeStore((s) => s.focusPath);
  const loadPage = useEditorStore((s) => s.loadPage);
  const kind = inferPageTypeFromPath(path);
  const Icon = pageTypeIcon(kind);
  const color = pageTypeColor(kind);
  const name = basename(path);
  const dir = directory(path);
  return (
    <button
      type="button"
      onClick={() => {
        const treePath = artifactPathToTreePath(path);
        const from = returnContext ?? useAppStore.getState().section;
        focusPath(treePath);
        pushSection({ type: "page", cabinetPath: from.cabinetPath }, from);
        void loadPage(treePath);
      }}
      className="group flex w-full items-center gap-2.5 rounded-md bg-card/80 px-2.5 py-2 text-left ring-1 ring-border/60 transition-colors hover:bg-muted/40"
    >
      <Icon className={cn("size-4 shrink-0", color)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-foreground">
          {name}
        </div>
        {dir ? (
          <div className="truncate text-[10.5px] text-muted-foreground/75">
            {dir}
          </div>
        ) : null}
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
/* eslint-enable react-hooks/static-components */

function collectArtifactPaths(turn: Turn): string[] {
  const seen = new Set<string>();
  for (const artifact of turn.artifacts ?? []) {
    if (
      artifact.kind === "file-edit" ||
      artifact.kind === "file-create" ||
      artifact.kind === "page-edit"
    ) {
      seen.add(artifact.path);
    }
  }
  return [...seen];
}

export function TurnBlock({
  turn,
  agent,
  user,
  returnContext,
  canRetryRun = false,
  retryTitle = "Retry run from the original prompt",
  onRetryRun,
  onForkTurn,
  onUseAsDraft,
}: {
  turn: Turn;
  agent?: TurnBlockAgent | null;
  user?: TurnBlockUser | null;
  returnContext?: SelectedSection;
  canRetryRun?: boolean;
  retryTitle?: string;
  onRetryRun?: () => void;
  onForkTurn?: (turn: Turn) => void;
  onUseAsDraft?: (turn: Turn) => void;
}) {
  const isUser = turn.role === "user";
  const totalTokens = turn.tokens
    ? turn.tokens.input + turn.tokens.output + (turn.tokens.cache ?? 0)
    : null;
  const artifactPaths = collectArtifactPaths(turn);
  const agentLabel = agent ? getAgentDisplayName(agent) || "Agent" : "Agent";
  const userLabel =
    user?.displayName?.trim() || user?.name?.trim() || "You";
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canCopy = turn.content.trim().length > 0;

  const handleCopy = async () => {
    if (
      !canCopy ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access is best-effort in embedded desktop/web contexts.
    }
  };

  return (
    <>
      <div
        className={cn(
          "group/turn flex w-full px-3 py-3 sm:px-4",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 gap-3",
            isUser
              ? "max-w-[88%] flex-row-reverse sm:max-w-[38rem]"
              : "w-full max-w-[46rem]"
          )}
        >
          {isUser ? (
            <button
              type="button"
              onClick={() => setAvatarEditorOpen(true)}
              title="Edit your avatar"
              className="mt-6 shrink-0 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {user ? (
                <UserAvatar profile={user} size="md" shape="circle" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                  <User className="size-3.5" />
                </span>
              )}
            </button>
          ) : agent ? (
            <AgentAvatar
              agent={agent}
              size="md"
              shape="circle"
              className="mt-6"
            />
          ) : (
            <div className="mt-6 flex size-7 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Sparkles className="size-3.5" />
            </div>
          )}

          <div
            className={cn(
              "min-w-0",
              isUser ? "flex flex-col items-end" : "flex-1"
            )}
          >
            <div
              className={cn(
                "mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground",
                isUser && "justify-end"
              )}
            >
              <span className="font-medium text-foreground/80">
                {isUser ? userLabel : agentLabel}
              </span>
              <span>·</span>
              <RelativeTime iso={turn.ts} />
              {totalTokens ? (
                <>
                  <span>·</span>
                  <span className="font-mono tabular-nums">
                    {(totalTokens / 1000).toFixed(1)}k tok
                  </span>
                </>
              ) : null}
              {turn.awaitingInput ? (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  <Pause className="size-2.5" /> awaiting input
                </span>
              ) : null}
            </div>

            <div
              className={cn(
                "min-w-0 rounded-2xl px-4 py-3 shadow-sm",
                isUser
                  ? "rounded-tr-md border border-primary/15 bg-primary/10 text-foreground"
                  : "rounded-tl-md border border-border/60 bg-card/90"
              )}
            >
              {isUser ? (
                <>
                  <Markdown
                    content={turn.content}
                    className="text-[14.5px] leading-[1.65] tracking-normal text-foreground/95"
                  />
                  {turn.attachmentPaths && turn.attachmentPaths.length > 0 ? (
                    <TurnAttachments paths={turn.attachmentPaths} />
                  ) : null}
                </>
              ) : turn.content.trim() ? (
                <ConversationContentViewer text={turn.content} />
              ) : null}

              {!isUser && turn.pending ? <PendingIndicator /> : null}
            </div>

            {canCopy ? (
              <div
                className={cn(
                  "mt-1.5 flex min-h-7 flex-wrap items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/turn:opacity-100 focus-within:opacity-100",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {isUser && onUseAsDraft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    title="Edit as new draft"
                    onClick={() => onUseAsDraft(turn)}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                ) : null}
                {isUser && onForkTurn ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    title="Fork from this turn"
                    onClick={() => onForkTurn(turn)}
                  >
                    <GitBranch className="size-3" />
                    Fork
                  </Button>
                ) : null}
                {!isUser && canRetryRun && onRetryRun ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    title={retryTitle}
                    onClick={onRetryRun}
                  >
                    <RotateCcw className="size-3" />
                    Retry
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  title={copied ? "Copied" : "Copy message"}
                  onClick={() => void handleCopy()}
                >
                  {copied ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : null}

            {artifactPaths.length > 0 ? (
              <div className="mt-2.5 w-full space-y-1.5 rounded-xl border border-border/60 bg-muted/35 p-2 dark:bg-muted/20">
                {artifactPaths.map((path) => (
                  <KbArtifactRow
                    key={path}
                    path={path}
                    returnContext={returnContext}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {isUser ? (
        <EditUserAvatarDialog
          open={avatarEditorOpen}
          onOpenChange={setAvatarEditorOpen}
        />
      ) : null}
    </>
  );
}
