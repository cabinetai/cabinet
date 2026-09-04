"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "info" | "success" | "error";

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface SystemToast {
  key: string;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

const DISMISS_MS = 4500;
// Actionable toasts dwell longer — clicking the action (e.g. Undo) is a real
// decision, not a glance-and-forget.
const ACTION_DISMISS_MS = 10000;

export function SystemToasts() {
  const [toasts, setToasts] = useState<SystemToast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Multi-file drag-drop import progress (single-file imports finish fast
  // enough that the summary toast alone suffices).
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { done?: number; total?: number }
        | undefined;
      const total = detail?.total ?? 0;
      setImportProgress(
        total > 1 ? { done: detail?.done ?? 0, total } : null
      );
    }
    window.addEventListener("cabinet:import-progress", handler);
    return () =>
      window.removeEventListener("cabinet:import-progress", handler);
  }, []);

  const dismiss = useCallback((key: string) => {
    const t = timers.current.get(key);
    if (t) {
      clearTimeout(t);
      timers.current.delete(key);
    }
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  useEffect(() => {
    function handler(event: Event) {
      if (event.defaultPrevented) return;
      const detail = (event as CustomEvent).detail as
        | {
            kind?: ToastKind;
            message?: string;
            actionLabel?: string;
            onAction?: () => void;
            durationMs?: number;
          }
        | undefined;
      if (!detail?.message) return;
      const hasAction = !!(detail.actionLabel && detail.onAction);
      const next: SystemToast = {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: detail.kind || "info",
        message: detail.message,
        action: hasAction
          ? { label: detail.actionLabel!, onAction: detail.onAction! }
          : undefined,
      };
      setToasts((prev) => [...prev, next]);
      const ttl =
        detail.durationMs ?? (hasAction ? ACTION_DISMISS_MS : DISMISS_MS);
      const timer = setTimeout(() => dismiss(next.key), ttl);
      timers.current.set(next.key, timer);
    }
    window.addEventListener("cabinet:toast", handler);
    return () => window.removeEventListener("cabinet:toast", handler);
  }, [dismiss]);

  if (toasts.length === 0 && !importProgress) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-100 mx-auto flex w-fit flex-col gap-2">
      {importProgress && (
        <div className="flex w-56 flex-col gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-[12px] shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-200">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            <span className="flex-1 leading-snug">
              Importing {importProgress.done} / {importProgress.total}…
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{
                width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      {toasts.map((toast) => {
        const Icon =
          toast.kind === "error"
            ? XCircle
            : toast.kind === "success"
              ? CheckCircle2
              : Info;
        return (
          <div
            key={toast.key}
            className={cn(
              "flex max-w-md items-start gap-2 rounded-lg border bg-popover px-3 py-2 text-[12px] shadow-lg backdrop-blur-sm",
              "animate-in slide-in-from-bottom-2 fade-in duration-200",
              toast.kind === "error"
                ? "border-red-500/30 text-foreground"
                : toast.kind === "success"
                  ? "border-emerald-500/30 text-foreground"
                  : "border-border text-foreground"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                toast.kind === "error"
                  ? "text-red-500"
                  : toast.kind === "success"
                    ? "text-emerald-500"
                    : "text-muted-foreground"
              )}
            />
            <span className="flex-1 leading-snug">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onAction();
                  dismiss(toast.key);
                }}
                className="-my-0.5 shrink-0 rounded px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.key)}
              className="-me-1 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
