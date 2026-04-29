"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { Header } from "@/components/layout/header";
import { KBEditor } from "@/components/editor/editor";
import { WebsiteViewer } from "@/components/editor/website-viewer";
import { PdfViewer } from "@/components/editor/pdf-viewer";
import { CsvViewer } from "@/components/editor/csv-viewer";
import { SourceViewer } from "@/components/editor/source-viewer";
import { NotebookViewer } from "@/components/editor/notebook-viewer";
import { ImageViewer } from "@/components/editor/image-viewer";
import { MediaViewer } from "@/components/editor/media-viewer";
import { MermaidViewer } from "@/components/editor/mermaid-viewer";
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
import { AIPanel } from "@/components/ai-panel/ai-panel";
import { TaskDetailPanel } from "@/components/tasks/task-detail-panel";
import { SearchPalette } from "@/components/search/search-palette";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog-host";
import { useGlobalHotkeys } from "@/hooks/use-global-hotkeys";
import { dedupFetch } from "@/lib/api/dedup-fetch";
import { StatusBar } from "@/components/layout/status-bar";
import { DaemonHealthBanner } from "@/components/layout/daemon-health-banner";
import {
  DISCLAIMER_ACKED_EVENT,
  isDisclaimerAcknowledged,
} from "@/components/layout/breaking-changes-warning";
import { TourModal } from "@/components/onboarding/tour/tour-modal";
import { useTour } from "@/components/onboarding/tour/use-tour";
import { StartWorkDialog, type StartWorkMode } from "@/components/composer/start-work-dialog";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { fetchCabinetOverviewClient } from "@/lib/cabinets/overview-client";
import type { CabinetAgentSummary } from "@/types/cabinets";
import { UpdateDialog } from "@/components/layout/update-dialog";
import { BreakingChangesWarning } from "@/components/layout/breaking-changes-warning";
import { NotificationToasts } from "@/components/layout/notification-toasts";
import { SystemToasts } from "@/components/layout/system-toasts";

// Section components are only rendered when the user navigates to them —
// load them on demand to keep the first-paint bundle small. Previously all of
// these (together ~15k lines of code including AgentsWorkspace and
// OnboardingWizard) shipped in the home-page chunk.
const AgentsWorkspace = dynamic(
  () => import("@/components/agents/agents-workspace").then((m) => m.AgentsWorkspace),
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
const OnboardingWizard = dynamic(
  () =>
    import("@/components/onboarding/onboarding-wizard").then(
      (m) => m.OnboardingWizard
    ),
  { ssr: false }
);
import { findNodeByPath } from "@/lib/cabinets/tree";
import { useCabinetUpdate } from "@/hooks/use-cabinet-update";
import { useHashRoute } from "@/hooks/use-hash-route";
import { useTreeStore } from "@/stores/tree-store";
import { useAppStore } from "@/stores/app-store";

const DISMISSED_UPDATE_STORAGE_KEY = "cabinet.dismissed-update-version";
const WIZARD_DONE_STORAGE_KEY = "cabinet.wizard-done";

// useLayoutEffect logs a no-op warning during SSR; alias to useEffect on the
// server so we get pre-paint sync on the client without console noise.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function AppShell() {
  useGlobalHotkeys();
  const loadTree = useTreeStore((s) => s.loadTree);
  const nodes = useTreeStore((s) => s.nodes);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const section = useAppStore((s) => s.section);
  const setSection = useAppStore((s) => s.setSection);
  const terminalOpen = useAppStore((s) => s.terminalOpen);
  const terminalPosition = useAppStore((s) => s.terminalPosition);
  const setTerminalCwd = useAppStore((s) => s.setTerminalCwd);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setAiPanelCollapsed = useAppStore((s) => s.setAiPanelCollapsed);
  const aiPanelCollapsed = useAppStore((s) => s.aiPanelCollapsed);
  const taskPanelConversation = useAppStore((s) => s.taskPanelConversation);
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

  // Sync navigation state with URL hash + localStorage
  useHashRoute();

  // Onboarding wizard state. We initialize to `null` on both server and first
  // client render to avoid a hydration mismatch, then synchronously rehydrate
  // from localStorage in a layout effect (runs before paint, so cached users
  // still skip the blank-screen flash that used to appear on refresh).
  const [showWizard, setShowWizard] = useState<boolean | null>(null);
  useIsoLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(WIZARD_DONE_STORAGE_KEY) === "1") {
        setShowWizard(false);
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

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  // Dynamic document.title — reflects the current section and page.
  useEffect(() => {
    const base = "Cabinet";
    let title: string;
    switch (section.type) {
      case "home":
        title = base;
        break;
      case "cabinet":
        title = selectedPath
          ? `${selectedPath.split("/").pop() ?? selectedPath} — ${base}`
          : base;
        break;
      case "agents":
        title = `Agents — ${base}`;
        break;
      case "agent":
        title = section.slug
          ? `${section.slug.replace(/-/g, " ")} — ${base}`
          : `Agents — ${base}`;
        break;
      case "tasks":
        title = `Tasks — ${base}`;
        break;
      case "task":
        title = `Task — ${base}`;
        break;
      case "settings":
        title = `Settings — ${base}`;
        break;
      case "help":
        title = `Help — ${base}`;
        break;
      case "registry":
        title = `Registry — ${base}`;
        break;
      default:
        title = base;
    }
    document.title = title;
  }, [section, selectedPath]);

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
  // (mission control, tree view, slack) can listen without each opening their
  // own EventSource. Previously both app-shell and mission-control subscribed
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
        "slack_activity",
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

  // Onboarding tour. Auto-opens once per browser after the wizard *and*
  // after the legal disclaimer has been explicitly acknowledged. Without
  // the disclaimer gate, both modals stack on first run (audit #007).
  const [disclaimerAcked, setDisclaimerAcked] = useState<boolean>(false);
  useEffect(() => {
    setDisclaimerAcked(isDisclaimerAcknowledged());
    const onAck = () => setDisclaimerAcked(true);
    window.addEventListener(DISCLAIMER_ACKED_EVENT, onAck);
    return () => window.removeEventListener(DISCLAIMER_ACKED_EVENT, onAck);
  }, []);
  const tour = useTour(showWizard === false && disclaimerAcked);

  // Tour-finish task composer. Opened from the tour's "Write your first task"
  // CTA. We mount the dialog at AppShell level so the user can land on the
  // composer popup wherever they were — no jarring section change to /tasks.
  const [tourTaskOpen, setTourTaskOpen] = useState(false);
  const [tourTaskPrompt, setTourTaskPrompt] = useState<string | undefined>(undefined);
  const [tourTaskAgents, setTourTaskAgents] = useState<CabinetAgentSummary[]>([]);

  const handleLaunchTourTask = useCallback((initialPrompt: string) => {
    setTourTaskPrompt(initialPrompt);
    setTourTaskOpen(true);
    // Refresh the agent roster on each open so the agent picker reflects
    // whatever the user has installed.
    fetchCabinetOverviewClient(ROOT_CABINET_PATH, "all")
      .then((data) => {
        setTourTaskAgents((data.agents || []) as CabinetAgentSummary[]);
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
      .then((data) => { setGlobalTaskAgents((data.agents || []) as CabinetAgentSummary[]); })
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
    } catch {
      // ignore
    }
    setSection({ type: "home" });
    loadTree();
  }, [setSection, loadTree]);

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

  const selectedNode = selectedPath ? findNodeByPath(nodes, selectedPath) : null;
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
    if (section.type === "help") return <HelpPage />;
    if (section.type === "cabinet" && section.cabinetPath) {
      return <CabinetView cabinetPath={section.cabinetPath} />;
    }
    if (section.type === "agents") {
      return (
        <AgentsWorkspace
          selectedScope="all"
          selectedAgentSlug={null}
          cabinetPath={section.cabinetPath}
        />
      );
    }
    if (section.type === "agent") {
      if (section.slug) {
        const agentCabinetPath = section.cabinetPath || ".";
        const agentScopedId = `${agentCabinetPath}::agent::${section.slug}`;
        return (
          <AgentDetailV2
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
      return (
        <AgentsWorkspace
          selectedScope="agent"
          selectedAgentSlug={section.slug || null}
          cabinetPath={section.cabinetPath}
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
      return <TaskConversationPage taskId={section.taskId} />;
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
      return (
        <PdfViewer
          path={pdfPath}
          title={pdfTitle}
        />
      );
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

  // Show onboarding wizard for first-time users
  if (showWizard) {
    return <OnboardingWizard onComplete={handleWizardComplete} />;
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ '--sidebar-toggle-offset': sidebarCollapsed ? '2.25rem' : '0px' } as React.CSSProperties}
      >
        <DaemonHealthBanner />
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderContent()}
        </main>
        {terminalOpen && terminalPosition === "bottom" && <TerminalTabs />}
        <StatusBar />
      </div>
      {terminalOpen && terminalPosition === "right" && <TerminalTabs />}
      {taskPanelConversation && <TaskDetailPanel />}
      {!aiPanelCollapsed && <AIPanel />}
      <SearchPalette />
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
      <BreakingChangesWarning />
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
        initialPrompt={tourTaskPrompt}
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
  );
}

