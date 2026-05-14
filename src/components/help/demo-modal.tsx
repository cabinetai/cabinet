"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { TOUR_PALETTE as P } from "@/components/onboarding/tour/palette";
import { useLocale } from "@/i18n/use-locale";

export interface DemoSlide {
  id: string;
  /**
   * Stable key for the slide stage. Slides sharing the same stageKey
   * remain mounted across navigation (useful for multi-scene flows where
   * copy shouldn't re-animate). Defaults to `id`.
   */
  stageKey?: string;
  render: () => ReactNode;
}

export interface DemoConfig {
  id: string;
  ariaLabel: string;
  slides: DemoSlide[];
  /**
   * Action shown on the final slide instead of "Next". The icon is rendered
   * to the left of the label.
   */
  finalCta?: {
    label: string;
    onClick: () => void;
  };
}

interface DemoModalProps {
  demo: DemoConfig | null;
  onClose: () => void;
}

type DocWithViewTransitions = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

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

export function DemoModal({ demo, onClose }: DemoModalProps) {
  const { t } = useLocale();
  if (!demo) return null;
  return <DemoBody demo={demo} onClose={onClose} />;
}

function DemoBody({ demo, onClose }: { demo: DemoConfig; onClose: () => void }) {
  const { t } = useLocale();
  const slides = demo.slides;
  const [index, setIndex] = useState(0);

  const goTo = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(n, slides.length - 1));
      transition(() => setIndex(clamped));
    },
    [slides.length],
  );

  const next = useCallback(() => {
    transition(() => setIndex((i) => Math.min(i + 1, slides.length - 1)));
  }, [slides.length]);

  const back = useCallback(() => {
    transition(() => setIndex((i) => Math.max(i - 1, 0)));
  }, []);

  const finish = useCallback(() => {
    if (demo.finalCta) demo.finalCta.onClick();
    onClose();
  }, [demo, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (index === slides.length - 1) {
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
  }, [index, slides.length, next, back, finish, onClose]);

  const isLast = index === slides.length - 1;
  const current = slides[index];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={demo.ariaLabel}
      style={{ background: `${P.paper}F0`, color: P.text }}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background: `radial-gradient(1200px 600px at 15% 20%, rgba(139, 94, 60, 0.10), transparent 60%), radial-gradient(900px 500px at 85% 80%, rgba(122, 79, 48, 0.08), transparent 60%)`,
        }}
      />

      <button
        onClick={onClose}
        aria-label={t("demoModal:closeDemo")}
        className="absolute right-6 top-6 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors"
        style={{
          color: P.textSecondary,
          background: P.bgCard,
          border: `1px solid ${P.border}`,
        }}
      >
        <span>{t("demoModal:close")}</span>
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="relative flex h-full w-full max-w-6xl flex-col px-10 py-16 lg:px-14">
        <div
          key={current.stageKey ?? current.id}
          className="cabinet-tour-animated flex-1"
        >
          {current.render()}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
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
            Back
          </button>

          <div className="flex items-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all duration-300"
                style={
                  i === index
                    ? { width: "28px", background: P.accent }
                    : { width: "6px", background: P.textTertiary, opacity: 0.5 }
                }
              />
            ))}
          </div>

          {isLast && demo.finalCta ? (
            <button
              onClick={finish}
              className="group flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:-translate-y-px"
              style={{
                background: P.accent,
                boxShadow: `0 10px 25px -10px ${P.accent}80`,
              }}
            >
              <Sparkles className="h-4 w-4" />
              {demo.finalCta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : isLast ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-semibold transition-all hover:-translate-y-px"
              style={{ background: P.text, color: P.paper }}
            >
              Done
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={next}
              className="flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-semibold transition-all hover:-translate-y-px"
              style={{ background: P.text, color: P.paper }}
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable two-column slide layout used by individual demos. Title +
 * description on the left, visual on the right.
 */
export function DemoSlideShell({
  title,
  description,
  children,
  reversed = false,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  reversed?: boolean;
}) {
  return (
    <div
      className={`grid h-full items-center gap-10 lg:gap-14 ${
        reversed
          ? "grid-cols-1 md:grid-cols-[1fr_minmax(280px,420px)]"
          : "grid-cols-1 md:grid-cols-[minmax(280px,420px)_1fr]"
      }`}
    >
      <div className={`flex flex-col gap-4 ${reversed ? "md:order-2" : ""}`}>
        <h2
          className="font-logo italic tracking-tight text-[40px] leading-[1.05] sm:text-[52px] lg:text-[60px] opacity-0"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: "80ms",
          }}
        >
          {title}
        </h2>
        <p
          className="font-body-serif text-[16px] leading-relaxed sm:text-[18px] opacity-0"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.55s ease-out forwards",
            animationDelay: "240ms",
          }}
        >
          {description}
        </p>
      </div>

      <div
        className={`flex h-full items-center justify-center opacity-0 ${
          reversed ? "md:order-1" : ""
        }`}
        style={{
          animation: "cabinet-tour-fade-in 0.55s ease-out forwards",
          animationDelay: "420ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}
