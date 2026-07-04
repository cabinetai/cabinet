"use client";

import { ExternalLink, Download } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";

interface ImageViewerProps {
  path: string;
  title: string;
}

export function ImageViewer({ path, title }: ImageViewerProps) {
  const src = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "IMG";

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title}
          className="max-w-full max-h-full object-contain rounded-md shadow-lg"
          style={{ imageRendering: "auto" }}
        />
      </div>
    </ViewerLayout>
  );
}
