"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Hover/focus reveal delay for board tooltips (ms). */
const HOVER_DELAY_MS = 500;

/**
 * Hover/focus tooltip for the task board's icon-only controls.
 *
 * The board historically leaned on native `title=` attributes, which only
 * surface after a ~1.5s delay and never on keyboard focus — so the meaning
 * of the status glyphs, lane icons, and row-action buttons was effectively
 * undiscoverable. This wraps a single trigger element with the app's
 * Base UI tooltip at a 0.5s delay (long enough not to flicker as the
 * pointer crosses the dense action cluster) and the `themed` content
 * variant, so the bubble uses the user's selected theme colors
 * (`--popover` / `--popover-foreground`) rather than a hard-contrast bubble.
 *
 * Self-contained (carries its own `TooltipProvider`) so callers can drop it
 * around any one icon without threading a provider through the board tree —
 * same pattern as `agent-picker`.
 *
 * `children` must be a single element that forwards props/ref (a native
 * `button`/`span`, or a Base UI trigger) — it's handed to `TooltipTrigger`
 * via `render`, which merges the hover/focus behavior onto it.
 */
export function IconHint({
  label,
  children,
  side = "top",
}: {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (label == null || label === "") return children;
  return (
    <TooltipProvider delay={HOVER_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent side={side} variant="themed">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
