"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { Trans } from "react-i18next";
import { useLocale } from "@/i18n/use-locale";
import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";

// Orchestrated timing for the intro sequence:
//   1. Copy lands (H1 + subhead).
//   2. The yellow Archive glyph pops oversized, then shrinks.
//   3. The Cabinet shell (Container 1 header + Container 2 drawer rail)
//      materializes at a narrow, near-square width.
//   4. Shell rests for ~0.5s.
//   5. Shell widens horizontally; title and tab buttons populate.
const COPY_H1_DELAY = 80;
const COPY_SUB_DELAY = 240;

// Standalone big Archive icon — pops bigger, then shrinks before the shell
// fades in. Duration covers the full pop→hold→shrink→fade arc.
const ICON_INTRO_DELAY = 520;
const ICON_INTRO_DURATION = 1100;

// Cabinet shell (2 containers) fades in at narrow/square size after the
// icon settles, with a slight overlap so the hand-off reads as one motion.
const SHELL_APPEAR_DELAY = 1520;
const SHELL_FADE_DURATION = 400;

// Mandatory rest at narrow size before the shell starts widening.
const REST_DURATION = 500;

// Width morph + title reveal + tab buttons.
const EXPAND_TRIGGER_DELAY =
  SHELL_APPEAR_DELAY + SHELL_FADE_DURATION + REST_DURATION; // 2420
const EXPAND_DURATION = 680;
const TITLE_REVEAL_DELAY = EXPAND_TRIGGER_DELAY + EXPAND_DURATION; // 3100
const TABS_START_DELAY = TITLE_REVEAL_DELAY + 120; // 3220

const NARROW_WIDTH = 160;
const FULL_WIDTH = 300;

export function SlideIntro() {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setExpanded(true), EXPAND_TRIGGER_DELAY);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h2
          className="font-logo text-5xl tracking-tight italic opacity-0 lg:text-6xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: `${COPY_H1_DELAY}ms`,
          }}
        >
          <Trans
            i18nKey="tour:introTitle"
            components={{ accent: <span style={{ color: P.accent }} /> }}
          />
        </h2>
        <p
          className="font-body-serif text-lg leading-relaxed opacity-0 lg:text-xl"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: `${COPY_SUB_DELAY}ms`,
          }}
        >
          {t("tour:introSubtitle")}
        </p>
      </div>

      {/* Staging area — fixed to the eventual full width so the shell can
          expand from centered-narrow to centered-wide without shifting
          the overlaid icon. */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: FULL_WIDTH, minHeight: NARROW_WIDTH }}
      >
        {/* Big Archive glyph: pops larger, then shrinks + fades as the
            shell takes over. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0"
          style={{
            animation: `cabinet-tour-icon-intro ${ICON_INTRO_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
            animationDelay: `${ICON_INTRO_DELAY}ms`,
          }}
        >
          <Archive
            className="h-14 w-14"
            style={{ color: P.iconAmber }}
            strokeWidth={1.8}
          />
        </div>

        {/* Cabinet shell — fades in narrow, rests, then widens. */}
        <div
          className="opacity-0"
          style={{
            width: expanded ? FULL_WIDTH : NARROW_WIDTH,
            transition: `width ${EXPAND_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            animation: `cabinet-tour-fade-in ${SHELL_FADE_DURATION}ms ease-out forwards`,
            animationDelay: `${SHELL_APPEAR_DELAY}ms`,
          }}
        >
          <MockupSidebar
            activeTab={null}
            title={t("tour:cabinetTitle")}
            titleDelay={TITLE_REVEAL_DELAY}
            headerBadge=""
            hideBody
            tabsPopIn
            tabsPopInDelay={TABS_START_DELAY}
            viewTransitionName="cabinet-card"
          />
        </div>
      </div>
    </div>
  );
}
