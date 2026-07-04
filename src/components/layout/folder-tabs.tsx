"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FolderTab {
  id: string;
  label: ReactNode;
  count?: number;
}

/**
 * Real-world file-folder tabs. They sit on the desk directly above a
 * ContentSheet; the active tab shares the sheet's fill and overlaps its top
 * edge so the two read as one folder, while inactive tabs recede behind it.
 */
export function FolderTabs({
  tabs,
  active,
  onSelect,
  className,
  ariaLabel,
}: {
  tabs: FolderTab[];
  active: string;
  onSelect: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  // ARIA tabs keyboard pattern: roving tabindex (only the active tab is
  // tabbable) + arrow/Home/End to move focus and selection between tabs.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === "ArrowLeft"
        ? (i - 1 + tabs.length) % tabs.length
        : e.key === "ArrowRight"
          ? (i + 1) % tabs.length
          : e.key === "Home"
            ? 0
            : tabs.length - 1;
    const id = tabs[next]?.id;
    if (!id) return;
    onSelect(id);
    e.currentTarget
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  };

  // The tablist overlaps the sheet below it by 1px (-mb-px); the active tab
  // shares the sheet's fill so the two read as one folder, while inactive tabs
  // are recessed (muted, shorter) behind it.
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn("relative z-10 -mb-px flex items-end gap-0.5 ps-2", className)}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-t-[9px] px-4 text-[12.5px] font-medium transition-all duration-150 cursor-pointer",
              on
                ? "z-20 bg-background text-foreground pt-2 pb-2.5 shadow-[0_-2px_8px_-3px_rgb(0_0_0/0.16)]"
                : "z-0 mb-px bg-muted/70 text-muted-foreground pt-1.5 pb-2 hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                  on ? "bg-muted text-muted-foreground" : "bg-background text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
