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
import { buildSkillsDemo } from "./demos/skills-demo";
import { buildApiKeysDemo } from "./demos/api-keys-demo";
import { useLocale } from "@/i18n/use-locale";
import { Trans } from "react-i18next";

type DemoId =
  | "ai-team"
  | "task-board"
  | "knowledge"
  | "cabinets"
  | "routines"
  | "conversations"
  | "themes"
  | "byoai"
  | "shortcuts"
  | "skills"
  | "api-keys";

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";

type HelpAction =
  | { kind: "tour" }
  | { kind: "demo"; demoId: DemoId }
  | { kind: "navigate"; section: SelectedSection }
  // Audit #053 review: dispatches `cabinet:open-shortcuts` so the new
  // searchable keyboard cheat sheet (KeyboardShortcutsModal) is reachable
  // from the Help page in addition to the global `?` hotkey.
  | { kind: "shortcuts-modal" }
  | { kind: "soon" };

interface HelpItem {
  id: string;
  title: ReactNode;
  description: string;
  cta: string;
  visual: ReactNode;
  action: HelpAction;
}

/** Render a localized item title with a single accent-colored span.
 *  The translation string is expected to contain `<accent>...</accent>`
 *  around the highlighted word(s); other text is rendered as-is. */
function ItemTitle({ id }: { id: string }) {
  return (
    <Trans
      i18nKey={`helpPage:items.${id}.title`}
      components={{ accent: <span style={{ color: P.accent }} /> }}
    />
  );
}

function getHelpItems(t: (k: string) => string): HelpItem[] { return [
  {
    id: "tour",
    title: <ItemTitle id="tour" />,
    description: t("helpPage:items.tour.description"),
    cta: t("helpPage:ctaWatchTour"),
    visual: <CabinetVisual />,
    action: { kind: "tour" },
  },
  {
    id: "agents",
    title: <ItemTitle id="agents" />,
    description: t("helpPage:items.agents.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <AgentsVisual />,
    action: { kind: "demo", demoId: "ai-team" },
  },
  {
    id: "tasks",
    title: <ItemTitle id="tasks" />,
    description: t("helpPage:items.tasks.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <TasksVisual />,
    action: { kind: "demo", demoId: "task-board" },
  },
  {
    id: "knowledge",
    title: <ItemTitle id="knowledge" />,
    description: t("helpPage:items.knowledge.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <KnowledgeVisual />,
    action: { kind: "demo", demoId: "knowledge" },
  },
  {
    id: "cabinets",
    title: <ItemTitle id="cabinets" />,
    description: t("helpPage:items.cabinets.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <CabinetsVisual />,
    action: { kind: "demo", demoId: "cabinets" },
  },
  {
    id: "routines",
    title: <ItemTitle id="routines" />,
    description: t("helpPage:items.routines.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <RoutinesVisual />,
    action: { kind: "demo", demoId: "routines" },
  },
  {
    id: "conversations",
    title: <ItemTitle id="conversations" />,
    description: t("helpPage:items.conversations.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <ConversationsVisual />,
    action: { kind: "demo", demoId: "conversations" },
  },
  {
    id: "themes",
    title: <ItemTitle id="themes" />,
    description: t("helpPage:items.themes.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <ThemesVisual />,
    action: { kind: "demo", demoId: "themes" },
  },
  {
    id: "providers",
    title: <ItemTitle id="providers" />,
    description: t("helpPage:items.providers.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <ProvidersVisual />,
    action: { kind: "demo", demoId: "byoai" },
  },
  {
    id: "shortcuts",
    title: <ItemTitle id="shortcuts" />,
    description: t("helpPage:items.shortcuts.description"),
    cta: t("helpPage:ctaCheatSheet"),
    visual: <ShortcutsVisual />,
    // Audit #053 review: opens the searchable cheat-sheet modal directly
    // instead of the older slideshow demo. Same surface as the `?` hotkey.
    action: { kind: "shortcuts-modal" },
  },
  {
    id: "skills",
    title: <ItemTitle id="skills" />,
    description: t("helpPage:items.skills.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <SkillsVisual />,
    action: { kind: "demo", demoId: "skills" },
  },
  {
    id: "api-keys",
    title: <ItemTitle id="apiKeysItem" />,
    description: t("helpPage:items.apiKeysItem.description"),
    cta: t("helpPage:ctaWatchDemo"),
    visual: <IntegrationsVisual />,
    action: { kind: "demo", demoId: "api-keys" },
  },
  {
    id: "integrations",
    title: <ItemTitle id="integrations" />,
    description: t("helpPage:items.integrations.description"),
    cta: t("helpPage:ctaComingSoon"),
    visual: <IntegrationsVisual />,
    action: { kind: "soon" },
  },
]; }

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
    if (item.action.kind === "shortcuts-modal") {
      window.dispatchEvent(new CustomEvent("cabinet:open-shortcuts"));
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
  const { t } = useLocale();
  const HELP_ITEMS = getHelpItems(t);
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
    if (demoId === "skills") {
      setActiveDemo(buildSkillsDemo());
      return;
    }
    if (demoId === "api-keys") {
      setActiveDemo(buildApiKeysDemo());
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
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">{t("helpPage:title")}</h2>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          <div className="mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("helpPage:howTo")}
            </p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-foreground">
              {t("helpPage:heading")}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {t("helpPage:subheading")}
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
                  {t("helpPage:discordHeading")}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {t("helpPage:discordSubheading")}
                </p>
              </div>
              <a
                href={DISCORD_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-[#5865F2]/25 bg-[#5865F2]/10 px-4 py-2 text-[12.5px] font-semibold text-[#5865F2] transition-all hover:-translate-y-px hover:border-[#5865F2]/40 hover:bg-[#5865F2]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
              >
                <MessageCircle className="h-4 w-4" />
                {t("helpPage:discordCta")}
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
