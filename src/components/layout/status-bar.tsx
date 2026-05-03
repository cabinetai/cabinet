"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { GitBranch, RefreshCw, Check, CloudDownload, X, ArrowRight, HelpCircle, AlertTriangle, XCircle, CircleDot, Loader2, Terminal } from "lucide-react";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { useAIPanelStore } from "@/stores/ai-panel-store";
import {
  selectAppLevel,
  selectDaemonLevel,
  useHealthStore,
} from "@/stores/health-store";
import { createConversation } from "@/lib/agents/conversation-client";
import {
  TaskRuntimePicker,
  type TaskRuntimeSelection,
} from "@/components/composer/task-runtime-picker";
import { dedupFetch } from "@/lib/api/dedup-fetch";

function describeUncommittedStatus(s: "M" | "?" | "A" | "D" | "R"): string {
  switch (s) {
    case "M":
      return "Modified";
    case "?":
      return "New";
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
  }
}

// Audit #092: surface the last successful health check in the popover so
// users can see how stale "Running"/"Down" actually is. "5s ago" is fine,
// "11m ago" should make a green pill suspect.
function formatRelativeAgo(ts: number | null, now: number): string {
  if (!ts) return "never";
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

export function StatusBar() {
  const { saveStatus, currentPath } = useEditorStore();
  const retrySave = useEditorStore((s) => s.save);
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const setAiPanelCollapsed = useAppStore((s) => s.setAiPanelCollapsed);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const { open, addEditorSession } = useAIPanelStore();
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiRuntime, setAiRuntime] = useState<TaskRuntimeSelection>({});

  const showAIPill = section.type === "page" && !!selectedPath;

  const handleAISubmit = async () => {
    if (!aiPrompt.trim() || !selectedPath || aiSubmitting) return;
    const message = aiPrompt.trim();
    setAiPrompt("");
    setAiSubmitting(true);
    setAiPanelCollapsed(false);
    open();
    try {
      try {
        const data = await createConversation({
          source: "editor",
          pagePath: selectedPath,
          userMessage: message,
          mentionedPaths: [],
          ...aiRuntime,
        });
        const conversation = data.conversation as { id: string; title: string };
        addEditorSession({
          id: conversation.id,
          sessionId: conversation.id,
          pagePath: selectedPath,
          userMessage: message,
          prompt: conversation.title,
          timestamp: Date.now(),
          status: "running",
          reconnect: true,
        });
      } catch {
        // Preserve the previous fire-and-forget behavior for the status bar action.
      }
    } finally {
      setAiSubmitting(false);
    }
  };
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [uncommitted, setUncommitted] = useState(0);
  const [uncommittedFiles, setUncommittedFiles] = useState<Array<{ path: string; status: "M" | "?" | "A" | "D" | "R" }>>([]);
  const [uncommittedTruncated, setUncommittedTruncated] = useState(false);
  const [showUncommittedPopup, setShowUncommittedPopup] = useState(false);
  const [showCommunityPopup, setShowCommunityPopup] = useState(false);
  const [pullStatus, setPullStatus] = useState<"idle" | "pulling" | "pulled" | "up-to-date" | "error">("idle");
  const [pulling, setPulling] = useState(false);
  const didAutoPullRef = useRef(false);
  const appLevel = useHealthStore(selectAppLevel);
  const daemonLevel = useHealthStore(selectDaemonLevel);
  const installKind = useHealthStore((s) => s.installKind);
  const startHealthPolling = useHealthStore((s) => s.startPolling);
  const lastDaemonOkAt = useHealthStore((s) => s.lastDaemonOkAt);
  const lastAppOkAt = useHealthStore((s) => s.lastAppOkAt);

  // Pill is honest about uncertainty: until the first health poll lands we
  // show "Checking…" rather than flashing green. After that, daemon needs
  // two consecutive misses to flip — single dropped polls during fast
  // refresh used to thrash the indicator.
  const checkingHealth = appLevel === "unknown" || daemonLevel === "unknown";
  const appAlive = appLevel !== "down";
  const daemonAlive = daemonLevel !== "down";

  const [showServerPopup, setShowServerPopup] = useState(false);

  // Tick a "now" value while the popover is open so the relative-time
  // strings ("13s ago") stay fresh even when no poll has fired in the
  // meantime. 1 Hz is plenty — we only render seconds for the first
  // minute, then minutes after that.
  const [popupNow, setPopupNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showServerPopup) return;
    const id = setInterval(() => setPopupNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showServerPopup]);
  const [providerStatuses, setProviderStatuses] = useState<
    { id: string; name: string; available: boolean; authenticated: boolean }[]
  >([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const { update } = useCabinetUpdate();

  const anyProviderReady = useMemo(
    () => !providersLoaded || providerStatuses.some((p) => p.available && p.authenticated),
    [providersLoaded, providerStatuses],
  );

  const fetchProviderStatus = useCallback(async () => {
    try {
      const res = await dedupFetch("/api/agents/providers/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.providers)) {
        setProviderStatuses(data.providers);
        setProvidersLoaded(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => startHealthPolling(), [startHealthPolling]);

  // Fetch provider status once on mount
  useEffect(() => {
    void fetchProviderStatus();
  }, [fetchProviderStatus]);

  const fetchGitStatus = async () => {
    try {
      const res = await fetch("/api/git/commit");
      if (res.ok) {
        const data = await res.json();
        setIsGitRepo(!!data.isGit);
        setUncommitted(data.uncommitted || 0);
        setUncommittedFiles(Array.isArray(data.files) ? data.files : []);
        setUncommittedTruncated(!!data.truncated);
      }
    } catch {
      // ignore
    }
  };


  const pullAndRefresh = useCallback(async () => {
    if (pulling) return;
    setPulling(true);
    setPullStatus("pulling");
    try {
      const res = await fetch("/api/git/pull", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.pulled) {
          setPullStatus("pulled");
          // Reload tree to reflect new/changed files
          await loadTree();
        } else {
          setPullStatus("up-to-date");
        }
      } else {
        setPullStatus("error");
      }
    } catch {
      setPullStatus("error");
    } finally {
      setPulling(false);
      // Reset status after 3 seconds
      setTimeout(() => setPullStatus("idle"), 3000);
    }
  }, [pulling, loadTree]);

  // Auto-pull on mount (page load)
  useEffect(() => {
    if (didAutoPullRef.current) return;
    didAutoPullRef.current = true;

    const initialPull = window.setTimeout(() => {
      void pullAndRefresh();
    }, 0);
    return () => window.clearTimeout(initialPull);
  }, [pullAndRefresh]);

  // Poll git status
  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchGitStatus();
    }, 0);
    const interval = setInterval(fetchGitStatus, 15000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative flex items-center justify-between px-3 py-1 border-t border-border text-[11px] text-muted-foreground/60 bg-background">
      {/* Center: AI edit pill + runtime picker. Picker sits to the LEFT of
          the pill so the narrow input stays readable; the same value is sent
          in the createConversation call (terminal mode swaps to legacy PTY). */}
      {showAIPill && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-auto">
          <TaskRuntimePicker
            value={aiRuntime}
            onChange={setAiRuntime}
            className="h-6 px-1.5 text-[10px]"
          />
          <div className="flex items-center rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 gap-1.5 focus-within:border-border/80 focus-within:bg-muted/60 transition-colors w-56">
            <input
              type="text"
              // Audit #098: anonymous form field tripped the
              // "needs id/name" warning on every page surface.
              name="status-bar-ai-prompt"
              aria-label="Ask AI to edit this page"
              title="↵ to send"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAISubmit();
                }
              }}
              placeholder="How to edit this page?"
              className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
            />
            <button
              onClick={() => void handleAISubmit()}
              disabled={!aiPrompt.trim() || aiSubmitting}
              className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground disabled:opacity-20 transition-colors cursor-pointer"
            >
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative">
          <button
            onClick={() => {
              setShowServerPopup((v) => {
                if (!v) void fetchProviderStatus();
                return !v;
              });
            }}
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer ${
              checkingHealth
                ? "text-muted-foreground hover:bg-muted/40"
                : appAlive && daemonAlive && anyProviderReady
                ? "text-green-500 hover:bg-green-500/10"
                : !appAlive
                ? "text-red-500 hover:bg-red-500/10"
                : "text-amber-500 hover:bg-amber-500/10"
            }`}
            title={
              checkingHealth
                ? "Checking server status…"
                : appAlive && daemonAlive && anyProviderReady
                ? "All systems running"
                : !appAlive
                ? "App server is not responding"
                : !daemonAlive && !anyProviderReady
                ? "Daemon is not responding; no agent providers available"
                : !daemonAlive
                ? "Daemon is not responding"
                : "No agent providers available"
            }
            aria-label="Server status — click for details"
          >
            {/* Audit #100: pair color with a state-specific shape so
                colorblind users (and anyone scanning fast) can read the
                pill without relying on hue. The visible "Online" /
                "Degraded" / "Offline" label below also covers screen
                readers. */}
            {checkingHealth ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : appAlive && daemonAlive && anyProviderReady ? (
              <CircleDot className="h-3 w-3 shrink-0 text-green-500" aria-hidden="true" />
            ) : !appAlive ? (
              <XCircle className="h-3 w-3 shrink-0 text-red-500 animate-pulse" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500 animate-pulse" aria-hidden="true" />
            )}
            <span>
              {checkingHealth
                ? "Checking…"
                : appAlive && daemonAlive && anyProviderReady
                ? "Online"
                : !appAlive
                ? "Offline"
                : "Degraded"}
            </span>
          </button>
          {showServerPopup && (
            <div className={`absolute bottom-full left-0 mb-2 z-50 w-80 rounded-lg border bg-background p-3 shadow-lg ${
              appAlive && daemonAlive && anyProviderReady
                ? "border-green-500/30"
                : !appAlive
                ? "border-red-500/30"
                : "border-amber-500/30"
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2.5">
                  <p className={`text-xs font-medium ${
                    appAlive && daemonAlive && anyProviderReady
                      ? "text-green-500"
                      : !appAlive
                      ? "text-red-500"
                      : "text-amber-500"
                  }`}>
                    {appAlive && daemonAlive && anyProviderReady
                      ? "All Systems Running"
                      : "Service Disruption"}
                  </p>

                  {/* App Server */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${appAlive ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="font-medium text-foreground/80">App Server</span>
                      <span className={`ml-auto ${appAlive ? "text-green-500" : "text-red-500"}`}>{appAlive ? "Running" : "Down"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 pl-3.5">
                      {appAlive
                        ? "Pages, editor, search, and file management are working."
                        : "Pages, editor, search, and saving are unavailable. You can still read cached content."}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 pl-3.5">
                      Last seen: {formatRelativeAgo(lastAppOkAt, popupNow)}
                    </p>
                  </div>

                  {/* Daemon */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${daemonAlive ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="font-medium text-foreground/80">Daemon</span>
                      <span className={`ml-auto ${daemonAlive ? "text-green-500" : "text-red-500"}`}>{daemonAlive ? "Running" : "Down"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 pl-3.5">
                      {daemonAlive
                        ? "AI agents, scheduled jobs, and the web terminal are working."
                        : "AI agents, scheduled jobs, and the web terminal are unavailable. Page editing still works."}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 pl-3.5">
                      Last seen: {formatRelativeAgo(lastDaemonOkAt, popupNow)}
                    </p>
                  </div>

                  {/* Agent Providers */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                        anyProviderReady ? "bg-green-500" : "bg-red-500"
                      }`} />
                      <span className="font-medium text-foreground/80">Agent Providers</span>
                      <span className={`ml-auto ${anyProviderReady ? "text-green-500" : "text-red-500"}`}>
                        {!providersLoaded ? "Checking..." : anyProviderReady ? "Available" : "None Ready"}
                      </span>
                    </div>
                    {providersLoaded && providerStatuses.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[10px] pl-3.5 text-muted-foreground/70">
                        <span className={`inline-block h-1 w-1 rounded-full shrink-0 ${
                          p.available && p.authenticated ? "bg-green-500"
                          : p.available ? "bg-amber-500"
                          : "bg-red-500/50"
                        }`} />
                        <span>{p.name}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <span>
                            {p.available && p.authenticated ? "Ready"
                            : p.available ? "Not logged in"
                            : "Not installed"}
                          </span>
                          {!p.available && (
                            <span
                              className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
                            >
                              Install in Settings
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Troubleshooting tips */}
                  {(!appAlive || !daemonAlive || !anyProviderReady) && (
                    <div className="pt-1.5 border-t border-border space-y-1">
                      <p className="text-[10px] font-medium text-foreground/70">How to fix</p>
                      {(!appAlive || !daemonAlive) && (
                        installKind === "electron-macos" ? (
                          <p className="text-[10px] text-muted-foreground">
                            {!appAlive && !daemonAlive
                              ? "Both servers are down. Try quitting and reopening Optale Observatory."
                              : !appAlive
                              ? "The app server is not responding. Try quitting and reopening Optale Observatory."
                              : "The background daemon is not running. Try quitting and reopening Optale Observatory. If the issue persists, check Activity Monitor for stuck Optale Observatory processes."}
                          </p>
                        ) : installKind === "source-managed" ? (
                          <p className="text-[10px] text-muted-foreground">
                            {!appAlive && !daemonAlive ? (
                              <>Both servers are down. Restart with:{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npx cabinet</code></>
                            ) : !appAlive ? (
                              <>The app server crashed. Restart with:{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npx cabinet</code></>
                            ) : (
                              <>The daemon is not running. It should start automatically with{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npx cabinet</code>
                              . Try restarting.</>
                            )}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            {!appAlive && !daemonAlive ? (
                              <>Both servers are down. Start everything with:{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run dev:all</code></>
                            ) : !appAlive ? (
                              <>The Next.js app server crashed or was stopped. Restart with:{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run dev</code></>
                            ) : (
                              <>The daemon is not running. If you started only{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run dev</code>
                              , use{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">npm run dev:all</code>
                              {" "}instead to start both servers.</>
                            )}
                          </p>
                        )
                      )}
                      {appAlive && daemonAlive && !anyProviderReady && (
                        <p className="text-[10px] text-muted-foreground">
                          No agent providers are installed or logged in.{" "}
                          <button
                            onClick={() => { setSection({ type: "settings" }); setShowServerPopup(false); }}
                            className="underline hover:text-foreground transition-colors"
                          >
                            Configure in Settings
                          </button>
                        </p>
                      )}
                    </div>
                  )}

                  {/* All good state */}
                  {appAlive && daemonAlive && anyProviderReady && (
                    <p className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
                      Optale Observatory is fully operational. All features are available.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowServerPopup(false)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
        {currentPath && (
          saveStatus === "error" ? (
            // Audit #126: clickable retry instead of forcing the user to
            // type a character to re-trigger autosave. Successful retry
            // flashes "Saved" via the existing 2s status flow.
            <button
              type="button"
              onClick={() => void retrySave()}
              title="Click to retry the failed save"
              aria-label="Save failed — click to retry"
              className="rounded-md px-1.5 py-0.5 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Save failed — retry
            </button>
          ) : saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-muted-foreground/70" title="Auto-saving…">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1 text-emerald-500/80" title="Force save: ⌘S">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null
        )}
        {pullStatus === "pulling" && (
          <span className="flex items-center gap-1 text-blue-400">
            <CloudDownload className="h-3 w-3 animate-pulse" />
            Pulling...
          </span>
        )}
        {pullStatus === "pulled" && (
          <span className="flex items-center gap-1 text-green-400">
            <Check className="h-3 w-3" />
            Updated from remote
          </span>
        )}
        {pullStatus === "up-to-date" && (
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <Check className="h-3 w-3" />
            Up to date
          </span>
        )}
        {pullStatus === "error" && (
          <span className="flex items-center gap-1 text-red-400">
            Pull failed
          </span>
        )}
        {update?.updateStatus.state === "restart-required" && (
          <button
            onClick={() => setSection({ type: "settings" })}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-amber-600 hover:bg-muted hover:text-foreground transition-colors"
            title="Open Settings to review the installed update"
          >
            <CloudDownload className="h-3 w-3" />
            Restart to finish update
          </button>
        )}
        {update?.updateAvailable && update?.updateStatus.state !== "restart-required" && update.latest && (
          <button
            onClick={() => setSection({ type: "settings" })}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-blue-500 hover:bg-muted hover:text-foreground transition-colors"
            title={`Optale Observatory ${update.latest.version} is available`}
          >
            <CloudDownload className="h-3 w-3" />
            Update {update.latest.version} available
          </button>
        )}
        {/* Audit #015: clickable so users can see *what* is uncommitted
            (file list popover) instead of guessing what the count refers
            to. The dropdown is read-only — committing still goes through
            the agent flow or `git` directly. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => uncommitted > 0 && setShowUncommittedPopup((v) => !v)}
            disabled={uncommitted === 0}
            aria-label={
              uncommitted > 0
                ? `${uncommitted} uncommitted files — click to see the list`
                : "All committed"
            }
            title={uncommitted > 0 ? "Click to see uncommitted files" : "All committed"}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-current"
          >
            <GitBranch className="h-3 w-3" />
            {uncommitted > 0 ? `${uncommitted} uncommitted` : "All committed"}
          </button>
          {showUncommittedPopup && uncommitted > 0 && (
            <div className="absolute bottom-full left-0 mb-2 z-50 w-80 rounded-lg border border-border bg-background p-2 shadow-lg">
              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                <span className="text-[11px] font-medium text-foreground/80">
                  {uncommitted} uncommitted file{uncommitted === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowUncommittedPopup(false)}
                  aria-label="Close"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto pr-1 text-[10.5px]">
                {uncommittedFiles.map((f) => (
                  <li key={`${f.status}:${f.path}`} className="flex items-center gap-1.5 py-0.5">
                    <span
                      className={`inline-flex h-3.5 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-semibold ${
                        f.status === "M" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : f.status === "?" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : f.status === "A" ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : f.status === "D" ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                      }`}
                      title={describeUncommittedStatus(f.status)}
                    >
                      {f.status}
                    </span>
                    <span className="truncate font-mono text-foreground/80" title={f.path}>
                      {f.path}
                    </span>
                  </li>
                ))}
              </ul>
              {uncommittedTruncated && (
                <p className="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground">
                  Only the first {uncommittedFiles.length} files shown — run{" "}
                  <code className="rounded bg-muted px-1 py-0.5">git status</code>{" "}
                  for the full list.
                </p>
              )}
            </div>
          )}
        </div>
        {isGitRepo && (
          <button
            onClick={pullAndRefresh}
            disabled={pulling}
            aria-label="Pull latest changes and refresh"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
            title="Pull latest changes & refresh"
          >
            <RefreshCw className={`h-3 w-3 ${pulling ? "animate-spin" : ""}`} />
            Sync
          </button>
        )}
        <button
          onClick={toggleTerminal}
          aria-label={terminalOpen ? "New terminal tab" : "Open terminal"}
          title={terminalOpen ? "New terminal tab" : "Open terminal"}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 ${terminalOpen ? "text-primary" : ""}`}
        >
          <Terminal className="h-3 w-3" />
          Terminal
        </button>
      </div>
      {/* Status-bar help menu. */}
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={() => setShowCommunityPopup((v) => !v)}
          aria-label="Open Help menu"
          aria-expanded={showCommunityPopup}
          title="Help"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-foreground">
            Help
          </span>
        </button>
        {showCommunityPopup && (
          <div className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-lg border border-border bg-background p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setSection({ type: "help" });
                setShowCommunityPopup(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">Help</span>
                <span className="text-[10px] text-muted-foreground">Demos, videos, and guides</span>
              </span>
            </button>
            <a
              href="mailto:hello@optale.com"
              onClick={() => setShowCommunityPopup(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                @
              </span>
              <span className="flex flex-col">
                <span className="font-medium text-foreground">Contact Optale</span>
                <span className="text-[10px] text-muted-foreground">hello@optale.com</span>
              </span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
