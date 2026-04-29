"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FileText,
  Search as SearchIcon,
  Sparkles,
  Tag as TagIcon,
  User,
  CheckSquare,
  Loader2,
  X,
  ArrowRight,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Dialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type AgentHit,
  type PageHit,
  type SearchResponse,
  type SearchScope,
  type TaskHit,
  useSearchStore,
} from "@/stores/search-store";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";

type FlatEntry =
  | { kind: "page"; key: string; hit: PageHit }
  | { kind: "agent"; key: string; hit: AgentHit }
  | { kind: "task"; key: string; hit: TaskHit };

const SCOPES: Array<{ id: SearchScope; label: string }> = [
  { id: "all", label: "All" },
  { id: "pages", label: "Pages" },
  { id: "agents", label: "Agents" },
  { id: "tasks", label: "Tasks" },
];

const DEBOUNCE_MS = 180;

function flatten(results: SearchResponse | null, scope: SearchScope): FlatEntry[] {
  if (!results) return [];
  const out: FlatEntry[] = [];
  if (scope === "all" || scope === "pages") {
    for (const hit of results.pages) {
      out.push({ kind: "page", key: `page:${hit.id}`, hit });
    }
  }
  if (scope === "all" || scope === "agents") {
    for (const hit of results.agents) {
      out.push({ kind: "agent", key: `agent:${hit.slug}`, hit });
    }
  }
  if (scope === "all" || scope === "tasks") {
    for (const hit of results.tasks) {
      out.push({ kind: "task", key: `task:${hit.id}`, hit });
    }
  }
  return out;
}

function findEntry(list: FlatEntry[], selectedId: string | null): FlatEntry | null {
  if (!selectedId) return list[0] ?? null;
  return list.find((e) => e.key === selectedId || idOf(e) === selectedId) ?? list[0] ?? null;
}

function idOf(e: FlatEntry): string {
  if (e.kind === "page") return e.hit.id;
  if (e.kind === "agent") return e.hit.slug;
  return e.hit.id;
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const needle = query.toLowerCase();
  const out: React.ReactNode[] = [];
  let idx = 0;
  const lower = text.toLowerCase();
  while (idx < text.length) {
    const found = lower.indexOf(needle, idx);
    if (found === -1) {
      out.push(text.slice(idx));
      break;
    }
    if (found > idx) out.push(text.slice(idx, found));
    out.push(
      <mark
        key={`${idx}-${found}`}
        className="rounded-sm bg-yellow-400/60 px-0.5 text-foreground dark:bg-yellow-500/40"
      >
        {text.slice(found, found + needle.length)}
      </mark>
    );
    idx = found + needle.length;
  }
  return out;
}

export function SearchPalette() {
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const scope = useSearchStore((s) => s.scope);
  const loading = useSearchStore((s) => s.loading);
  const results = useSearchStore((s) => s.results);
  const serviceError = useSearchStore((s) => s.serviceError);
  const selectedResultId = useSearchStore((s) => s.selectedResultId);
  const selectedMatchIndex = useSearchStore((s) => s.selectedMatchIndex);
  const recentQueries = useSearchStore((s) => s.recentQueries);
  const recentPageIds = useSearchStore((s) => s.recentPageIds);
  const aiPending = useSearchStore((s) => s.aiPending);
  const aiResult = useSearchStore((s) => s.aiResult);
  const openPalette = useSearchStore((s) => s.openPalette);
  const closePalette = useSearchStore((s) => s.closePalette);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setScope = useSearchStore((s) => s.setScope);
  const setResults = useSearchStore((s) => s.setResults);
  const setLoading = useSearchStore((s) => s.setLoading);
  const setServiceError = useSearchStore((s) => s.setServiceError);
  const setSelectedResultId = useSearchStore((s) => s.setSelectedResultId);
  const setSelectedMatchIndex = useSearchStore((s) => s.setSelectedMatchIndex);
  const commitRecentQuery = useSearchStore((s) => s.commitRecentQuery);
  const commitRecentPage = useSearchStore((s) => s.commitRecentPage);
  const setAiPending = useSearchStore((s) => s.setAiPending);
  const setAiResult = useSearchStore((s) => s.setAiResult);

  const selectPage = useTreeStore((s) => s.selectPage);
  const loadPage = useEditorStore((s) => s.loadPage);
  const setSection = useAppStore((s) => s.setSection);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flat = useMemo(() => flatten(results, scope), [results, scope]);
  const selected = useMemo(() => findEntry(flat, selectedResultId), [flat, selectedResultId]);

  const performSearch = useCallback(
    async (q: string, s: SearchScope) => {
      if (abortRef.current) abortRef.current.abort();
      if (!q.trim()) {
        setResults(null);
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          scope: s,
          limit: "50",
        });
        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { hint?: string };
          setServiceError(body.hint ?? `Search failed (${res.status})`);
          setResults(null);
          return;
        }
        const data = (await res.json()) as SearchResponse;
        setServiceError(null);
        setResults(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setServiceError(err instanceof Error ? err.message : "Search failed");
        setResults(null);
      } finally {
        setLoading(false);
      }
    },
    [setResults, setLoading, setServiceError]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSearch(query, scope);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, scope, performSearch]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const openEntry = useCallback(
    (entry: FlatEntry) => {
      commitRecentQuery(query);
      if (entry.kind === "page") {
        commitRecentPage(entry.hit.id);
        selectPage(entry.hit.path);
        void loadPage(entry.hit.path);
      } else if (entry.kind === "agent") {
        setSection({ type: "agent", slug: entry.hit.slug });
      } else if (entry.kind === "task") {
        setSection({ type: "task", taskId: entry.hit.id });
      }
      closePalette();
    },
    [commitRecentQuery, commitRecentPage, selectPage, loadPage, setSection, closePalette, query]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
        return;
      }
      if (flat.length === 0) return;
      const currentIndex = Math.max(
        0,
        flat.findIndex((e) => e.key === (selected?.key ?? ""))
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = flat[Math.min(flat.length - 1, currentIndex + 1)];
        if (next) setSelectedResultId(next.key);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = flat[Math.max(0, currentIndex - 1)];
        if (prev) setSelectedResultId(prev.key);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selected) openEntry(selected);
      }
    },
    [flat, selected, setSelectedResultId, closePalette, openEntry]
  );

  const askAi = useCallback(async () => {
    if (!query.trim()) return;
    setAiPending(true);
    try {
      const res = await fetch("/api/agents/headless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Search the knowledge base at /data for content related to: "${query}". List any relevant pages, sections, or information you find. Be concise.`,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { output?: string };
        setAiResult(data.output || "No relevant content found.");
      } else {
        setAiResult("AI search failed.");
      }
    } catch {
      setAiResult("AI search failed.");
    } finally {
      setAiPending(false);
    }
  }, [query, setAiPending, setAiResult]);

  const hasAnyResults = flat.length > 0;
  const showZeroState = !loading && query.trim().length > 0 && !hasAnyResults && !serviceError;
  const showRecents = !query.trim() && !loading;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (v) openPalette();
        else closePalette();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-[15%] z-50 -translate-x-1/2",
            "w-[min(920px,calc(100%-2rem))] h-[min(600px,calc(100%-6rem))]",
            "flex flex-col overflow-hidden rounded-xl bg-background text-sm shadow-2xl ring-1 ring-foreground/10 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          {/* Header / input */}
          <div className="flex items-center gap-2 border-b border-border px-3">
            <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search pages, agents, tasks…"
              className="h-12 flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear query"
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>

          {/* Scope tabs */}
          <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
            {SCOPES.map((s) => {
              const count =
                results == null
                  ? null
                  : s.id === "all"
                    ? results.pages.length + results.agents.length + results.tasks.length
                    : s.id === "pages"
                      ? results.pages.length
                      : s.id === "agents"
                        ? results.agents.length
                        : results.tasks.length;
              return (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors",
                    scope === s.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{s.label}</span>
                  {count != null && count > 0 && (
                    <span className="rounded bg-background/50 px-1 text-[10px] tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {results && !results.indexReady && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Indexing…
              </span>
            )}
            {results?.tookMs != null && query && hasAnyResults && (
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {results.tookMs} ms
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {/* Left pane */}
            <div className="flex w-[340px] flex-col overflow-hidden border-r border-border">
              <div className="flex-1 overflow-y-auto py-1">
                {loading && !hasAnyResults && (
                  <div className="flex items-center gap-2 px-3 py-6 text-muted-foreground text-[12px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching…
                  </div>
                )}

                {serviceError && (
                  <div className="m-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive-foreground">
                    <div className="flex items-center gap-2 font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Search is unavailable
                    </div>
                    <p className="mt-1 text-muted-foreground">{serviceError}</p>
                  </div>
                )}

                {showRecents && recentQueries.length === 0 && recentPageIds.length === 0 && (
                  <div className="px-4 py-5 space-y-2">
                    <p className="text-[12px] text-muted-foreground/70">
                      Search pages, agents, and tasks. Start typing to find anything.
                    </p>
                    <div className="space-y-1">
                      {(["a page title or keyword", "an agent name", "a task"] as const).map((hint) => (
                        <p key={hint} className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
                          <SearchIcon className="h-3 w-3 shrink-0" />
                          {hint}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {showRecents && recentQueries.length > 0 && (
                  <div className="px-2 py-1">
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Recent searches
                    </div>
                    {recentQueries.map((q) => (
                      <button
                        key={q}
                        onClick={() => setQuery(q)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent/50"
                      >
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{q}</span>
                      </button>
                    ))}
                  </div>
                )}

                {showRecents && recentPageIds.length > 0 && (
                  <div className="px-2 py-1">
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Recently opened
                    </div>
                    {recentPageIds.slice(0, 6).map((pid) => (
                      <button
                        key={pid}
                        onClick={() => {
                          commitRecentPage(pid);
                          selectPage(pid);
                          void loadPage(pid);
                          closePalette();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent/50"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{pid}</span>
                      </button>
                    ))}
                  </div>
                )}

                {hasAnyResults && (
                  <ResultList
                    flat={flat}
                    query={query.trim().toLowerCase()}
                    selectedKey={selected?.key ?? null}
                    onSelect={(key) => setSelectedResultId(key)}
                    onActivate={(entry) => openEntry(entry)}
                  />
                )}

                {showZeroState && (
                  <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                    <p>No results for “{query}”.</p>
                    <div className="mt-3">
                      {!aiPending && !aiResult && (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={askAi}>
                          <Sparkles className="h-3 w-3" />
                          Ask the cabinet
                        </Button>
                      )}
                      {aiPending && (
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Asking…
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right pane */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <DetailPane
                entry={selected}
                query={query.trim().toLowerCase()}
                aiResult={aiResult}
                onOpen={() => selected && openEntry(selected)}
                selectedMatchIndex={selectedMatchIndex}
                setSelectedMatchIndex={setSelectedMatchIndex}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="rounded border border-border px-1 py-[1px]">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border border-border px-1 py-[1px]">↵</kbd> open
              </span>
              <span>
                <kbd className="rounded border border-border px-1 py-[1px]">esc</kbd> close
              </span>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultList({
  flat,
  query,
  selectedKey,
  onSelect,
  onActivate,
}: {
  flat: FlatEntry[];
  query: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onActivate: (entry: FlatEntry) => void;
}) {
  const groups = useMemo(() => {
    const pages = flat.filter((e) => e.kind === "page");
    const agents = flat.filter((e) => e.kind === "agent");
    const tasks = flat.filter((e) => e.kind === "task");
    return { pages, agents, tasks };
  }, [flat]);

  return (
    <div className="px-1 py-1">
      {groups.pages.length > 0 && (
        <Group label="Pages">
          {groups.pages.map((e) => (
            <Row
              key={e.key}
              entry={e}
              query={query}
              active={selectedKey === e.key}
              onSelect={onSelect}
              onActivate={onActivate}
            />
          ))}
        </Group>
      )}
      {groups.agents.length > 0 && (
        <Group label="Agents">
          {groups.agents.map((e) => (
            <Row
              key={e.key}
              entry={e}
              query={query}
              active={selectedKey === e.key}
              onSelect={onSelect}
              onActivate={onActivate}
            />
          ))}
        </Group>
      )}
      {groups.tasks.length > 0 && (
        <Group label="Tasks">
          {groups.tasks.map((e) => (
            <Row
              key={e.key}
              entry={e}
              query={query}
              active={selectedKey === e.key}
              onSelect={onSelect}
              onActivate={onActivate}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="sticky top-0 z-[1] bg-background/95 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  entry,
  query,
  active,
  onSelect,
  onActivate,
}: {
  entry: FlatEntry;
  query: string;
  active: boolean;
  onSelect: (key: string) => void;
  onActivate: (entry: FlatEntry) => void;
}) {
  let icon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let badgeText: string | null = null;
  // Audit #079: surface the first match's context as a snippet under each
  // result so users can verify relevance without opening the page first.
  let snippet: string | null = null;

  if (entry.kind === "page") {
    icon = <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    title = entry.hit.title;
    subtitle = entry.hit.path;
    badgeText = entry.hit.matchCount > 0 ? `${entry.hit.matchCount}` : null;
    snippet = entry.hit.matches[0]?.context ?? null;
  } else if (entry.kind === "agent") {
    icon = <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    title = entry.hit.title;
    subtitle = [entry.hit.role, entry.hit.department].filter(Boolean).join(" · ") || entry.hit.slug;
    snippet = entry.hit.matches[0]?.context ?? null;
  } else {
    icon = <CheckSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    title = entry.hit.title;
    subtitle = [entry.hit.agent, entry.hit.status].filter(Boolean).join(" · ") || "task";
    snippet = entry.hit.matches[0]?.context ?? null;
  }

  return (
    <button
      onClick={() => onSelect(entry.key)}
      onDoubleClick={() => onActivate(entry)}
      className={cn(
        "group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">
            {highlight(title, query)}
          </span>
          {badgeText && (
            <span className="ml-auto rounded bg-muted px-1.5 py-[1px] text-[10px] tabular-nums text-muted-foreground">
              {badgeText}
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {subtitle}
        </span>
        {snippet && snippet !== title && snippet !== subtitle ? (
          <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/80">
            {highlight(snippet, query)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function DetailPane({
  entry,
  query,
  aiResult,
  onOpen,
  selectedMatchIndex,
  setSelectedMatchIndex,
}: {
  entry: FlatEntry | null;
  query: string;
  aiResult: string | null;
  onOpen: () => void;
  selectedMatchIndex: number;
  setSelectedMatchIndex: (i: number) => void;
}) {
  if (aiResult) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Cabinet AI answer
          </div>
        </div>
        <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed">
          {aiResult}
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[12px] text-muted-foreground">
        <div className="max-w-[240px]">
          <SearchIcon className="mx-auto mb-2 h-5 w-5 opacity-50" />
          <p>Start typing to search across pages, agents, and tasks.</p>
        </div>
      </div>
    );
  }

  if (entry.kind === "page") {
    return <PageDetail hit={entry.hit} query={query} onOpen={onOpen} selectedMatchIndex={selectedMatchIndex} setSelectedMatchIndex={setSelectedMatchIndex} />;
  }
  if (entry.kind === "agent") {
    return <AgentDetail hit={entry.hit} query={query} onOpen={onOpen} />;
  }
  return <TaskDetail hit={entry.hit} query={query} onOpen={onOpen} />;
}

function PageDetail({
  hit,
  query,
  onOpen,
  selectedMatchIndex,
  setSelectedMatchIndex,
}: {
  hit: PageHit;
  query: string;
  onOpen: () => void;
  selectedMatchIndex: number;
  setSelectedMatchIndex: (i: number) => void;
}) {
  const parts = hit.path.split("/");
  const parentPath = parts.slice(0, -1).join(" / ");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {parentPath || "Root"}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="truncate text-[14px] font-medium">{highlight(hit.title, query)}</div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate font-mono text-[10px]">{hit.path}</span>
          {hit.tags.map((t) => (
            <span key={t} className="flex items-center gap-0.5 rounded bg-muted px-1 py-[1px]">
              <TagIcon className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {hit.matches.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Matched by{" "}
            {hit.matchedFields.join(", ") || "title"}. No inline snippet — try broadening your query.
          </p>
        ) : (
          <ol className="space-y-2">
            {hit.matches.map((m, i) => (
              <li
                key={`${m.line}-${i}`}
                onClick={() => setSelectedMatchIndex(i)}
                className={cn(
                  "cursor-pointer rounded-md border border-transparent px-2 py-1.5 text-[12.5px] leading-relaxed transition-colors",
                  i === selectedMatchIndex
                    ? "border-border bg-accent/40"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="tabular-nums">L{m.line}</span>
                  <span className="h-2 w-px bg-border" />
                  <span className="truncate">column {m.column + 1}</span>
                </div>
                <div className="mt-0.5 font-mono text-[12px] text-foreground">
                  {highlight(m.context, query)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="text-[11px] text-muted-foreground">
          {hit.matchCount > 0 ? `${hit.matchCount} match${hit.matchCount === 1 ? "" : "es"}` : `Matched by ${hit.matchedFields.join(", ") || "title"}`}
        </div>
        <Button size="sm" onClick={onOpen} className="gap-1.5">
          Open page
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function AgentDetail({
  hit,
  query,
  onOpen,
}: {
  hit: AgentHit;
  query: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Agent
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="truncate text-[14px] font-medium">{highlight(hit.title, query)}</div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {hit.role && <span>{hit.role}</span>}
          {hit.department && <span>· {hit.department}</span>}
          {hit.provider && <span>· {hit.provider}</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-[12.5px] text-foreground leading-relaxed">
        {hit.matches.map((m, i) => (
          <p key={i}>{highlight(m.context, query)}</p>
        ))}
      </div>
      <div className="flex items-center justify-end border-t border-border px-3 py-2">
        <Button size="sm" onClick={onOpen} className="gap-1.5">
          Open agent
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function TaskDetail({
  hit,
  query,
  onOpen,
}: {
  hit: TaskHit;
  query: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Task
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="truncate text-[14px] font-medium">{highlight(hit.title, query)}</div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {hit.agent && <span>{hit.agent}</span>}
          {hit.status && <span>· {hit.status}</span>}
          {hit.trigger && <span>· {hit.trigger}</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-[12.5px] text-foreground leading-relaxed">
        {hit.matches.map((m, i) => (
          <p key={i}>{highlight(m.context, query)}</p>
        ))}
      </div>
      <div className="flex items-center justify-end border-t border-border px-3 py-2">
        <Button size="sm" onClick={onOpen} className="gap-1.5">
          Open task
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
