"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "cabinet.agents.explainer.";

/**
 * Onboarding-card state for a tab. Split into a hook + two pieces (Card,
 * Icon) so the card can live in a prominent row at the top of the tab
 * while the dismissed-state `ⓘ` re-opener sits inline with the stats line
 * (no dedicated row, no empty space when collapsed). Dismissal persists
 * per tab via localStorage.
 */
export function useExplainerState(id: string) {
  const storageKey = STORAGE_PREFIX + id;
  // `null` = haven't checked localStorage yet (avoids SSR/hydration flicker).
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

  return {
    open,
    dismiss: () => {
      setOpen(false);
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* quota / private mode is non-fatal */
      }
    },
    reopen: () => setOpen(true),
  };
}

export type ExplainerState = ReturnType<typeof useExplainerState>;

/** The prominent card with the body copy + dismiss `×`. Renders nothing
 *  when dismissed or while storage is being read. */
export function ExplainerCard({
  state,
  children,
}: {
  state: ExplainerState;
  children: ReactNode;
}) {
  if (state.open !== true) return null;
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border/50 bg-muted/20 px-4 py-3",
        "animate-in fade-in slide-in-from-top-1 duration-200"
      )}
    >
      <button
        type="button"
        onClick={state.dismiss}
        aria-label="Dismiss"
        title="Dismiss"
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      <div className="space-y-1.5 pr-6 text-[12.5px] leading-relaxed text-foreground/80">
        {children}
      </div>
    </div>
  );
}

/** The small `ⓘ` re-opener. Renders nothing while the card is visible (or
 *  state is still loading) so it can sit inline with the stats line without
 *  pushing layout when present/absent. */
export function ExplainerIcon({
  state,
  ariaLabel,
}: {
  state: ExplainerState;
  ariaLabel: string;
}) {
  if (state.open !== false) return null;
  return (
    <button
      type="button"
      onClick={state.reopen}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <Info className="size-3" />
    </button>
  );
}
