"use client";

import { ExternalLink } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";

interface PdfViewerProps {
  path: string;
  title: string;
}

export function PdfViewer({ path, title }: PdfViewerProps) {
  const pdfSrc = `/api/assets/${path}`;

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar path={path} badge="PDF">
          <ToolbarButton
            icon={ExternalLink}
            label="Open in new tab"
            iconOnly
            onClick={() => window.open(pdfSrc, "_blank")}
          />
        </ViewerToolbar>
      }
    >
      <iframe
        src={pdfSrc}
        className="flex-1 w-full border-0"
        title={title}
      />
    </ViewerLayout>
  );
}
