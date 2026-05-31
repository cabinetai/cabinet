"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";
import { DirIcon } from "@/components/ui/dir-icon";

export function NavArrows() {
  const { t } = useLocale();
  const canGoBack = useAppStore((s) => s.canGoBack);
  const canGoForward = useAppStore((s) => s.canGoForward);
  const goBack = useAppStore((s) => s.goBack);
  const goForward = useAppStore((s) => s.goForward);

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("common:nav.goBack")}
        title={`${t("common:nav.goBack")} (⌘[)`}
        className="h-7 w-6 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goBack}
        disabled={!canGoBack}
      >
        <DirIcon ltr={ArrowLeft} rtl={ArrowRight} className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("common:nav.goForward")}
        title={`${t("common:nav.goForward")} (⌘])`}
        className="h-7 w-6 text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
        onClick={goForward}
        disabled={!canGoForward}
      >
        <DirIcon ltr={ArrowRight} rtl={ArrowLeft} className="h-3 w-3" />
      </Button>
    </div>
  );
}
