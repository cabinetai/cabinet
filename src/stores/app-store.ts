import { create } from "zustand";
import type { CabinetVisibilityMode } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import type { ProviderInfo } from "@/types/agents";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { dedupFetch } from "@/lib/api/dedup-fetch";

// Module-level in-flight guard for per-provider model hydration so N picker
// mounts / tab switches collapse to one request. Cleared on settle so a
// failed fetch can be retried on the next interaction (server 60s-caches the
// success path anyway).
const inflightModelFetches = new Map<string, Promise<void>>();

export type SectionType =
  | "home"
  | "cabinet"
  | "page"
  | "agents"
  | "agent"
  | "tasks"
  | "task"
  | "settings"
  | "registry"
  | "integrations"
  | "help";

const CABINET_VISIBILITY_STORAGE_KEY = "cabinet.visibility.modes";
const SIDEBAR_DRAWER_STORAGE_KEY = "cabinet.sidebar.drawer";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "cabinet.sidebar.collapsed";
const TERMINAL_POSITION_STORAGE_KEY = "cabinet.terminal.position";

function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function loadTerminalPosition(): "bottom" | "right" {
  if (typeof window === "undefined") return "bottom";
  try {
    const stored = window.localStorage.getItem(TERMINAL_POSITION_STORAGE_KEY);
    if (stored === "bottom" || stored === "right") return stored;
  } catch {
    // ignore
  }
  return "bottom";
}

export type SidebarDrawer = "data" | "agents" | "tasks";

function loadSidebarDrawer(): SidebarDrawer {
  if (typeof window === "undefined") return "data";
  try {
    const stored = window.localStorage.getItem(SIDEBAR_DRAWER_STORAGE_KEY);
    if (stored === "data" || stored === "agents" || stored === "tasks") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "data";
}

export interface SelectedSection {
  type: SectionType;
  slug?: string; // agent slug when type === "agent"
  cabinetPath?: string; // scope for cabinet/page/agent/agents/tasks/task; defaults to ROOT_CABINET_PATH
  agentScopedId?: string;
  conversationId?: string; // auto-select this conversation on mount
  taskId?: string; // task id when type === "task"
  /** Sub-tab key when type === "agents" (e.g. "routines", "heartbeats"). */
  agentsTab?: "agents" | "routines" | "heartbeats" | "schedule" | "channels";
  /**
   * The integration card actually clicked, when it differs from `slug` (the
   * suite it connects through). E.g. clicking "Microsoft Teams" sets
   * slug="microsoft-365", integrationVia="microsoft-teams" so the detail page
   * can default to the account mode that sub-product needs.
   */
  integrationVia?: string;
}

/**
 * The task drawer is either showing a live conversation or composing a new
 * one. Compose mode carries optional context so a "New Chat" launched from a
 * page can default to the Editor agent with that page pinned.
 */
export type TaskPanelMode = "conversation" | "compose";

export interface TaskPanelComposeContext {
  pinnedPagePath?: string | null;
  pinnedPagePaths?: string[];
  defaultAgentSlug?: string;
  source?: "editor" | "agent";
  greeting?: string;
}

interface TerminalTab {
  id: string;
  label: string;
  prompt?: string;
  adapterType?: string;
  cwd?: string;
}

const NAV_HISTORY_CAP = 50;

interface AppState {
  section: SelectedSection;
  returnTo: SelectedSection | null;
  // Hash-level navigation history. Each entry is a `window.location.hash` string
  // (e.g. `#/p/audits/foo`). Hash-level history captures *every* user
  // navigation — including page-to-page moves that share the same SelectedSection
  // (the page path lives in tree-store, not in `section`). The hash is the
  // canonical identity of "where the user is".
  navHistory: string[];
  navIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Called by `useHashRoute` after a non-replay hashchange. Idempotent. */
  recordNav: (hash: string) => void;
  goBack: () => void;
  goForward: () => void;
  terminalOpen: boolean;
  terminalTabs: TerminalTab[];
  activeTerminalTab: string | null;
  terminalPosition: "bottom" | "right";
  terminalCwd: string | null;
  sidebarCollapsed: boolean;
  sidebarDrawer: SidebarDrawer;
  aiPanelCollapsed: boolean;
  cabinetVisibilityModes: Record<string, CabinetVisibilityMode>;
  taskPanelConversation: ConversationMeta | null;
  taskPanelOpen: boolean;
  taskPanelMode: TaskPanelMode;
  taskPanelComposeContext: TaskPanelComposeContext | null;
  /** Right-edge recent-tasks rail. Closed by default; session memory only. */
  taskRailOpen: boolean;
  recentlyOpenedTaskIds: string[];
  canvasSelectedCardPaths: string[];
  providers: ProviderInfo[];
  defaultProviderId: string | null;
  defaultModel: string | null;
  defaultEffort: string | null;
  providersLoading: boolean;
  providersLoaded: boolean;
  appMode: "edit" | "browse" | "canvas";
  browseUrl: string | null;
  setAppMode: (mode: "edit" | "browse" | "canvas", url?: string | null) => void;
  loadProviders: () => Promise<void>;
  /**
   * Hydrate one provider's real, entitlement-gated model list from
   * GET /api/agents/providers/:id/models and merge it into `providers`.
   * Lazy + deduped — call it when a dynamic-discovery provider's tab opens.
   * `refresh` busts the server's 60s cache (use after the user adds a key).
   */
  ensureProviderModels: (
    providerId: string,
    opts?: { refresh?: boolean }
  ) => Promise<void>;
  setSection: (section: SelectedSection) => void;
  pushSection: (next: SelectedSection, from: SelectedSection) => void;
  popReturnTo: () => void;
  toggleTerminal: () => void;
  closeTerminal: () => void;
  addTerminalTab: (label?: string, prompt?: string, adapterType?: string) => void;
  removeTerminalTab: (id: string) => void;
  setActiveTerminalTab: (id: string) => void;
  openAgentTab: (taskTitle: string, prompt: string) => void;
  setTerminalPosition: (pos: "bottom" | "right") => void;
  setTerminalCwd: (cwd: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarDrawer: (drawer: SidebarDrawer) => void;
  setAiPanelCollapsed: (collapsed: boolean) => void;
  setCabinetVisibilityMode: (
    cabinetPath: string,
    mode: CabinetVisibilityMode
  ) => void;
  setTaskPanelConversation: (conversation: ConversationMeta | null) => void;
  openTaskPanelCompose: (context?: TaskPanelComposeContext) => void;
  closeTaskPanel: () => void;
  toggleTaskPanelCompose: (context?: TaskPanelComposeContext) => void;
  swapToConversation: (conversation: ConversationMeta) => void;
  toggleTaskRail: () => void;
  setCanvasSelectedCardPaths: (paths: string[]) => void;
  clearCanvasSelectedCardPaths: () => void;
}

function normalizeVisibilityCabinetPath(cabinetPath?: string): string {
  return cabinetPath?.trim() || ROOT_CABINET_PATH;
}

/** Max entries kept in the task rail's "recently opened" session history. */
const RECENT_TASKS_CAP = 25;

/** Prepend `id` to the recents list, dedupe, and cap. Pure. */
function rememberOpenedTask(current: string[], id: string): string[] {
  const next = [id, ...current.filter((existing) => existing !== id)];
  return next.length > RECENT_TASKS_CAP
    ? next.slice(0, RECENT_TASKS_CAP)
    : next;
}

function loadCabinetVisibilityModes(): Record<string, CabinetVisibilityMode> {
  if (typeof window === "undefined") {
    return { [ROOT_CABINET_PATH]: "own" };
  }
  try {
    const stored = window.localStorage.getItem(CABINET_VISIBILITY_STORAGE_KEY);
    if (!stored) {
      return { [ROOT_CABINET_PATH]: "own" };
    }

    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const next: Record<string, CabinetVisibilityMode> = {};

    for (const [cabinetPath, value] of Object.entries(parsed)) {
      if (
        value === "children-1" ||
        value === "children-2" ||
        value === "all" ||
        value === "own"
      ) {
        next[normalizeVisibilityCabinetPath(cabinetPath)] = value;
      }
    }

    return Object.keys(next).length > 0
      ? next
      : { [ROOT_CABINET_PATH]: "own" };
  } catch {
    return { [ROOT_CABINET_PATH]: "own" };
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  section: { type: "home" },
  returnTo: null,
  navHistory: [],
  navIndex: -1,
  canGoBack: false,
  canGoForward: false,
  terminalOpen: false,
  terminalTabs: [],
  activeTerminalTab: null,
  terminalPosition: loadTerminalPosition(),
  terminalCwd: null,
  sidebarCollapsed: loadSidebarCollapsed(),
  sidebarDrawer: loadSidebarDrawer(),
  aiPanelCollapsed: false,
  cabinetVisibilityModes: loadCabinetVisibilityModes(),
  taskPanelConversation: null,
  taskPanelOpen: false,
  taskPanelMode: "compose",
  taskPanelComposeContext: null,
  taskRailOpen: false,
  recentlyOpenedTaskIds: [],
  canvasSelectedCardPaths: [],
  providers: [],
  defaultProviderId: null,
  defaultModel: null,
  defaultEffort: null,
  providersLoading: false,
  providersLoaded: false,
  appMode: "edit",
  browseUrl: null,
  setAppMode: (mode, url) =>
    set((state) => ({
      appMode: mode,
      browseUrl: url !== undefined ? url : state.browseUrl,
    })),

  loadProviders: async () => {
    const { providersLoading, providersLoaded } = get();
    if (providersLoading || providersLoaded) return;
    set({ providersLoading: true });
    try {
      const response = await dedupFetch("/api/agents/providers");
      if (!response.ok) return;
      const data = await response.json() as {
        providers?: ProviderInfo[];
        defaultProvider?: string;
        defaultModel?: string;
        defaultEffort?: string;
      };
      set({
        providers: data.providers ?? [],
        defaultProviderId: data.defaultProvider ?? null,
        defaultModel: data.defaultModel ?? null,
        defaultEffort: data.defaultEffort ?? null,
        providersLoaded: true,
      });
    } catch {
      // ignore — will retry next mount
    } finally {
      set({ providersLoading: false });
    }
  },

  ensureProviderModels: async (providerId, opts) => {
    const refresh = opts?.refresh === true;
    const dedupeKey = refresh ? `${providerId}::refresh` : providerId;

    const existing = get().providers.find((p) => p.id === providerId);
    // Already hydrated and not a forced refresh → nothing to do.
    if (existing?.modelsHydrated && !refresh) return;
    const pending = inflightModelFetches.get(dedupeKey);
    if (pending) return pending;

    const run = (async () => {
      try {
        const url = `/api/agents/providers/${encodeURIComponent(providerId)}/models${
          refresh ? "?refresh=1" : ""
        }`;
        const response = await dedupFetch(url);
        if (!response.ok) return;
        const data = (await response.json()) as {
          models?: ProviderInfo["models"];
          dynamic?: boolean;
        };
        const models = data.models;
        if (!Array.isArray(models)) return;
        // Only treat the list as authoritative when it's the provider's live
        // list. An offline fallback (dynamic:false — CLI not runnable) still
        // gets merged for display, but modelsHydrated stays false so
        // resolveProviderModel keeps preserving a saved id instead of
        // snapping it to the fallback's first entry just because we're
        // transiently offline. A later interaction retries.
        const isLive = data.dynamic === true;
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  models: models.length > 0 ? models : p.models,
                  modelsHydrated: isLive ? true : p.modelsHydrated,
                }
              : p
          ),
        }));
      } catch {
        // Leave modelsHydrated unset so the resolver keeps preserving any
        // saved model id and a later interaction retries.
      } finally {
        inflightModelFetches.delete(dedupeKey);
      }
    })();

    inflightModelFetches.set(dedupeKey, run);
    return run;
  },

  setSection: (section) => {
    const prev = get().section;
    if (prev.cabinetPath !== section.cabinetPath) {
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "cabinet.switched", payload: {} }),
        keepalive: true,
      }).catch(() => {});
    }
    // Audit #131: keep the task side panel visible across navigation so the
    // user can launch a task and keep working while it runs. The panel is
    // dismissed explicitly via its X button or replaced by another launch.
    set({ section, returnTo: null });
  },

  pushSection: (next, from) => {
    const prev = get().section;
    if (prev.cabinetPath !== next.cabinetPath) {
      void fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "cabinet.switched", payload: {} }),
        keepalive: true,
      }).catch(() => {});
    }
    set({ section: next, returnTo: from });
  },

  popReturnTo: () => {
    const { returnTo } = get();
    if (!returnTo) return;
    set({ section: returnTo, returnTo: null });
  },

  recordNav: (hash) => {
    const { navHistory, navIndex } = get();
    // No-op if the hash matches the current entry (this is what fires when
    // goBack/goForward set the hash; the resulting hashchange would otherwise
    // pollute history).
    if (navIndex >= 0 && navHistory[navIndex] === hash) return;
    // Drop any forward entries — a new navigation invalidates the redo path.
    const truncated = navHistory.slice(0, navIndex + 1);
    const next = [...truncated, hash];
    const trimmed =
      next.length > NAV_HISTORY_CAP
        ? next.slice(next.length - NAV_HISTORY_CAP)
        : next;
    const nextIndex = trimmed.length - 1;
    set({
      navHistory: trimmed,
      navIndex: nextIndex,
      canGoBack: nextIndex > 0,
      canGoForward: false,
    });
  },

  goBack: () => {
    if (typeof window === "undefined") return;
    const { navHistory, navIndex } = get();
    if (navIndex <= 0) return;
    const nextIndex = navIndex - 1;
    set({
      navIndex: nextIndex,
      canGoBack: nextIndex > 0,
      canGoForward: true,
    });
    // Clean-path routing: set the pathname and signal the router to re-apply.
    window.history.replaceState(null, "", navHistory[nextIndex]);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },

  goForward: () => {
    if (typeof window === "undefined") return;
    const { navHistory, navIndex } = get();
    if (navIndex >= navHistory.length - 1) return;
    const nextIndex = navIndex + 1;
    set({
      navIndex: nextIndex,
      canGoBack: true,
      canGoForward: nextIndex < navHistory.length - 1,
    });
    window.history.replaceState(null, "", navHistory[nextIndex]);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },

  toggleTerminal: () => {
    const { terminalOpen, terminalTabs, terminalCwd } = get();
    if (terminalOpen) {
      // Panel is already visible — open a new tab rather than closing
      const num = terminalTabs.length + 1;
      const id = `term-${Date.now()}`;
      set({
        terminalTabs: [...terminalTabs, { id, label: `Terminal ${num}`, adapterType: "shell", cwd: terminalCwd ?? undefined }],
        activeTerminalTab: id,
      });
    } else if (terminalTabs.length === 0) {
      const id = `term-${Date.now()}`;
      set({
        terminalOpen: true,
        terminalTabs: [{ id, label: "Terminal 1", adapterType: "shell", cwd: terminalCwd ?? undefined }],
        activeTerminalTab: id,
      });
    } else {
      set({ terminalOpen: true });
    }
  },

  closeTerminal: () => set({ terminalOpen: false, terminalTabs: [], activeTerminalTab: null }),

  addTerminalTab: (label?: string, prompt?: string, adapterType?: string) => {
    const { terminalTabs, terminalCwd } = get();
    const num = terminalTabs.length + 1;
    const id = `term-${Date.now()}`;
    set({
      terminalTabs: [
        ...terminalTabs,
        { id, label: label || `Terminal ${num}`, prompt, adapterType: adapterType || "shell", cwd: terminalCwd ?? undefined },
      ],
      activeTerminalTab: id,
      terminalOpen: true,
    });
  },

  removeTerminalTab: (id) => {
    const { terminalTabs, activeTerminalTab } = get();
    const next = terminalTabs.filter((t) => t.id !== id);
    let newActive = activeTerminalTab;
    if (activeTerminalTab === id) {
      newActive = next.length > 0 ? next[next.length - 1].id : null;
    }
    set({
      terminalTabs: next,
      activeTerminalTab: newActive,
      terminalOpen: next.length > 0,
    });
  },

  setActiveTerminalTab: (id) => set({ activeTerminalTab: id }),

  setTerminalPosition: (pos) => {
    const next: Partial<AppState> = { terminalPosition: pos };
    if (pos === "right") next.aiPanelCollapsed = true;
    try {
      window.localStorage.setItem(TERMINAL_POSITION_STORAGE_KEY, pos);
    } catch {
      // ignore
    }
    set(next);
  },

  setTerminalCwd: (cwd) => set({ terminalCwd: cwd }),

  setSidebarCollapsed: (collapsed) => {
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
    set({ sidebarCollapsed: collapsed });
  },
  setSidebarDrawer: (drawer) => {
    try {
      window.localStorage.setItem(SIDEBAR_DRAWER_STORAGE_KEY, drawer);
    } catch {
      // ignore storage failures
    }
    set({ sidebarDrawer: drawer });
  },
  setAiPanelCollapsed: (collapsed) => set({ aiPanelCollapsed: collapsed }),
  setCabinetVisibilityMode: (cabinetPath, mode) => {
    const normalizedCabinetPath = normalizeVisibilityCabinetPath(cabinetPath);
    const nextModes = {
      ...get().cabinetVisibilityModes,
      [normalizedCabinetPath]: mode,
    };
    try {
      window.localStorage.setItem(
        CABINET_VISIBILITY_STORAGE_KEY,
        JSON.stringify(nextModes)
      );
    } catch {
      // ignore storage failures
    }
    set({ cabinetVisibilityModes: nextModes });
  },

  // Backward-compatible entry point used by the post-create flows
  // (start-work-dialog / new-task-button.onStarted). `meta` opens the
  // animated drawer in conversation mode; `null` closes it (the
  // conversation is kept so the desktop close tween can play out).
  setTaskPanelConversation: (conversation) => {
    set(
      conversation
        ? {
            taskPanelConversation: conversation,
            taskPanelMode: "conversation" as const,
            taskPanelOpen: true,
            canvasSelectedCardPaths: [],
            recentlyOpenedTaskIds: rememberOpenedTask(
              get().recentlyOpenedTaskIds,
              conversation.id
            ),
          }
        : { taskPanelOpen: false }
    );
  },

  openTaskPanelCompose: (context) => {
    const state = get();
    const canvasPaths = state.appMode === "canvas" ? state.canvasSelectedCardPaths : [];
    const requestedPaths = [
      ...(context?.pinnedPagePaths ?? []),
      ...(context?.pinnedPagePath ? [context.pinnedPagePath] : []),
      ...canvasPaths,
    ];
    const pinnedPagePaths = Array.from(new Set(requestedPaths.filter((path): path is string => !!path)));
    set({
      taskPanelOpen: true,
      taskPanelMode: "compose",
      taskPanelComposeContext: context
        ? {
            ...context,
            pinnedPagePath: pinnedPagePaths[0] ?? null,
            pinnedPagePaths,
          }
        : pinnedPagePaths.length > 0
          ? { source: "editor", defaultAgentSlug: "editor", pinnedPagePath: pinnedPagePaths[0], pinnedPagePaths }
          : null,
      taskPanelConversation: null,
    });
  },

  closeTaskPanel: () => set({ taskPanelOpen: false, canvasSelectedCardPaths: [] }),

  toggleTaskPanelCompose: (context) => {
    if (get().taskPanelOpen) {
      set({ taskPanelOpen: false, canvasSelectedCardPaths: [] });
    } else {
      get().openTaskPanelCompose(context);
    }
  },

  // Compose -> live swap: keep the SAME drawer mounted (width unchanged),
  // unlike the external setTaskPanelConversation.
  swapToConversation: (conversation) => {
    set({
      taskPanelConversation: conversation,
      taskPanelMode: "conversation",
      taskPanelOpen: true,
      canvasSelectedCardPaths: [],
      recentlyOpenedTaskIds: rememberOpenedTask(
        get().recentlyOpenedTaskIds,
        conversation.id
      ),
    });
  },

  toggleTaskRail: () => set({ taskRailOpen: !get().taskRailOpen }),

  setCanvasSelectedCardPaths: (paths) =>
    set((state) => {
      const nextPaths = Array.from(new Set(paths.filter((path) => !!path)));
      if (state.appMode !== "canvas" || !state.taskPanelOpen || state.taskPanelMode !== "compose") {
        return { canvasSelectedCardPaths: nextPaths };
      }
      const baseContext = state.taskPanelComposeContext ?? {
        source: "editor" as const,
        defaultAgentSlug: "editor",
      };
      return {
        canvasSelectedCardPaths: nextPaths,
        taskPanelComposeContext: {
          ...baseContext,
          pinnedPagePath: nextPaths[0] ?? null,
          pinnedPagePaths: nextPaths,
        },
      };
    }),
  clearCanvasSelectedCardPaths: () =>
    set((state) => {
      if (state.appMode !== "canvas" || !state.taskPanelOpen || state.taskPanelMode !== "compose") {
        return { canvasSelectedCardPaths: [] };
      }
      return {
        canvasSelectedCardPaths: [],
        taskPanelComposeContext: state.taskPanelComposeContext
          ? {
              ...state.taskPanelComposeContext,
              pinnedPagePath: null,
              pinnedPagePaths: [],
            }
          : null,
      };
    }),

  openAgentTab: (taskTitle: string, prompt: string) => {
    const id = `agent-${Date.now()}`;
    const { terminalTabs } = get();
    set({
      terminalTabs: [
        ...terminalTabs,
        { id, label: `Agent: ${taskTitle.slice(0, 20)}`, prompt },
      ],
      activeTerminalTab: id,
      terminalOpen: true,
    });
  },
}));
