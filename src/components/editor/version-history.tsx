"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { FileTimeline } from "@/components/history/file-timeline";
import { useLocale } from "@/i18n/use-locale";

const OPEN_EVENT = "cabinet:open-file-history";

/**
 * Open the per-file history slide-over for `path` from anywhere — the sidebar
 * right-click menu, the cabinet dashboard, etc. The panel is mounted once
 * globally (FileHistoryPanel) and listens for this event.
 */
export function openFileHistory(path: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { path } }));
}

/**
 * File-history trigger button. No longer on the file toolbars (history now
 * lives in the sidebar right-click menu) — kept for surfaces that still want an
 * inline button (e.g. the cabinet dashboard). Requests the global panel.
 */
export function VersionHistory({ path }: { path?: string }) {
  const { t } = useLocale();
  const { currentPath } = useEditorStore();
  const targetPath = path ?? currentPath;

  if (!targetPath) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground/70 hover:text-foreground"
      onClick={() => openFileHistory(targetPath)}
      title={t("versionHistory:title")}
    >
      <History className="h-3.5 w-3.5" />
    </Button>
  );
}

/**
 * Globally-mounted file-history slide-over (mounted once in AppShell, like the
 * search palette). Opens when `openFileHistory(path)` fires. The body is the
 * shared FileTimeline (PRD §4.5) — commits with actor chips + diffs, journal
 * events, and OS anchors, so it's never empty for an existing file.
 */
export function FileHistoryPanel() {
  const { t } = useLocale();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const p = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (p) setPath(p);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!path) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path]);

  if (!path) return null;

  return (
    // Manila Arc: a floating sheet on the desk — inset 10px on every side,
    // rounded + lifted with --sheet-shadow, no border (matches the content sheet
    // and the AI panel).
    <div className="fixed top-[10px] bottom-[10px] end-[10px] z-40 flex w-[420px] max-w-[calc(94vw-20px)] flex-col overflow-hidden rounded-[var(--sheet-radius)] bg-background shadow-[var(--sheet-shadow)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <History className="h-4 w-4 shrink-0" />
          <span className="text-[13px] font-semibold">{t("versionHistory:title")}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {path.split("/").pop()}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPath(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <FileTimeline
        path={path}
        onRestored={() => useEditorStore.getState().loadPage(path)}
      />
    </div>
  );
}
