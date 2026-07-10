"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { Header } from "@/components/layout/header";
import { KBEditor } from "@/components/editor/editor";
import { BrowserView } from "@/components/layout/browser-view";
import { WebsiteViewer } from "@/components/editor/website-viewer";
import { PdfViewer } from "@/components/editor/pdf-viewer";
import { CsvViewer } from "@/components/editor/csv-viewer";
import { SourceViewer } from "@/components/editor/source-viewer";
import { NotebookViewer } from "@/components/editor/notebook-viewer";
import { ImageViewer } from "@/components/editor/image-viewer";
import { MediaViewer } from "@/components/editor/media-viewer";
import { MermaidViewer } from "@/components/editor/mermaid-viewer";
import { LatexViewer } from "@/components/editor/latex-viewer";
import { FileFallbackViewer } from "@/components/editor/file-fallback-viewer";
import dynamic from "next/dynamic";
import { GoogleDocViewer } from "@/components/editor/google-doc-viewer";

const DocxViewer = dynamic(
  () => import("@/components/editor/office/docx-viewer").then((m) => m.DocxViewer),
  { ssr: false }
);
const XlsxViewer = dynamic(
  () => import("@/components/editor/office/xlsx-viewer").then((m) => m.XlsxViewer),
  { ssr: false }
);
const PptxViewer = dynamic(
  () => import("@/components/editor/office/pptx-viewer").then((m) => m.PptxViewer),
  { ssr: false }
);
import { HomeScreen } from "@/components/home/home-screen";
import type { ConversationMeta } from "@/types/conversations";
import { TerminalTabs } from "@/components/terminal/terminal-tabs";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { TaskRail } from "@/components/tasks/rail/task-rail";
import { TaskRailProvider } from "@/components/tasks/rail/task-rail-context";
import { SearchPalette } from "@/components/search/search-palette";
import { FileHistoryPanel } from "@/components/editor/version-history";
import { KeyboardShortcutsModal } from "@/components/help/keyboard-shortcuts-modal";
import { WhatsNewCard } from "@/components/help/whats-new-card";
import { NarrowViewportHint } from "@/components/layout/narrow-viewport-hint";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog-host";
import { useGlobalHotkeys } from "@/hooks/use-global-hotkeys";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { subscribeConversationEvents } from "@/lib/agents/conversation-events-client";
import { StatusBar } from "@/components/layout/status-bar";
import { ContentSheet } from "@/components/layout/content-sheet";
import { DaemonHealthBanner } from "@/components/layout/daemon-health-banner";
import { CloudConnectClaudeBanner } from "@/components/layout/cloud-connect-claude-banner";
import { CloudTierBanner } from "@/components/layout/cloud-tier-banner";
import { CloudUpgradeModal } from "@/components/layout/cloud-upgrade-modal";
import { TourModal } from "@/components/onboarding/tour/tour-modal";
import { useTour } from "@/components/onboarding/tour/use-tour";
import {
  DataDirPrompt,
  isDataDirConfirmed,
} from "@/components/onboarding/data-dir-prompt";
import { FeedbackPopup } from "@/components/onboarding/feedback-popup";
import { DiagnosticsBoot } from "@/components/feedback/diagnostics-boot";
import { StartWorkDialog, type StartWorkMode } from "@/components/composer/start-work-dialog";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { useUserProfile } from "@/hooks/use-user-profile";
import { UpdateDialog } from "@/components/layout/update-dialog";
import { NotificationToasts } from "@/components/layout/notification-toasts";
import { SystemToasts } from "@/components/layout/system-toasts";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { useIsMobile } from "@/hooks/use-is-mobile";

// Section components are only rendered when the user navigates to them —
// load them on demand to keep the first-paint bundle small. Previously all of
// these (together ~15k lines of code including OnboardingWizard) shipped in
// the home-page chunk.
const AgentsWorkspaceV2 = dynamic(
  () =>
    import("@/components/agents/v2/agents-workspace-v2").then(
      (m) => m.AgentsWorkspaceV2
    ),
  { ssr: false }
);
const AgentDetailV2 = dynamic(
  () => import("@/components/agents/agent-detail-v2").then((m) => m.AgentDetailV2),
  { ssr: false }
);
const TasksBoard = dynamic(
  () => import("@/components/tasks/board").then((m) => m.TasksBoard),
  { ssr: false }
);
const TaskConversationPage = dynamic(
  () =>
    import("@/components/tasks/conversation/task-conversation-page").then(
      (m) => m.TaskConversationPage
    ),
  { ssr: false }
);
const SettingsPage = dynamic(
  () => import("@/components/settings/settings-page").then((m) => m.SettingsPage),
  { ssr: false }
);
const HelpPage = dynamic(
  () => import("@/components/help/help-page").then((m) => m.HelpPage),
  { ssr: false }
);
const CabinetView = dynamic(
  () => import("@/components/cabinets/cabinet-view").then((m) => m.CabinetView),
  { ssr: false }
);
const RegistryBrowser = dynamic(
  () =>
    import("@/components/registry/registry-browser").then((m) => m.RegistryBrowser),
  { ssr: false }
);
const IntegrationsHubPage = dynamic(
  () =>
    import("@/components/integrations/hub/integrations-hub-page").then(
      (m) => m.IntegrationsHubPage
    ),
  { ssr: false }
);
const OnboardingWizard = dynamic(
  () =>
    import("@/components/onboarding/onboarding-wizard").then(
      (m) => m.OnboardingWizard
    ),
  { ssr: false }
);
import { findNodeByPath } from "@/lib/cabinets/tree";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useRoute } from "@/hooks/use-hash-route";
import { useTaskFileSync } from "@/hooks/use-task-file-sync";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useRoomsStore } from "@/stores/rooms-store";

const DISMISSED_UPDATE_STORAGE_KEY = "cabinet.dismissed-update-version";
const WIZARD_DONE_STORAGE_KEY = "cabinet.wizard-done";
// sessionStorage key set by Settings → Storage → Reset onboarding. While
// present we (a) skip the silent-accept of dataDirConfirmed and (b) skip the
// agents-config self-correction that would otherwise rewrite wizard-done="1"
// from server state — both of which silently undid Reset before this guard.
// Cleared when the wizard completes; auto-clears on tab close (sessionStorage).
export const ONBOARDING_RESET_MARKER_KEY = "cabinet.onboarding-reset-in-progress";

function isOnboardingResetInProgress(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ONBOARDING_RESET_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

// useLayoutEffect logs a no-op warning during SSR; alias to useEffect on the
// server so we get pre-paint sync on the client without console noise.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AppShell() {
  useGlobalHotkeys();
  const isMobile = useIsMobile();
  const loadTree = useTreeStore((s) => s.loadTree);
  const nodes = useTreeStore((s) => s.nodes);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const driveNode = useTreeStore((s) => s.driveNode);
  const section = useAppStore((s) => s.section);
  const appMode = useAppStore((s) => s.appMode);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const setSection = useAppStore((s) => s.setSection);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const terminalPosition = useAppStore((s) => s.terminalPosition);
  const taskRailOpen = useAppStore((s) => s.taskRailOpen);
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setAiPanelCollapsed = useAppStore((s) => s.setAiPanelCollapsed);
  const setTaskPanelConversation = useAppStore((s) => s.setTaskPanelConversation);
  const {
    update,
    refreshing: updateRefreshing,
    applyPending,
    backupPending,
    backupPath,
    actionError,
    refresh: refreshUpdate,
    createBackup,
    openDataDir,
    applyUpdate,
  } = useCabinetUpdate({ autoRefresh: true });

  // Sync navigation state with the URL path (clean-path routing).
  useRoute();

  // Live-refresh the tree + open page when agent tasks create/change files.
  useTaskFileSync();

  // Onboarding wizard state. We initialize to `null` on both server and first
  // client render to avoid a hydration mismatch, then synchronously rehydrate
  // from localStorage in a layout effect (runs before paint, so cached users
  // still skip the blank-screen flash that used to appear on refresh).
  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  const [showDataDirPrompt, setShowDataDirPrompt] = useState<boolean>(false);
  useIsoLayoutEffect(() => {
    try {
      const resetting = isOnboardingResetInProgress();
      const wizardDone =
        window.localStorage.getItem(WIZARD_DONE_STORAGE_KEY) === "1";
      if (resetting) {
        // Explicit reset in progress: re-show the data-dir picker (with the
        // current folder pre-filled) so the user can confirm or change it
        // before the wizard re-runs. Do NOT silent-accept dataDirConfirmed —
        // that would skip the picker the user just asked to see again.
        if (!isDataDirConfirmed()) {
          setShowDataDirPrompt(true);
        }
        // Leave showWizard=null so the agents-config effect (below) can flip
        // it to true regardless of whether workspace.json exists on disk.
      } else if (wizardDone) {
        setShowWizard(false);
        // Existing user — silent-accept their current data dir choice so the
        // first-launch picker never ambushes them post-update.
        if (!isDataDirConfirmed()) {
          window.localStorage.setItem("cabinet.dataDirConfirmed", "silent");
        }
      } else if (!isDataDirConfirmed()) {
        // First-run users see the data-dir picker before the wizard so they
        // can confirm or override the default before the wizard writes anything.
        setShowDataDirPrompt(true);
      }
    } catch {
      // ignore
    }
  }, []);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(DISMISSED_UPDATE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const loadProviders = useAppStore((s) => s.loadProviders);

  // Audit #017: page tab title should use the human title from frontmatter
  // when present, falling back to the slug. Read from the editor store so the
  // title reflects the currently-loaded page (selectedPath can race ahead of
  // the actual editor content during loadPage).
  const editorFrontmatterTitle = useEditorStore((s) => s.frontmatter?.title);
  const editorCurrentPath = useEditorStore((s) => s.currentPath);

  // Audit #045: when "Match system" is on, listen to OS color-scheme
  // changes and re-apply the appropriate light/dark variant from the
  // stored pair without a reload.
  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const themesMod = await import("@/lib/themes");
      if (cancelled) return;
      const mode = themesMod.getStoredThemeMode();
      if (mode !== "system") return;
      const active = themesMod.resolveActiveTheme();
      if (active) themesMod.applyTheme(active);
    };
    const mq =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const handler = () => {
      void apply();
    };
    mq?.addEventListener("change", handler);
    void apply();
    return () => {
      cancelled = true;
      mq?.removeEventListener("change", handler);
    };
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Auto-refresh the sidebar tree when a conversation reports created/modified
  // artifacts (files an agent wrote). The global conversation event stream
  // emits a `task.updated` carrying `payload.artifactPaths`; when that's
  // non-empty we reload the tree (debounced) so new files appear without a
  // manual refresh. App-wide so it works from any section.
  useEffect(() => {
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void loadTree();
      }, 400);
    };
    const unsubscribe = subscribeConversationEvents((data) => {
      try {
        const ev = JSON.parse(data) as {
          type?: string;
          payload?: { artifactPaths?: unknown };
        };
        if (ev.type !== "task.updated") return;
        const artifacts = ev.payload?.artifactPaths;
        if (Array.isArray(artifacts) && artifacts.length > 0) {
          scheduleRefresh();
        }
      } catch {
        // ignore malformed frames / pings
      }
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [loadTree]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // Rooms v3: you are always inside a room. The data-dir root is a neutral
  // "home" container with no content, so when the app lands on the bare home
  // section we redirect into the default room (its scope drives the tree,
  // agents, tasks and view). Deep links into a specific room/page already
  // carry a cabinetPath and are left untouched.
  const loadRooms = useRoomsStore((s) => s.load);
  const defaultRoom = useRoomsStore((s) => s.defaultRoom);
  const reopen = useRoomsStore((s) => s.reopen);
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);
  useEffect(() => {
    // Reopen into the last active room (PRD §10.5), falling back to the
    // configured default. Phase 2 routing extends this to restore the deepest
    // path (reopen.path); within a returning tab the persisted route already does.
    const landingRoom = reopen?.room ?? defaultRoom;
    if (!landingRoom || landingRoom === ROOT_CABINET_PATH) return;
    const cp = section.cabinetPath;
    // Snap into the room whenever a section would otherwise show the neutral
    // home container: the bare home screen, or any content view scoped to the
    // data-dir root ("."). You're always inside a room, never the dir above
    // it. (settings/help/registry carry no cabinetPath, so are untouched.)
    // A "page" scoped to the data-dir root is a file the user explicitly opened
    // (e.g. `#/p/foo`), not the neutral home container — don't yank it into a room.
    // (On Windows a leading-`\` path normalized to "." made this hijack visible: #103.)
    const onHomeContainer =
      (section.type === "home" && !cp) ||
      (cp === ROOT_CABINET_PATH && section.type !== "page");
    if (onHomeContainer) {
      setSection({ type: "cabinet", cabinetPath: landingRoom });
    }
  }, [reopen, defaultRoom, section.type, section.cabinetPath, setSection]);

  // Persist the current location so the app reopens here next launch
  // (PRD §10.5). Debounced; best-effort. setLastActive ignores the home
  // container and unknown rooms server-side.
  useEffect(() => {
    const current =
      selectedPath ||
      (section.cabinetPath && section.cabinetPath !== ROOT_CABINET_PATH
        ? section.cabinetPath
        : "");
    if (!current) return;
    const id = window.setTimeout(() => {
      void fetch("/api/rooms/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: current }),
      }).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(id);
  }, [selectedPath, section.cabinetPath]);

  // Browse mode only makes sense over a page/cabinet surface; leaving those
  // sections (settings, help, etc.) drops back to the editor.
  useEffect(() => {
    if (section.type !== "page" && section.type !== "cabinet" && appMode !== "edit") {
      setAppMode("edit");
    }
  }, [section.type, appMode, setAppMode]);

  // Dynamic document.title — reflects the current section and page.
  useEffect(() => {
    const base = "Cabinet";
    // Audit #017: prefer the frontmatter `title` over the slug whenever a
    // page is loaded. Falls back to the slug when the frontmatter is absent
    // or the editor store hasn't caught up to the new selection yet.
    const pageDisplayTitle = (() => {
      if (!selectedPath) return null;
      const slug = selectedPath.split("/").pop() ?? selectedPath;
      if (
        editorCurrentPath === selectedPath &&
        typeof editorFrontmatterTitle === "string" &&
        editorFrontmatterTitle.trim()
      ) {
        return editorFrontmatterTitle.trim();
      }
      return slug;
    })();
    let title: string;
    switch (section.type) {
      case "home":
        title = base;
        break;
      case "page":
        title = pageDisplayTitle ? `${pageDisplayTitle} — ${base}` : base;
        break;
      case "cabinet":
        title = pageDisplayTitle ? `${pageDisplayTitle} — ${base}` : base;
        break;
      case "agents":
        title = `Agents — ${base}`;
        break;
      case "agent":
        // Audit #025: title-case the slug so the tab title matches the
        // agent's display name (was lowercase "assistant — Cabinet"). Use
        // word-by-word capitalization on the dasherized slug.
        title = section.slug
          ? `${section.slug
              .split("-")
              .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
              .join(" ")} — ${base}`
          : `Agents — ${base}`;
        break;
      case "tasks":
        title = `Tasks — ${base}`;
        break;
      case "task":
        title = `Task — ${base}`;
        break;
      case "settings":
        // Audit #062: include the active settings tab in the title so window
        // history shows "Appearance — Settings — Cabinet" not just "Settings".
        title = section.slug
          ? `${section.slug.charAt(0).toUpperCase() + section.slug.slice(1)} — Settings — ${base}`
          : `Settings — ${base}`;
        break;
      case "help":
        title = `Help — ${base}`;
        break;
      case "registry":
        title = `Registry — ${base}`;
        break;
      case "integrations":
        title = `Integrations — ${base}`;
        break;
      default:
        title = base;
    }
    document.title = title;
    // Audit #031: write the new page title into the SR live region so
    // VoiceOver/NVDA announce route changes. Cleared briefly first so the
    // same string on repeat-nav still triggers an announcement, then set
    // on the next tick.
    const announcer = document.getElementById("cabinet-page-announcer");
    if (announcer) {
      announcer.textContent = "";
      const id = window.setTimeout(() => {
        if (announcer) announcer.textContent = title;
      }, 30);
      return () => window.clearTimeout(id);
    }
  }, [section, selectedPath, editorFrontmatterTitle, editorCurrentPath]);

  // Track the last known file context so new terminal tabs open in the right CWD.
  useEffect(() => {
    const cabinetPath = section.cabinetPath ?? ".";
    if (selectedPath) {
      const lastSlash = selectedPath.lastIndexOf("/");
      const dir = lastSlash > 0 ? selectedPath.slice(0, lastSlash) : "";
      setTerminalCwd(dir ? `${cabinetPath}/${dir}` : cabinetPath);
    } else {
      setTerminalCwd(cabinetPath === "." ? "" : cabinetPath);
    }
  }, [section.cabinetPath, selectedPath, setTerminalCwd]);

  // Single /api/agents/events subscription for the whole app. Re-dispatches
  // each SSE event as a `cabinet:agents/<event>` window event so other panels
  // (channels, tree view) can listen without each opening their own
  // EventSource. Previously both app-shell and mission-control subscribed
  // independently, creating two concurrent SSE streams.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/agents/events");
      es.addEventListener("tree_changed", () => loadTree());

      const forward = (name: string) => (e: MessageEvent) => {
        try {
          const detail = JSON.parse(e.data);
          window.dispatchEvent(
            new CustomEvent(`cabinet:agents/${name}`, { detail })
          );
        } catch {
          /* ignore malformed payload */
        }
      };

      const forwardedEvents = [
        "conversation_completed",
        "conversation_started",
        "agent_status",
        "pulse",
        "agent_responding",
        "channel_activity",
        "goal_update",
      ] as const;
      for (const name of forwardedEvents) {
        es.addEventListener(name, forward(name));
      }

      // Keep existing conversation events on the legacy name for back-compat.
      es.addEventListener("conversation_completed", (e) => {
        try {
          const data = JSON.parse(e.data);
          window.dispatchEvent(
            new CustomEvent("cabinet:conversation-completed", { detail: data })
          );
        } catch { /* ignore */ }
      });
      es.addEventListener("conversation_started", (e) => {
        try {
          const data = JSON.parse(e.data);
          window.dispatchEvent(
            new CustomEvent("cabinet:conversation-started", { detail: data })
          );
        } catch { /* ignore */ }
      });
    } catch {
      // SSE not supported
    }
    return () => es?.close();
  }, [loadTree]);

  // Check if company config exists (first-time setup). Defer to idle so it
  // doesn't block first paint; if we already cached "wizard done" we only
  // use this to self-correct a stale cache.
  useEffect(() => {
    const run = () => {
      dedupFetch("/api/agents/config")
        .then((r) => r.json())
        .then((data) => {
          // While Reset onboarding is in progress, force the wizard to show
          // even though workspace.json still exists on disk. Without this the
          // self-correction below silently rewrites wizard-done="1" within a
          // second of reload and undoes the reset the user just requested.
          if (isOnboardingResetInProgress()) {
            setShowWizard(true);
            return;
          }
          const done = !!data.exists;
          setShowWizard(!done);
          if (done) {
            try {
              window.localStorage.setItem(WIZARD_DONE_STORAGE_KEY, "1");
            } catch {
              // ignore
            }
          }
        })
        .catch(() => setShowWizard(false));
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const handle = w.requestIdleCallback(run, { timeout: 2000 });
      return () => w.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(run, 1000);
    return () => window.clearTimeout(timer);
  }, []);

  // Onboarding tour. Auto-opens once per browser after the wizard. The
  // legal disclaimer is folded into the wizard's final step (single source
  // of truth) — there is no separate disclaimer modal here. The tour mounts
  // synchronously before paint (useLayoutEffect inside useTour) so the
  // user goes straight from wizard to "Meet your Cabinet" with no app
  // flash in between.
  const tour = useTour(showWizard === false);

  // Tour-finish task composer. Opened from the tour's "Write your first task"
  // CTA. We mount the dialog at AppShell level so the user can land on the
  // composer popup wherever they were — no jarring section change to /tasks.
  const [tourTaskOpen, setTourTaskOpen] = useState(false);
  const [tourTaskAgents, setTourTaskAgents] = useState<CabinetAgentSummary[]>([]);

  const handleLaunchTourTask = useCallback(() => {
    setTourTaskOpen(true);
    // Refresh the agent roster on each open so the agent picker reflects
    // whatever the user has installed.
    fetchCabinetOverviewClient(ROOT_CABINET_PATH, "all")
      .then((data) => {
        setTourTaskAgents((data?.agents || []) as CabinetAgentSummary[]);
      })
      .catch(() => {
        // Empty list is fine — StartWorkDialog handles it gracefully.
      });
  }, []);

  // ⌘⌥T (inbox) and ⌘⌥R (run-now) — shared global composer dialog.
  const [globalTaskOpen, setGlobalTaskOpen] = useState(false);
  const [globalTaskMode, setGlobalTaskMode] = useState<StartWorkMode>("now");
  const [globalTaskAgents, setGlobalTaskAgents] = useState<CabinetAgentSummary[]>([]);

  const openGlobalTask = useCallback((mode: StartWorkMode) => {
    const cabinetPath =
      ("cabinetPath" in section && section.cabinetPath) || ROOT_CABINET_PATH;
    fetchCabinetOverviewClient(cabinetPath, "all")
      .then((data) => { setGlobalTaskAgents((data?.agents || []) as CabinetAgentSummary[]); })
      .catch(() => {});
    setGlobalTaskMode(mode);
    setGlobalTaskOpen(true);
  }, [section]);

  useEffect(() => {
    const handler = () => openGlobalTask("inbox");
    window.addEventListener("cabinet:global-inbox-task", handler);
    return () => window.removeEventListener("cabinet:global-inbox-task", handler);
  }, [openGlobalTask]);

  useEffect(() => {
    const handler = () => openGlobalTask("now");
    window.addEventListener("cabinet:global-run-task", handler);
    return () => window.removeEventListener("cabinet:global-run-task", handler);
  }, [openGlobalTask]);

  // ── Chat-editor handoff ────────────────────────────────────────────────
  // After a file is created from the sidebar, open the right-side chat panel
  // (compose mode, `editor` agent) greeting the user with a file-aware prompt
  // — same surface as the editor's "Ask AI" button, not the task-prompt modal.
  const profileState = useUserProfile();
  const userFirstName = useMemo(() => {
    if (profileState.status !== "ready") return "";
    const raw =
      profileState.data.profile.displayName ||
      profileState.data.profile.name ||
      "";
    if (!raw || raw.toLowerCase() === "you") return "";
    return raw.trim().split(/\s+/)[0];
  }, [profileState]);

  // Post-tour first task: a warm, teammate-voiced opener shown as the composer
  // placeholder (evocative empty-state text, not a pre-filled value). Name-free
  // on purpose, so it never surfaces a stale or awkward profile name.
  const tourStarterPlaceholder = useMemo(
    () =>
      "Hi, I'm your teammate. I've just joined your Cabinet and I'm ready to get to work. " +
      "What would you like to accomplish? I can create useful pages, beautiful dashboards, and web apps for you.",
    []
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { pagePath?: string; fileName?: string }
        | undefined;
      const fileName = detail?.fileName || "this file";
      const greeting = userFirstName
        ? `Hi ${userFirstName} — what would you like to do in ${fileName}?`
        : `What would you like to do in ${fileName}?`;
      useAppStore.getState().openTaskPanelCompose({
        source: "editor",
        pinnedPagePath: detail?.pagePath ?? null,
        defaultAgentSlug: "editor",
        greeting,
      });
    };
    window.addEventListener("cabinet:open-editor-chat", handler);
    return () => window.removeEventListener("cabinet:open-editor-chat", handler);
  }, [userFirstName]);

  const handleWizardComplete = useCallback(() => {
    setShowWizard(false);
    try {
      window.localStorage.setItem(WIZARD_DONE_STORAGE_KEY, "1");
      // Onboarding defaults for the Tasks board. Ensures a first-time user
      // lands on Kanban with no filters active, regardless of any stale
      // state that may have leaked in from a prior dev build.
      window.localStorage.setItem("cabinet.tasks.v2.view", "kanban");
      window.localStorage.setItem("cabinet.tasks.v2.trigger", "all");
      window.localStorage.removeItem("cabinet.tasks.v2.agent");
      // Onboarding flow finished — drop the reset marker so the next page
      // load goes through the normal silent-accept path.
      window.sessionStorage.removeItem(ONBOARDING_RESET_MARKER_KEY);
    } catch {
      // ignore
    }
    setSection({ type: "home" });
    loadTree();
    // Onboarding just created the first room, but the rooms store was loaded
    // earlier when none existed (defaultRoom: null). Force a refresh so the
    // landing redirect picks up the new room and drops you inside it.
    void loadRooms(true);
  }, [setSection, loadTree, loadRooms]);

  function handleUpdateLater() {
    const latestVersion = update?.latest?.version;
    if (latestVersion) {
      try {
        window.localStorage.setItem(DISMISSED_UPDATE_STORAGE_KEY, latestVersion);
      } catch {
        // ignore
      }
      setDismissedUpdateVersion(latestVersion);
    }
    setUpdateDialogOpen(false);
  }

  const driveLoading = useTreeStore((s) => s.driveLoading);
  const setDriveLoading = useTreeStore((s) => s.setDriveLoading);

  // Clear the Drive loading state after a short delay once the skeleton has
  // rendered — gives the viewer time to mount and start its own fetch/render.
  // driveNode?.path is included so selecting a different file while a timer is
  // already running cancels the old timer and starts a fresh one for the new file.
  const driveNodePath = driveNode?.path;
  useEffect(() => {
    if (!driveLoading) return;
    const t = window.setTimeout(() => setDriveLoading(false), 400);
    return () => window.clearTimeout(t);
  }, [driveLoading, driveNodePath, setDriveLoading]);

  const localNode = selectedPath ? findNodeByPath(nodes, selectedPath) : null;
  // Fall back to the Drive node when the selected path is not in the local tree.
  const selectedNode = localNode ?? (driveNode?.path === selectedPath ? driveNode : null);
  // For paths not in the tree (e.g. .agents/ workspace files, or artifact
  // paths opened from a conversation panel), infer type from extension so
  // we route to the right viewer instead of treating everything as markdown.
  const inferredType = !selectedNode && selectedPath
    ? (() => {
        const lower = selectedPath.toLowerCase();
        if (lower.endsWith(".csv")) return "csv";
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".docx")) return "docx";
        if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) return "xlsx";
        if (lower.endsWith(".pptx")) return "pptx";
        if (lower.endsWith(".ipynb")) return "notebook";
        if (lower.endsWith(".mmd") || lower.endsWith(".mermaid")) return "mermaid";
        if (lower.endsWith(".tex") || lower.endsWith(".latex")) return "latex";
        if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(lower)) return "image";
        if (/\.(mp4|mov|webm|avi|mkv)$/.test(lower)) return "video";
        if (/\.(mp3|wav|ogg|flac|m4a)$/.test(lower)) return "audio";
        if (/\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cpp|cs|php|sh|bash|zsh|html|css|scss|less|json|yaml|yml|toml|xml|sql|lua|r|dart)$/.test(lower)) {
          return "code";
        }
        return null;
      })()
    : null;
  const nodeType = selectedNode?.type || inferredType;
  const isWebsite = nodeType === "website";
  const isApp = nodeType === "app";
  const isPdf = nodeType === "pdf";
  const isCsv = nodeType === "csv";
  const isCode = nodeType === "code";
  const isNotebook = nodeType === "notebook";
  const isImage = nodeType === "image";
  const isVideo = nodeType === "video";
  const isAudio = nodeType === "audio";
  const isMermaid = nodeType === "mermaid";
  const isLatex = nodeType === "latex";
  const isDocx = nodeType === "docx";
  const isXlsx = nodeType === "xlsx";
  const isPptx = nodeType === "pptx";
  const isUnknown = nodeType === "unknown";
  const googleFrontmatter = selectedNode?.frontmatter?.google;
  const hasPersistentUpdateState =
    update?.updateStatus.state === "restart-required" ||
    update?.updateStatus.state === "failed" ||
    update?.updateStatus.state === "starting" ||
    update?.updateStatus.state === "backing-up" ||
    update?.updateStatus.state === "downloading" ||
    update?.updateStatus.state === "applying";
  const shouldPromptForUpdate =
    update?.updateAvailable === true &&
    !!update.latest?.version &&
    dismissedUpdateVersion !== update.latest.version;
  const effectiveUpdateDialogOpen =
    updateDialogOpen || hasPersistentUpdateState || shouldPromptForUpdate;

  // Auto-collapse sidebar + AI panel when entering app mode
  const prevIsApp = useRef(false);
  useEffect(() => {
    if (isApp && !prevIsApp.current) {
      setSidebarCollapsed(true);
      setAiPanelCollapsed(true);
    }
    prevIsApp.current = !!isApp;
  }, [isApp, setSidebarCollapsed, setAiPanelCollapsed]);

  const handleExitApp = () => {
    setSidebarCollapsed(false);
    setAiPanelCollapsed(false);
  };

  // Determine what to render in the main area
  const renderContent = () => {
    // System sections (non-page views)
    if (section.type === "home") return <HomeScreen />;
    if (section.type === "registry") return <RegistryBrowser />;
    if (section.type === "settings") return <SettingsPage />;
    if (section.type === "integrations") return <IntegrationsHubPage />;
    if (section.type === "help") return <HelpPage />;
    if ((section.type === "cabinet" || section.type === "page") && appMode === "browse") {
      return <BrowserView />;
    }
    if (section.type === "cabinet" && section.cabinetPath) {
      return <CabinetView cabinetPath={section.cabinetPath} />;
    }
    if (section.type === "agents") {
      return (
        <AgentsWorkspaceV2
          cabinetPath={section.cabinetPath}
          tab={section.agentsTab}
          onTabChange={(next) =>
            setSection({
              type: "agents",
              cabinetPath: section.cabinetPath,
              agentsTab: next,
            })
          }
        />
      );
    }
    if (section.type === "agent") {
      if (section.slug) {
        const agentCabinetPath = section.cabinetPath || ".";
        const agentScopedId = `${agentCabinetPath}::agent::${section.slug}`;
        return (
          <AgentDetailV2
            key={agentScopedId}
            slug={section.slug}
            cabinetPath={agentCabinetPath}
            onBack={() =>
              setSection({
                type: "agents",
                cabinetPath: section.cabinetPath,
              })
            }
            onOpenConversation={(c: ConversationMeta) =>
              setSection({
                type: "task",
                taskId: c.id,
                cabinetPath: c.cabinetPath,
              })
            }
            onSeeAllConversations={() =>
              setSection({
                type: "tasks",
                cabinetPath: section.cabinetPath,
                agentScopedId,
              })
            }
          />
        );
      }
      // Slug-less "agent" section (not produced by routing today) falls back
      // to the V2 agents list rather than the retired V1 workspace.
      return (
        <AgentsWorkspaceV2
          cabinetPath={section.cabinetPath}
          onTabChange={(next) =>
            setSection({
              type: "agents",
              cabinetPath: section.cabinetPath,
              agentsTab: next,
            })
          }
        />
      );
    }
    if (section.type === "tasks") {
      const visibility =
        useAppStore.getState().cabinetVisibilityModes[
          section.cabinetPath ?? ""
        ] ?? "own";
      return (
        <TasksBoard
          cabinetPath={section.cabinetPath}
          visibilityMode={visibility}
        />
      );
    }
    if (section.type === "task" && section.taskId) {
      return (
        <TaskConversationPage
          taskId={section.taskId}
          cabinetPath={section.cabinetPath}
        />
      );
    }

    // Google Drive file loading skeleton
    if (driveLoading && driveNode) {
      return (
        <div className="flex flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background px-4 py-2 md:h-12">
            <div className="h-3 w-3 rounded-full bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading from Google Drive…
          </div>
        </div>
      );
    }

    // Page-based views (when a KB page is selected)
    // A cabinet's own markdown can be opened as a data page, so only render
    // the dashboard when navigation explicitly targets the cabinet section.
    if (isApp && selectedNode) {
      return (
        <WebsiteViewer
          path={selectedNode.path}
          title={selectedNode.frontmatter?.title || selectedNode.name}
          fullscreen
          onExit={handleExitApp}
        />
      );
    }
    if (isCsv && (selectedNode || selectedPath)) {
      const csvPath = selectedNode?.path || selectedPath!;
      const csvTitle = selectedNode?.frontmatter?.title || selectedNode?.name || csvPath.split("/").pop() || "CSV";
      return (
        <CsvViewer
          path={csvPath}
          title={csvTitle}
        />
      );
    }
    if (isPdf && (selectedNode || selectedPath)) {
      const pdfPath = selectedNode?.path || selectedPath!;
      const pdfTitle = selectedNode?.frontmatter?.title || selectedNode?.name || pdfPath.split("/").pop() || "PDF";
      return <PdfViewer path={pdfPath} title={pdfTitle} />;
    }
    if (isWebsite && selectedNode) {
      return (
        <WebsiteViewer
          path={selectedNode.path}
          title={selectedNode.frontmatter?.title || selectedNode.name}
        />
      );
    }
    if (isNotebook && (selectedNode || selectedPath)) {
      const nbPath = selectedNode?.path || selectedPath!;
      const nbTitle = selectedNode?.frontmatter?.title || selectedNode?.name || nbPath.split("/").pop() || "Notebook";
      return <NotebookViewer path={nbPath} title={nbTitle} />;
    }
    if (isCode && (selectedNode || selectedPath)) {
      const codePath = selectedNode?.path || selectedPath!;
      const codeTitle = selectedNode?.frontmatter?.title || selectedNode?.name || codePath.split("/").pop() || "Source";
      return <SourceViewer path={codePath} title={codeTitle} />;
    }
    if (isImage && (selectedNode || selectedPath)) {
      const imgPath = selectedNode?.path || selectedPath!;
      const imgTitle = selectedNode?.frontmatter?.title || selectedNode?.name || imgPath.split("/").pop() || "Image";
      return <ImageViewer path={imgPath} title={imgTitle} />;
    }
    if ((isVideo || isAudio) && (selectedNode || selectedPath)) {
      const mediaPath = selectedNode?.path || selectedPath!;
      const mediaTitle = selectedNode?.frontmatter?.title || selectedNode?.name || mediaPath.split("/").pop() || "Media";
      return <MediaViewer path={mediaPath} title={mediaTitle} type={isVideo ? "video" : "audio"} />;
    }

    if (isMermaid && (selectedNode || selectedPath)) {
      const mmdPath = selectedNode?.path || selectedPath!;
      const mmdTitle = selectedNode?.frontmatter?.title || selectedNode?.name || mmdPath.split("/").pop() || "Diagram";
      return <MermaidViewer path={mmdPath} title={mmdTitle} />;
    }

    if (isLatex && (selectedNode || selectedPath)) {
      const texPath = selectedNode?.path || selectedPath!;
      const texTitle = selectedNode?.frontmatter?.title || selectedNode?.name || texPath.split("/").pop() || "LaTeX";
      return <LatexViewer key={texPath} path={texPath} title={texTitle} />;
    }

    if (isDocx && (selectedNode || selectedPath)) {
      const p = selectedNode?.path || selectedPath!;
      const t = selectedNode?.frontmatter?.title || selectedNode?.name || p.split("/").pop() || "Document";
      return <DocxViewer path={p} title={t} />;
    }

    if (isXlsx && (selectedNode || selectedPath)) {
      const p = selectedNode?.path || selectedPath!;
      const t = selectedNode?.frontmatter?.title || selectedNode?.name || p.split("/").pop() || "Spreadsheet";
      return <XlsxViewer path={p} title={t} />;
    }

    if (isPptx && (selectedNode || selectedPath)) {
      const p = selectedNode?.path || selectedPath!;
      const t = selectedNode?.frontmatter?.title || selectedNode?.name || p.split("/").pop() || "Presentation";
      return <PptxViewer path={p} title={t} />;
    }

    // Google-linked markdown page: frontmatter.google.url flips the page to the
    // Google viewer in place of the normal editor.
    if (googleFrontmatter?.url && selectedNode) {
      return (
        <GoogleDocViewer
          path={selectedNode.path}
          title={selectedNode.frontmatter?.title || selectedNode.name}
          google={googleFrontmatter}
        />
      );
    }

    if (isUnknown && (selectedNode || selectedPath)) {
      const unkPath = selectedNode?.path || selectedPath!;
      const unkTitle = selectedNode?.frontmatter?.title || selectedNode?.name || unkPath.split("/").pop() || "File";
      return <FileFallbackViewer path={unkPath} title={unkTitle} />;
    }

    // Default: editor
    return (
      <>
        <Header />
        <KBEditor />
      </>
    );
  };

  // Show nothing while checking config
  if (showWizard === null) {
    return <div className="flex h-screen bg-background" />;
  }

  // Show data-dir picker before the wizard for true first-run users.
  if (showDataDirPrompt) {
    return (
      <DataDirPrompt onConfirmed={() => setShowDataDirPrompt(false)} />
    );
  }

  // Show onboarding wizard for first-time users
  if (showWizard) {
    return <OnboardingWizard onComplete={handleWizardComplete} />;
  }

  // The default markdown editor renders its own chrome (breadcrumb + folder
  // tabs + formatting toolbar) on the desk and its body in a ContentSheet, so
  // it opts out of app-shell's single full-view sheet. Every other view is a
  // single elevated sheet.
  const isDefaultEditor =
    section.type === "page" &&
    appMode !== "browse" &&
    !driveLoading &&
    !isApp && !isCsv && !isPdf && !isWebsite && !isNotebook && !isCode &&
    !isImage && !isVideo && !isAudio && !isMermaid && !isLatex && !isDocx &&
    !isXlsx && !isPptx && !isUnknown && !googleFrontmatter?.url;

  // Viewers migrated to ViewerLayout put their toolbar on the desk and wrap
  // only their body in a ContentSheet — so they, like the editor, opt out of
  // the app-shell sheet (otherwise the toolbar sits back on a double sheet).
  const isSelfSheetedViewer =
    isCsv || isCode || isImage || isMermaid ||
    isPdf || isVideo || isAudio || isUnknown || isLatex ||
    isWebsite || isApp || isDocx || isXlsx || isPptx || isNotebook ||
    !!googleFrontmatter?.url;

  // Views that place their controls on the desk and their body in a
  // ContentSheet manage their own layout — skip the app-shell sheet wrapper.
  const bareLayout =
    isDefaultEditor ||
    isSelfSheetedViewer ||
    section.type === "tasks" ||
    section.type === "agents" ||
    // The room/cabinet dashboard puts its header on the desk and wraps its body
    // in a ContentSheet, like agents/tasks — but only in edit mode; browse mode
    // hands off to BrowserView, which still wants the app-shell sheet.
    (section.type === "cabinet" && appMode !== "browse");

  return (
    <TaskRailProvider>
    {/* When the rail is open we reserve a 52px gutter on the inline-end
        edge: the whole app shrinks into the remaining width (the "iframe")
        and the fixed, full-height rail — a floating capsule of avatars —
        lives in that gutter. */}
    <div
      className="flex h-screen bg-[var(--gutter)] text-foreground transition-[padding] duration-200 ease-out"
      style={
        isMobile
          ? undefined
          : { paddingTop: 10, paddingInlineEnd: taskRailOpen ? 52 : 10, paddingBottom: 0, paddingInlineStart: 0 }
      }
    >
      {/* Audit #031: SR-only live region announcing the active page title
          on every route change. role="status" + aria-live="polite" so it
          doesn't interrupt other speech; aria-atomic so the entire string
          is read on each update. The effect that writes document.title
          also writes here. */}
      <div
        id="cabinet-page-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <Sidebar />
      {/* The main column is transparent (shows the desk gutter). The content
          "sheet" floats inside it (rounded + shadow); the status bar sits
          BELOW the sheet, on the desk — outside the floating page. */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden max-md:pb-[calc(56px+env(safe-area-inset-bottom))]"
        style={{ '--sidebar-toggle-offset': sidebarCollapsed ? 'calc(8rem + var(--traffic-clearance, 0px))' : '0px' } as React.CSSProperties}
      >
        <DaemonHealthBanner />
        <CloudConnectClaudeBanner />
        <CloudTierBanner />
        <CloudUpgradeModal />
        {!isMobile && <NarrowViewportHint />}
        {/* The main column IS the desk (transparent). Content floats on an
            elevated ContentSheet; the editor manages its own layout — its
            toolbars sit on the desk — so it opts out of the default sheet. */}
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 gap-1.5">
          {bareLayout ? (
            renderContent()
          ) : (
            <ContentSheet>{renderContent()}</ContentSheet>
          )}
        </main>
        {terminalOpen && terminalPosition === "bottom" && <TerminalTabs />}
        {!isMobile && <StatusBar />}
      </div>
      <MobileBottomNav />
      {terminalOpen && terminalPosition === "right" && <TerminalTabs />}
      {!isMobile && <TaskRail />}
      <TaskDetailPanel />
      <SearchPalette />
      <FileHistoryPanel />
      <KeyboardShortcutsModal />
      <WhatsNewCard />
      <ConfirmDialogHost />
      <UpdateDialog
        open={effectiveUpdateDialogOpen}
        update={update}
        refreshing={updateRefreshing}
        applyPending={applyPending}
        backupPending={backupPending}
        backupPath={backupPath}
        actionError={actionError}
        onOpenChange={(open) => {
          if (open) {
            setUpdateDialogOpen(true);
            return;
          }
          handleUpdateLater();
        }}
        onRefresh={() => {
          void refreshUpdate();
        }}
        onApply={applyUpdate}
        onCreateBackup={async (options) => {
          await createBackup("data", options);
        }}
        onOpenDataDir={openDataDir}
        onLater={handleUpdateLater}
      />
      <NotificationToasts />
      <SystemToasts />
      <FeedbackPopup />
      <DiagnosticsBoot />
      <TourModal
        open={tour.open}
        onClose={tour.close}
        onLaunchTask={handleLaunchTourTask}
      />
      <StartWorkDialog
        open={tourTaskOpen}
        onOpenChange={setTourTaskOpen}
        cabinetPath={ROOT_CABINET_PATH}
        agents={tourTaskAgents}
        initialMode="now"
        placeholderOverride={tourStarterPlaceholder}
        onStarted={(conversationId) => {
          setTourTaskOpen(false);
          setSection({
            type: "task",
            taskId: conversationId,
            cabinetPath: ROOT_CABINET_PATH,
          });
        }}
      />
      <StartWorkDialog
        open={globalTaskOpen}
        onOpenChange={setGlobalTaskOpen}
        cabinetPath={
          ("cabinetPath" in section && section.cabinetPath) || ROOT_CABINET_PATH
        }
        agents={globalTaskAgents}
        initialMode={globalTaskMode}
        onStarted={async (conversationId, conversationCabinetPath) => {
          setGlobalTaskOpen(false);
          if (globalTaskMode === "inbox") return;
          try {
            const params = new URLSearchParams();
            if (conversationCabinetPath) params.set("cabinetPath", conversationCabinetPath);
            const res = await fetch(
              `/api/agents/conversations/${encodeURIComponent(conversationId)}${params.toString() ? `?${params.toString()}` : ""}`
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data?.meta) setTaskPanelConversation(data.meta);
          } catch {
            // non-fatal — task is created, panel just won't auto-open
          }
        }}
      />
    </div>
    </TaskRailProvider>
  );
}

