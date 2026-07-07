"use client";

import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { Archive, Globe, Layout, Maximize, Minimize } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";
import { VersionHistory } from "@/components/editor/version-history";
import { NavArrows } from "@/components/layout/nav-arrows";
import { ReturnToChip } from "@/components/layout/return-to-chip";
import { ViewerBreadcrumb } from "@/components/layout/viewer-breadcrumb";
import { NewTaskButton } from "@/components/composer/new-task-button";
import { TaskRailToggle } from "@/components/tasks/rail/task-rail-toggle";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { cn } from "@/lib/utils";
import { isHtmlPath } from "@/lib/ui/html-view-mode";

/**
 * Unified toolbar used by every file viewer (PDF, CSV, source, office, media,
 * mermaid, image, embedded website/app, and the markdown editor). Replaces the
 * former stack of ReturnToBanner + separate breadcrumb row + per-viewer title
 * chip with a single row:
 *
 *   [Back to …]  [breadcrumb > file] [BADGE] [sublabel]        [actions] [HeaderActions]
 *
 * Pass viewer-specific actions (Wrap/Copy/Download/Raw etc.) as `children` —
 * they render immediately before the global `HeaderActions`.
 */
export function ViewerToolbar({
  path,
  badge,
  sublabel,
  showBreadcrumb = true,
  leading,
  children,
  className,
  showModeButtons = true,
}: {
  path?: string;
  badge?: string;
  sublabel?: string;
  showBreadcrumb?: boolean;
  /** Extra leading element (e.g. a viewer's own Back button for full-screen mode). */
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
  showModeButtons?: boolean;
}) {
  const { t } = useLocale();
  const appMode = useAppStore((s) => s.appMode);
  const setAppMode = useAppStore((s) => s.setAppMode);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setAiPanelCollapsed = useAppStore((s) => s.setAiPanelCollapsed);
  const openTaskPanelCompose = useAppStore((s) => s.openTaskPanelCompose);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const aiPanelCollapsed = useAppStore((s) => s.aiPanelCollapsed);
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);

  const [inFullscreen, setInFullscreen] = useState(false);
  const prevStateRef = useRef<{
    sidebarCollapsed: boolean;
    aiPanelCollapsed: boolean;
    taskPanelOpen: boolean;
  } | null>(null);

  useEffect(() => {
    const updateFullscreen = () => {
      setInFullscreen(Boolean(document.fullscreenElement));
    };

    updateFullscreen();
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  const handleFocus = async () => {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        if (prevStateRef.current) {
          setSidebarCollapsed(prevStateRef.current.sidebarCollapsed);
          setAiPanelCollapsed(prevStateRef.current.aiPanelCollapsed);
          if (prevStateRef.current.taskPanelOpen) {
            openTaskPanelCompose();
          }
          prevStateRef.current = null;
        }
        return;
      }

      prevStateRef.current = {
        sidebarCollapsed: sidebarCollapsed,
        aiPanelCollapsed: aiPanelCollapsed,
        taskPanelOpen: taskPanelOpen,
      };

      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }

      setSidebarCollapsed(true);
      setAiPanelCollapsed(true);
      if (taskPanelOpen) closeTaskPanel();
    } catch (error) {
      prevStateRef.current = null;
      console.error(error);
    }
  };

  const nodes = useTreeStore((s) => s.nodes);
  const selectedPath = useTreeStore((s) => s.selectedPath);
  const sourcePath = path || selectedPath;
  const sourceNode = useMemo(
    () => (sourcePath ? findNodeByPath(nodes, sourcePath) : null),
    [nodes, sourcePath]
  );

  // Map the current file to an in-app browser URL: websites/apps open their
  // index.html, directories/cabinets their index.md, markdown its <name>.md,
  // everything else the raw asset.
  const browseModeUrl = useMemo(() => {
    if (!sourcePath) return null;
    const assetUrl = `/api/assets/${sourcePath.split("/").map(encodeURIComponent).join("/")}`;
    const lower = sourcePath.toLowerCase();
    if (sourceNode?.type === "website" || sourceNode?.type === "app") {
      return `${assetUrl}/index.html`;
    }
    if (sourceNode?.type === "drawio") {
      return `${window.location.origin}/drawio/editor.html?path=${sourcePath}`;
    }
    if (sourceNode?.type === "excalidraw") {
      return `${window.location.origin}/excalidraw/editor?path=${sourcePath}`;
    }
    // Check the markdown file case before directory/cabinet: a `<name>.md` page
    // can carry sub-pages and so be typed "directory", but its content still
    // lives at `<name>.md`, not an `index.md` inside the folder.
    if ((sourceNode?.type === "file" && !isHtmlPath(sourcePath)) || lower.endsWith(".md")) {
      return `${assetUrl}.md`;
    }
    if (sourceNode?.type === "directory" || sourceNode?.type === "cabinet") {
      return `${assetUrl}/index.md`;
    }
    return assetUrl;
  }, [sourcePath, sourceNode?.type]);

  const openBrowseMode = () => {
    setAppMode("browse", browseModeUrl);
  };

  const modeButtons = showModeButtons ? (
    <>
      {appMode === "edit" && (
        <>
          <button
            aria-label={t("editor:header.browseMode")}
            title={t("editor:header.browseMode")}
            onClick={openBrowseMode}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Globe className="h-4 w-4" />
          </button>
          <button
            aria-label={t("editor:header.canvasMode")}
            title={t("editor:header.canvasMode")}
            onClick={() => setAppMode("canvas")}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Layout className="h-4 w-4" />
          </button>
        </>
      )}
      {appMode === "browse" && (
        <>
          <button
            aria-label={t("editor:header.editMode")}
            title={t("editor:header.editMode")}
            onClick={() => setAppMode("edit")}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            aria-label={t("editor:header.canvasMode")}
            title={t("editor:header.canvasMode")}
            onClick={() => setAppMode("canvas")}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Layout className="h-4 w-4" />
          </button>
        </>
      )}
      {appMode === "canvas" && (
        <>
          <button
            aria-label={t("editor:header.editMode")}
            title={t("editor:header.editMode")}
            onClick={() => setAppMode("edit")}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            aria-label={t("editor:header.browseMode")}
            title={t("editor:header.browseMode")}
            onClick={openBrowseMode}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <Globe className="h-4 w-4" />
          </button>
        </>
      )}
    </>
  ) : null;

  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-x-3 gap-y-2 px-3 py-1.5 transition-[padding] duration-200 md:h-10 md:py-0 bg-[var(--gutter)]",
        className
      )}
      style={{ paddingInlineStart: `calc(1rem + var(--sidebar-toggle-offset, 0px))` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <ReturnToChip />
        {leading}
        {showBreadcrumb && path ? <ViewerBreadcrumb path={path} /> : null}
        {badge && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground/50">
            {badge}
          </span>
        )}
        {sublabel && (
          <span className="hidden shrink-0 text-xs text-muted-foreground/40 sm:inline">
            {sublabel}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <NavArrows />
        {children}
        {path && (
          <button
            aria-label={inFullscreen ? t("editor:header.exitFocus") : t("editor:header.focus")}
            title={inFullscreen ? t("editor:header.exitFocus") : t("editor:header.focus")}
            onClick={handleFocus}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-foreground/80"
          >
            {inFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        )}
        {/* File History on every viewer, not just the markdown editor. */}
        {path ? <VersionHistory path={path} /> : null}
        {modeButtons}
        <HeaderActions />
        <NewTaskButton />
        <TaskRailToggle />
      </div>
    </header>
  );
}
