"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, UsersRound } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  StartWorkDialog,
  WhenChip,
  type StartWorkMode,
} from "@/components/composer/start-work-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import { createConversation } from "@/lib/agents/conversation-client";
import { flattenTree } from "@/lib/tree-utils";
import { useTreeStore } from "@/stores/tree-store";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { cn } from "@/lib/utils";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { getGreeting } from "./cabinet-utils";
import { useLocale } from "@/i18n/use-locale";

export function CabinetTaskComposer({
  cabinetPath,
  agents,
  displayName,
  cabinetName,
  cabinetDescription,
  requestedAgent,
  focusRequest,
  onNavigate,
}: {
  cabinetPath: string;
  agents: CabinetAgentSummary[];
  displayName: string;
  cabinetName?: string;
  cabinetDescription?: string;
  requestedAgent?: CabinetAgentSummary | null;
  focusRequest?: number;
  onNavigate: (agentSlug: string, agentCabinetPath: string, conversationId: string) => void;
}) {
  const { t } = useLocale();
  const [pickedAgent, setPickedAgent] = useState<CabinetAgentSummary | null>(null);
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState<StartWorkMode>("recurring");
  const rootRef = useRef<HTMLDivElement>(null);
  const treeNodes = useTreeStore((state) => state.nodes);
  const pages = useMemo(() => flattenTree(treeNodes), [treeNodes]);

  // The default selection is DERIVED, not synced via an effect
  // (react-hooks/set-state-in-effect): until the user explicitly picks an
  // agent, follow the best available one — which also keeps the selection
  // valid if the agents list changes underneath.
  const defaultAgent = useMemo(() => {
    if (agents.length === 0) return null;
    return (
      agents.find((agent) => agent.cabinetDepth === 0 && agent.active) ||
      agents.find((agent) => agent.active) ||
      agents[0]
    );
  }, [agents]);
  const selectedAgent = pickedAgent ?? defaultAgent;

  // Prop-driven selection ("start a task with this agent"): adjust state
  // during render instead of in an effect — the pattern from
  // react.dev/learn/you-might-not-need-an-effect.
  const [prevRequestedAgent, setPrevRequestedAgent] = useState(
    requestedAgent ?? null
  );
  if ((requestedAgent ?? null) !== prevRequestedAgent) {
    setPrevRequestedAgent(requestedAgent ?? null);
    if (requestedAgent) setPickedAgent(requestedAgent);
  }

  const greeting = getGreeting();
  const activeAgents = agents.filter((agent) => agent.active);
  const assignableAgents = activeAgents.length > 0 ? activeAgents : agents;

  const skillItems = useSkillMentionItems({ cabinetPath });

  const mentionItems = useMemo<MentionableItem[]>(
    () => [
      ...assignableAgents.map((agent) => ({
        type: "agent" as const,
        id: agent.scopedId,
        label: agent.name,
        sublabel: agent.inherited ? `${agent.role} · ${agent.cabinetName}` : agent.role,
        icon: agent.emoji,
      })),
      ...skillItems,
      ...pages.map((page) => ({
        type: "page" as const,
        id: page.path,
        label: page.title,
        sublabel: page.path,
      })),
    ],
    [assignableAgents, skillItems, pages]
  );

  // Lazy useState (not useMemo): the initializer runs once per mount, so
  // the impure id generation never re-executes on re-render.
  const [stagingClientUuid] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}`
  );
  const attachmentsCabinetPath =
    selectedAgent?.cabinetPath || cabinetPath;
  const attachments = useComposerAttachments({
    cabinetPath: attachmentsCabinetPath,
    clientAttachmentId: stagingClientUuid,
  });

  const composer = useComposer({
    items: mentionItems,
    disabled: !selectedAgent,
    attachments,
    stagingClientUuid,
    getMentionInsertBehavior: (item) => {
      if (item.type !== "agent") return;
      const nextAgent =
        assignableAgents.find((agent) => agent.scopedId === item.id) || null;
      if (nextAgent) {
        setPickedAgent(nextAgent);
      }
      return {
        replaceText: "",
        trackMention: false,
      };
    },
    onSubmit: async ({
      message,
      mentionedPaths,
      mentionedSkills,
      attachmentPaths,
      stagingClientUuid: turnStagingUuid,
    }) => {
      if (!selectedAgent) return;
      const agentCabinetPath = selectedAgent.cabinetPath || cabinetPath;
      const data = await createConversation({
        agentSlug: selectedAgent.slug,
        userMessage: message,
        mentionedPaths,
        mentionedSkills,
        attachmentPaths,
        stagingClientUuid: turnStagingUuid,
        cabinetPath: agentCabinetPath,
        ...taskRuntime,
      });
      onNavigate(selectedAgent.slug, agentCabinetPath, data.conversation.id);
    },
  });

  useEffect(() => {
    if (!focusRequest) return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      composer.textareaRef.current?.focus();
    }, 120);
  }, [composer.textareaRef, focusRequest]);

  const placeholder = selectedAgent
    ? `What should ${selectedAgent.name} work on?`
    : "Choose an agent and describe the next task.";

  // Only weave in the name when we actually have one — an unknown user is
  // greeted "Good evening. What are we working on today?" instead of the
  // broken-merge-field "…, there." (#001).
  const greetingLine = displayName
    ? `${greeting}, ${displayName}. What are we working on today?`
    : `${greeting}. What are we working on today?`;

  return (
    <div ref={rootRef} className="space-y-5">
      <div className="space-y-2">
        {cabinetName ? (
          <>
            <h1 className="font-body-serif text-[2.2rem] leading-none tracking-tight text-foreground">
              {cabinetName}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {cabinetDescription || greetingLine}
            </p>
          </>
        ) : (
          <h1 className="font-body-serif text-[1.45rem] leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
            {greetingLine}
          </h1>
        )}
      </div>

      {agents.length === 0 ? (
        // Audit #014: a cabinet with no agents used to show a fully-disabled
        // composer with no escape ("Choose an agent…" with nothing to choose).
        // Give that dead end a real next step instead.
        <div className="rounded-2xl border border-foreground/10 bg-card p-7 text-center shadow-[0_1px_3px_rgb(0_0_0/0.05)]">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <UsersRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">No agents in this cabinet yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add your first agent to start delegating work, then this composer comes alive.
          </p>
          <button
            type="button"
            onClick={() => useAppStore.getState().setSection({ type: "agents" })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Add your first agent
          </button>
        </div>
      ) : (
        <>
          <ComposerInput
            composer={composer}
            placeholder={placeholder}
            submitLabel="Start"
            items={mentionItems}
            attachments={attachments}
            minHeight="72px"
            className="w-full"
            mentionDropdownPlacement="below"
            topRightOverlay={
              <WhenChip
                mode="now"
                onChange={(next) => {
                  if (next === "now") return;
                  setHandoffMode(next);
                  setHandoffOpen(true);
                }}
              />
            }
            actionsStart={
              <>
                <AgentPickerCompact
                  agents={assignableAgents}
                  selected={selectedAgent}
                  onSelect={setPickedAgent}
                />
                <TaskRuntimePicker
                  value={taskRuntime}
                  onChange={setTaskRuntime}
                />
              </>
            }
          />

          <StartWorkDialog
            open={handoffOpen}
            onOpenChange={setHandoffOpen}
            cabinetPath={cabinetPath}
            agents={assignableAgents}
            initialMode={handoffMode}
            initialPrompt={composer.input}
            initialAgentSlug={selectedAgent?.slug}
            onStarted={(conversationId, conversationCabinetPath) => {
              composer.reset();
              if (selectedAgent) {
                onNavigate(
                  selectedAgent.slug,
                  conversationCabinetPath || selectedAgent.cabinetPath || cabinetPath,
                  conversationId
                );
              }
            }}
          />
        </>
      )}
    </div>
  );
}

function AgentPickerCompact({
  agents,
  selected,
  onSelect,
}: {
  agents: CabinetAgentSummary[];
  selected: CabinetAgentSummary | null;
  onSelect: (agent: CabinetAgentSummary) => void;
}) {
  const { t } = useLocale();
  const disabled = agents.length === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background pl-1 pr-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        )}
        disabled={disabled}
        title={selected ? `Assigned to ${selected.displayName ?? selected.name}` : "Pick an agent"}
      >
        {selected ? (
          <>
            <AgentAvatar agent={selected} shape="circle" size="md" />
            <span className="text-[11px] font-medium text-foreground">
              {selected.displayName ?? selected.name}
            </span>
          </>
        ) : (
          <span className="px-1 text-[11px]">{t("cabinetsExtras:noAgents")}</span>
        )}
        <ChevronDown className="size-3 text-muted-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto scrollbar-thin p-1">
        {agents.map((agent) => {
          const isSelected = selected?.scopedId === agent.scopedId;
          return (
            <DropdownMenuItem
              key={agent.scopedId}
              onClick={() => onSelect(agent)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]",
                isSelected && "bg-accent text-accent-foreground"
              )}
            >
              <AgentAvatar agent={agent} shape="circle" size="md" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {agent.displayName ?? agent.name}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {agent.role}
                  {agent.inherited ? ` · ${agent.cabinetName}` : ""}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

