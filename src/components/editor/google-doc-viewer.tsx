"use client";

import { useMemo } from "react";
import { OfficeChrome } from "./office/office-chrome";
import { detectGoogle, googleKindLabel, type GoogleKind } from "@/lib/google/detect";
import { Info } from "lucide-react";
import type { GoogleFrontmatter } from "@/types";
import { useLocale } from "@/i18n/use-locale";

interface Props {
  path: string;
  title: string;
  google: GoogleFrontmatter;
}

export function GoogleDocViewer({ path, title, google }: Props) {
  const { t } = useLocale();
  const resolved = useMemo(() => detectGoogle(google.url || ""), [google.url]);
  const embedUrl = google.embedUrl ?? resolved?.embedUrl ?? "";
  const openUrl = resolved?.openUrl ?? google.url ?? "";
  const kind: GoogleKind = (google.kind as GoogleKind) ?? resolved?.kind ?? "docs";
  const label = googleKindLabel(kind).toUpperCase();

  if (!embedUrl) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <OfficeChrome path={path} title={title} extLabel="GOOGLE" hideFinder />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm font-medium">{t("googleDoc:noUrl")}</p>
            <p className="text-xs text-muted-foreground">
              Add a <code>google.url</code> field to this page&apos;s frontmatter pointing to a
              Google Sheets, Slides, Docs or Forms link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <OfficeChrome
        path={path}
        title={title}
        extLabel={label}
        hideFinder
        external={openUrl ? { label: "Open in Google", href: openUrl } : undefined}
      />
      <div className="px-4 py-1.5 border-b border-border bg-muted/30 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3 w-3 shrink-0" />
        Embed requires the doc&apos;s sharing to be <strong className="text-foreground/80">{t("googleDoc:anyoneWithLink")}</strong> or{" "}
        <strong className="text-foreground/80">{t("googleDoc:publishedToWeb")}</strong>.
      </div>
      <div className="flex-1 relative bg-muted/30">
        <iframe
          key={embedUrl}
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0 bg-background"
          allow="clipboard-write; fullscreen"
          title={title}
        />
      </div>
    </div>
  );
}
