"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editor-store";
import { FileTimeline } from "@/components/history/file-timeline";
import { useLocale } from "@/i18n/use-locale";

/**
 * File History button + slide-over panel. Mounted in the ViewerToolbar so
 * EVERY viewer (markdown, PDF, CSV, office, media, source, website…) gets
 * it. The body is the shared FileTimeline (PRD §4.5) — commits with actor
 * chips and vimdiff-style diffs, journal events, and OS-level anchors, so
 * it's never empty for an existing file.
 */
export function VersionHistory({ path }: { path?: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const { currentPath } = useEditorStore();
  const targetPath = path ?? currentPath;

  if (!targetPath) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(!open)}
        title={t("versionHistory:title")}
      >
        <History className="h-4 w-4" />
      </Button>

      {open && (
        <div className="fixed right-0 top-0 bottom-0 z-40 flex w-[420px] max-w-[94vw] flex-col border-l border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="h-4 w-4 shrink-0" />
              <span className="text-[13px] font-semibold">{t("versionHistory:title")}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {targetPath.split("/").pop()}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <FileTimeline
            path={targetPath}
            onRestored={() => useEditorStore.getState().loadPage(targetPath)}
          />
        </div>
      )}
    </>
  );
}
