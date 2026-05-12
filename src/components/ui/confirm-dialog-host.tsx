"use client";

import { useEffect, useState, useCallback } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONFIRM_EVENT, type ConfirmEventDetail } from "@/lib/ui/confirm";
import { useLocale } from "@/i18n/use-locale";

interface ActiveDialog extends ConfirmEventDetail {
  key: string;
}

export function ConfirmDialogHost() {
  const { t } = useLocale();
  const [active, setActive] = useState<ActiveDialog | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as ConfirmEventDetail | undefined;
      if (!detail) return;
      setActive({ ...detail, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    };
    window.addEventListener(CONFIRM_EVENT, handler);
    return () => window.removeEventListener(CONFIRM_EVENT, handler);
  }, []);

  const resolve = useCallback(
    (accepted: boolean) => {
      if (!active) return;
      active.resolve(accepted);
      setActive(null);
    },
    [active]
  );

  if (!active) return null;

  const destructive = active.destructive ?? false;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && resolve(false)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-[90] -translate-x-1/2 -translate-y-1/2",
            "w-[min(420px,calc(100%-2rem))] rounded-xl bg-background p-5 ring-1 ring-foreground/10 shadow-2xl outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <div className="flex items-start gap-3">
            {destructive && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[14px] font-semibold leading-tight">
                {active.title}
              </Dialog.Title>
              {active.message && (
                <Dialog.Description className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                  {active.message}
                </Dialog.Description>
              )}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => resolve(false)}>
              {active.cancelText ?? t("common:actions.cancel")}
            </Button>
            <Button
              size="sm"
              variant={destructive ? "destructive" : "default"}
              onClick={() => resolve(true)}
              autoFocus
            >
              {active.confirmText ?? t("common:actions.confirm")}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
