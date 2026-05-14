"use client";

import { ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewerToolbar } from "@/components/layout/viewer-toolbar";
import { useLocale } from "@/i18n/use-locale";

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
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={onExit}
        title={t("editorExtras:exitApp")}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Exit app
      </Button>
    ) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => window.open(iframeSrc, "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in new tab
        </Button>
      </ViewerToolbar>

      <iframe
        src={iframeSrc}
        className="flex-1 w-full border-0 bg-white"
        title={title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation"
      />
    </div>
  );
}
