"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { DirIcon } from "@/components/ui/dir-icon";

export function NavArrows() {
  const { t } = useLocale();
  const navIndex = useAppStore((s) => s.navIndex);
  const navHistoryLength = useAppStore((s) => s.navHistory.length);
  const goBack = useAppStore((s) => s.goBack);
  const goForward = useAppStore((s) => s.goForward);
  const canGoBack = navIndex > 0;
  const canGoForward = navIndex >= 0 && navIndex < navHistoryLength - 1;

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("common:nav.goBack")}
        title={`${t("common:nav.goBack")} (⌘[)`}
        className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goBack}
        disabled={!canGoBack}
      >
        <DirIcon ltr={ArrowLeft} rtl={ArrowRight} className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("common:nav.goForward")}
        title={`${t("common:nav.goForward")} (⌘])`}
        className="h-7 w-7 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goForward}
        disabled={!canGoForward}
      >
        <DirIcon ltr={ArrowRight} rtl={ArrowLeft} className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
