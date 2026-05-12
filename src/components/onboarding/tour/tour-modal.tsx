"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, X, Sparkles } from "lucide-react";
import { SlideIntro } from "./slide-intro";
import { SlideData, DATA_SCENE_COUNT } from "./slide-data";
import { SlideAgents } from "./slide-agents";
import { SlideTasks } from "./slide-tasks";
import { TOUR_PALETTE as P } from "./palette";
import { useLocale } from "@/i18n/use-locale";

interface TourModalProps {
  open: boolean;
  onClose: () => void;
  onLaunchTask: (starterPrompt: string) => void;
}

// Each data scene is its own back/next step. `stageKey` is stable across
// all data slides so `SlideData` stays mounted while stepping through
// them — that keeps the copy column from re-animating on every click.
// Non-data slides use their id as the stageKey so they remount and
// replay their intro animations when re-visited.
type Slide = { id: string; stageKey: string; render: () => ReactNode };

const SLIDES: Slide[] = [
  { id: "intro", stageKey: "intro", render: () => <SlideIntro /> },
  ...Array.from({ length: DATA_SCENE_COUNT }, (_, i) => ({
    id: `data-${i}`,
    stageKey: "data",
    render: () => <SlideData sceneIdx={i} />,
  })),
  { id: "agents", stageKey: "agents", render: () => <SlideAgents /> },
  { id: "tasks", stageKey: "tasks", render: () => <SlideTasks /> },
];

type DocWithViewTransitions = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

// Animate cross-slide state changes with the View Transitions API. The
// shared `view-transition-name` on the Cabinet card gives the browser an
// identity to morph between the intro (centered) and tour (left) layouts.
// Falls back to a synchronous update on browsers without the API.
function transition(update: () => void) {
  const doc = document as DocWithViewTransitions;
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      flushSync(update);
    });
    return;
  }
  update();
}

export function TourModal({ open, onClose, onLaunchTask }: TourModalProps) {
  // TourBody is only mounted while `open`, so its internal state resets on
  // each reopen without needing a reactive effect.
  if (!open) return null;
  return <TourBody onClose={onClose} onLaunchTask={onLaunchTask} />;
}

function TourBody({
  onClose,
  onLaunchTask,
}: {
  onClose: () => void;
  onLaunchTask: (starterPrompt: string) => void;
}) {
  const { t } = useLocale();
  const [index, setIndex] = useState(0);
  const [viewerRevealed, setViewerRevealed] = useState(false);

  const goTo = useCallback((n: number) => {
    setViewerRevealed(false);
    const clamped = Math.max(0, Math.min(n, SLIDES.length - 1));
    transition(() => setIndex(clamped));
  }, []);

  const next = useCallback(() => {
    if (SLIDES[index].id === "data-0" && !viewerRevealed) {
      setViewerRevealed(true);
      return;
    }
    setViewerRevealed(false);
    transition(() => setIndex((i) => Math.min(i + 1, SLIDES.length - 1)));
  }, [index, viewerRevealed]);

  const back = useCallback(() => {
    setViewerRevealed(false);
    transition(() => setIndex((i) => Math.max(i - 1, 0)));
  }, []);
  const finish = useCallback(() => {
    onLaunchTask(t("tour:starterTask"));
    onClose();
  }, [onLaunchTask, onClose, t]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (index === SLIDES.length - 1) {
          finish();
        } else {
          next();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, next, back, finish, onClose]);

  const isLast = index === SLIDES.length - 1;
  const current = SLIDES[index];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t("tour:ariaLabel")}
      style={{ background: `${P.paper}F0`, color: P.text }}
    >
      {/* Soft decorative background wash — warm cream with subtle mocha glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background: `radial-gradient(1200px 600px at 15% 20%, rgba(139, 94, 60, 0.10), transparent 60%), radial-gradient(900px 500px at 85% 80%, rgba(122, 79, 48, 0.08), transparent 60%)`,
        }}
      />

      {/* Skip / close */}
      <button
        onClick={onClose}
        aria-label={t("tour:skipAriaLabel")}
        className="absolute right-6 top-6 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors"
        style={{
          color: P.textSecondary,
          background: P.bgCard,
          border: `1px solid ${P.border}`,
        }}
      >
        <span>{t("tour:skip")}</span>
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Slide stage */}
      <div className="relative flex h-full w-full max-w-6xl flex-col px-10 py-16 lg:px-14">
        <div
          key={current.stageKey}
          className="cabinet-tour-animated flex-1"
        >
          {current.id === "data-0"
            ? <SlideData sceneIdx={0} viewerRevealed={viewerRevealed} />
            : current.render()}
        </div>

        {/* Footer nav */}
        <div className="mt-8 flex items-center justify-between gap-4">
          {/* Back */}
          <button
            onClick={back}
            disabled={index === 0}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              color: P.textSecondary,
              background: P.bgCard,
              border: `1px solid ${P.border}`,
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("tour:back")}
          </button>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={t("tour:goToSlide", { n: i + 1 })}
                className="h-1.5 rounded-full transition-all duration-300"
                style={
                  i === index
                    ? { width: "28px", background: P.accent }
                    : { width: "6px", background: P.textTertiary, opacity: 0.5 }
                }
              />
            ))}
          </div>

          {/* Next / Finish */}
          {isLast ? (
            <button
              onClick={finish}
              className="group flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-px"
              style={{
                background: P.accent,
                boxShadow: `0 10px 25px -10px ${P.accent}80`,
              }}
            >
              <Sparkles className="h-4 w-4" />
              {t("tour:writeFirstTask")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-semibold transition-all hover:-translate-y-px"
              style={{ background: P.text, color: P.paper }}
            >
              {t("tour:next")}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
