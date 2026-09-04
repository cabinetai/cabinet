"use client";

import { ExternalLink, ArrowLeft } from "lucide-react";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { ViewerLayout } from "@/components/layout/viewer-layout";
import { ToolbarButton } from "@/components/layout/toolbar-button";
import { useLocale } from "@/i18n/use-locale";
import { HtmlHighlighter } from "./html-highlighter";

interface WebsiteViewerProps {
  path: string;
  title: string;
  fullscreen?: boolean;
  onExit?: () => void;
}

export function WebsiteViewer({ path, title, fullscreen, onExit }: WebsiteViewerProps) {
  const { t } = useLocale();
  const iframeSrc = `/api/assets/${path}/index.html`;
  const exitButton =
    fullscreen && onExit ? (
      <ToolbarButton
        icon={ArrowLeft}
        label={t("editorExtras:exitApp")}
        onClick={onExit}
      />
    ) : null;

  return (
    <ViewerLayout
      toolbar={
        <ViewerToolbar
        path={path}
        badge={fullscreen ? "App" : "Embedded Website"}
        showBreadcrumb={!fullscreen}
        leading={
          fullscreen ? (
            <>
              {exitButton}
              <span className="truncate text-[13px] font-medium text-foreground">{title}</span>
            </>
          ) : null
        }
      >
        <ToolbarButton
          icon={ExternalLink}
          label="Open in new tab"
          iconOnly
          onClick={() => window.open(iframeSrc, "_blank")}
        />
        </ViewerToolbar>
      }
    >
      <HtmlHighlighter htmlPath={`${path}/index.html`}>
        <iframe
          src={iframeSrc}
          className="flex-1 w-full border-0 bg-white"
          title={title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
        />
      </HtmlHighlighter>
    </ViewerLayout>
  );
}
