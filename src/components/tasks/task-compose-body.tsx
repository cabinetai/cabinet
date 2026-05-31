"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAppStore, type TaskPanelComposeContext } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { flattenTree } from "@/lib/tree-utils";
import { createConversation } from "@/lib/agents/conversation-client";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { ComposerInput } from "@/components/composer/composer-input";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  AgentPicker,
  type AgentPickerOption,
} from "@/components/composer/agent-picker";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import type { AgentListItem } from "@/types/agents";

interface TaskComposeBodyProps {
  context: TaskPanelComposeContext | null;
}

/**
 * The "new task" composer that fills the drawer before a conversation
 * exists. On submit it creates the conversation and swaps the SAME drawer
 * into the live view via `swapToConversation`. Reuses the shared composer
 * stack (mentions, agent picker, runtime picker); no editor-session
 * bookkeeping (the live conversation renders through TaskConversationPage).
 */
export function TaskComposeBody({ context }: TaskComposeBodyProps) {
  const swapToConversation = useAppStore((s) => s.swapToConversation);
  const treeNodes = useTreeStore((s) => s.nodes);
  const [agents, setAgents] = useState<AgentListItem[]>([]);

  const pinnedPagePath = context?.pinnedPagePath ?? null;
  const editorScoped = context?.source === "editor";
  const defaultAgentSlug = context?.defaultAgentSlug ?? (editorScoped ? "editor" : "");

  const skillItems = useSkillMentionItems({ enabled: true });

  const mentionItems: MentionableItem[] = useMemo(
    () => [
      ...agents
        .filter((a) => a.slug !== "editor")
        .map((a) => ({
          type: "agent" as const,
          id: a.slug,
          label: a.name,
          sublabel: a.role || "",
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
    [agents, skillItems, treeNodes]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCabinetOverviewClient(".", "all");
        if (!data || cancelled) return;
        setAgents(
          (data.agents || []).map((a) => ({
            name: a.name,
            slug: a.slug,
            emoji: a.emoji || "",
            role: a.role || "",
            active: a.active,
          })) as AgentListItem[]
        );
      } catch {
        /* non-fatal — picker just shows fewer agents */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [pickedAgentSlug, setPickedAgentSlug] = useState<string>(defaultAgentSlug);

  const agentPickerOptions = useMemo<AgentPickerOption[]>(() => {
    const others = agents
      .filter((a) => a.slug !== "editor")
      .map((a) => ({
        slug: a.slug,
        name: a.name,
        role: a.role,
        cabinetPath: a.cabinetPath,
        iconKey: (a as { iconKey?: string | null }).iconKey,
        color: (a as { color?: string | null }).color,
        avatar: (a as { avatar?: string | null }).avatar,
        avatarExt: (a as { avatarExt?: string | null }).avatarExt,
      }));
    const lead: AgentPickerOption = editorScoped
      ? { slug: "editor", name: "Editor", role: "Edits the current page" }
      : ({ slug: "", name: "Auto", role: "editor → first agent" } as AgentPickerOption);
    return [lead, ...others];
  }, [agents, editorScoped]);

  // No cabinet context in this drawer — mirror the home composer and stage
  // attachments under the root cabinet's _pending/<uuid> dir until submit
  // hands them to the new conversation.
  const stagingClientUuid = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`,
    []
  );
  const attachments = useComposerAttachments({
    cabinetPath: undefined,
    clientAttachmentId: stagingClientUuid,
  });

  const composer = useComposer({
    items: mentionItems,
    pinnedPagePath,
    attachments,
    stagingClientUuid,
    onSubmit: async ({
      message,
      mentionedPaths,
      mentionedAgents,
      mentionedSkills,
      attachmentPaths,
      stagingClientUuid: turnStagingUuid,
    }) => {
      // @-mention wins; otherwise the picker (empty slug = Auto = editor
      // fallback, mirroring the home composer).
      const mentionTarget = mentionedAgents.length > 0 ? mentionedAgents[0] : null;
      const pickedTarget =
        pickedAgentSlug && pickedAgentSlug !== "editor" ? pickedAgentSlug : null;
      const targetAgent = mentionTarget ?? pickedTarget;

      const data = await createConversation(
        editorScoped && pinnedPagePath && !targetAgent
          ? {
              source: "editor",
              pagePath: pinnedPagePath,
              userMessage: message,
              mentionedPaths,
              mentionedSkills,
              attachmentPaths,
              stagingClientUuid: turnStagingUuid,
              ...taskRuntime,
            }
          : {
              agentSlug: targetAgent || "editor",
              userMessage: message,
              mentionedPaths,
              mentionedSkills,
              attachmentPaths,
              stagingClientUuid: turnStagingUuid,
              ...taskRuntime,
            }
      );

      // The user may have closed the drawer mid-create; only swap if it's
      // still open. The conversation still exists (reachable from Tasks).
      if (useAppStore.getState().taskPanelOpen) {
        swapToConversation(data.conversation);
      }
    },
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <Sparkles className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">
          {context?.greeting
            ? context.greeting
            : editorScoped
              ? "Tell me how you'd like to edit this page."
              : "Describe a new task to start."}
        </p>
      </div>

      <div className="shrink-0 p-3">
        <div className="rounded-2xl bg-muted/50 ring-1 ring-border/50">
          <ComposerInput
            composer={composer}
            placeholder="use @ to mention agents, skills & pages"
            variant="inline"
            minHeight="56px"
            items={mentionItems}
            showKeyHint={false}
            autoFocus
            attachments={attachments}
            actionsStart={
              <>
                <AgentPicker
                  agents={agentPickerOptions}
                  selectedSlug={pickedAgentSlug}
                  onSelect={setPickedAgentSlug}
                />
                <TaskRuntimePicker value={taskRuntime} onChange={setTaskRuntime} />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
