"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Terminal } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { ConversationRuntimeOverride } from "@/types/conversations";

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
  onScheduleHandoff,
  agent,
}: TaskComposerPanelProps) {
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

  // Lazy-load mentions from the tree when the caller doesn't pre-supply them.
  useEffect(() => {
    if (mentionableItems || !autoLoadMentions || loadedMentions) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tree", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tree?: PageTreeNode[] };
        if (!cancelled) {
          setLoadedMentions(flattenTreeToMentions(data.tree));
        }
      } catch {
        if (!cancelled) setLoadedMentions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mentionableItems, autoLoadMentions, loadedMentions]);

  const skillItems = useSkillMentionItems({
    cabinetPath,
    enabled: !mentionableItems && autoLoadMentions,
  });

  const items = useMemo(
    () => mentionableItems ?? [...(loadedMentions ?? []), ...skillItems],
    [mentionableItems, loadedMentions, skillItems]
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
  // so the hook's staging path is well-formed.
  const clientAttachmentId = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`,
    []
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
        "bg-background px-4 py-3",
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

      {effectiveRuntime.runtimeMode === "terminal" ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Terminal className="size-3" />
          <span>
            Sending in <strong>terminal mode</strong> — opens a live PTY stream
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
        maxHeight="240px"
        className={awaitingInput ? "[&>div:first-child]:border-amber-500/40" : undefined}
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
            {agent ? (
              <AgentPicker
                agents={[agent]}
                selectedSlug={agent.slug}
                disabled
                disabledReason={`Continuing with ${agent.displayName ?? agent.name} — agent can't change mid-conversation`}
              />
            ) : null}
            <TaskRuntimePicker
              value={effectiveRuntime}
              onChange={handleRuntimeChange}
              align="start"
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
