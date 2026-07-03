"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visible multi-select affordance for a task card/row (audit #068). Bulk
 * actions used to be reachable only via an undiscoverable shift/⌘-click; this
 * checkbox surfaces selection directly. It reveals on hover of the enclosing
 * `group/card` element (or on keyboard focus) and stays solid once checked.
 *
 * Lives above the drag layer: `onPointerDown` stops propagation so ticking the
 * box never starts a card drag, and `onClick` stops propagation so it never
 * opens the task.
 */
export function SelectCheckbox({
  selected,
  onToggle,
  className,
}: {
  selected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={selected ? "Deselect task" : "Select task"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex size-4 items-center justify-center rounded border shadow-sm outline-none transition-all",
        selected
          ? "border-sky-500 bg-sky-500 text-white opacity-100"
          : "border-border bg-card text-transparent opacity-0 hover:border-sky-500 focus-visible:opacity-100 group-hover/card:opacity-100",
        className
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}
