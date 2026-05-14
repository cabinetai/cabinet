"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { Button } from "@/components/ui/button";
import { useAIPanelStore } from "@/stores/ai-panel-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { WebTerminal } from "@/components/terminal/web-terminal";
import type { ConversationDetail, ConversationMeta } from "@/types/conversations";
import type { AgentListItem } from "@/types/agents";
import { createConversation } from "@/lib/agents/conversation-client";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import { flattenTree } from "@/lib/tree-utils";
import { ComposerInput } from "@/components/composer/composer-input";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import {
  AgentPicker,
  type AgentPickerOption,
} from "@/components/composer/agent-picker";
import { useComposer, type MentionableItem } from "@/hooks/use-composer";
import { useSkillMentionItems } from "@/hooks/use-skill-mention-items";
import { useLocale } from "@/i18n/use-locale";

interface PastSession {
  id: string;
  pagePath: string;
  instruction: string;
  timestamp: string;
  duration?: number;
  status: "completed" | "failed" | "cancelled";
  summary: string;
}

interface PendingLiveSession {
  id: string;
  pagePath: string;
  userMessage: string;
  agentSlug: string;
  timestamp: number;
  status: "starting" | "failed";
  error?: string;
}

type LiveSessionView =
  | {
      kind: "pending";
      id: string;
      pagePath: string;
      agentSlug: string;
      userMessage: string;
      timestamp: number;
      status: "starting" | "failed";
      error?: string;
    }
  | {
      kind: "running";
      id: string;
      sessionId: string;
      pagePath: string;
      agentSlug: string;
      userMessage: string;
      prompt: string;
      timestamp: number;
      reconnect?: boolean;
    };

function startCase(value: string | undefined, fallback = "Editor"): string {
  if (!value) return fallback;
  const words = value.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function AIPanel() {
  const { t } = useLocale();
  const {
    isOpen,
    close,
    editorSessions,
    addEditorSession,
    markSessionCompleted,
    removeSession,
    clearAllSessions,
  } = useAIPanelStore();
  const { currentPath, loadPage } = useEditorStore();
  const treeNodes = useTreeStore((s) => s.nodes);
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
  const [expandedPast, setExpandedPast] = useState<Set<string>>(new Set());
  const [pastSessionDetails, setPastSessionDetails] = useState<Record<string, string>>({});
  const [pendingSessions, setPendingSessions] = useState<PendingLiveSession[]>([]);
  const [selectedLiveSessionId, setSelectedLiveSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCurrentPathRef = useRef<string | null>(null);

  const skillItems = useSkillMentionItems({ enabled: isOpen });

  // Build mentionable items from tree + agents + skills
  const mentionItems: MentionableItem[] = [
    ...agents
      .filter((a) => a.slug !== "editor")
      .map((a) => ({
        type: "agent" as const,
        id: a.slug,
        label: a.name,
        sublabel: a.role || "",
        icon: a.emoji,
      })),
    ...skillItems,
    ...flattenTree(treeNodes).map((p) => ({
      type: "page" as const,
      id: p.path,
      label: p.title,
      sublabel: p.path,
    })),
  ];

  const loadPastSessions = useCallback(async () => {
    if (!currentPath || !isOpen) return;
    try {
      const res = await fetch(
        `/api/agents/conversations?agent=editor&pagePath=${encodeURIComponent(currentPath)}&limit=20`
      );
      if (!res.ok) return;

      const data = await res.json();
      const conversations = (data.conversations || []) as ConversationMeta[];
      const nextSessions = conversations
        .filter((conversation) => conversation.status !== "running")
        .map((conversation) => {
          const duration = conversation.completedAt
            ? Math.max(
                0,
                Math.round(
                  (new Date(conversation.completedAt).getTime() -
                    new Date(conversation.startedAt).getTime()) /
                    1000
                )
              )
            : undefined;

          return {
            id: conversation.id,
            pagePath: currentPath,
            instruction: conversation.title,
            timestamp: conversation.startedAt,
            duration,
            status:
              conversation.status === "failed"
                ? "failed"
                : conversation.status === "cancelled"
                  ? "cancelled"
                  : "completed",
            summary: conversation.summary || "",
          } satisfies PastSession;
        });

      setPastSessions(nextSessions);
    } catch {}
  }, [currentPath, isOpen]);

  const runningSessions = useMemo(
    () => editorSessions.filter((session) => session.status === "running"),
    [editorSessions]
  );

  const liveSessions = useMemo<LiveSessionView[]>(() => {
    const pending = pendingSessions.map((session) => ({
      kind: "pending" as const,
      id: session.id,
      pagePath: session.pagePath,
      agentSlug: session.agentSlug,
      userMessage: session.userMessage,
      timestamp: session.timestamp,
      status: session.status,
      error: session.error,
    }));

    const running = runningSessions.map((session) => ({
      kind: "running" as const,
      id: session.sessionId,
      sessionId: session.sessionId,
      pagePath: session.pagePath,
      agentSlug: session.agentSlug || "editor",
      userMessage: session.userMessage,
      prompt: session.prompt,
      timestamp: session.timestamp,
      reconnect: session.reconnect,
    }));

    return [...pending, ...running].sort((left, right) => {
      const leftCurrent = left.pagePath === currentPath ? 0 : 1;
      const rightCurrent = right.pagePath === currentPath ? 0 : 1;
      if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
      return right.timestamp - left.timestamp;
    });
  }, [currentPath, pendingSessions, runningSessions]);

  const selectedLiveSession = useMemo(
    () => liveSessions.find((session) => session.id === selectedLiveSessionId) || null,
    [liveSessions, selectedLiveSessionId]
  );

  // Restore sessions from sessionStorage on mount and validate against terminal server
  useEffect(() => {
    const restore = async () => {
      useAIPanelStore.getState().restoreSessionsFromStorage();

      // Check which restored sessions are still alive on the terminal server.
      // Audit #104: route through dedupFetch so React 18 StrictMode's
      // double-mount in dev (and any sibling caller racing on the same
      // tick) collapses to one network request.
      try {
        const res = await dedupFetch("/api/daemon/sessions", undefined, { ttlMs: 1500 });
        if (res.ok) {
          const serverSessions: { id: string; exited: boolean }[] = await res.json();
          const aliveIds = new Set(serverSessions.filter((s) => !s.exited).map((s) => s.id));
          const exitedIds = new Set(serverSessions.filter((s) => s.exited).map((s) => s.id));

          const state = useAIPanelStore.getState();
          for (const session of state.editorSessions) {
            if (session.status === "running" && session.reconnect) {
              if (exitedIds.has(session.sessionId)) {
                // Process finished while we were away — mark completed
                state.markSessionCompleted(session.sessionId);
              } else if (!aliveIds.has(session.sessionId)) {
                // Session no longer exists on server at all — remove it
                state.removeSession(session.sessionId);
              }
              // If alive, it stays as reconnect=true and the WebTerminal will reconnect
            }
          }
        }
      } catch {
        // Terminal server not reachable — clear all reconnect sessions
        const state = useAIPanelStore.getState();
        for (const session of state.editorSessions) {
          if (session.reconnect) {
            state.removeSession(session.sessionId);
          }
        }
      }
    };
    restore();
  }, []);

  // Load agents for @ mentions
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const data = await fetchCabinetOverviewClient(".", "all");
        if (!data) return;
        const overview = (data.agents || []).map((a) => ({
          name: a.name,
          slug: a.slug,
          emoji: a.emoji || "",
          role: a.role || "",
          active: a.active,
        })) as AgentListItem[];
        setAgents(overview);
      } catch {}
    };
    load();
  }, [isOpen]);

  // Load past sessions when page changes
  useEffect(() => {
    void loadPastSessions();
  }, [loadPastSessions]);

  useEffect(() => {
    const selectedStillExists =
      !!selectedLiveSessionId && liveSessions.some((session) => session.id === selectedLiveSessionId);
    if (selectedStillExists) return;

    const fallbackSession =
      liveSessions.find((session) => session.pagePath === currentPath) || liveSessions[0] || null;
    setSelectedLiveSessionId(fallbackSession?.id || null);
  }, [currentPath, liveSessions, selectedLiveSessionId]);

  useEffect(() => {
    if (previousCurrentPathRef.current === currentPath) return;
    previousCurrentPathRef.current = currentPath;
    const currentPageLive = liveSessions.find((session) => session.pagePath === currentPath);
    if (currentPageLive) {
      setSelectedLiveSessionId(currentPageLive.id);
    }
  }, [currentPath, liveSessions]);

  const [taskRuntime, setTaskRuntime] = useState<TaskRuntimeSelection>({});
  const [pickedAgentSlug, setPickedAgentSlug] = useState<string>("editor");

  const agentPickerOptions = useMemo<AgentPickerOption[]>(
    () => [
      {
        slug: "editor",
        name: "Editor",
        role: "Edits the current page",
      },
      ...agents
        .filter((a) => a.slug !== "editor")
        .map((a) => ({
          slug: a.slug,
          name: a.name,
          role: a.role,
          cabinetPath: a.cabinetPath,
          iconKey: (a as { iconKey?: string | null }).iconKey,
          color: (a as { color?: string | null }).color,
          avatar: (a as { avatar?: string | null }).avatar,
          avatarExt: (a as { avatarExt?: string | null }).avatarExt,
        })),
    ],
    [agents]
  );

  const composer = useComposer({
    items: mentionItems,
    disabled: !currentPath,
    onSubmit: async ({ message, mentionedPaths, mentionedAgents, mentionedSkills }) => {
      if (!currentPath) return;

      // @-mention takes precedence over the picker (it's the explicit hint
      // for that turn). Otherwise fall back to whatever the picker has.
      const mentionTarget = mentionedAgents.length > 0 ? mentionedAgents[0] : null;
      const targetAgent =
        mentionTarget ??
        (pickedAgentSlug && pickedAgentSlug !== "editor" ? pickedAgentSlug : null);
      const nextAgentSlug = targetAgent || "editor";
      const pendingId = `pending-${Date.now()}-${crypto.randomUUID()}`;

      setPendingSessions((prev) => [
        ...prev,
        {
          id: pendingId,
          pagePath: currentPath,
          userMessage: message,
          agentSlug: nextAgentSlug,
          timestamp: Date.now(),
          status: "starting",
        },
      ]);
      setSelectedLiveSessionId(pendingId);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      });

      try {
        const data = await createConversation(
          targetAgent
            ? {
                agentSlug: targetAgent,
                userMessage: message,
                mentionedPaths,
                mentionedSkills,
                ...taskRuntime,
              }
            : {
                source: "editor",
                pagePath: currentPath,
                userMessage: message,
                mentionedPaths,
                mentionedSkills,
                ...taskRuntime,
              }
        );
        const conversation = data.conversation as ConversationMeta;

        setPendingSessions((prev) => prev.filter((session) => session.id !== pendingId));
        addEditorSession({
          id: conversation.id,
          sessionId: conversation.id,
          pagePath: currentPath,
          agentSlug: conversation.agentSlug,
          userMessage: message,
          prompt: conversation.title,
          timestamp: Date.now(),
          status: "running",
          reconnect: true,
        });
        setSelectedLiveSessionId(conversation.id);
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "Failed to start conversation";
        setPendingSessions((prev) =>
          prev.map((session) =>
            session.id === pendingId
              ? { ...session, status: "failed", error: message }
              : session
          )
        );
        throw error;
      }
    },
  });

  // Keep newest live work visible
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [liveSessions.length]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => composer.textareaRef.current?.focus(), 100);
    }
  }, [composer.textareaRef, isOpen]);

  const handleSessionEnd = useCallback(
    async (sessionId: string) => {
      const session = useAIPanelStore
        .getState()
        .editorSessions.find((s) => s.sessionId === sessionId);
      markSessionCompleted(sessionId);
      await loadPastSessions();

      // Reload the current page if we're still on it
      const currentPagePath = useEditorStore.getState().currentPath;
      if (session && currentPagePath === session.pagePath) {
        setTimeout(() => loadPage(session.pagePath), 500);
      }
    },
    [loadPage, loadPastSessions, markSessionCompleted]
  );

  const togglePastExpanded = async (id: string) => {
    const wasExpanded = expandedPast.has(id);
    setExpandedPast((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    if (wasExpanded || pastSessionDetails[id]) {
      return;
    }

    try {
      const res = await fetch(`/api/agents/conversations/${id}`);
      if (!res.ok) return;
      const detail = (await res.json()) as ConversationDetail;
      setPastSessionDetails((prev) => ({
        ...prev,
        [id]: detail.transcript || detail.meta.summary || "",
      }));
    } catch {}
  };

  const formatTime = (ts: string | number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (ts: string | number) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (!isOpen) return null;

  const hasAnySessions =
    liveSessions.length > 0 ||
    pastSessions.length > 0 ||
    runningSessions.length > 0;

  const dismissLiveSession = (session: LiveSessionView) => {
    if (session.kind === "pending") {
      setPendingSessions((prev) => prev.filter((entry) => entry.id !== session.id));
      return;
    }
    removeSession(session.sessionId);
  };

  return (
    <div className="w-[480px] min-w-[420px] border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold tracking-[-0.02em]">
            AI Editor
          </span>
          {currentPath && (
            <span className="text-[11px] text-muted-foreground">
              {currentPath.split("/").pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasAnySessions && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={t("aiPanel:clearSessions")}
              onClick={() => {
                clearAllSessions();
                setPendingSessions([]);
                setSelectedLiveSessionId(null);
                setPastSessions([]);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={close}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Sessions */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto" ref={scrollRef}>
        <div className="p-3 space-y-4">
          {!hasAnySessions && (
            <div className="text-center py-8 space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">
                Tell me how you&apos;d like to edit this page.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Use{" "}
                <span className="font-mono bg-muted px-1 rounded">@</span> to
                reference other pages as context.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Sessions persist across pages and show in Editor Agent.
              </p>
            </div>
          )}

          {liveSessions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  Live Sessions
                </div>
                <span className="text-[10px] text-muted-foreground/50">
                  {liveSessions.length} active
                </span>
              </div>

              <div className="space-y-1.5">
                {liveSessions.map((session) => {
                  const isSelected = selectedLiveSessionId === session.id;
                  const isCurrentPage = session.pagePath === currentPath;
                  const agentLabel =
                    session.agentSlug === "editor" ? "Editor" : startCase(session.agentSlug);

                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedLiveSessionId(session.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/8"
                          : "border-border/60 hover:bg-accent/30"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {session.kind === "pending" ? (
                          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        ) : (
                          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-emerald-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[12px] font-medium text-foreground">
                              {session.userMessage}
                            </span>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {agentLabel}
                            </span>
                            {isCurrentPage ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-primary">
                                Here
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="truncate">{session.pagePath}</span>
                            <span className="shrink-0">
                              {session.kind === "pending" && session.status === "failed"
                                ? "Failed"
                                : session.kind === "pending"
                                  ? "Starting"
                                  : "Streaming"}
                            </span>
                          </div>
                        </div>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            dismissLiveSession(session);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              dismissLiveSession(session);
                            }
                          }}
                          className="shrink-0 p-1 text-muted-foreground/40 transition-colors hover:text-destructive"
                          title={t("aiPanel:dismiss")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedLiveSession && (
                <div className="space-y-2 rounded-xl border border-border/70 bg-card/50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="rounded-lg bg-accent/50 px-3 py-2 text-[13px] leading-relaxed flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        {selectedLiveSession.kind === "pending"
                          ? selectedLiveSession.status === "failed"
                            ? "Unable to start"
                            : "Starting live session..."
                          : "Live stream"}
                      </div>
                      <div className="mt-1.5 text-foreground">
                        {selectedLiveSession.userMessage}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{selectedLiveSession.pagePath}</span>
                        <span>
                          {selectedLiveSession.agentSlug === "editor"
                            ? "Editor"
                            : startCase(selectedLiveSession.agentSlug)}
                        </span>
                        <span>{formatDate(selectedLiveSession.timestamp)} {formatTime(selectedLiveSession.timestamp)}</span>
                      </div>
                    </div>
                    {selectedLiveSession.pagePath !== currentPath ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 text-[11px]"
                        onClick={() => {
                          useAppStore.getState().setSection({ type: "page" });
                          void loadPage(selectedLiveSession.pagePath);
                        }}
                      >
                        Open Page
                      </Button>
                    ) : null}
                  </div>

                  {selectedLiveSession.kind === "pending" ? (
                    <div className="min-h-[220px] rounded-lg border border-dashed border-border/70 bg-background/80 p-4">
                      <div className="flex h-full min-h-[188px] flex-col items-center justify-center gap-3 text-center">
                        {selectedLiveSession.status === "failed" ? (
                          <>
                            <X className="h-8 w-8 text-destructive" />
                            <div className="space-y-1">
                              <p className="text-[13px] font-medium text-foreground">
                                The session did not start.
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {selectedLiveSession.error || "Try sending the request again."}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div className="space-y-1">
                              <p className="text-[13px] font-medium text-foreground">
                                Starting the live editor stream...
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                The panel will switch to terminal output as soon as the daemon session is ready.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[260px] overflow-hidden rounded-lg border border-border/70 bg-background">
                      <WebTerminal
                        sessionId={selectedLiveSession.sessionId}
                        prompt={selectedLiveSession.prompt}
                        displayPrompt={selectedLiveSession.userMessage}
                        reconnect={selectedLiveSession.reconnect}
                        themeSurface="page"
                        onClose={() => handleSessionEnd(selectedLiveSession.sessionId)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Past sessions for current page (collapsed by default) */}
          {pastSessions.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1">
                Previous Sessions
              </div>
              {pastSessions.map((session) => (
                <div
                  key={session.id}
                  className="border border-[#ffffff08] rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => togglePastExpanded(session.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
                  >
                    {expandedPast.has(session.id) ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="text-[12px] truncate flex-1">
                      {session.instruction}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {formatDate(session.timestamp)}{" "}
                      {formatTime(session.timestamp)}
                    </span>
                  </button>
                  {expandedPast.has(session.id) && (
                    <div
                      className="border-t"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--background)",
                        color: "var(--foreground)",
                      }}
                    >
                      <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground/85">
                        {pastSessionDetails[session.id] || session.summary || "(No output captured)"}
                      </pre>
                      <div
                        className="flex items-center gap-3 border-t px-3 py-1.5 text-[10px] text-muted-foreground/60"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {session.duration !== undefined && (
                          <span>
                            <Clock className="h-2.5 w-2.5 inline mr-1" />
                            {session.duration}s
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Non-selected running sessions stay mounted in the background so their streams stay alive */}
      {runningSessions
        .filter((session) =>
          selectedLiveSession?.kind === "running"
            ? session.sessionId !== selectedLiveSession.sessionId
            : true
        )
        .map((session) => (
          <div
            key={`hidden-${session.id}`}
            style={{ width: 0, height: 0, overflow: "hidden", position: "absolute" }}
          >
            <WebTerminal
              sessionId={session.sessionId}
              prompt={session.prompt}
              displayPrompt={session.userMessage}
              reconnect={session.reconnect}
              themeSurface="page"
              onClose={() => handleSessionEnd(session.sessionId)}
            />
          </div>
        ))}

      {/* Input */}
      <div className="border-t border-border shrink-0">
        <ComposerInput
          composer={composer}
          placeholder={
            currentPath
              ? "Ask anything... use @ to mention pages or agents"
              : "Select a page first..."
          }
          disabled={!currentPath}
          variant="inline"
          minHeight="56px"
          maxHeight="160px"
          items={mentionItems}
          autoFocus={isOpen}
          actionsStart={
            <>
              <AgentPicker
                agents={agentPickerOptions}
                selectedSlug={pickedAgentSlug}
                onSelect={setPickedAgentSlug}
              />
              <TaskRuntimePicker value={taskRuntime} onChange={setTaskRuntime} />
            </>
          }
        />
      </div>
    </div>
  );
}
