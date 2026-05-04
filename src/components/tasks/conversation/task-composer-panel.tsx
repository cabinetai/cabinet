"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { GitBranch, Terminal, X } from "lucide-react";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import { TaskProductToolPicker } from "@/components/composer/task-product-tool-picker";
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

export interface TaskComposerPayload {
  text: string;
  mentionedPaths: string[];
  mentionedSkills: string[];
  attachmentPaths: string[];
  productToolNames: string[];
  runtime: ConversationRuntimeOverride;
}

export interface TaskComposerDraftSeed {
  id: string;
  text: string;
  mode?: "fork";
  label?: string;
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
  onSend: (payload: TaskComposerPayload) => void | Promise<void>;
  onSendDraftSeed?: (payload: TaskComposerPayload) => void | Promise<void>;
  onCancelDraftSeed?: () => void;
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
  draftSeed?: TaskComposerDraftSeed | null;
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
  draftSeed,
  onSendDraftSeed,
  onCancelDraftSeed,
}: TaskComposerPanelProps) {
  // We don't seed with initialRuntime directly — that way, when the parent
  // re-renders with fresh meta (SSE → fetchTask), the displayed runtime
  // stays in sync until the user explicitly picks one. When they pick, that
  // choice sticks through the send and is cleared again after submit.
  const [userPickedRuntime, setUserPickedRuntime] =
    useState<TaskRuntimeSelection | null>(null);
  const [productToolNames, setProductToolNames] = useState<string[]>([]);
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
      const payload: TaskComposerPayload = {
        text: message,
        mentionedPaths,
        mentionedSkills,
        attachmentPaths,
        productToolNames,
        runtime: {
          providerId: effectiveRuntime.providerId,
          adapterType: effectiveRuntime.adapterType,
          model: effectiveRuntime.model,
          effort: effectiveRuntime.effort,
          runtimeMode: effectiveRuntime.runtimeMode,
        },
      };
      if (draftSeed?.mode === "fork" && onSendDraftSeed) {
        await onSendDraftSeed(payload);
      } else {
        await onSend(payload);
      }
      // Reset the user's explicit pick after send so the composer snaps
      // back to whatever runtime the next turn settles on.
      setUserPickedRuntime(null);
      setProductToolNames([]);
    },
    [draftSeed?.mode, onSend, onSendDraftSeed, effectiveRuntime, productToolNames]
  );

  // Continuation turns upload directly into the existing conversation's
  // attachments dir — no staging needed. When conversationId is missing
  // (shouldn't happen for this surface), fall back to a stable client id
  // so the hook's staging path is well-formed.
  const fallbackAttachmentId = useId();
  const clientAttachmentId = `c-${fallbackAttachmentId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
  const lastDraftSeedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!draftSeed) return;
    if (lastDraftSeedIdRef.current === draftSeed.id) return;
    lastDraftSeedIdRef.current = draftSeed.id;
    composer.setInput(draftSeed.text);
    window.setTimeout(() => {
      const textarea = composer.textareaRef.current;
      textarea?.focus();
      if (textarea) {
        const end = draftSeed.text.length;
        textarea.selectionStart = end;
        textarea.selectionEnd = end;
      }
    }, 0);
  }, [composer, draftSeed]);

  return (
    <div
      className={cn(
        "px-3 py-3 sm:px-4",
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

      {draftSeed?.mode === "fork" ? (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="shrink-0 font-semibold">Branch draft</span>
          <span className="min-w-0 flex-1 truncate text-primary/85">
            {draftSeed.label || "Editing as a new branch"}
          </span>
          {onCancelDraftSeed ? (
            <button
              type="button"
              className="rounded p-0.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
              title="Cancel branch draft"
              onClick={onCancelDraftSeed}
            >
              <X className="size-3" />
            </button>
          ) : null}
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
            <strong>Heads up:</strong> mid-session skill mentions in terminal
            mode reach the model via prompt text only — not as live{" "}
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
          awaitingInput ? "Reply to the agent…" : "Message Optale Command…"
        }
        variant="chat"
        autoFocus={awaitingInput}
        showKeyHint={false}
        minHeight="56px"
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
            <TaskProductToolPicker
              value={productToolNames}
              onChange={setProductToolNames}
              disabled={disabled}
            />
          </>
        }
      />

      <p className="mt-1.5 hidden px-1 text-[10px] text-muted-foreground sm:block">
        ⌘↵ to send · @ to mention · this turn&rsquo;s runtime:{" "}
        {effectiveRuntime.model || effectiveRuntime.providerId || "default"}
      </p>
    </div>
  );
}
