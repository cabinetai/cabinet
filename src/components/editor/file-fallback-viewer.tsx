"use client";

import { File, FolderOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";

interface FileFallbackViewerProps {
  path: string;
  title: string;
}

export function FileFallbackViewer({ path }: FileFallbackViewerProps) {
  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "";

  const revealInFinder = async () => {
    try {
      await fetch("/api/system/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge={ext || undefined} />
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <File className="size-8 text-muted-foreground/50" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{filename}</p>
            <p className="text-xs text-muted-foreground">
              This file type can&apos;t be previewed in Cabinet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={revealInFinder}
            >
              <FolderOpen className="h-4 w-4" />
              Open in Finder
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const a = document.createElement("a");
                a.href = assetUrl;
                a.download = filename;
                a.click();
              }}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
