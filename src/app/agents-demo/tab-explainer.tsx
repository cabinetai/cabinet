"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "cabinet.agents-demo.explainer.";

/**
 * Per-tab onboarding card. Visible by default on first visit, dismissible.
 * After dismissal a small `ⓘ` button stays inline next to the page heading
 * and re-opens the card on click. Dismissal is persisted per-tab via
 * localStorage so each tab onboards independently.
 *
 * No heading inside the card — the prose carries it. Soft styling (subtle
 * border, no background tint) so it feels like product chrome, not a
 * warning banner.
 */
export function TabExplainer({
  id,
  body,
  ariaLabel,
}: {
  /** Stable ID per tab; used as the localStorage key suffix. */
  id: string;
  /** The conversational copy. Use short paragraphs, plain language. */
  body: ReactNode;
  /** Used on the toggle button for screen readers. */
  ariaLabel: string;
}) {
  const storageKey = STORAGE_PREFIX + id;
  // `null` = haven't checked localStorage yet (SSR-safe initial render).
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === "1";
    } catch {
      dismissed = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(!dismissed);
  }, [storageKey]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Quota / private mode — non-fatal.
    }
  }

  function reopen() {
    setOpen(true);
  }

  const isOpen = open === true;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={reopen}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:text-foreground focus-visible:outline-none"
      >
        <Info className="size-3.5" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-border/50 bg-muted/20 px-4 py-3",
        "animate-in fade-in slide-in-from-top-1 duration-200"
      )}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss"
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      <div className="space-y-1.5 pr-6 text-[12.5px] leading-relaxed text-foreground/80">
        {body}
      </div>
    </div>
  );
}
