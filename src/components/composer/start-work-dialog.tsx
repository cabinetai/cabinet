"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, HeartPulse, Inbox, Repeat, X, Zap } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  RoutineFields,
  HeartbeatFields,
  slugifyId,
  type RoutineDraft,
  type HeartbeatDraft,
} from "@/components/composer/scheduling-fields";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { flattenTree } from "@/lib/tree-utils";
import { createConversation } from "@/lib/agents/conversation-client";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import type { CabinetAgentSummary } from "@/types/cabinets";
import type { JobConfig } from "@/types/jobs";
import { useLocale } from "@/i18n/use-locale";

const PLACEHOLDERS = [
  "Write a blog post about our Q2 results...",
  "Analyze user churn and suggest three concrete improvements...",
  "Review last week's metrics and flag anything unusual...",
  "Draft a partnership proposal for the Acme integration...",
  "Summarize key insights from customer discovery interviews...",
  "Prepare a competitive landscape update for the board...",
  "Create a rollout plan for the new onboarding flow...",
  "Audit our pricing page and suggest A/B test ideas...",
];

const DEFAULT_HEARTBEAT = "0 9 * * 1-5";

export type StartWorkMode = "now" | "inbox" | "recurring" | "heartbeat";

export function StartWorkDialog({
  open,
  onOpenChange,
  cabinetPath,
  agents,
  initialMode = "now",
  initialPrompt,
  initialAgentSlug,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinetPath: string;
  agents: CabinetAgentSummary[];
  initialMode?: StartWorkMode;
  /** Seed the prompt (used when the inline composers hand off to the dialog
   *  after the user picks a non-"now" mode — preserves what they already typed). */
  initialPrompt?: string;
  /** Seed the selected agent. Falls back to the first active agent. */
  initialAgentSlug?: string;
  onStarted?: (conversationId: string, conversationCabinetPath?: string) => void;
}) {
  const { t } = useLocale();
  const treeNodes = useTreeStore((s) => s.nodes);
  const setSection = useAppStore((s) => s.setSection);

  const [mode, setMode] = useState<StartWorkMode>(initialMode);
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset dialog state each time it opens so a fresh + click doesn't inherit
  // the previous draft.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    setSubmitting(false);
  }, [open, initialMode]);


  const placeholder = useMemo(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  const defaultAgent = useMemo(() => {
    if (initialAgentSlug) {
      const seeded = agents.find((a) => a.slug === initialAgentSlug);
      if (seeded) return seeded;
    }
    const active = agents.find((a) => a.active) ?? agents[0];
    return active ?? null;
  }, [agents, initialAgentSlug]);

  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string>(
    () => defaultAgent?.slug ?? ""
  );

  // Re-seed the selected agent each time the dialog opens with a new
  // initialAgentSlug (inline composers pass the currently-selected agent).
  useEffect(() => {
    if (!open || !initialAgentSlug) return;
    setSelectedAgentSlug(initialAgentSlug);
  }, [open, initialAgentSlug]);

  // Keep the selected agent in sync if the parent's agent list changes while
  // the dialog is open (e.g. persona sync in the background).
  useEffect(() => {
    if (!selectedAgentSlug && defaultAgent) {
      setSelectedAgentSlug(defaultAgent.slug);
    }
  }, [defaultAgent, selectedAgentSlug]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.slug === selectedAgentSlug) ?? defaultAgent,
    [agents, selectedAgentSlug, defaultAgent]
  );

  const [routineDraft, setRoutineDraft] = useState<RoutineDraft>({
    name: "",
    id: "",
    schedule: DEFAULT_HEARTBEAT,
    timeout: 600,
    enabled: true,
  });

  const [heartbeatDraft, setHeartbeatDraft] = useState<HeartbeatDraft>({
    schedule: DEFAULT_HEARTBEAT,
    active: true,
  });

  // When the selected agent changes, seed the heartbeat draft with that
  // agent's existing heartbeat / active state so "Save heartbeat" shows its
  // current schedule instead of clobbering it with a default.
  useEffect(() => {
    if (!selectedAgent) return;
    setHeartbeatDraft({
      schedule: selectedAgent.heartbeat || DEFAULT_HEARTBEAT,
      active: selectedAgent.active,
    });
  }, [selectedAgent]);

  const skillItems = useSkillMentionItems({ cabinetPath, enabled: open });

  const mentionItems: MentionableItem[] = useMemo(
    () => [
      ...agents.map((a) => ({
        type: "agent" as const,
        id: a.slug,
        label: a.displayName ?? a.name,
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
    [agents, skillItems, treeNodes]
  );

  // One composer for task + routine (both need a prompt). Heartbeat mode
  // hides the composer entirely but we keep the state so flipping back
  // restores whatever the user typed.
  const stashedPromptRef = useRef<string>("");

  const runNow = useCallback(
    async (
      message: string,
      mentionedPaths: string[],
      mentionedSkills: string[],
    ) => {
      const resolvedAgent = selectedAgent;
      if (!resolvedAgent) throw new Error("No agent available.");
      const result = await createConversation({
        agentSlug: resolvedAgent.slug,
        userMessage: message,
        mentionedPaths,
        mentionedSkills,
        cabinetPath: resolvedAgent.cabinetPath || cabinetPath,
        ...taskRuntime,
      });
      onStarted?.(result.conversation.id, result.conversation.cabinetPath);
    },
    [selectedAgent, cabinetPath, taskRuntime, onStarted]
  );

  const addToInbox = useCallback(
    async (
      message: string,
      mentionedPaths: string[],
      mentionedSkills: string[],
    ) => {
      const resolvedAgent = selectedAgent;
      if (!resolvedAgent) throw new Error("No agent available.");
      const result = await createConversation({
        agentSlug: resolvedAgent.slug,
        userMessage: message,
        mentionedPaths,
        mentionedSkills,
        cabinetPath: resolvedAgent.cabinetPath || cabinetPath,
        draftOnly: true,
        ...taskRuntime,
      });
      onStarted?.(result.conversation.id, result.conversation.cabinetPath);
    },
    [selectedAgent, cabinetPath, taskRuntime, onStarted]
  );

  const saveRoutine = useCallback(
    async (message: string) => {
      const resolvedAgent = selectedAgent;
      if (!resolvedAgent) throw new Error("No agent available.");
      if (!routineDraft.name.trim()) throw new Error("Routine needs a name.");
      const id = routineDraft.id || slugifyId(routineDraft.name);
      const cabQ = resolvedAgent.cabinetPath
        ? `?cabinetPath=${encodeURIComponent(resolvedAgent.cabinetPath)}`
        : "";
      const body: Partial<JobConfig> & { cabinetPath?: string } = {
        id,
        name: routineDraft.name,
        enabled: routineDraft.enabled,
        schedule: routineDraft.schedule,
        prompt: message,
        agentSlug: resolvedAgent.slug,
        timeout: routineDraft.timeout,
        cabinetPath: resolvedAgent.cabinetPath,
        provider: taskRuntime.providerId,
        adapterType: taskRuntime.adapterType,
        adapterConfig:
          taskRuntime.model || taskRuntime.effort
            ? { model: taskRuntime.model, effort: taskRuntime.effort }
            : undefined,
      };
      const res = await fetch(
        `/api/agents/${resolvedAgent.slug}/jobs${cabQ}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const msg = await res
          .json()
          .then((j) => j?.error as string | undefined)
          .catch(() => undefined);
        throw new Error(msg || `Failed to create routine (${res.status})`);
      }
    },
    [selectedAgent, routineDraft, taskRuntime]
  );

  const saveHeartbeat = useCallback(async () => {
    const resolvedAgent = selectedAgent;
    if (!resolvedAgent) throw new Error("No agent available.");
    const res = await fetch(`/api/agents/personas/${resolvedAgent.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heartbeat: heartbeatDraft.schedule,
        active: heartbeatDraft.active,
        cabinetPath: resolvedAgent.cabinetPath,
      }),
    });
    if (!res.ok) throw new Error(`Failed to save heartbeat (${res.status})`);
  }, [selectedAgent, heartbeatDraft]);

  const composer = useComposer({
    items: mentionItems,
    onSubmit: async ({ message, mentionedPaths, mentionedSkills }) => {
      setSubmitting(true);
      setError(null);
      try {
        if (mode === "now") {
          await runNow(message, mentionedPaths, mentionedSkills);
        } else if (mode === "inbox") {
          await addToInbox(message, mentionedPaths, mentionedSkills);
        } else if (mode === "recurring") {
          await saveRoutine(message);
        } else {
          // Should not reach here — heartbeat submit goes through direct button.
          await saveHeartbeat();
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start");
      } finally {
        setSubmitting(false);
      }
    },
  });

  // Seed the composer textarea from inline-composer handoffs (HomeScreen /
  // CabinetTaskComposer pass whatever the user already typed as
  // initialPrompt when they pick a non-"now" mode from the When chip).
  useEffect(() => {
    if (!open) return;
    if (typeof initialPrompt === "string") {
      composer.setInput(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  const handleModeChange = (next: StartWorkMode) => {
    if (next === mode) return;
    if (next === "heartbeat") {
      stashedPromptRef.current = composer.input;
    } else if (mode === "heartbeat") {
      // Coming back from heartbeat — restore stashed prompt.
      composer.setInput(stashedPromptRef.current);
    }
    setMode(next);
  };

  const submitHeartbeat = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await saveHeartbeat();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save heartbeat");
    } finally {
      setSubmitting(false);
    }
  };

  const openPersonaEdit = () => {
    if (!selectedAgent) return;
    const cp = selectedAgent.cabinetPath || ".";
    setSection({
      type: "agent",
      slug: selectedAgent.slug,
      cabinetPath: cp,
      agentScopedId: `${cp}::agent::${selectedAgent.slug}`,
    });
    onOpenChange(false);
  };

  const widthClass =
    mode === "recurring"
      ? "sm:max-w-3xl"
      : "sm:max-w-xl";

  const title =
    mode === "now" || mode === "inbox"
      ? "What needs to get done?"
      : mode === "recurring"
        ? "Set up a recurring routine"
        : "Wake this agent on a schedule";

  const submitLabel =
    mode === "now"
      ? "Start"
      : mode === "inbox"
        ? "Add to Inbox"
        : mode === "recurring"
          ? "Create routine"
          : "Save heartbeat";

  const canSubmitRecurring = routineDraft.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "gap-0 overflow-visible p-0 transition-[max-width] duration-300",
          widthClass
        )}
      >
        <DialogHeader className="px-5 pb-3 pt-5">
          <div className="flex items-start gap-3">
            <DialogTitle className="flex-1 text-xl font-semibold">{title}</DialogTitle>
            <WhenChip mode={mode} onChange={handleModeChange} />
            <DialogClose className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">{t("startWork:close")}</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {mode !== "heartbeat" ? (
          <ComposerInput
            composer={composer}
            placeholder={placeholder}
            submitLabel={submitLabel}
            variant="inline"
            items={mentionItems}
            autoFocus
            minHeight="100px"
            maxHeight="260px"
            mentionDropdownPlacement="below"
            disabled={mode === "recurring" && !canSubmitRecurring}
            actionsStart={
              <>
                <TaskRuntimePicker value={taskRuntime} onChange={setTaskRuntime} />
                {agents.length > 0 ? (
                  <AgentDropdown
                    agents={agents}
                    selectedAgent={selectedAgent}
                    onSelect={setSelectedAgentSlug}
                  />
                ) : null}
              </>
            }
            footer={
              <>
                {mode === "recurring" ? (
                  <div className="border-t border-border/60 px-4 py-4">
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      <Repeat className="size-3.5 text-foreground/70" />
                      Routine details
                    </div>
                    <RoutineFields
                      draft={routineDraft}
                      onChange={setRoutineDraft}
                    />
                  </div>
                ) : null}
                {error || submitting ? (
                  <div className="px-4 pb-2.5 text-[11px]">
                    {error ? (
                      <span className="text-destructive">{error}</span>
                    ) : (
                      <span className="text-muted-foreground/60">
                        {mode === "recurring" ? "Creating routine…" : mode === "inbox" ? "Saving to Inbox…" : "Starting…"}
                      </span>
                    )}
                  </div>
                ) : null}
              </>
            }
          />
        ) : (
          <HeartbeatModePanel
            agent={selectedAgent}
            agents={agents}
            onSelectAgent={setSelectedAgentSlug}
            draft={heartbeatDraft}
            onChange={setHeartbeatDraft}
            submitting={submitting}
            error={error}
            onEditPersona={openPersonaEdit}
            onSubmit={submitHeartbeat}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WhenChip({
  mode,
  onChange,
  allowHeartbeat = true,
}: {
  mode: StartWorkMode;
  onChange: (next: StartWorkMode) => void;
  /**
   * Audit #020: heartbeat is per-agent — surface it only on composers that
   * already have a specific agent context. The home-screen composer
   * (free-text prompt with no agent picked yet) hides this option.
   */
  allowHeartbeat?: boolean;
}) {
  const { icon: Icon, label, tone } = modeMeta(mode);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
          tone
        )}
        // Audit #002: title now matches the visible label so screen readers
        // hear "Run now, menu" rather than "Run now, menu, When should this
        // run?". The dropdown's content already explains the choice.
        title={`${label} — change schedule`}
        aria-label={`Schedule: ${label}. Click to change.`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <ModeItem
          mode="inbox"
          active={mode === "inbox"}
          onSelect={() => onChange("inbox")}
          hint="Save to Inbox — start it when you're ready"
        />
        <ModeItem
          mode="now"
          active={mode === "now"}
          onSelect={() => onChange("now")}
          hint="Start this conversation right away"
        />
        <ModeItem
          mode="recurring"
          active={mode === "recurring"}
          onSelect={() => onChange("recurring")}
          hint="Run this prompt on a schedule"
        />
        {allowHeartbeat && (
          <ModeItem
            mode="heartbeat"
            active={mode === "heartbeat"}
            onSelect={() => onChange("heartbeat")}
            hint="Wake the agent on its own rhythm"
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeItem({
  mode,
  active,
  onSelect,
  hint,
}: {
  mode: StartWorkMode;
  active: boolean;
  onSelect: () => void;
  hint: string;
}) {
  const { icon: Icon, label } = modeMeta(mode);
  return (
    <DropdownMenuItem onClick={onSelect} className="flex flex-col items-start gap-0.5 py-2">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {active ? (
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            current
          </span>
        ) : null}
      </div>
      <span className="pl-5 text-[11px] text-muted-foreground">{hint}</span>
    </DropdownMenuItem>
  );
}

function modeMeta(mode: StartWorkMode): {
  icon: typeof Zap;
  label: string;
  tone: string;
} {
  if (mode === "inbox") {
    return {
      icon: Inbox,
      label: "→ Inbox",
      tone: "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    };
  }
  if (mode === "recurring") {
    return {
      icon: Repeat,
      label: "On a schedule",
      tone: "border-indigo-500/40 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/15",
    };
  }
  if (mode === "heartbeat") {
    return {
      icon: HeartPulse,
      label: "Heartbeat",
      tone: "border-pink-500/40 bg-pink-500/10 text-pink-500 hover:bg-pink-500/15",
    };
  }
  return {
    icon: Zap,
    label: "Run now",
    tone: "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  };
}

function AgentDropdown({
  agents,
  selectedAgent,
  onSelect,
}: {
  agents: CabinetAgentSummary[];
  selectedAgent: CabinetAgentSummary | null;
  onSelect: (slug: string) => void;
}) {
  const { t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        title={t("startWork:selectAgent")}
      >
        {selectedAgent ? (
          <AgentAvatar agent={selectedAgent} shape="circle" size="xs" />
        ) : null}
        <span className="max-w-[7rem] truncate font-medium">
          {selectedAgent?.displayName ?? selectedAgent?.name ?? "Agent"}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.slug}
            onClick={() => onSelect(agent.slug)}
            className="gap-2"
          >
            <AgentAvatar agent={agent} shape="circle" size="sm" />
            <span className="truncate">{agent.displayName ?? agent.name}</span>
            {agent.slug === selectedAgent?.slug ? (
              <span className="ml-auto text-[10px] text-muted-foreground">active</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeartbeatModePanel({
  agent,
  agents,
  onSelectAgent,
  draft,
  onChange,
  submitting,
  error,
  onEditPersona,
  onSubmit,
  onCancel,
}: {
  agent: CabinetAgentSummary | null;
  agents: CabinetAgentSummary[];
  onSelectAgent: (slug: string) => void;
  draft: HeartbeatDraft;
  onChange: (next: HeartbeatDraft) => void;
  submitting: boolean;
  error: string | null;
  onEditPersona: () => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div className="px-5 pb-5">
      {agents.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AgentDropdown
            agents={agents}
            selectedAgent={agent}
            onSelect={onSelectAgent}
          />
        </div>
      ) : null}
      <HeartbeatFields
        draft={draft}
        onChange={onChange}
        onEditPersona={onEditPersona}
      />
      {error ? (
        <p className="mt-3 text-[11px] text-destructive">{error}</p>
      ) : null}
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting || !agent}
          className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save heartbeat"}
        </button>
      </div>
    </div>
  );
}
