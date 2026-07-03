"use client";

import { ChevronRight, Home, Cloud } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { findNodeByPath } from "@/lib/cabinets/tree";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/use-locale";
import { decodeDrivePath } from "@/lib/google-drive/paths";

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
  const { t } = useLocale();

  const goHome = () => {
    useAppStore.getState().setSection({ type: "home" });
  };

  // Google Drive file: show a simple "Google Drive > filename" breadcrumb
  // instead of exploding the full absolute path into segments.
  const driveAbsPath = decodeDrivePath(path);
  if (driveAbsPath !== null) {
    const driveNode = useTreeStore.getState().driveNode;
    const filename =
      driveNode?.frontmatter?.title ||
      driveNode?.name ||
      // basename, handling both POSIX (/) and Windows (\) separators
      driveAbsPath.split(/[\\/]/).pop() ||
      "File";
    return (
      <div className={cn("flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground", className)}>
        <button
          type="button"
          onClick={goHome}
          className="inline-flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground"
          title={t("tinyExtras:home")}
        >
          <Home className="h-3 w-3" />
        </button>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
        <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground/70">
          <Cloud className="h-3 w-3 shrink-0 text-blue-400" />
          Google Drive
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
        <span
          className="truncate text-[14px] font-semibold tracking-tight text-foreground"
          title={filename}
        >
          {filename}
        </span>
      </div>
    );
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const nodes = useTreeStore.getState().nodes;
  const leafNode = findNodeByPath(nodes, path);
  const leafTitle =
    leafNode?.frontmatter?.title ||
    leafNode?.name ||
    segments[segments.length - 1];

  const labelFor = (segPath: string, seg: string) => {
    const node = findNodeByPath(nodes, segPath);
    return node?.frontmatter?.title || node?.name || seg;
  };

  // Ancestors = every segment except the leaf. A deep path collapses its middle
  // into a single "…" (jumping to the grandparent, tooltip lists what's hidden)
  // so an overloaded breadcrumb stays one tidy line instead of wrapping.
  const ancestors = segments.slice(0, -1);
  type Crumb =
    | { kind: "seg"; key: string; path: string; label: string }
    | { kind: "gap"; key: string; hiddenLabel: string; jumpPath: string };
  let crumbs: Crumb[];
  if (ancestors.length > 3) {
    const firstPath = segments[0];
    const parentPath = ancestors.join("/");
    const jumpPath = segments.slice(0, ancestors.length - 1).join("/");
    const hiddenLabel = ancestors
      .slice(1, -1)
      .map((seg, i) => labelFor(segments.slice(0, i + 2).join("/"), seg))
      .join(" / ");
    crumbs = [
      { kind: "seg", key: firstPath, path: firstPath, label: labelFor(firstPath, segments[0]) },
      { kind: "gap", key: "__gap", hiddenLabel, jumpPath },
      { kind: "seg", key: parentPath, path: parentPath, label: labelFor(parentPath, ancestors[ancestors.length - 1]) },
    ];
  } else {
    crumbs = ancestors.map((seg, i) => {
      const p = segments.slice(0, i + 1).join("/");
      return { kind: "seg" as const, key: p, path: p, label: labelFor(p, seg) };
    });
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground", className)}>
      <button
        type="button"
        onClick={goHome}
        className="inline-flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground"
        title={t("tinyExtras:home")}
      >
        <Home className="h-3 w-3" />
      </button>
      {crumbs.map((c) => (
        <div key={c.key} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
          {c.kind === "gap" ? (
            <button
              type="button"
              onClick={() => navigateTo(c.jumpPath)}
              className="shrink-0 rounded px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground"
              title={c.hiddenLabel}
            >
              …
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigateTo(c.path)}
              className="max-w-[12rem] shrink-0 truncate rounded px-1 py-0.5 hover:bg-muted/60 hover:text-foreground"
              title={`Open ${c.label}`}
            >
              {c.label}
            </button>
          )}
        </div>
      ))}
      <div className="flex min-w-0 items-center gap-1">
        <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
        <span
          className="truncate text-[14px] font-semibold tracking-tight text-foreground"
          title={leafTitle}
        >
          {leafTitle}
        </span>
      </div>
    </div>
  );
}
