"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";

/**
 * Skeleton loaders that mirror each view's real layout so the Tasks board
 * feels instantly responsive instead of showing a blank spinner during the
 * initial conversations fetch (UX audit #51/#52 follow-up — the user sees
 * something structural while data is in flight rather than a lonely
 * Loader2 in empty space).
 */

const LANE_TITLES = ["Inbox", "Needs Reply", "Running", "Just Finished", "Archive"];
const LANE_CARDS_PER_COLUMN = [3, 2, 3, 2, 2];

interface BarProps {
  className?: string;
  style?: CSSProperties;
}

function Bar({ className, style }: BarProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-muted/60 animate-pulse", className)}
      style={style}
    />
  );
}

export function ListSkeleton({ rowCount = 10 }: { rowCount?: number }) {
  const { t } = useLocale();
  // Pre-baked widths so the skeleton reads as "varied rows" rather than
  // identical stripes. Cycling through keeps every render stable.
  const widths = [82, 68, 76, 60, 88, 72, 58, 80, 64, 78, 72, 86];
  return (
    <div
      className="flex flex-1 flex-col gap-0.5 overflow-hidden px-1 pt-1"
      aria-busy="true"
      aria-label={t("boardSkeleton:loadingTasks")}
    >
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2",
            i % 2 === 0 ? "bg-transparent" : "bg-muted/15"
          )}
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <Bar className="h-1.5 w-1.5 shrink-0 rounded-full" />
          <Bar className="h-4 w-16 shrink-0" />
          <Bar className="h-3 shrink" style={{ width: `${widths[i % widths.length]}%` }} />
          <Bar className="ml-auto h-3 w-10 shrink-0" />
          <Bar className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function KanbanSkeleton() {
  const { t } = useLocale();
  return (
    <div
      className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-2 pt-2"
      aria-busy="true"
      aria-label={t("boardSkeleton:loadingTasks")}
    >
      {LANE_TITLES.map((title, laneIdx) => (
        <div
          key={title}
          className="flex w-[260px] shrink-0 flex-col gap-2 rounded-lg bg-muted/15 p-2"
        >
          <div className="flex items-center justify-between px-1 pt-0.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-5" />
          </div>
          {Array.from({ length: LANE_CARDS_PER_COLUMN[laneIdx] ?? 2 }).map((_, cardIdx) => (
            <div
              key={cardIdx}
              className="rounded-lg bg-background p-2.5 ring-1 ring-border/60"
            >
              <Bar className="h-3 w-full" />
              <Bar className="mt-2 h-3 w-2/3" />
              <div className="mt-3 flex items-center gap-1.5">
                <Bar className="h-4 w-16 rounded-full" />
                <Bar className="ml-auto h-2.5 w-10" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ScheduleSkeleton() {
  const { t } = useLocale();
  return (
    <div
      className="flex flex-1 flex-col gap-2 overflow-hidden px-3 pt-3"
      aria-busy="true"
      aria-label={t("boardSkeleton:loadingTasks")}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-muted/15 px-3 py-2.5 ring-1 ring-border/40"
        >
          <Bar className="size-6 shrink-0 rounded-full" />
          <Bar className="h-3 w-24 shrink-0" />
          <Bar className="h-2 w-12 shrink-0 rounded-full" />
          <div className="flex flex-1 items-center gap-1">
            {Array.from({ length: 8 }).map((_, segIdx) => (
              <Bar key={segIdx} className="h-4 flex-1" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoardSkeleton({ view }: { view: "kanban" | "list" | "schedule" }) {
  if (view === "kanban") return <KanbanSkeleton />;
  if (view === "schedule") return <ScheduleSkeleton />;
  return <ListSkeleton />;
}
