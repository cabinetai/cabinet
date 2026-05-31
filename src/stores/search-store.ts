import { create } from "zustand";

export type SearchScope = "all" | "pages" | "agents" | "tasks";

export interface SearchMatch {
  line: number;
  column: number;
  length: number;
  context: string;
}

export interface PageHit {
  kind: "page";
  id: string;
  title: string;
  path: string;
  icon?: string;
  tags: string[];
  modified?: string;
  matchCount: number;
  matches: SearchMatch[];
  matchedFields: string[];
}

export interface AgentHit {
  kind: "agent";
  id: string;
  slug: string;
  title: string;
  role?: string;
  department?: string;
  provider?: string;
  tags?: string[];
  matches: SearchMatch[];
}

export interface TaskHit {
  kind: "task";
  id: string;
  title: string;
  agent?: string;
  status?: string;
  trigger?: string;
  createdAt?: string;
  matches: SearchMatch[];
}

export interface SearchResponse {
  query: string;
  scope: SearchScope;
  pages: PageHit[];
  agents: AgentHit[];
  tasks: TaskHit[];
  tookMs: number;
  indexReady: boolean;
  error?: string;
  hint?: string;
}

const RECENTS_KEY = "cabinet:search:recents";
const RECENT_PAGES_KEY = "cabinet:search:recent-pages";
const MAX_RECENTS = 8;

function loadList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    // quota / serialization; non-fatal
  }
}

interface SearchState {
  open: boolean;
  query: string;
  scope: SearchScope;
  loading: boolean;
  results: SearchResponse | null;
  serviceError: string | null;
  selectedResultId: string | null;
  selectedMatchIndex: number;
  recentQueries: string[];
  recentPageIds: string[];
  aiPending: boolean;
  aiResult: string | null;

  openPalette: () => void;
  closePalette: () => void;
  setQuery: (q: string) => void;
  setScope: (scope: SearchScope) => void;
  setResults: (r: SearchResponse | null) => void;
  setServiceError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
  setSelectedResultId: (id: string | null) => void;
  setSelectedMatchIndex: (i: number) => void;
  commitRecentQuery: (q: string) => void;
  commitRecentPage: (pageId: string) => void;
  setAiPending: (v: boolean) => void;
  setAiResult: (s: string | null) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  open: false,
  query: "",
  scope: "all",
  loading: false,
  results: null,
  serviceError: null,
  selectedResultId: null,
  selectedMatchIndex: 0,
  recentQueries: loadList(RECENTS_KEY),
  recentPageIds: loadList(RECENT_PAGES_KEY),
  aiPending: false,
  aiResult: null,

  openPalette: () => set({ open: true }),
  closePalette: () =>
    set({
      open: false,
      aiPending: false,
      aiResult: null,
      serviceError: null,
    }),
  setQuery: (q) => set({ query: q, aiResult: null, serviceError: null }),
  setScope: (scope) => set({ scope }),
  setResults: (r) => {
    const firstResult =
      r?.pages[0]?.id ?? r?.agents[0]?.slug ?? r?.tasks[0]?.id ?? null;
    set({ results: r, selectedResultId: firstResult, selectedMatchIndex: 0 });
  },
  setServiceError: (msg) => set({ serviceError: msg }),
  setLoading: (v) => set({ loading: v }),
  setSelectedResultId: (id) => set({ selectedResultId: id, selectedMatchIndex: 0 }),
  setSelectedMatchIndex: (i) => set({ selectedMatchIndex: Math.max(0, i) }),
  commitRecentQuery: (q) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const current = get().recentQueries.filter((x) => x !== trimmed);
    const next = [trimmed, ...current].slice(0, MAX_RECENTS);
    saveList(RECENTS_KEY, next);
    set({ recentQueries: next });
  },
  commitRecentPage: (pageId) => {
    if (!pageId) return;
    const current = get().recentPageIds.filter((x) => x !== pageId);
    const next = [pageId, ...current].slice(0, MAX_RECENTS);
    saveList(RECENT_PAGES_KEY, next);
    set({ recentPageIds: next });
  },
  setAiPending: (v) => set({ aiPending: v }),
  setAiResult: (s) => set({ aiResult: s }),
  reset: () =>
    set({
      query: "",
      results: null,
      selectedResultId: null,
      selectedMatchIndex: 0,
      aiResult: null,
      aiPending: false,
      serviceError: null,
    }),
}));
