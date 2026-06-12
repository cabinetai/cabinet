"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { GitBranch, RefreshCw, Check, CloudDownload, Star, X, HelpCircle, AlertTriangle, XCircle, CircleDot, Loader2, Terminal, PanelRight, Heart, History as HistoryIcon } from "lucide-react";
import { ActivityFeed } from "@/components/history/activity-feed";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import {
  selectAppLevel,
  selectDaemonLevel,
  useHealthStore,
} from "@/stores/health-store";
import { useGithubStatsStore } from "@/stores/github-stats-store";
import { StarExplosion, formatGithubStars } from "@/components/layout/star-explosion";
import { useTaskRail } from "@/components/tasks/rail/task-rail-context";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { useLocale } from "@/i18n/use-locale";
import { useUserProfile } from "@/hooks/use-user-profile";
import type { TFunction } from "i18next";

const DISCORD_SUPPORT_URL = "https://discord.gg/hJa5TRTbTH";
const GITHUB_REPO_URL = "https://github.com/hilash/cabinet";
const CABINET_INVITE_URL = "https://runcabinet.com";

// Audit #094: each "Not installed" provider row needs a one-click path to
// the canonical install instructions. Mapped by the provider id used by
// /api/agents/providers — falls back to a generic search if the id is new.
const PROVIDER_INSTALL_URLS: Record<string, string> = {
  "claude-code": "https://docs.claude.com/en/docs/claude-code/quickstart",
  "codex-cli": "https://github.com/openai/codex#installation",
  codex: "https://github.com/openai/codex#installation",
  "openai-codex": "https://github.com/openai/codex#installation",
  "cursor-cli": "https://cursor.com/cli",
  cursor: "https://cursor.com/cli",
  "gemini-cli": "https://github.com/google-gemini/gemini-cli#installation",
  gemini: "https://github.com/google-gemini/gemini-cli#installation",
  opencode: "https://opencode.ai/docs/install",
  pi: "https://github.com/PiAPI-CLI/pi#install",
  "grok-cli": "https://docs.x.ai/docs/quickstart",
  grok: "https://docs.x.ai/docs/quickstart",
  "copilot-cli": "https://docs.github.com/copilot/github-copilot-in-the-cli/configuring-github-copilot-in-the-cli",
  copilot: "https://docs.github.com/copilot/github-copilot-in-the-cli/configuring-github-copilot-in-the-cli",
  "github-copilot": "https://docs.github.com/copilot/github-copilot-in-the-cli/configuring-github-copilot-in-the-cli",
};

function installUrlForProvider(id: string): string {
  return (
    PROVIDER_INSTALL_URLS[id] ||
    `https://www.google.com/search?q=${encodeURIComponent(`${id} CLI install`)}`
  );
}

// Word counter for the open page. The editor stores the page body as
// markdown, so we strip markdown syntax that shouldn't count as prose
// (code fences, inline code, link/image URLs, emphasis markers, raw HTML)
// before splitting on whitespace. Frontmatter lives on a separate field,
// so it isn't in `content`.
function countWords(content: string): number {
  if (!content) return 0;
  let text = content.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`]*`/g, " ");
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/[#*_~>`]/g, " ");
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function describeUncommittedStatus(
  s: "M" | "?" | "A" | "D" | "R",
  t: TFunction,
): string {
  switch (s) {
    case "M":
      return t("status:git.statusModified");
    case "?":
      return t("status:git.statusNew");
    case "A":
      return t("status:git.statusAdded");
    case "D":
      return t("status:git.statusDeleted");
    case "R":
      return t("status:git.statusRenamed");
  }
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.32 4.37a16.4 16.4 0 0 0-4.1-1.28.06.06 0 0 0-.07.03c-.18.32-.38.73-.52 1.06a15.16 15.16 0 0 0-4.56 0c-.15-.34-.35-.74-.53-1.06a.06.06 0 0 0-.07-.03c-1.43.24-2.8.68-4.1 1.28a.05.05 0 0 0-.02.02C3.77 8.17 3.12 11.87 3.44 15.53a.06.06 0 0 0 .02.04 16.52 16.52 0 0 0 5.03 2.54.06.06 0 0 0 .07-.02c.39-.54.74-1.12 1.04-1.73a.06.06 0 0 0-.03-.08 10.73 10.73 0 0 1-1.6-.77.06.06 0 0 1-.01-.1l.32-.24a.06.06 0 0 1 .06-.01c3.35 1.53 6.98 1.53 10.29 0a.06.06 0 0 1 .06 0c.1.08.21.16.32.24a.06.06 0 0 1-.01.1c-.51.3-1.05.56-1.6.77a.06.06 0 0 0-.03.08c.3.61.65 1.19 1.04 1.73a.06.06 0 0 0 .07.02 16.42 16.42 0 0 0 5.03-2.54.06.06 0 0 0 .02-.04c.38-4.23-.64-7.9-2.89-11.14a.04.04 0 0 0-.02-.02ZM9.68 13.3c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.8 2-1.78 2Zm4.64 0c-.98 0-1.78-.9-1.78-2s.79-2 1.78-2c.99 0 1.79.9 1.78 2 0 1.1-.79 2-1.78 2Z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.37-1.33-1.73-1.33-1.73-1.08-.74.08-.72.08-.72 1.2.08 1.83 1.22 1.83 1.22 1.06 1.8 2.8 1.28 3.48.98.11-.77.42-1.28.76-1.58-2.67-.3-5.47-1.32-5.47-5.86 0-1.3.47-2.36 1.23-3.2-.12-.3-.53-1.52.12-3.16 0 0 1-.32 3.3 1.22a11.67 11.67 0 0 1 6.02 0c2.3-1.54 3.3-1.22 3.3-1.22.65 1.64.24 2.86.12 3.16.77.84 1.23 1.9 1.23 3.2 0 4.55-2.8 5.56-5.48 5.86.43.37.81 1.08.81 2.19v3.25c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}


// Audit #092: surface the last successful health check in the popover so
// users can see how stale "Running"/"Down" actually is. "5s ago" is fine,
// "11m ago" should make a green pill suspect.
function formatRelativeAgo(ts: number | null, now: number, t: TFunction): string {
  if (!ts) return t("status:save.savedNever");
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 5) return t("status:save.savedJustNow");
  if (sec < 60) return t("status:save.savedAgoSeconds", { n: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t("status:save.savedAgoMinutes", { n: min });
  const hr = Math.round(min / 60);
  return t("status:save.savedAgoHours", { n: hr });
}


// Audit #018: relative-time formatter for the persistent "Saved · Xs ago"
// state. Returns short tokens (s/m/h) with "just now" for the first 5
// seconds. Updated on a 10s tick by the StatusBar; the indicator never
// claims more precision than it can deliver.
function formatRelativeSavedAgo(ts: number, now: number, t: TFunction): string {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 5) return t("status:save.savedJustNow");
  if (diffSec < 60) return t("status:save.savedAgoSeconds", { n: diffSec });
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t("status:save.savedAgoMinutes", { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("status:save.savedAgoHours", { n: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  return t("status:save.savedAgoDays", { n: diffDay });
}

export function StatusBar() {
  const { t } = useLocale();
  const profileState = useUserProfile();
  // First name only — a warm, personal "thanks" beats a sterile
  // "link copied". Falls back to a localized "friend" when the profile
  // hasn't loaded or the user never set a name.
  const shareName = useMemo(() => {
    const p = profileState.status === "ready" ? profileState.data.profile : null;
    const full = (p?.displayName || p?.name || "").trim();
    return full.split(/\s+/)[0] || t("status:help.friend");
  }, [profileState, t]);
  const shareCabinet = useCallback(() => {
    void navigator.clipboard
      ?.writeText(CABINET_INVITE_URL)
      .then(() => {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: {
              kind: "success",
              message: t("status:help.shareCopied", { name: shareName }),
            },
          })
        );
      })
      .catch(() => {
        window.dispatchEvent(
          new CustomEvent("cabinet:toast", {
            detail: { kind: "error", message: t("status:help.shareFailed") },
          })
        );
      });
  }, [t, shareName]);
  const { saveStatus, currentPath, isDirty, lastSavedAt } = useEditorStore();
  const retrySave = useEditorStore((s) => s.save);
  const editorContent = useEditorStore((s) => s.content);
  const editorLoadStatus = useEditorStore((s) => s.loadStatus);
  const wordCount = useMemo(() => countWords(editorContent), [editorContent]);
  // Only meaningful for the markdown editor surface — viewers (PDF, CSV,
  // image, media, office) never populate the editor store's content, so
  // the count would always read 0 there. loadStatus === "ok" means a
  // markdown page actually loaded.
  const showWordCount = !!currentPath && editorLoadStatus === "ok";

  // Audit #018: rerender every 10s so the relative timestamp ticks. The
  // indicator only mounts when a page is open, so this isn't a global cost.
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt || saveStatus !== "idle" || isDirty) return;
    const id = window.setInterval(() => setSavedTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, [lastSavedAt, saveStatus, isDirty]);
  // Reference savedTick so the relative label re-renders on the interval.
  const savedAgoLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    return formatRelativeSavedAgo(lastSavedAt, Date.now(), t);
    // savedTick is intentionally a dependency: bumping it forces a re-render
    // so the relative label updates without recomputing on every parent
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSavedAt, savedTick]);
  const loadTree = useTreeStore((s) => s.loadTree);
  const setSection = useAppStore((s) => s.setSection);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const toggleTerminal = useAppStore((s) => s.toggleTerminal);
  const taskRailOpen = useAppStore((s) => s.taskRailOpen);
  const toggleTaskRail = useAppStore((s) => s.toggleTaskRail);
  const { runningCount, flash: taskRailFlash } = useTaskRail();
  const [isGitRepo, setIsGitRepo] = useState(false);
  // Audit #049: track when the last successful pull completed so the Sync
  // button's tooltip can answer "did the team's overnight work land?"
  // without the user having to click and watch the spinner.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = window.setInterval(() => setSyncTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [lastSyncedAt]);
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return null;
    return formatRelativeSavedAgo(lastSyncedAt, Date.now(), t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncedAt, syncTick]);
  const [uncommitted, setUncommitted] = useState(0);
  const [uncommittedFiles, setUncommittedFiles] = useState<Array<{ path: string; status: "M" | "?" | "A" | "D" | "R" }>>([]);
  // Audit #050: lightweight commit form inside the uncommitted popover.
  // Diff/discard intentionally deferred — would need /api/git/diff for the
  // working tree (not just by hash) and a confirmation flow respectively.
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [uncommittedTruncated, setUncommittedTruncated] = useState(false);
  const [showUncommittedPopup, setShowUncommittedPopup] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showCommunityPopup, setShowCommunityPopup] = useState(false);
  const [pullStatus, setPullStatus] = useState<"idle" | "pulling" | "pulled" | "up-to-date" | "error">("idle");
  const [pulling, setPulling] = useState(false);
  // Stars: shared store so cross-navigation re-mounts don't restart the
  // load-and-animate sequence (which is what produced the visible flicker
  // between fallback / mid-animation / final values). Component-local
  // animation state is intentionally seeded from the store so re-mounts
  // after the initial load skip the animation.
  const githubStars = useGithubStatsStore((s) => s.stars);
  const fetchStars = useGithubStatsStore((s) => s.fetchStars);
  const hasFetchedStarsOnce = useGithubStatsStore((s) => s.hasFetchedOnce);
  const [displayStars, setDisplayStars] = useState<number | null>(githubStars);
  const [starsExploding, setStarsExploding] = useState(false);
  const starsAnimRef = useRef<number | null>(null);
  const starsAnimated = useRef(hasFetchedStarsOnce);
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
        setLastSyncedAt(Date.now());
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
    // Audit #058: refresh on tab focus so a banner stuck at "1 uncommitted"
    // updates the moment the user comes back. The 15s interval still
    // catches background changes between focus events.
    const onFocus = () => {
      void fetchGitStatus();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchGitStatus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    void fetchStars();
    const handleFocus = () => {
      void fetchStars();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStars]);

  // Animate the count exactly once per session — on the transition from
  // "loading" (no value) to "loaded". Re-mounts after the value lands skip
  // the animation entirely because the store already has the value and
  // starsAnimated.current was seeded with hasFetchedStarsOnce on mount.
  useEffect(() => {
    if (githubStars === null) return;
    if (starsAnimated.current) {
      setDisplayStars(githubStars);
      return;
    }
    starsAnimated.current = true;
    const target = githubStars;
    const duration = 2000;
    const startTime = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayStars(Math.round(target * eased));
      if (progress < 1) {
        starsAnimRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayStars(target);
        setStarsExploding(true);
        setTimeout(() => setStarsExploding(false), 900);
      }
    };
    starsAnimRef.current = requestAnimationFrame(tick);
    return () => {
      if (starsAnimRef.current !== null) cancelAnimationFrame(starsAnimRef.current);
    };
  }, [githubStars]);

  return (
    /* Audit #060: status bar is contentinfo for the page. Audit #048: gap-3
       between groups becomes gap-3 + 1px separators on either side of the
       diagnostics + tools clusters so the bar reads as
       [diagnostics | tools | brand] rather than seven flat items. */
    <footer
      role="contentinfo"
      aria-label={t("status:bar.ariaLabel")}
      className="relative flex items-center justify-between px-3 py-1 border-t border-border text-[11px] text-muted-foreground/60 bg-background"
    >
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
                ? t("status:server.checking")
                : appAlive && daemonAlive && anyProviderReady
                ? t("status:server.allRunning")
                : !appAlive
                ? t("status:server.appNotResponding")
                : !daemonAlive && !anyProviderReady
                ? t("status:server.daemonDownNoProviders")
                : !daemonAlive
                ? t("status:server.daemonDown")
                : t("status:server.noProviders")
            }
            aria-label={t("status:server.serverStatusAriaLabel")}
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
                ? t("status:server.checkingShort")
                : appAlive && daemonAlive && anyProviderReady
                ? t("status:server.online")
                : !appAlive
                ? t("status:server.offline")
                : t("status:server.degraded")}
            </span>
          </button>
          {showServerPopup && (
            <div className={`absolute bottom-full start-0 mb-2 z-50 w-80 rounded-lg border bg-background p-3 shadow-lg ${
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
                      ? t("status:server.allSystemsRunning")
                      : t("status:server.serviceDisruption")}
                  </p>

                  {/* App Server */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${appAlive ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="font-medium text-foreground/80">{t("status:server.appServer")}</span>
                      <span className={`ml-auto ${appAlive ? "text-green-500" : "text-red-500"}`}>{appAlive ? t("status:server.running") : t("status:server.down")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 pl-3.5">
                      {appAlive
                        ? t("status:server.appWorking")
                        : t("status:server.appDown")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 pl-3.5">
                      {t("status:server.lastSeen", { when: formatRelativeAgo(lastAppOkAt, popupNow, t) })}
                    </p>
                  </div>

                  {/* Daemon */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${daemonAlive ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="font-medium text-foreground/80">{t("status:server.daemon")}</span>
                      <span className={`ml-auto ${daemonAlive ? "text-green-500" : "text-red-500"}`}>{daemonAlive ? t("status:server.running") : t("status:server.down")}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 pl-3.5">
                      {daemonAlive
                        ? t("status:server.daemonWorking")
                        : t("status:server.daemonDownDescription")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 pl-3.5">
                      {t("status:server.lastSeen", { when: formatRelativeAgo(lastDaemonOkAt, popupNow, t) })}
                    </p>
                  </div>

                  {/* Agent Providers */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                        anyProviderReady ? "bg-green-500" : "bg-red-500"
                      }`} />
                      <span className="font-medium text-foreground/80">{t("status:server.agentProviders")}</span>
                      <span className={`ml-auto ${anyProviderReady ? "text-green-500" : "text-red-500"}`}>
                        {!providersLoaded ? t("status:server.checkingShort") : anyProviderReady ? t("status:server.available") : t("status:server.noneReady")}
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
                            {p.available && p.authenticated ? t("status:server.providerReady")
                            : p.available ? t("status:server.providerNotLoggedIn")
                            : t("status:server.providerNotInstalled")}
                          </span>
                          {/* Audit #094: every "Not installed" row gets a link
                              to the provider's canonical install docs. */}
                          {!p.available && (
                            <a
                              href={installUrlForProvider(p.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background hover:bg-foreground/85"
                            >
                              {t("status:server.install")}
                            </a>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Troubleshooting tips */}
                  {(!appAlive || !daemonAlive || !anyProviderReady) && (
                    <div className="pt-1.5 border-t border-border space-y-1">
                      <p className="text-[10px] font-medium text-foreground/70">{t("status:server.howToFix")}</p>
                      {(!appAlive || !daemonAlive) && (
                        installKind === "electron-macos" ? (
                          <p className="text-[10px] text-muted-foreground">
                            {!appAlive && !daemonAlive
                              ? "Both servers are down. Try quitting and reopening the Cabinet app."
                              : !appAlive
                              ? "The app server is not responding. Try quitting and reopening the Cabinet app."
                              : "The background daemon is not running. Try quitting and reopening the Cabinet app. If the issue persists, check Activity Monitor for stuck Cabinet processes."}
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
                      Cabinet is fully operational. All features are available.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowServerPopup(false)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={t("status:common.dismiss")}
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
              title={t("status:save.retryTitle")}
              aria-label={t("status:save.retryAriaLabel")}
              className="rounded-md px-1.5 py-0.5 text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {t("status:save.saveFailedRetry")}
            </button>
          ) : saveStatus === "saving" ? (
            <span className="flex items-center gap-1 text-muted-foreground/70" title={t("status:save.autoSaving")}>
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("status:save.savingText")}
            </span>
          ) : saveStatus === "saved" ? (
            <span className="flex items-center gap-1 text-emerald-500/80" title={t("status:save.forceSave")}>
              <Check className="h-3 w-3" />
              {t("status:save.savedText")}
            </span>
          ) : isDirty ? (
            // Audit #018: while the user is mid-burst (debounce open),
            // surface a soft "Editing…" so they don't feel autosave has
            // forgotten about them. Pulses subtly via animate-pulse.
            <span
              className="flex items-center gap-1 text-muted-foreground/60"
              title={t("status:save.editing")}
            >
              <CircleDot className="h-3 w-3 animate-pulse" />
              {t("status:save.editingText")}
            </span>
          ) : savedAgoLabel ? (
            // Audit #018: persistent "Saved · Xs ago" replaces the empty
            // idle state — the timestamp is the trust anchor that confirms
            // autosave is alive even when nothing is happening.
            <span
              className="flex items-center gap-1 text-muted-foreground/60"
              title={t("status:save.forceSave")}
            >
              <Check className="h-3 w-3 text-emerald-500/70" />
              {t("status:save.savedAgo", { ago: savedAgoLabel })}
            </span>
          ) : null
        )}
        {showWordCount && (
          <span
            className="text-muted-foreground/60 tabular-nums"
            title={t("status:save.wordCountTitle")}
            aria-label={`${wordCount} ${wordCount === 1 ? t("status:save.word") : t("status:save.words")}`}
          >
            {wordCount.toLocaleString()} {wordCount === 1 ? t("status:save.word") : t("status:save.words")}
          </span>
        )}
        {pullStatus === "pulling" && (
          <span className="flex items-center gap-1 text-blue-400">
            <CloudDownload className="h-3 w-3 animate-pulse" />
            {t("status:git2.pulling")}
          </span>
        )}
        {pullStatus === "pulled" && (
          <span className="flex items-center gap-1 text-green-400">
            <Check className="h-3 w-3" />
            {t("status:git2.pulled")}
          </span>
        )}
        {pullStatus === "up-to-date" && (
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <Check className="h-3 w-3" />
            {t("status:git2.upToDate")}
          </span>
        )}
        {pullStatus === "error" && (
          <span className="flex items-center gap-1 text-red-400">
            {t("status:git2.pullFailed")}
          </span>
        )}
        {update?.updateStatus.state === "restart-required" && (
          <button
            onClick={() => setSection({ type: "settings" })}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-amber-600 hover:bg-muted hover:text-foreground transition-colors"
            title={t("status:common.openSettings")}
          >
            <CloudDownload className="h-3 w-3" />
            {t("status:misc.restartToFinishUpdate")}
          </button>
        )}
        {update?.updateAvailable && update?.updateStatus.state !== "restart-required" && update.latest && (
          <button
            onClick={() => setSection({ type: "settings" })}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-blue-500 hover:bg-muted hover:text-foreground transition-colors"
            title={t("status:update2.updateAvailableTip", { version: update.latest.version })}
          >
            <CloudDownload className="h-3 w-3" />
            {t("status:update2.updateAvailable", { version: update.latest.version })}
          </button>
        )}
        {/* Activity: per-room file-history feed (who touched what). */}
        <button
          type="button"
          onClick={() => setShowActivity(true)}
          title="File activity in this room (who changed what)"
          aria-label="Open file activity"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
        >
          <HistoryIcon className="h-3 w-3" />
          Activity
        </button>
        {showActivity ? <ActivityFeed onClose={() => setShowActivity(false)} /> : null}
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
                ? t("status:git2.uncommittedFilesAria", {
                    count: uncommitted,
                  })
                : t("status:git2.allCommitted")
            }
            title={
              uncommitted > 0
                ? uncommitted === 1
                  ? t("status:git2.uncommittedFileTip")
                  : t("status:git2.uncommittedFilesTip")
                : t("status:git2.allCommitted")
            }
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-current"
          >
            <GitBranch className="h-3 w-3" />
            {uncommitted > 0
              ? uncommitted === 1
                ? t("status:git2.uncommittedFile", { count: uncommitted })
                : t("status:git2.uncommittedFiles", { count: uncommitted })
              : t("status:git2.allCommitted")}
          </button>
          {showUncommittedPopup && uncommitted > 0 && (
            <div className="absolute bottom-full start-0 mb-2 z-50 w-80 rounded-lg border border-border bg-background p-2 shadow-lg">
              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                <span className="text-[11px] font-medium text-foreground/80">
                  {uncommitted} uncommitted file{uncommitted === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowUncommittedPopup(false)}
                  aria-label={t("status:common.close")}
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
                      title={describeUncommittedStatus(f.status, t)}
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

              {/* Audit #050: commit affordance inside the popover so the
                  indicator becomes a workflow, not just a nag. Sends to the
                  existing /api/git/commit endpoint with the user's message
                  (or a sensible default when empty). */}
              <form
                className="mt-2 space-y-1.5 border-t border-border/60 pt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (committing) return;
                  setCommitting(true);
                  setCommitError(null);
                  try {
                    const message =
                      commitMessage.trim() ||
                      `Update ${uncommittedFiles.length} file${
                        uncommittedFiles.length === 1 ? "" : "s"
                      }`;
                    const res = await fetch("/api/git/commit", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message }),
                    });
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}));
                      throw new Error(body?.error || `Commit failed (${res.status})`);
                    }
                    setCommitMessage("");
                    await fetchGitStatus();
                  } catch (err) {
                    setCommitError(
                      err instanceof Error ? err.message : "Commit failed"
                    );
                  } finally {
                    setCommitting(false);
                  }
                }}
              >
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder={`Update ${uncommittedFiles.length} file${
                    uncommittedFiles.length === 1 ? "" : "s"
                  }`}
                  disabled={committing}
                  aria-label={t("status:git.commitMessageAriaLabel")}
                  className="w-full rounded border border-border/60 bg-background px-2 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                />
                {commitError && (
                  <p className="text-[10px] text-destructive">{commitError}</p>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="submit"
                    disabled={committing}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {committing ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Committing…
                      </>
                    ) : (
                      "Commit"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        {isGitRepo && (
          <button
            onClick={pullAndRefresh}
            disabled={pulling}
            aria-label={
              lastSyncedLabel
                ? t("status:git2.syncAriaLabelWithLast", { when: lastSyncedLabel })
                : t("status:git2.syncAriaLabel")
            }
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
            title={
              lastSyncedLabel
                ? t("status:git2.syncTitleWithLast", { when: lastSyncedLabel })
                : t("status:git2.syncTitle")
            }
          >
            <RefreshCw className={`h-3 w-3 ${pulling ? "animate-spin" : ""}`} />
            {t("status:git2.sync")}
          </button>
        )}
        <button
          onClick={toggleTerminal}
          aria-label={terminalOpen ? t("status:git2.newTerminalTab") : t("status:git2.openTerminal")}
          title={terminalOpen ? t("status:git2.newTerminalTab") : t("status:git2.openTerminal")}
          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 ${terminalOpen ? "text-primary" : ""}`}
        >
          <Terminal className="h-3 w-3" />
          {t("status:git2.terminal")}
        </button>
      </div>
      {/* Audit #018: status-bar carries live state on the left (status pill,
          uncommitted, save state, sync). Help / Discord / Contribute /
          Stars used to live as four separate pills competing visually with
          the live state. They're now collapsed into a single Help & community
          popover so the status bar stays readable at a glance. */}
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShowCommunityPopup((v) => !v)}
          aria-label={t("status:help.menuAriaLabel")}
          aria-expanded={showCommunityPopup}
          title={t("status:help.menuTitle")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-foreground">
            {t("status:help.label")}
          </span>
        </button>
        {/* Stars moved out of the Help pill into their own control so the
            count — and its count-up + burst animation — reads as a
            standalone community signal rather than Help-pill chrome. */}
        {displayStars !== null && (
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("status:help.starsAriaLabel", {
              count: formatGithubStars(displayStars),
            })}
            title={t("status:help.starsTitle", {
              count: formatGithubStars(displayStars),
            })}
            className="relative inline-flex items-center gap-1 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
          >
            {starsExploding && <StarExplosion />}
            <Star className="h-3 w-3 fill-current text-amber-500/75" />
            <span className="text-[10px] font-semibold tabular-nums tracking-[0.04em] text-foreground">
              {formatGithubStars(displayStars)}
            </span>
          </a>
        )}
        {/* Share Cabinet — a first-class status-bar control. Sharing is the
            single highest-leverage thing a happy user can do for the project,
            so it gets its own pill rather than hiding in the menu. */}
        <button
          type="button"
          onClick={shareCabinet}
          aria-label={t("status:help.share")}
          title={t("status:help.shareSubtitle")}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1"
        >
          <Heart className="h-3.5 w-3.5 fill-current text-rose-300/60 transition-transform group-hover:scale-110" />
          <span className="text-[10px] font-semibold tracking-[0.04em] text-foreground">
            {t("status:help.share")}
          </span>
        </button>
        {/* Rail toggle — kept as the rightmost status-bar control so it sits
            right against the rail's reserved gutter. */}
        <button
          type="button"
          onClick={toggleTaskRail}
          aria-label={taskRailOpen ? t("taskRail:hide") : t("taskRail:show")}
          aria-pressed={taskRailOpen}
          title={
            runningCount > 0
              ? t("taskRail:toggleRunning", { count: runningCount })
              : taskRailOpen
                ? t("taskRail:hide")
                : t("taskRail:show")
          }
          className={`relative inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 ${
            taskRailOpen ? "border-foreground/15 bg-muted text-primary" : ""
          } ${taskRailFlash ? "animate-pulse !text-emerald-600 dark:!text-emerald-400" : ""}`}
        >
          <PanelRight className="h-3.5 w-3.5" />
          {runningCount > 0 && (
            <span
              className="cabinet-task-heartbeat inline-block size-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
              aria-hidden="true"
            />
          )}
        </button>
        {showCommunityPopup && (
          <div className="absolute bottom-full end-0 mb-2 z-50 w-64 rounded-lg border border-border bg-background p-1.5 shadow-lg">
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
                <span className="text-[10px] text-muted-foreground">{t("status:help.demos")}</span>
              </span>
            </button>
            <a
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowCommunityPopup(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2]" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t("status:help.discord")}</span>
                <span className="text-[10px] text-muted-foreground">{t("status:help.discordSubtitle")}</span>
              </span>
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowCommunityPopup(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <GitHubIcon className="h-3.5 w-3.5 text-foreground" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t("status:help.github")}</span>
                <span className="text-[10px] text-muted-foreground">{t("status:help.githubSubtitle")}</span>
              </span>
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowCommunityPopup(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">
                  {displayStars === null ? "Star Cabinet" : `${formatGithubStars(displayStars)} stars`}
                </span>
                <span className="text-[10px] text-muted-foreground">{t("status:help.ifUseful")}</span>
              </span>
            </a>
            <button
              type="button"
              onClick={() => {
                shareCabinet();
                setShowCommunityPopup(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-muted"
            >
              <Heart className="h-3.5 w-3.5 fill-current text-rose-500" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t("status:help.share")}</span>
                <span className="text-[10px] text-muted-foreground">{t("status:help.shareSubtitle")}</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
