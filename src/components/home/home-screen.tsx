"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { selectDaemonLevel, useHealthStore } from "@/stores/health-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegistryTemplate } from "@/lib/registry/registry-manifest";
import { TiltCard } from "@/components/ui/tilt-card";

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
      "Schedule a SCHEDULE_TASK on the assistant for next Monday 09:00 — review what I worked on this past week by inspecting recently-modified files in this cabinet, then write @Weekly Review and a @Tasks for Next Week list.",
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
      "Create an interactive webapp inside this cabinet so I can study physics for beginners. Include clear explanations, simple animations where useful, and quick checks for understanding.",
  },
  {
    label: "Summarise my recent work",
    prompt:
      "Read the most recently modified pages in this cabinet and write a concise summary of what I've been working on. Group by theme, note any open threads, and save the result as @Recent Work Summary.",
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
      "Pipeline of two LAUNCH_TASKs: first dispatch the librarian to identify the articles in this cabinet and map connections between their ideas, people, and concepts. Then dispatch the editor to build an interactive webapp that visualises that graph.",
  },
  {
    label: "Spin up a 6-module physics course",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Plan a beginner physics curriculum across 6 modules (motion, forces, energy, waves, electricity, light). Dispatch one LAUNCH_TASK per module to the editor (effort=high) to build an interactive lesson page. Save them under @Physics 101.",
  },
  {
    label: "Outline a short story",
    prompt:
      "Outline a 5-chapter short story with a clear arc, a protagonist, and a twist in chapter 4. Save it as @Story Outline. Don't write the prose yet — just chapter titles and 3–4 beats each.",
  },
  {
    label: "Hourly stand-up nudge",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Schedule a SCHEDULE_JOB on the assistant with cron `0 9-18 * * 1-5` — every weekday hour from 9am–6pm, ask me what I'm working on right now and append the answer to @Hourly Log.",
  },
  {
    label: "Research my next phone",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Dispatch the librarian to research the current top-3 flagship phones for someone who values battery life and camera. Compile the comparison into @Phone Research with a recommendation and the trade-offs.",
  },
  {
    label: "Translate this cabinet to Spanish",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Read every page in this cabinet and dispatch a LAUNCH_TASK per page to the editor (effort=low) to write a Spanish translation. Save each under @Translations/<original page name>.",
  },
  {
    label: "Refactor my note-taking system",
    prompt:
      "Audit the structure of this cabinet — folders, naming, orphans, duplicates. Propose a cleaner structure as @Note System Audit with concrete moves (don't apply them yet).",
  },
  {
    label: "Plan a birthday party",
    prompt:
      "Plan a birthday party for 12 adults at home. Output @Party Plan with: theme suggestions (3 options), shopping list, day-of timeline, and a music vibe.",
  },
  {
    label: "Draft a board update",
    prompt:
      "Write a concise monthly board update. Cover: traction, shipped, missed, asks. Pull anything I've worked on this month from recently-modified pages. Save as @Board Update.",
  },
  {
    label: "Simulate 5 customer interviews",
    preferredAgents: LEAD_FALLBACKS,
    prompt:
      "Dispatch 5 LAUNCH_TASKs to the editor — each writes a transcript of a customer interview from a different persona (busy parent, freelancer, student, retiree, founder). Use my product as the subject. Save under @Interviews.",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function CabinetCard({
  template,
  onClick,
}: {
  template: RegistryTemplate;
  onClick: () => void;
}) {
  return (
    <TiltCard className="flex-shrink-0 w-48">
      <button
        onClick={onClick}
        className="fancy-card w-full border border-border bg-card flex flex-col text-left"
      >
        <div
          className="relative h-20 w-full bg-muted"
          style={
            template.coverUrl
              ? {
                  backgroundImage: `url(${template.coverUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
          aria-hidden
        >
          {!template.coverUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-xl opacity-40">
              📦
            </div>
          )}
        </div>
        <div className="p-2.5 flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium leading-tight line-clamp-1 flex-1 min-w-0 text-foreground">
              {template.name}
            </p>
            <span className="text-[9px] shrink-0 text-muted-foreground">
              {template.agentCount === 0
                ? "No agents"
                : `${template.agentCount} agent${template.agentCount === 1 ? "" : "s"}`}
            </span>
          </div>
          <p className="text-[9px] leading-snug line-clamp-2 text-muted-foreground">
            {template.description}
          </p>
        </div>
      </button>
    </TiltCard>
  );
}

function RegistryCarousel({
  templates,
  onSelect,
}: {
  templates: RegistryTemplate[];
  onSelect: (template: RegistryTemplate) => void;
}) {
  const { dir } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || templates.length === 0) return;

    let animationId: number;
    let position = 0;
    const speed = 1.2;
    // In RTL the row reverses, so the marquee scrolls in the opposite
    // direction to keep items visually emerging from the leading edge.
    const sign = dir === "rtl" ? 1 : -1;

    const animate = () => {
      if (!isPaused) {
        position += speed;
        const halfWidth = el.scrollWidth / 2;
        if (position >= halfWidth) {
          position = 0;
        }
        el.style.transform = `translateX(${sign * position}px)`;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPaused, templates, dir]);

  const doubled = [...templates, ...templates];

  return (
    <div
      className="tilt-carousel relative w-full py-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div ref={scrollRef} className="flex gap-3 will-change-transform">
        {doubled.map((template, i) => {
          const isClone = i >= templates.length;
          return (
            <div
              key={`${template.slug}-${i}`}
              aria-hidden={isClone || undefined}
              inert={isClone || undefined}
            >
              <CabinetCard
                template={template}
                onClick={() => onSelect(template)}
              />
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

function ImportDialog({
  template,
  open,
  onOpenChange,
  onImportStart,
  onImportEnd,
}: {
  template: RegistryTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportStart: () => void;
  onImportEnd: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const setSection = useAppStore((s) => s.setSection);

  useEffect(() => {
    if (template) setName(template.name);
  }, [template]);

  const handleImport = async () => {
    if (!template) return;
    setImporting(true);
    setError(null);
    onImportStart();
    onOpenChange(false);

    try {
      const res = await fetch("/api/registry/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: template.slug,
          name: name.trim() !== template.name ? name.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Import failed");
        setImporting(false);
        onImportEnd();
        onOpenChange(true);
        return;
      }

      await res.json();
      onImportEnd();
      window.location.reload();
    } catch {
      setError("Import failed. Check your internet connection.");
      setImporting(false);
      onImportEnd();
      onOpenChange(true);
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import {template.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {template.description}
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{template.agentCount} {template.agentCount === 1 ? "agent" : "agents"}</span>
            <span>{template.jobCount} {template.jobCount === 1 ? "job" : "jobs"}</span>
            {template.childCount > 0 && (
              <span>{template.childCount} {template.childCount === 1 ? "sub-cabinet" : "sub-cabinets"}</span>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Cabinet name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("home:newCabinet.namePlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground/70">
              {t("home:newCabinet.renameWarning")}
            </p>
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || !name.trim()}
            >
              <Download className="mr-2 h-4 w-4" />
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HomeScreen() {
  const { t } = useLocale();
  const setSection = useAppStore((s) => s.setSection);
  const treeNodes = useTreeStore((s) => s.nodes);
  const [userName, setUserName] = useState<string | null>(null);
  const [agents, setAgents] = useState<CabinetAgentSummary[]>([]);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffMode, setHandoffMode] = useState<StartWorkMode>("recurring");
  const [registryTemplates, setRegistryTemplates] = useState<
    RegistryTemplate[]
  >([]);
  const [importTemplate, setImportTemplate] =
    useState<RegistryTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [quickRunning, setQuickRunning] = useState(false);
  // Hold the chip row until the agents fetch has settled — only then do we
  // know which delegation chips to show. Animating before that point causes
  // the second wave of chips to pop in at scrambled positions and reflow the
  // layout. The 2.5s timeout is a safety net for a hung request; in practice
  // the local overview fetch settles in under 200ms.
  const [chipsReady, setChipsReady] = useState(false);
  const [chipShuffle, setChipShuffle] = useState(0);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(
    null
  );

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        const profileName: string | undefined =
          data?.profile?.displayName || data?.profile?.name;
        // Filter the legacy "You" placeholder so the greeting falls back to
        // the no-name form rather than reading "Good morning, You."
        const cleaned = profileName?.trim();
        if (cleaned && cleaned.toLowerCase() !== "you") {
          setUserName(cleaned);
        }
      })
      .catch(() => {});

    fetchCabinetOverviewClient(".", "all")
      .then((data) => {
        setAgents((data?.agents || []) as CabinetAgentSummary[]);
      })
      .catch(() => {})
      .finally(() => setChipsReady(true));

    fetch("/api/registry")
      .then((r) => r.json())
      .then((data) => {
        if (data.templates) setRegistryTemplates(data.templates);
      })
      .catch(() => {});

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

  // Audit #010: previously rendered the full pool every time; the same 9
  // chips greeted every cold-boot. Now: keep the first chip stable as a
  // landmark, then surface a random window of CHIP_DISPLAY_COUNT-1 from the
  // remaining pool. The shuffle button (RefreshCw) below bumps `chipShuffle`
  // to re-roll. All chips still render — it's just which ones are visible.
  const CHIP_DISPLAY_COUNT = 9;
  const visibleActions = useMemo(() => {
    if (QUICK_ACTIONS.length <= CHIP_DISPLAY_COUNT) return QUICK_ACTIONS;
    const [head, ...rest] = QUICK_ACTIONS;
    const indices = rest.map((_, i) => i);
    // Fisher–Yates with a seed derived from chipShuffle so re-rolls are
    // deterministic per click and stable across re-renders within one roll.
    let seed = (chipShuffle + 1) * 2654435761;
    for (let i = indices.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const picked = indices
      .slice(0, CHIP_DISPLAY_COUNT - 1)
      .map((idx) => rest[idx]);
    return [head, ...picked];
  }, [chipShuffle]);

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
    <div className="flex-1 flex flex-col items-center px-4 overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-xl space-y-8">
        {/*
         * Audit #005 (review feedback 2026-05-02): the prior text-xl/2xl
         * fix was too aggressive — the greeting felt undersized on a
         * desktop. Restore the larger headline at md+ where prompt-fold
         * isn't the constraint, but keep a smaller text-2xl on narrow
         * viewports so 13" laptops don't push the input below the fold.
         */}
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-center text-foreground tracking-tight">
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
                  key={`${chipShuffle}-${action.label}`}
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
          {chipsReady && QUICK_ACTIONS.length > CHIP_DISPLAY_COUNT && (
            <button
              type="button"
              onClick={() => setChipShuffle((n) => n + 1)}
              disabled={composer.submitting || quickRunning || daemonDown}
              title={t("home:quickActions.shuffle")}
              aria-label={t("home:quickActions.shuffle")}
              className={cn(
                "inline-flex items-center justify-center rounded-full border border-dashed border-border/70 bg-card/40 size-7",
                "text-muted-foreground hover:bg-secondary hover:border-border hover:text-foreground",
                "transition-colors",
                "animate-in fade-in slide-in-from-top-1 duration-200 ease-out",
                (composer.submitting || quickRunning || daemonDown) &&
                  "opacity-50 cursor-not-allowed"
              )}
              style={{
                animationDelay: `${Math.min(visibleActions.length, 12) * 50}ms`,
                animationFillMode: "backwards",
              }}
            >
              <RefreshCw className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="w-screen pb-8 pt-4 space-y-3">
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Start from a template
          </h2>
          <button
            onClick={() => setSection({ type: "registry" })}
            className="text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2 cursor-pointer transition-colors"
          >
            Browse all &rarr;
          </button>
        </div>
        <RegistryCarousel
          templates={registryTemplates}
          onSelect={(template) => {
            setImportTemplate(template);
            setImportOpen(true);
          }}
        />
      </div>

      <ImportDialog
        template={importTemplate}
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open && !importing) setImportTemplate(null);
        }}
        onImportStart={() => setImporting(true)}
        onImportEnd={() => setImporting(false)}
      />

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

      {importing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium text-foreground">
            Importing {importTemplate?.name || "cabinet"}...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Downloading agents, jobs, and content from the registry
          </p>
          <p className="mt-3 text-[11px] text-muted-foreground/60">
            Please do not refresh the page while importing
          </p>
        </div>
      )}
    </div>
  );
}
