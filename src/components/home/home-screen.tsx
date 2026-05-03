"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { selectDaemonLevel, useHealthStore } from "@/stores/health-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { cn } from "@/lib/utils";
import { flattenTree } from "@/lib/tree-utils";
import { createConversation } from "@/lib/agents/conversation-client";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  AgentPicker,
  type AgentPickerOption,
} from "@/components/composer/agent-picker";
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
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useComposerAttachments } from "@/components/composer/use-composer-attachments";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { OptaleBrainPanel } from "@/components/optale/brain-panel";
import { OptaleMcpOversightPanel } from "@/components/optale/mcp-oversight-panel";
import { OptaleMcpClientsPanel } from "@/components/optale/mcp-clients-panel";

type QuickAction = {
  label: string;
  prompt: string;
  // For delegation chips: ordered list of preferred dispatcher slugs. The
  // first one that exists in the user's cabinet is used; if none exist, the
  // chip is hidden so we never ship a "showcase" that silently routes to a
  // non-dispatcher (e.g. editor) and quietly degrades to a solo task.
  // Solo chips omit this field and use the composer's default routing.
  preferredAgents?: string[];
};

// Common dispatch-enabled lead slugs. Per
// `data/getting-started/delegating-between-agents`, leads default to
// canDispatch:true. We try them in order; the first one present wins.
const LEAD_FALLBACKS = ["ceo", "cto", "pm"];

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Launch 10 song-writing editors",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Launch 10 LAUNCH_TASKs to the editor in parallel. Each one writes a short song from the perspective of a different Harry Potter character (Harry, Hermione, Ron, Dumbledore, Snape, Hagrid, Luna, Draco, Neville, McGonagall). Save each as its own page under @Songs. Use effort=low.",
  },
  {
    label: "Daily review at 9am",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Schedule a SCHEDULE_JOB on the editor with cron `0 9 * * *` — every day at 9am, write a short daily review of yesterday and what's on today, and append it to @Daily Review.",
  },
  {
    label: "Weekly review next Monday",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Schedule a SCHEDULE_TASK on the assistant for next Monday 09:00 — review what I worked on this past week by inspecting recently-modified files in this space, then write @Weekly Review and a @Tasks for Next Week list.",
  },
  {
    label: "Plan my Thailand trip",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Plan a 2-week Thailand trip. Dispatch a LAUNCH_TASK to the librarian (effort=high) to research itinerary, places to stay, and food spots, and a LAUNCH_TASK to the editor (effort=medium) to compile the findings into one @Thailand Trip page with a day-by-day schedule and a rough budget.",
  },
  {
    label: "Build me a physics study app",
    prompt:
      "Create an interactive webapp inside this space so I can study physics for beginners. Include clear explanations, simple animations where useful, and quick checks for understanding.",
  },
  {
    label: "Summarise my recent work",
    prompt:
      "Read the most recently modified pages in this space and write a concise summary of what I've been working on. Group by theme, note any open threads, and save the result as @Recent Work Summary.",
  },
  {
    label: "Draft a recruiter reply",
    prompt:
      "Write a polite, direct reply to a recruiter outreach message. Ask the key qualifying questions (role, comp range, company stage, remote policy) without committing to anything. Keep it under 100 words.",
  },
  {
    label: "Map article connections",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Pipeline of two LAUNCH_TASKs: first dispatch the librarian to identify the articles in this space and map connections between their ideas, people, and concepts. Then dispatch the editor to build an interactive webapp that visualises that graph.",
  },
  {
    label: "Spin up a 6-module physics course",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Plan a beginner physics curriculum across 6 modules (motion, forces, energy, waves, electricity, light). Dispatch one LAUNCH_TASK per module to the editor (effort=high) to build an interactive lesson page. Save them under @Physics 101.",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const setSection = useAppStore((s) => s.setSection);
  const treeNodes = useTreeStore((s) => s.nodes);
  const [userName, setUserName] = useState<string | null>(null);
  const [agents, setAgents] = useState<CabinetAgentSummary[]>([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState<StartWorkMode>("recurring");
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [quickRunning, setQuickRunning] = useState(false);
  // Hold the chip row until the agents fetch has settled — only then do we
  // know which delegation chips to show. Animating before that point causes
  // the second wave of chips to pop in at scrambled positions and reflow the
  // layout. The 2.5s timeout is a safety net for a hung request; in practice
  // the local overview fetch settles in under 200ms.
  const [chipsReady, setChipsReady] = useState(false);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        const profileName: string | undefined =
          data?.profile?.displayName || data?.profile?.name;
        if (profileName) {
          setUserName(profileName);
        }
      })
      .catch(() => {});

    fetchCabinetOverviewClient(".", "all")
      .then((data) => {
        setAgents((data?.agents || []) as CabinetAgentSummary[]);
      })
      .catch(() => {})
      .finally(() => setChipsReady(true));

    const safetyTimer = setTimeout(() => setChipsReady(true), 2500);
    return () => clearTimeout(safetyTimer);
  }, []);

  const skillItems = useSkillMentionItems();

  const mentionItems: MentionableItem[] = [
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
  ];

  const stagingClientUuid = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`,
    []
  );
  const attachments = useComposerAttachments({
    // Home-screen has no cabinet context — attachments land at the root
    // cabinet (data/.agents/.conversations/_pending/...).
    cabinetPath: undefined,
    clientAttachmentId: stagingClientUuid,
  });

  const composer = useComposer({
    items: mentionItems,
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
      // v0.4.1 dispatch priority: explicitly-selected picker agent →
      // first @-mentioned agent → "editor" fallback. The picker overrides
      // mentions because the user just clicked it.
      const targetAgent =
        selectedAgentSlug ??
        (mentionedAgents.length > 0 ? mentionedAgents[0] : "editor");

      const data = await createConversation({
        agentSlug: targetAgent,
        userMessage: message,
        mentionedPaths,
        mentionedSkills,
        attachmentPaths,
        stagingClientUuid: turnStagingUuid,
        ...taskRuntime,
      });
      setSection({
        type: "task",
        taskId: data.conversation?.id,
        cabinetPath: ROOT_CABINET_PATH,
      });
    },
  });

  // v0.4.1: chips ignore each action's preferredAgents and dispatch via a
  // single priority: user-picked agent → editor (if installed) → first
  // installed agent → null (fall through to composer.submit, which then
  // routes via its own onSubmit priority).
  const pickDispatcher = (): string | null => {
    if (selectedAgentSlug) return selectedAgentSlug;
    const slugs = new Set(agents.map((a) => a.slug));
    if (slugs.has("editor")) return "editor";
    return agents[0]?.slug ?? null;
  };

  // All chips render. Delegation chips that don't have any installed agent
  // to dispatch to fall through to composer.submit, which currently routes
  // to "editor" — that path may surface a clearer error on agent-less
  // cabinets but doesn't silently drop the click.
  const visibleActions = QUICK_ACTIONS;

  // Build options for the home-composer agent picker. Prepended "Auto"
  // sentinel (empty slug) clears `selectedAgentSlug` so the cascade kicks in.
  const agentPickerOptions: AgentPickerOption[] = [
    {
      slug: "",
      name: "Auto",
      role: "editor → first agent",
    } as AgentPickerOption,
    ...(agents as AgentPickerOption[]),
  ];

  const runQuickAction = async (action: QuickAction) => {
    if (composer.submitting || quickRunning) return;
    const dispatcher = pickDispatcher();
    if (!dispatcher) {
      void composer.submit(action.prompt);
      return;
    }
    setQuickRunning(true);
    try {
      const data = await createConversation({
        agentSlug: dispatcher,
        userMessage: action.prompt,
        mentionedPaths: [],
        attachmentPaths: [],
        ...taskRuntime,
      });
      if (data.conversation?.id) {
        setSection({
          type: "task",
          taskId: data.conversation.id,
          cabinetPath: ROOT_CABINET_PATH,
        });
      }
    } catch {
      // Best-effort: chip clicks fail silently; the composer stays interactive.
    } finally {
      setQuickRunning(false);
    }
  };

  const greeting = getGreeting();
  const headline = userName ? `${greeting}, ${userName}.` : `${greeting}.`;

  // Daemon owns agent execution — if it's confirmed down (≥2 missed polls)
  // disable the prompt and surface why, instead of letting the user fire a
  // request that will silently fail.
  const daemonLevel = useHealthStore(selectDaemonLevel);
  const daemonDown = daemonLevel === "down";
  const composerPlaceholder = daemonDown
    ? "Agent daemon offline — restart to send"
    : "I want to create...";

  return (
    <div className="flex-1 flex flex-col items-center overflow-y-auto px-4 py-8">
      <div className="flex min-h-[46vh] w-full max-w-xl flex-col items-center justify-center space-y-8">
        <h1 className="text-3xl md:text-4xl font-semibold text-center text-foreground tracking-normal">
          {headline}
        </h1>

        <ComposerInput
          composer={composer}
          placeholder={composerPlaceholder}
          variant="card"
          items={mentionItems}
          attachments={attachments}
          autoFocus
          disabled={daemonDown}
          className="w-full"
          minHeight="44px"
          maxHeight="160px"
          mentionDropdownPlacement="below"
          topRightOverlay={
            <WhenChip
              mode="now"
              // Audit #020: home-screen composer has no agent context yet,
              // so "Heartbeat" doesn't apply. Surface it only on agent
              // detail / mid-conversation composers.
              allowHeartbeat={false}
              onChange={(next) => {
                if (next === "now") return;
                setHandoffMode(next);
                setHandoffOpen(true);
              }}
            />
          }
          actionsStart={
            <div className="flex items-center gap-1.5">
              <AgentPicker
                agents={agentPickerOptions}
                selectedSlug={selectedAgentSlug ?? ""}
                onSelect={(slug) =>
                  setSelectedAgentSlug(slug === "" ? null : slug)
                }
              />
              <TaskRuntimePicker
                value={taskRuntime}
                onChange={setTaskRuntime}
              />
            </div>
          }
        />

        <div className="flex flex-wrap items-start justify-center content-start gap-1.5 min-h-[8rem]">
          {chipsReady &&
            visibleActions.map((action, index) => {
              const disabled = composer.submitting || quickRunning || daemonDown;
              return (
                <button
                  key={action.label}
                  onClick={() => void runQuickAction(action)}
                  disabled={disabled}
                  title={action.prompt}
                  style={{
                    fontFamily:
                      "var(--font-heading-theme, var(--font-theme, var(--font-sans)))",
                    animationDelay: `${Math.min(index, 12) * 50}ms`,
                    animationFillMode: "backwards",
                  }}
                  className={cn(
                    "rounded-full border border-border/70 bg-card/80 px-3 py-1",
                    "text-xs text-foreground/85",
                    "hover:bg-secondary hover:border-border hover:text-foreground",
                    "transition-colors",
                    "animate-in fade-in slide-in-from-top-1 duration-200 ease-out",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {action.label}
                </button>
              );
            })}
        </div>
      </div>

      <section className="w-full max-w-6xl pb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-normal text-foreground">
              Observatory
            </h2>
            <p className="text-xs text-muted-foreground">
              Brain, MCP oversight, and client access for the root Optale space.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Resources", type: "resources" as const },
              { label: "Brain", type: "brain" as const },
              { label: "Vault", type: "vault" as const },
              { label: "Graph", type: "graph" as const },
              { label: "Entities", type: "entities" as const },
              { label: "Dreams", type: "dreams" as const },
            ].map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() =>
                  setSection({
                    type: item.type,
                    cabinetPath: ROOT_CABINET_PATH,
                  })
                }
                className="rounded-md border border-border/70 bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <OptaleBrainPanel cabinetPath={ROOT_CABINET_PATH} />
          <OptaleMcpOversightPanel
            cabinetPath={ROOT_CABINET_PATH}
            visibilityMode="all"
          />
          <OptaleMcpClientsPanel cabinetPath={ROOT_CABINET_PATH} />
        </div>
      </section>

      <StartWorkDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        cabinetPath={ROOT_CABINET_PATH}
        agents={agents}
        initialMode={handoffMode}
        initialPrompt={composer.input}
        onStarted={(conversationId) => {
          composer.reset();
          setSection({
            type: "task",
            taskId: conversationId,
            cabinetPath: ROOT_CABINET_PATH,
          });
        }}
      />
    </div>
  );
}
