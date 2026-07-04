"use client";

import { ExternalLink, Download } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";

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
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge={ext}>
        <ToolbarButton
          icon={Download}
          label="Download"
          onClick={() => {
            const a = document.createElement("a");
            a.href = src;
            a.download = filename;
            a.click();
          }}
        />
        <ToolbarButton
          icon={ExternalLink}
          label="Open in new tab"
          iconOnly
          onClick={() => window.open(src, "_blank")}
        />
        </ViewerToolbar>
      }
    >
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
    </ViewerLayout>
  );
}
