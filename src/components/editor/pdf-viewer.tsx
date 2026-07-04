"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";

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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => window.open(pdfSrc, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </Button>
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
