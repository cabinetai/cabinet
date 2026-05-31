import { create } from "zustand";
import type { FrontMatter, SaveStatus } from "@/types";
import { fetchPage, savePage, FetchPageError, createPageApi } from "@/lib/api/client";

// Load and save are independent error surfaces. The previous design folded
// load failures (page 404, fetch error) into `saveStatus: "error"`, which
// the bottom-bar pill rendered as "Save failed" even though no save had
// been attempted. `loadStatus` lets the editor distinguish "this page
// doesn't exist yet" from "your save failed" without lying to the user.
export type LoadStatus = "idle" | "loading" | "ok" | "missing" | "error";

interface EditorState {
  currentPath: string | null;
  content: string;
  frontmatter: FrontMatter | null;
  saveStatus: SaveStatus;
  loadStatus: LoadStatus;
  isDirty: boolean;
  isLoading: boolean;
  // Audit #018: epoch ms of the last successful save for the current page.
  // Used by the status bar to render "Saved · 12s ago" while idle, instead
  // of going completely silent after the 2s "Saved ✓" flash.
  lastSavedAt: number | null;

  loadPage: (path: string) => Promise<void>;
  createMissingPage: (title: string) => Promise<void>;
  updateContent: (content: string) => void;
  updateFrontmatter: (updates: Partial<FrontMatter>) => void;
  save: () => Promise<void>;
  clear: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

const PAGE_CACHE_KEY = "kb-page-cache";

interface CachedPage {
  path: string;
  content: string;
  frontmatter: FrontMatter | null;
}

function loadCachedPage(path: string): CachedPage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PAGE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPage;
    if (parsed.path !== path) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedPage(page: CachedPage) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PAGE_CACHE_KEY, JSON.stringify(page));
  } catch {
    // quota errors are non-fatal; skip caching
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentPath: null,
  content: "",
  frontmatter: null,
  saveStatus: "idle",
  loadStatus: "idle",
  isDirty: false,
  isLoading: false,
  lastSavedAt: null,

  loadPage: async (path: string) => {
    // Cancel any pending save for the previous page
    if (saveTimer) clearTimeout(saveTimer);
    if (statusTimer) clearTimeout(statusTimer);

    // Navigating to a new path: synchronously clear the previous file's
    // content so the editor can't render stale content while the fetch
    // resolves. Without this, clicking an artifact briefly shows whatever
    // page was open before. saveStatus is reset because a previous page's
    // save error is not relevant to the new page.
    const prevPath = get().currentPath;
    if (prevPath !== path) {
      set({
        currentPath: path,
        content: "",
        frontmatter: null,
        saveStatus: "idle",
        loadStatus: "loading",
        isDirty: false,
        isLoading: true,
        lastSavedAt: null,
      });
    }

    // Paint instantly from cache if available — covers refreshes of the
    // last-opened page so the editor doesn't flash empty while the fetch
    // resolves.
    const cached = loadCachedPage(path);
    if (cached) {
      set({
        currentPath: path,
        content: cached.content,
        frontmatter: cached.frontmatter,
        saveStatus: "idle",
        loadStatus: "loading",
        isDirty: false,
        isLoading: false,
        lastSavedAt: null,
      });
    }

    try {
      const page = await fetchPage(path);
      // A newer loadPage() may have superseded us — bail instead of
      // overwriting the currently-visible page with a stale response.
      if (get().currentPath !== path) return;
      set({
        currentPath: path,
        content: page.content,
        frontmatter: page.frontmatter,
        saveStatus: "idle",
        loadStatus: "ok",
        isDirty: false,
        isLoading: false,
        lastSavedAt: null,
      });
      saveCachedPage({
        path,
        content: page.content,
        frontmatter: page.frontmatter,
      });
    } catch (err) {
      if (get().currentPath !== path) return;
      const status = err instanceof FetchPageError ? err.status : undefined;
      const loadStatus: LoadStatus = status === 404 ? "missing" : "error";
      if (!cached) {
        set({
          currentPath: path,
          content: "",
          frontmatter: null,
          saveStatus: "idle",
          loadStatus,
          isDirty: false,
          isLoading: false,
          lastSavedAt: null,
        });
      } else {
        set({ isLoading: false, loadStatus });
      }
    }
  },

  createMissingPage: async (title: string) => {
    const path = get().currentPath;
    if (!path) return;
    set({ loadStatus: "loading" });
    try {
      await createPageApi(path, title);
    } catch {
      set({ loadStatus: "error" });
      return;
    }
    // Re-fetch the newly created page so the editor pulls in the
    // server-generated frontmatter (order, title, etc.) rather than a
    // best-effort local guess.
    await get().loadPage(path);
  },

  updateContent: (content: string) => {
    set({ content, isDirty: true });

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      get().save();
    }, 500);
  },

  updateFrontmatter: (updates: Partial<FrontMatter>) => {
    const { frontmatter } = get();
    if (!frontmatter) return;
    set({ frontmatter: { ...frontmatter, ...updates }, isDirty: true });

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      get().save();
    }, 500);
  },

  save: async () => {
    const { currentPath, content, frontmatter, isDirty } = get();
    if (!currentPath || !isDirty) return;

    set({ saveStatus: "saving" });
    try {
      await savePage(currentPath, content, frontmatter || {});
      set({ saveStatus: "saved", isDirty: false, lastSavedAt: Date.now() });
      saveCachedPage({
        path: currentPath,
        content,
        frontmatter: frontmatter || null,
      });

      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => {
        set({ saveStatus: "idle" });
      }, 2000);
    } catch {
      set({ saveStatus: "error" });
    }
  },

  clear: () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (statusTimer) clearTimeout(statusTimer);
    set({
      currentPath: null,
      content: "",
      frontmatter: null,
      saveStatus: "idle",
      loadStatus: "idle",
      isDirty: false,
      isLoading: false,
      lastSavedAt: null,
    });
  },
}));
