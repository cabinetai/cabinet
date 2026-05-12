"use client";

import type { ReactNode } from "react";
import { ChevronDown, ListFilter, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Search input + N filter chips + list pane shell, shared across all tabs. */
export function ListShell({
  explainer,
  stats,
  query,
  setQuery,
  searchPlaceholder = "Search",
  filters,
  trailingActions,
  loading,
  empty,
  children,
}: {
  /** Either a plain string (rendered as a one-line muted paragraph) or a
   *  ReactNode (e.g. a `<TabExplainer>`) that the tab fully owns. */
  explainer: ReactNode;
  /** Optional sub-header line above the filter row, e.g. mini-stats
   *  ("12 firing · 4 off · 3 locked") or facets ("50 active · 36 depts"). */
  stats?: ReactNode;
  query: string;
  setQuery: (q: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  /** Action(s) anchored to the right of the filter row (e.g. "Pause all
   *  heartbeats" on the Heartbeats tab, "Org chart" on the Agents tab). */
  trailingActions?: ReactNode;
  loading: boolean;
  /** Shown when not loading and the list has no items. */
  empty: { title: string; hint?: string };
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {typeof explainer === "string" ? (
        <p className="text-[12px] text-muted-foreground">{explainer}</p>
      ) : (
        explainer
      )}

      {stats ? (
        <p className="text-[11.5px] text-muted-foreground/80">{stats}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-md border border-border/70 bg-background pl-8 pr-3 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </div>
        {filters}
        {trailingActions ? (
          <div className="ml-auto flex items-center gap-1.5">{trailingActions}</div>
        ) : null}
      </div>

      <div className="min-h-0 max-h-full overflow-y-auto rounded-xl border border-border/70 bg-card">
        {loading ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex h-9 animate-pulse items-center gap-3 px-3"
              >
                <div className="size-4 rounded-full bg-muted/60" />
                <div className="size-5 shrink-0 rounded-full bg-muted/60" />
                <div className="h-2.5 w-32 rounded bg-muted/60" />
                <div className="ml-auto h-2.5 w-20 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyOrChildren empty={empty}>{children}</EmptyOrChildren>
        )}
      </div>
    </div>
  );
}

function EmptyOrChildren({
  empty,
  children,
}: {
  empty: { title: string; hint?: string };
  children: ReactNode;
}) {
  // Children may be a list — if it's a non-array (e.g. a single <ul/>), let
  // the parent decide. If it's an empty array we paint the empty state.
  const isEmpty = Array.isArray(children) && children.length === 0;
  if (isEmpty) {
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center">
        <ListFilter className="size-5 text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">{empty.title}</p>
        {empty.hint ? (
          <p className="text-[11.5px] text-muted-foreground/70">{empty.hint}</p>
        ) : null}
      </div>
    );
  }
  return <>{children}</>;
}

export function FilterChip<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className={cn(
          "h-8 cursor-pointer appearance-none rounded-md border border-border/70 bg-background pl-3 pr-7 text-[12.5px] outline-none focus:border-ring"
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
