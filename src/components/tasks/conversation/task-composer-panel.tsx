"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Terminal } from "lucide-react";
import {
  ErrorFeedbackDialog,
  type ErrorFeedbackContext,
} from "@/components/feedback/error-feedback-dialog";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  AgentPicker,
  type AgentPickerOption,
} from "@/components/composer/agent-picker";
import {
  WhenChip,
  type StartWorkMode,
} from "@/components/composer/start-work-dialog";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { cn } from "@/lib/utils";
import type { ConversationRuntimeOverride } from "@/types/conversations";
import { useLocale } from "@/i18n/use-locale";

interface PageTreeNode {
  path?: string;
  name?: string;
  children?: PageTreeNode[];
  type?: string;
  frontmatter?: { title?: string };
}

function flattenTreeToMentions(
  nodes: PageTreeNode[] | undefined
): MentionableItem[] {
  if (!nodes || nodes.length === 0) return [];
  const out: MentionableItem[] = [];
  const walk = (children: PageTreeNode[]) => {
    for (const node of children) {
      if (node.path && node.type !== "folder") {
        out.push({
          type: "page",
          id: node.path,
          label: node.frontmatter?.title || node.name || node.path,
          sublabel: node.path,
        });
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export interface TaskComposerPanelProps {
  awaitingInput: boolean;
  /**
   * Initial runtime selection — defaults to the conversation's current
   * adapterType/model/effort so the chip reflects what produced the last turn.
   */
  initialRuntime?: TaskRuntimeSelection;
  /**
   * Cabinet + conversation IDs so attachments upload directly to the
   * conversation's attachments dir (no staging needed on continuation turns).
   */
  cabinetPath?: string;
  conversationId?: string;
  onSend: (payload: {
    text: string;
    mentionedPaths: string[];
    mentionedSkills: string[];
    attachmentPaths: string[];
    runtime: ConversationRuntimeOverride;
  }) => void | Promise<void>;
  /**
   * Pre-built mentionable list (e.g. the AI Panel passes a known set).
   * Omitted → the composer lazy-loads the cabinet tree on demand.
   */
  mentionableItems?: MentionableItem[];
  /** When true, lazy-load the tree from /api/tree and convert to mentions. */
  autoLoadMentions?: boolean;
  /** Optional className for outer wrapper. */
  className?: string;
  disabled?: boolean;
  /**
   * Why the last send failed (the draft is restored by the composer hook).
   * Rendered as a banner above the input; null/undefined hides it.
   */
  sendError?: string | null;
  /**
   * When provided, renders the WhenChip in the composer's top-right corner.
   * Called when the user picks a non-"now" mode (recurring or heartbeat) —
   * the current draft message is forwarded so the parent can open
   * StartWorkDialog seeded with the in-flight prompt.
   */
  onScheduleHandoff?: (
    mode: Exclude<StartWorkMode, "now">,
    message: string
  ) => void;
  /**
   * The agent this conversation is bound to. Surfaces a locked AgentPicker
   * chip so the composer matches other launch surfaces; the picker is
   * non-interactive because continuation turns can't change the agent.
   */
  agent?: AgentPickerOption | null;
  /**
   * Tight surface (the side-panel conversation view): hides the
   * Run-now/Inbox/schedule WhenChip and renders the runtime picker
   * icon-only so the composer isn't visually overloaded.
   */
  compact?: boolean;
}

export function TaskComposerPanel({
  awaitingInput,
  initialRuntime,
  cabinetPath,
  conversationId,
  onSend,
  mentionableItems,
  autoLoadMentions = true,
  className,
  disabled,
  sendError,
  onScheduleHandoff,
  agent,
  compact = false,
}: TaskComposerPanelProps) {
  const { t } = useLocale();
  // Error-feedback dialog (PRD §3.5), opened from the send-error banner.
  const [feedbackContext, setFeedbackContext] =
    useState<ErrorFeedbackContext | null>(null);
  // We don't seed with initialRuntime directly — that way, when the parent
  // re-renders with fresh meta (SSE → fetchTask), the displayed runtime
  // stays in sync until the user explicitly picks one. When they pick, that
  // choice sticks through the send and is cleared again after submit.
  const [userPickedRuntime, setUserPickedRuntime] =
    useState<TaskRuntimeSelection | null>(null);
  const [loadedMentions, setLoadedMentions] = useState<MentionableItem[] | null>(
    null
  );

  const effectiveRuntime: TaskRuntimeSelection = useMemo(
    () => userPickedRuntime ?? initialRuntime ?? {},
    [userPickedRuntime, initialRuntime]
  );

  const handleRuntimeChange = useCallback((value: TaskRuntimeSelection) => {
    setUserPickedRuntime(value);
  }, []);

  // Lazy-load page mentions from the tree when the caller doesn't pre-supply
  // them. /api/tree returns the tree as a bare array — earlier code expected
  // `{ tree }` and silently dropped pages.
  useEffect(() => {
    if (mentionableItems || !autoLoadMentions || loadedMentions) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tree", { cache: "no-store" });
        if (!res.ok) return;
        const raw = (await res.json()) as PageTreeNode[] | { tree?: PageTreeNode[] };
        const tree = Array.isArray(raw) ? raw : raw?.tree;
        if (!cancelled) {
          setLoadedMentions(flattenTreeToMentions(tree));
        }
      } catch {
        if (!cancelled) setLoadedMentions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mentionableItems, autoLoadMentions, loadedMentions]);

  // Lazy-load agent mentions from the cabinet overview. Continuation
  // composers locked to one agent benefit from being able to @-reference
  // OTHER agents (delegation context, handoff notes, etc.) — not from
  // changing this conversation's agent (that's locked by the meta).
  const [agentMentions, setAgentMentions] = useState<MentionableItem[] | null>(
    null,
  );
  useEffect(() => {
    if (mentionableItems || !autoLoadMentions || agentMentions) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCabinetOverviewClient(cabinetPath ?? ".", "all");
        if (!data) {
          if (!cancelled) setAgentMentions([]);
          return;
        }
        const list = (data.agents || []).map<MentionableItem>((a) => ({
          type: "agent",
          id: a.slug,
          label: a.name,
          sublabel: a.role || "",
          icon: a.emoji,
        }));
        if (!cancelled) setAgentMentions(list);
      } catch {
        if (!cancelled) setAgentMentions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mentionableItems, autoLoadMentions, agentMentions, cabinetPath]);

  const skillItems = useSkillMentionItems({
    cabinetPath,
    enabled: !mentionableItems && autoLoadMentions,
  });

  const items = useMemo(
    () =>
      mentionableItems ?? [
        ...(agentMentions ?? []),
        ...skillItems,
        ...(loadedMentions ?? []),
      ],
    [mentionableItems, agentMentions, skillItems, loadedMentions]
  );

  const handleSubmit = useCallback(
    async ({
      message,
      mentionedPaths,
      mentionedSkills,
      attachmentPaths,
    }: {
      message: string;
      mentionedPaths: string[];
      mentionedSkills: string[];
      attachmentPaths: string[];
    }) => {
      await onSend({
        text: message,
        mentionedPaths,
        mentionedSkills,
        attachmentPaths,
        runtime: {
          providerId: effectiveRuntime.providerId,
          adapterType: effectiveRuntime.adapterType,
          model: effectiveRuntime.model,
          effort: effectiveRuntime.effort,
          runtimeMode: effectiveRuntime.runtimeMode,
        },
      });
      // Reset the user's explicit pick after send so the composer snaps
      // back to whatever runtime the next turn settles on.
      setUserPickedRuntime(null);
    },
    [onSend, effectiveRuntime]
  );

  // Continuation turns upload directly into the existing conversation's
  // attachments dir — no staging needed. When conversationId is missing
  // (shouldn't happen for this surface), fall back to a stable random id
  // so the hook's staging path is well-formed. Lazy useState (not useMemo):
  // the initializer runs once per mount, so the impure id generation never
  // re-executes on re-render.
  const [clientAttachmentId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}`
  );
  const attachments = useComposerAttachments({
    cabinetPath,
    conversationId,
    clientAttachmentId,
  });

  const composer = useComposer({
    items,
    onSubmit: handleSubmit,
    disabled,
    attachments,
  });

  return (
    <div
      className={cn(
        "bg-background px-4 pt-3",
        // Drawer: keep the footnote hint close to the bottom edge.
        compact ? "pb-1.5" : "pb-3",
        awaitingInput && "bg-amber-500/[0.04]",
        className
      )}
    >
      {awaitingInput ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
          </span>
          Agent is waiting for your reply
        </div>
      ) : null}

      {sendError ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-400">
          <AlertCircle className="size-3 mt-[2px] shrink-0" />
          <span className="flex-1">{sendError}</span>
          <button
            type="button"
            className="shrink-0 underline decoration-red-500/50 underline-offset-2 hover:decoration-red-500"
            onClick={() => setFeedbackContext({ errorMessage: sendError, errorScope: "composer", conversationId })}
          >
            Feedback
          </button>
        </div>
      ) : null}

      {feedbackContext ? (
        <ErrorFeedbackDialog
          context={feedbackContext}
          onClose={() => setFeedbackContext(null)}
        />
      ) : null}

      {effectiveRuntime.runtimeMode === "terminal" ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Terminal className="size-3" />
          <span>
            Sending in <strong>terminal mode</strong>, which opens a live PTY stream
          </span>
        </div>
      ) : null}

      {/* PTY/terminal-mode mid-conversation caveat: structured adapters
          re-mount skills per turn via --plugin-dir, but a live PTY session
          can't dynamically register new skills. The model still sees the
          @-mentioned skill described in the prompt, so it knows what to do,
          but the skill isn't discoverable as a slash command for this turn. */}
      {effectiveRuntime.runtimeMode === "terminal" &&
      composer.mentions.skills.length > 0 ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          <Terminal className="size-3 mt-[2px] shrink-0" />
          <span>
            <strong>{t("tinyExtras:headsUp")}</strong> mid-session skill mentions in terminal
            mode reach the model via prompt text only, not as live{" "}
            <code className="text-[10px]">/skill</code> commands. New tasks
            (non-terminal) get the full mount.
          </span>
        </div>
      ) : null}

      <ComposerInput
        composer={composer}
        items={items}
        attachments={attachments}
        placeholder={
          awaitingInput ? "Reply to the agent…" : "Continue the conversation…"
        }
        autoFocus={awaitingInput}
        showKeyHint={false}
        minHeight="52px"
        className={awaitingInput ? "[&>div:first-child]:border-amber-500/40" : undefined}
        topRightOverlay={
          onScheduleHandoff && !compact ? (
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
            {agent ? (
              <AgentPicker
                agents={[agent]}
                selectedSlug={agent.slug}
                disabled
                disabledReason={`Continuing with ${agent.displayName ?? agent.name}. The agent can't change mid-conversation`}
              />
            ) : null}
            <TaskRuntimePicker
              value={effectiveRuntime}
              onChange={handleRuntimeChange}
              align="start"
              compact={compact}
            />
          </>
        }
      />

      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
        ⌘↵ to send · @ to mention · this turn&rsquo;s runtime:{" "}
        {effectiveRuntime.model || effectiveRuntime.providerId || "default"}
      </p>
    </div>
  );
}
