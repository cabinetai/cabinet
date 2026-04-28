"use client";

import { ChevronRight, Home } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { cn } from "@/lib/utils";

function navigateTo(segmentPath: string) {
  useTreeStore.getState().focusPath(segmentPath);
  void useEditorStore.getState().loadPage(segmentPath).catch(() => {});
}

/**
 * Inline breadcrumb for use inside a viewer toolbar. Renders Home + clickable
 * ancestor segments, with the leaf as non-clickable emphasized text.
 * No outer chrome — the toolbar supplies its own border/padding.
 */
export function ViewerBreadcrumb({
  path,
  className,
}: {
  path: string;
  className?: string;
}) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const nodes = useTreeStore.getState().nodes;
  const leafNode = findNodeByPath(nodes, path);
  const leafTitle =
    leafNode?.frontmatter?.title ||
    leafNode?.name ||
    segments[segments.length - 1];

  const goHome = () => {
    useAppStore.getState().setSection({ type: "home" });
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground", className)}>
      <button
        type="button"
        onClick={goHome}
        className="inline-flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground"
        title="Home"
      >
        <Home className="h-3 w-3" />
      </button>
      {segments.map((segment, index) => {
        const segmentPath = segments.slice(0, index + 1).join("/");
        const isLast = index === segments.length - 1;
        const node = findNodeByPath(nodes, segmentPath);
        const label = node?.frontmatter?.title || node?.name || segment;
        return (
          <div key={segmentPath} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
            {isLast ? (
              <span
                className="truncate text-[13px] font-semibold text-foreground"
                title={leafTitle}
              >
                {leafTitle}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigateTo(segmentPath)}
                className="max-w-[14rem] shrink-0 truncate rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground"
                title={`Open ${label}`}
              >
                {label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
