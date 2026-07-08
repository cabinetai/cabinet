"use client";

import { useMemo, type ReactNode } from "react";
import { Archive, Globe } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { ReturnToChip } from "@/components/layout/return-to-chip";
import { ViewerBreadcrumb } from "@/components/layout/viewer-breadcrumb";
import { NewTaskButton } from "@/components/composer/new-task-button";
import { TaskRailToggle } from "@/components/tasks/rail/task-rail-toggle";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { cn } from "@/lib/utils";

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
    // Check the markdown file case before directory/cabinet: a `<name>.md` page
    // can carry sub-pages and so be typed "directory", but its content still
    // lives at `<name>.md`, not an `index.md` inside the folder.
    if (sourceNode?.type === "file" || lower.endsWith(".md")) {
      return `${assetUrl}.md`;
    }
    if (sourceNode?.type === "directory" || sourceNode?.type === "cabinet") {
      return `${assetUrl}/index.md`;
    }
    return assetUrl;
  }, [sourcePath, sourceNode?.type]);

  // The Globe (enter-browse) button only makes sense for web-renderable
  // content — i.e. bundled websites/apps, which open their index.html. Markdown
  // articles and other files render in their own viewers, and their raw asset
  // URL isn't browsable (e.g. .md downloads as octet-stream), so no button.
  const isBrowsable = sourceNode?.type === "website" || sourceNode?.type === "app";

  const modeButtons = !showModeButtons ? null : appMode === "browse" ? (
    // Always offer the exit affordance while browsing, regardless of which node
    // is selected (you may have entered browse from a link in a markdown page).
    <ToolbarButton
      icon={Archive}
      label={t("editor:header.editMode")}
      iconOnly
      onClick={() => setAppMode("edit")}
    />
  ) : isBrowsable ? (
    <ToolbarButton
      icon={Globe}
      label={t("editor:header.browseMode")}
      iconOnly
      onClick={() => setAppMode("browse", browseModeUrl)}
    />
  ) : null;

  return (
    <div
      className={cn(
        // `viewer-toolbar` is the stable hook the Electron macOS drag-region
        // CSS targets (globals.css) — this bar is a <div>, not a <header>, so
        // without the class the hidden-title-bar window can't be dragged from
        // the editor or any file viewer built on ViewerToolbar.
        "viewer-toolbar flex shrink-0 items-center justify-between gap-x-3 gap-y-2 px-3 py-1.5 transition-[padding] duration-200 md:h-10 md:py-0",
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
        {children}
        {/* File history moved to the sidebar right-click menu — the toolbar
            stays minimal so the content leads. */}
        {modeButtons}
        <HeaderActions />
        <NewTaskButton />
        <TaskRailToggle />
      </div>
    </div>
  );
}
