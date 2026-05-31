"use client";
import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface EditorSession {
  id: string;
  sessionId: string;
  pagePath: string;
  agentSlug?: string;
  userMessage: string;
  prompt: string;
  timestamp: number;
  status: "running" | "completed";
  reconnect?: boolean;  // true when restored from sessionStorage after refresh
}

export interface AgentLiveSession {
  sessionId: string;
  slug: string;
  personaName: string;
  personaEmoji?: string;
  timestamp: number;
  status: "running" | "completed";
  reconnect?: boolean;
}

const SESSION_STORAGE_KEY = "ai-panel-running-sessions";
const AGENT_SESSION_STORAGE_KEY = "ai-panel-running-agent-sessions";

function saveAgentSessionsToStorage(sessions: AgentLiveSession[]) {
  try {
    const running = sessions.filter((s) => s.status === "running");
    sessionStorage.setItem(AGENT_SESSION_STORAGE_KEY, JSON.stringify(running));
  } catch {}
}

function loadAgentSessionsFromStorage(): AgentLiveSession[] {
  try {
    const raw = sessionStorage.getItem(AGENT_SESSION_STORAGE_KEY);
    if (!raw) return [];
    const sessions: AgentLiveSession[] = JSON.parse(raw);
    return sessions.map((s) => ({ ...s, reconnect: true }));
  } catch {
    return [];
  }
}

function saveRunningSessionsToStorage(sessions: EditorSession[]) {
  try {
    const running = sessions.filter((s) => s.status === "running");
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(running));
  } catch {}
}

function loadRunningSessionsFromStorage(): EditorSession[] {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const sessions: EditorSession[] = JSON.parse(raw);
    // Mark all restored sessions for reconnection
    return sessions.map((s) => ({ ...s, reconnect: true }));
  } catch {
    return [];
  }
}

interface AIPanelState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;

  // Live editor sessions (persist across page navigation)
  editorSessions: EditorSession[];

  // Live agent sessions (persist across navigation)
  agentSessions: AgentLiveSession[];

  open: () => void;
  close: () => void;
  toggle: () => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;

  // Editor session management
  addEditorSession: (session: EditorSession) => void;
  markSessionCompleted: (sessionId: string) => void;
  removeSession: (sessionId: string) => void;
  clearSessionsForPage: (pagePath: string) => void;
  clearAllSessions: () => void;
  getSessionsForPage: (pagePath: string) => EditorSession[];
  getAllRunningSessions: () => EditorSession[];
  restoreSessionsFromStorage: () => void;

  // Agent session management
  addAgentSession: (session: AgentLiveSession) => void;
  markAgentSessionCompleted: (sessionId: string) => void;
  removeAgentSession: (sessionId: string) => void;
  getSessionsForAgent: (slug: string) => AgentLiveSession[];
  restoreAgentSessionsFromStorage: () => void;
}

export const useAIPanelStore = create<AIPanelState>((set, get) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  editorSessions: [],
  agentSessions: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  addMessage: (role, content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), role, content, timestamp: Date.now() },
      ],
    })),

  setLoading: (isLoading) => set({ isLoading }),
  clearMessages: () => set({ messages: [] }),

  addEditorSession: (session) =>
    set((s) => {
      const next = [...s.editorSessions, session];
      saveRunningSessionsToStorage(next);
      return { editorSessions: next };
    }),

  markSessionCompleted: (sessionId) =>
    set((s) => {
      const next = s.editorSessions.map((es) =>
        es.sessionId === sessionId ? { ...es, status: "completed" as const } : es
      );
      saveRunningSessionsToStorage(next);
      return { editorSessions: next };
    }),

  removeSession: (sessionId) =>
    set((s) => {
      const next = s.editorSessions.filter((es) => es.sessionId !== sessionId);
      saveRunningSessionsToStorage(next);
      return { editorSessions: next };
    }),

  clearSessionsForPage: (pagePath) =>
    set((s) => {
      const next = s.editorSessions.filter((es) => es.pagePath !== pagePath);
      saveRunningSessionsToStorage(next);
      return { editorSessions: next };
    }),

  clearAllSessions: () => {
    saveRunningSessionsToStorage([]);
    set({ editorSessions: [] });
  },

  getSessionsForPage: (pagePath) =>
    get().editorSessions.filter((es) => es.pagePath === pagePath),

  getAllRunningSessions: () =>
    get().editorSessions.filter((es) => es.status === "running"),

  restoreSessionsFromStorage: () => {
    const restored = loadRunningSessionsFromStorage();
    if (restored.length > 0) {
      set((s) => {
        const existingIds = new Set(s.editorSessions.map((es) => es.sessionId));
        const newSessions = restored.filter((r) => !existingIds.has(r.sessionId));
        return { editorSessions: [...s.editorSessions, ...newSessions] };
      });
    }
  },

  addAgentSession: (session) =>
    set((s) => {
      const next = [...s.agentSessions, session];
      saveAgentSessionsToStorage(next);
      return { agentSessions: next };
    }),

  markAgentSessionCompleted: (sessionId) =>
    set((s) => {
      const next = s.agentSessions.map((as) =>
        as.sessionId === sessionId ? { ...as, status: "completed" as const } : as
      );
      saveAgentSessionsToStorage(next);
      return { agentSessions: next };
    }),

  removeAgentSession: (sessionId) =>
    set((s) => {
      const next = s.agentSessions.filter((as) => as.sessionId !== sessionId);
      saveAgentSessionsToStorage(next);
      return { agentSessions: next };
    }),

  getSessionsForAgent: (slug) =>
    get().agentSessions.filter((as) => as.slug === slug),

  restoreAgentSessionsFromStorage: () => {
    const restored = loadAgentSessionsFromStorage();
    if (restored.length > 0) {
      set((s) => {
        const existingIds = new Set(s.agentSessions.map((as) => as.sessionId));
        const newSessions = restored.filter((r) => !existingIds.has(r.sessionId));
        return { agentSessions: [...s.agentSessions, ...newSessions] };
      });
    }
  },
}));
