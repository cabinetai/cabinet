"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useLocale } from "@/i18n/use-locale";
import type { PageHit, SearchResponse } from "@/stores/search-store";

const DEBOUNCE_MS = 160;
const RESULT_LIMIT = 30;

/**
 * Filter-as-you-type search for the Data drawer. Renders a compact input
 * above the file list; while a query is active it replaces `children` (the
 * tree) with inline results, so nothing overlays inside the ScrollArea.
 */
export function SidebarSearch({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const focusPath = useTreeStore((s) => s.focusPath);
  const loadPage = useEditorStore((s) => s.loadPage);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PageHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  // Fetch only runs for a non-empty query; clearing is event-driven
  // (clear button / Esc / open / deleting the text) so the effect never
  // sets state synchronously on the empty path.
  useEffect(() => {
    if (!trimmed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const params = new URLSearchParams({
        q: trimmed,
        scope: "pages",
        limit: String(RESULT_LIMIT),
      });
      fetch(`/api/search?${params}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Search failed (${res.status})`);
          const data = (await res.json()) as SearchResponse;
          // Ignore a response that a newer keystroke already superseded.
          if (abortRef.current !== controller) return;
          setHits(data.pages ?? []);
          setActiveIndex(0);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (abortRef.current !== controller) return;
          setHits([]);
        })
        .finally(() => {
          // Only the latest in-flight request owns the loading flag.
          if (abortRef.current === controller) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed]);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    setQuery("");
    setHits([]);
    setLoading(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      if (value.trim()) {
        // Enter the loading state on the same render as the query change so
        // the debounce gap shows "Searching…", never a false "no results".
        setLoading(true);
      } else {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (abortRef.current) abortRef.current.abort();
        setHits([]);
        setLoading(false);
      }
    },
    []
  );

  // Abort any in-flight request and timer on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    },
    []
  );

  const openHit = useCallback(
    (hit: PageHit) => {
      // focusPath (not selectPage) expands ancestor folders and bumps
      // focusTick so the tree row scrolls itself into view — same reveal
      // the Cmd+K palette path relies on.
      focusPath(hit.path);
      void loadPage(hit.path);
      clear();
      inputRef.current?.blur();
    },
    [focusPath, loadPage, clear]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (trimmed) clear();
        else inputRef.current?.blur();
        return;
      }
      if (hits.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hits[activeIndex] ?? hits[0];
        if (hit) openHit(hit);
      }
    },
    [hits, activeIndex, trimmed, clear, openHit]
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="relative mx-[15px] mb-1">
        <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          aria-label={t("sidebar:search")}
          placeholder={t("sidebar:searchPlaceholder")}
          className="h-7 w-full rounded-md border-0 bg-foreground/[0.012] ps-7 pe-7 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:bg-foreground/[0.03]"
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground/50" />
        ) : query ? (
          <button
            type="button"
            aria-label={t("search:clearQuery")}
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            className="absolute end-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <div className="flex flex-1 flex-col pt-0.5">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground animate-in fade-in duration-150">
              {loading
                ? t("sidebar:searchSearching")
                : t("sidebar:searchNoResults", { query: trimmed })}
            </p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => openHit(hit)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  animationDelay: `${Math.min(i, 12) * 18}ms`,
                  animationFillMode: "backwards",
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-foreground/75 transition-colors",
                  "animate-in fade-in slide-in-from-top-1 duration-200 ease-out",
                  i === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-foreground/[0.03] hover:text-foreground"
                )}
              >
                <span className="shrink-0 text-[13px] leading-none">
                  {hit.icon || (
                    <FileText className="size-3.5 text-muted-foreground/60" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{hit.title}</span>
                  {hit.path !== hit.title && (
                    <span className="block truncate text-[10px] text-muted-foreground/60">
                      {hit.path}
                    </span>
                  )}
                </span>
                {hit.matchCount > 0 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
                    {hit.matchCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
