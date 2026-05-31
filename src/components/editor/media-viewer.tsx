"use client";

import { ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";

interface MediaViewerProps {
  path: string;
  title: string;
  type: "video" | "audio";
}

export function MediaViewer({ path, type }: MediaViewerProps) {
  const src = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : type.toUpperCase();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ViewerToolbar path={path} badge={ext}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            const a = document.createElement("a");
            a.href = src;
            a.download = filename;
            a.click();
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => window.open(src, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in new tab
        </Button>
      </ViewerToolbar>
      <div className="flex-1 overflow-auto flex items-center justify-center bg-[#1a1a1a] p-8">
        {type === "video" ? (
          <video
            src={src}
            controls
            className="max-w-full max-h-full rounded-md shadow-lg"
          >
            Your browser does not support the video element.
          </video>
        ) : (
          <div className="w-full max-w-lg space-y-4">
            <div className="text-center text-muted-foreground text-sm">{filename}</div>
            <audio src={src} controls className="w-full">
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}
