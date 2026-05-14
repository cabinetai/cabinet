"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

// Audit #063: Cabinet's layout is desktop-first (Electron, primary breakpoint
// ~1280px). Below 960px, parts of the chrome cramp visibly even after the
// per-surface fixes (#012 toolbar, #036 filters, #040 settings sidebar).
// Rather than try to fully responsive-collapse every surface, surface a
// one-line dismissible hint so users know what to expect.

const STORAGE_KEY = "cabinet.narrow-viewport-hint-dismissed";
const NARROW_BREAKPOINT_PX = 960;

export function NarrowViewportHint() {
  const { t } = useLocale();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let dismissedSession = false;
    try {
      dismissedSession = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Private mode — fall through.
    }

    const evaluate = () => {
      if (dismissedSession) {
        setShow(false);
        return;
      }
      setShow(window.innerWidth < NARROW_BREAKPOINT_PX);
    };

    evaluate();
    window.addEventListener("resize", evaluate);
    return () => window.removeEventListener("resize", evaluate);
  }, []);

  if (!show) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-900 dark:text-amber-100">
      <span>
        Cabinet is best at <strong>≥960&nbsp;px</strong> wide. Some surfaces
        cramp at narrower widths.
      </span>
      <button
        type="button"
        onClick={() => {
          setShow(false);
          try {
            sessionStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // Non-fatal.
          }
        }}
        aria-label={t("narrowViewport:dismiss")}
        title={t("narrowViewport:dismissTitle")}
        className="shrink-0 rounded p-0.5 text-amber-900/70 transition-colors hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-100/70 dark:hover:text-amber-100"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
