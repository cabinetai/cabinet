"use client";

import type { ReactNode } from "react";
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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex items-end gap-1 px-1", className)}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.id)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-t-[10px] px-3.5 text-[12.5px] font-medium transition-all duration-150 cursor-pointer",
              on
                ? "z-10 -mb-px bg-background text-foreground pt-1.5 pb-2 shadow-[0_-3px_10px_-4px_rgb(0_0_0/0.15)]"
                : "translate-y-[3px] bg-muted/50 text-muted-foreground pt-1 pb-1.5 hover:translate-y-[1px] hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                  on ? "bg-muted text-muted-foreground" : "bg-background/60 text-muted-foreground/70"
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
