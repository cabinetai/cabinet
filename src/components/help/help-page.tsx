"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, HelpCircle, MessageCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requestShowTour } from "@/components/onboarding/tour/use-tour";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { useAppStore, type SelectedSection } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
  AgentsVisual,
  CabinetVisual,
  CabinetsVisual,
  ConversationsVisual,
  IntegrationsVisual,
  KnowledgeVisual,
  ProvidersVisual,
  RoutinesVisual,
  ShortcutsVisual,
  SkillsVisual,
  TasksVisual,
  ThemesVisual,
} from "./help-visuals";
import { DemoModal, type DemoConfig } from "./demo-modal";
import { buildAiTeamDemo } from "./demos/ai-team-demo";
import { buildByoaiDemo } from "./demos/byoai-demo";
import { buildCabinetsDemo } from "./demos/cabinets-demo";
import { buildConversationsDemo } from "./demos/conversations-demo";
import { buildKnowledgeDemo } from "./demos/knowledge-demo";
import { buildRoutinesDemo } from "./demos/routines-demo";
import { buildTaskBoardDemo } from "./demos/task-board-demo";
import { buildThemesDemo } from "./demos/themes-demo";
import { buildShortcutsDemo } from "./demos/shortcuts-demo";

type DemoId =
  | "ai-team"
  | "task-board"
  | "knowledge"
  | "cabinets"
  | "routines"
  | "conversations"
  | "themes"
  | "byoai"
  | "shortcuts";

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";

type HelpAction =
  | { kind: "tour" }
  | { kind: "demo"; demoId: DemoId }
  | { kind: "navigate"; section: SelectedSection }
  | { kind: "soon" };

interface HelpItem {
  id: string;
  title: ReactNode;
  description: string;
  cta: string;
  visual: ReactNode;
  action: HelpAction;
}

const HELP_ITEMS: HelpItem[] = [
  {
    id: "tour",
    title: (
      <>
        Meet your <span style={{ color: P.accent }}>Cabinet</span>.
      </>
    ),
    description: "Your AI team. Your knowledge base. One place.",
    cta: "Watch the tour",
    visual: <CabinetVisual />,
    action: { kind: "tour" },
  },
  {
    id: "agents",
    title: (
      <>
        Your <span style={{ color: P.accent }}>AI team</span>.
      </>
    ),
    description:
      "Hire leads and specialists. Group them into departments. Let them dispatch work to each other.",
    cta: "Watch the demo",
    visual: <AgentsVisual />,
    action: { kind: "demo", demoId: "ai-team" },
  },
  {
    id: "tasks",
    title: (
      <>
        The <span style={{ color: P.accent }}>task board</span>.
      </>
    ),
    description:
      "Kanban, list, and schedule views. Filter by agent or status. Pick a runtime per task.",
    cta: "Watch the demo",
    visual: <TasksVisual />,
    action: { kind: "demo", demoId: "task-board" },
  },
  {
    id: "knowledge",
    title: (
      <>
        Your <span style={{ color: P.accent }}>knowledge base</span>.
      </>
    ),
    description:
      "Markdown, CSV, PDF, code, notebooks, mermaid, images, audio — everything renders inline. Your data stays on your machine; it's yours, not ours.",
    cta: "Watch the demo",
    visual: <KnowledgeVisual />,
    action: { kind: "demo", demoId: "knowledge" },
  },
  {
    id: "cabinets",
    title: (
      <>
        A team of <span style={{ color: P.accent }}>AI teams</span>.
      </>
    ),
    description:
      "Cabinets nest inside cabinets. Each one is its own AI team with its own data, agents, and visibility scope — and they can collaborate up and down the tree.",
    cta: "Watch the demo",
    visual: <CabinetsVisual />,
    action: { kind: "demo", demoId: "cabinets" },
  },
  {
    id: "routines",
    title: (
      <>
        <span style={{ color: P.accent }}>Routines</span> & schedules.
      </>
    ),
    description:
      "Run a task daily at 9am, weekly on Friday, or once next Monday. Cron, calendar, or natural language.",
    cta: "Watch the demo",
    visual: <RoutinesVisual />,
    action: { kind: "demo", demoId: "routines" },
  },
  {
    id: "conversations",
    title: (
      <>
        Conversations & <span style={{ color: P.accent }}>approvals</span>.
      </>
    ),
    description:
      "Agents propose actions — launch a task, schedule a job — and you approve before anything runs.",
    cta: "Watch the demo",
    visual: <ConversationsVisual />,
    action: { kind: "demo", demoId: "conversations" },
  },
  {
    id: "themes",
    title: (
      <>
        Make it <span style={{ color: P.accent }}>yours</span>.
      </>
    ),
    description:
      "Pick from a curated set of light and dark themes — Paper, Slate, Claude, Ink, and more.",
    cta: "Watch the demo",
    visual: <ThemesVisual />,
    action: { kind: "demo", demoId: "themes" },
  },
  {
    id: "providers",
    title: (
      <>
        <span style={{ color: P.accent }}>BYOAI</span> — bring your own AI.
      </>
    ),
    description:
      "Claude, GPT, Gemini, Grok, Codex, Cursor — bring whichever providers you already pay for. Pick a default, or override per task.",
    cta: "Watch the demo",
    visual: <ProvidersVisual />,
    action: { kind: "demo", demoId: "byoai" },
  },
  {
    id: "shortcuts",
    title: (
      <>
        <span style={{ color: P.accent }}>Keyboard</span> shortcuts.
      </>
    ),
    description:
      "Ten global shortcuts work from any surface. The editor adds slash commands, block reordering, and link editing — all without leaving the keyboard.",
    cta: "Browse shortcuts",
    visual: <ShortcutsVisual />,
    action: { kind: "demo", demoId: "shortcuts" },
  },
  {
    id: "skills",
    title: (
      <>
        <span style={{ color: P.accent }}>Skills</span> for your agents.
      </>
    ),
    description:
      "Installable Agent Skills — drop-in capabilities like SEO research, design system, or DevOps. Coming soon.",
    cta: "Coming soon",
    visual: <SkillsVisual />,
    action: { kind: "soon" },
  },
  {
    id: "integrations",
    title: (
      <>
        <span style={{ color: P.accent }}>Integrations</span> & apps.
      </>
    ),
    description:
      "MCP servers, Slack, Telegram, Gmail, Calendar, and external apps. Coming soon.",
    cta: "Coming soon",
    visual: <IntegrationsVisual />,
    action: { kind: "soon" },
  },
];

function HelpCard({
  item,
  reversed,
  onLaunchDemo,
}: {
  item: HelpItem;
  reversed: boolean;
  onLaunchDemo: (demoId: DemoId) => void;
}) {
  const setSection = useAppStore((s) => s.setSection);
  const isSoon = item.action.kind === "soon";

  const handleClick = () => {
    if (item.action.kind === "tour") {
      requestShowTour();
      return;
    }
    if (item.action.kind === "demo") {
      onLaunchDemo(item.action.demoId);
      return;
    }
    if (item.action.kind === "navigate") {
      setSection(item.action.section);
      return;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSoon}
      aria-disabled={isSoon || undefined}
      className={cn(
        "group relative grid w-full grid-cols-1 overflow-hidden rounded-2xl text-left",
        "transition-all duration-200",
        !isSoon &&
          "hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(59,47,47,0.45)] cursor-pointer",
        isSoon && "cursor-default",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
        reversed ? "md:grid-cols-[1fr_1.15fr]" : "md:grid-cols-[1.15fr_1fr]",
      )}
      style={{
        background: P.paper,
        border: `1px solid ${P.border}`,
        opacity: isSoon ? 0.85 : 1,
      }}
    >
      <div
        className={cn(
          "flex flex-col justify-center gap-4 p-8 md:p-10 lg:p-12",
          reversed && "md:order-2",
        )}
      >
        <h3
          className="font-logo italic tracking-tight text-[40px] leading-[1.05] sm:text-[48px] lg:text-[56px]"
          style={{ color: P.text }}
        >
          {item.title}
        </h3>

        <p
          className="font-body-serif text-[16px] leading-relaxed sm:text-[17px]"
          style={{ color: P.textSecondary }}
        >
          {item.description}
        </p>

        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] transition-transform duration-200",
            !isSoon && "group-hover:translate-x-0.5",
          )}
          style={{ color: isSoon ? P.textTertiary : P.accent }}
        >
          {item.cta}
          {!isSoon && <ArrowUpRight className="h-3.5 w-3.5" />}
        </span>
      </div>

      <div
        className={cn(
          "relative flex min-h-[220px] items-center justify-center md:min-h-[300px]",
          reversed && "md:order-1",
        )}
        style={{
          [reversed ? "borderRight" : "borderLeft"]: `1px solid ${P.borderLight}`,
        }}
      >
        {item.visual}
      </div>
    </button>
  );
}

export function HelpPage() {
  const [activeDemo, setActiveDemo] = useState<DemoConfig | null>(null);

  const launchDemo = (demoId: DemoId) => {
    if (demoId === "ai-team") {
      setActiveDemo(buildAiTeamDemo());
      return;
    }
    if (demoId === "task-board") {
      setActiveDemo(buildTaskBoardDemo());
      return;
    }
    if (demoId === "knowledge") {
      setActiveDemo(buildKnowledgeDemo());
      return;
    }
    if (demoId === "cabinets") {
      setActiveDemo(buildCabinetsDemo());
      return;
    }
    if (demoId === "routines") {
      setActiveDemo(buildRoutinesDemo());
      return;
    }
    if (demoId === "conversations") {
      setActiveDemo(buildConversationsDemo());
      return;
    }
    if (demoId === "themes") {
      setActiveDemo(buildThemesDemo());
      return;
    }
    if (demoId === "byoai") {
      setActiveDemo(buildByoaiDemo());
      return;
    }
    if (demoId === "shortcuts") {
      setActiveDemo(buildShortcutsDemo());
      return;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border transition-[padding] duration-200"
        style={{ paddingLeft: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4" />
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Help</h2>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              How To
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              Learn how Cabinet works
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Short demos, walkthroughs, and previews for getting the most out of Cabinet.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {HELP_ITEMS.map((item, i) => (
              <HelpCard
                key={item.id}
                item={item}
                reversed={i % 2 === 1}
                onLaunchDemo={launchDemo}
              />
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-muted/40 p-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                  Didn&apos;t find what you&apos;re looking for?
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  We&apos;re in the Discord — come say hi, ask questions, share what you&apos;re building.
                </p>
              </div>
              <a
                href={DISCORD_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[#5865F2]/25 bg-[#5865F2]/10 px-4 py-2 text-[12.5px] font-semibold text-[#5865F2] transition-all hover:-translate-y-px hover:border-[#5865F2]/40 hover:bg-[#5865F2]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" />
                Join the Discord
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </ScrollArea>

      <DemoModal demo={activeDemo} onClose={() => setActiveDemo(null)} />
    </div>
  );
}
