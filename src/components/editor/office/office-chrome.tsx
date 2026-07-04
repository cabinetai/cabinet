"use client";

import { Download, FolderOpen, ExternalLink } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ToolbarButton } from "@/components/layout/toolbar-button";
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
        <ToolbarButton
          icon={ExternalLink}
          label={external.label}
          href={external.href}
          target="_blank"
        />
      )}
      {!hideFinder && (
        <ToolbarButton
          icon={FolderOpen}
          label="Reveal"
          title={t("officeChrome:openInFinder")}
          onClick={revealInFinder}
        />
      )}
      {!hideFinder && (
        <ToolbarButton
          icon={Download}
          label="Download"
          title={t("officeChrome:downloadOriginal")}
          onClick={() => {
            const a = document.createElement("a");
            a.href = assetUrl;
            a.download = filename;
            a.click();
          }}
        />
      )}
    </ViewerToolbar>
  );
}
