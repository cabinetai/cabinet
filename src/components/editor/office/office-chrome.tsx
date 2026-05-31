"use client";

import { Download, FolderOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { useLocale } from "@/i18n/use-locale";

interface OfficeChromeProps {
  path: string;
  title: string;
  extLabel: string;
  /** Optional external "open in source" action (e.g. Open in Google). */
  external?: { label: string; href: string };
  /** Hide the "Open in Finder" button (useful for Google embeds that aren't on disk). */
  hideFinder?: boolean;
}

export function OfficeChrome({ path, extLabel, external, hideFinder }: OfficeChromeProps) {
  const { t } = useLocale();
  const assetUrl = `/api/assets/${path}`;
  const filename = path.split("/").pop() || path;

  const revealInFinder = async () => {
    try {
      await fetch("/api/system/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <ViewerToolbar path={path} badge={extLabel || undefined}>
      {external && (
        <a
          href={external.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[11px] h-7 px-2.5 rounded-md border border-border hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {external.label}
        </a>
      )}
      {!hideFinder && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-[11px] h-7"
          onClick={revealInFinder}
          title={t("officeChrome:openInFinder")}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Reveal
        </Button>
      )}
      {!hideFinder && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-[11px] h-7"
          onClick={() => {
            const a = document.createElement("a");
            a.href = assetUrl;
            a.download = filename;
            a.click();
          }}
          title={t("officeChrome:downloadOriginal")}
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      )}
    </ViewerToolbar>
  );
}
