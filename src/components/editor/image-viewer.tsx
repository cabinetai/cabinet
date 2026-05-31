"use client";

import { ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";

interface ImageViewerProps {
  path: string;
  title: string;
}

export function ImageViewer({ path, title }: ImageViewerProps) {
  const src = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;
  const ext = filename.includes(".") ? filename.split(".").pop()!.toUpperCase() : "IMG";

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title}
          className="max-w-full max-h-full object-contain rounded-md shadow-lg"
          style={{ imageRendering: "auto" }}
        />
      </div>
    </div>
  );
}
