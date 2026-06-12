"use client";

import type { ReactNode } from "react";
import { HeaderActions } from "@/components/layout/header-actions";
import { VersionHistory } from "@/components/editor/version-history";
import { ReturnToChip } from "@/components/layout/return-to-chip";
import { ViewerBreadcrumb } from "@/components/layout/viewer-breadcrumb";
import { NewTaskButton } from "@/components/composer/new-task-button";
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
}: {
  path?: string;
  badge?: string;
  sublabel?: string;
  showBreadcrumb?: boolean;
  /** Extra leading element (e.g. a viewer's own Back button for full-screen mode). */
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-x-3 gap-y-2 border-b border-border/70 bg-background px-4 py-2 transition-[padding] duration-200 md:h-12 md:py-0",
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
        {/* File History on every viewer, not just the markdown editor. */}
        {path ? <VersionHistory path={path} /> : null}
        <HeaderActions />
        <NewTaskButton />
      </div>
    </div>
  );
}
