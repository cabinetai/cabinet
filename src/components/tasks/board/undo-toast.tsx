"use client";

import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

export interface PendingUndo {
  id: string;
  message: string;
  undo: () => Promise<void> | void;
  /** Milliseconds after which the toast auto-dismisses. Default 5000. */
  durationMs?: number;
}

export function UndoToast({
  pending,
  onDismiss,
}: {
  pending: PendingUndo | null;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const duration = pending.durationMs ?? 5000;
    const startedAt = Date.now();
    setRemaining(duration);

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onDismiss();
      }
    }, 100);

    return () => clearInterval(tick);
  }, [pending, onDismiss]);

  if (!pending) return null;

  const duration = pending.durationMs ?? 5000;
  const progress = Math.max(0, Math.min(100, (remaining / duration) * 100));

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex items-center gap-3">
      <div className="pointer-events-auto flex min-w-[260px] items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-lg">
        <span className="text-[13px] text-foreground">{pending.message}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await pending.undo();
            } finally {
              onDismiss();
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          <RotateCcw className="size-3" />
          Undo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("undoToast:dismiss")}
        >
          <X className="size-3.5" />
        </button>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-foreground/30 transition-[width] duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
