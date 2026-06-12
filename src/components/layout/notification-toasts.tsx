"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, X, Play } from "lucide-react";
import { dedupeConversationNotifications } from "@/lib/agents/conversation-notification-utils";
import type { ConversationTrigger } from "@/types/conversations";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";

type ToastStatus = "completed" | "failed" | "running";

interface TaskNotification {
  id: string;
  agentSlug: string;
  cabinetPath?: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  status: ToastStatus;
  summary?: string;
  completedAt: string;
  trigger?: ConversationTrigger;
  jobName?: string;
  scheduledAt?: string;
  /** Internal: auto-dismiss timer key */
  _key: string;
}

const DISMISS_MS = 8000;

// Synthesized notification sounds via Web Audio API — no files needed
function playNotificationSound(status: ToastStatus) {
  if (status === "running") {
    playStartSound();
    return;
  }
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;

    if (status === "completed") {
      // Two-tone ascending chime
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 587; // D5
      o1.connect(gain);
      o1.start(ctx.currentTime);
      o1.stop(ctx.currentTime + 0.12);

      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 880; // A5
      o2.connect(gain);
      o2.start(ctx.currentTime + 0.14);
      o2.stop(ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      setTimeout(() => ctx.close(), 500);
    } else {
      // Low descending tone
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 440; // A4
      o1.connect(gain);
      o1.start(ctx.currentTime);
      o1.stop(ctx.currentTime + 0.15);

      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = 330; // E4
      o2.connect(gain);
      o2.start(ctx.currentTime + 0.17);
      o2.stop(ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 500);
    }
  } catch {
    // Audio not available — silently skip
  }
}

// Softer single tone for background task starts — scheduled jobs and
// heartbeats fire often, so this needs to fade into the background.
function playStartSound() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 523.25; // C5
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 250);
  } catch {
    // Audio not available — silently skip
  }
}

function startToastSubtitle(toast: TaskNotification): string {
  if (toast.trigger === "job") {
    return toast.jobName ? `Scheduled: ${toast.jobName}` : "Scheduled";
  }
  if (toast.trigger === "heartbeat") return "Heartbeat";
  if (toast.trigger === "agent") return "Spawned by another agent";
  if (toast.trigger === "telegram") return "From Telegram";
  return toast.agentName;
}

export function NotificationToasts() {
  const [toasts, setToasts] = useState<TaskNotification[]>([]);
  const setSection = useAppStore((s) => s.setSection);

  const dismiss = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t._key !== key));
  }, []);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent).detail as Omit<TaskNotification, "_key">[];
      if (!detail?.length) return;
      const newToasts = dedupeConversationNotifications(detail).map((n) => ({
        ...n,
        _key: `${crypto.randomUUID()}-${n.id}`,
      }));
      setToasts((prev) => dedupeConversationNotifications([...prev, ...newToasts]));

      // Play sound for the first notification in the batch
      const first = newToasts[0];
      if (first) playNotificationSound(first.status);

      // Auto-dismiss each toast
      for (const t of newToasts) {
        setTimeout(() => dismiss(t._key), DISMISS_MS);
      }
    }

    window.addEventListener("cabinet:conversation-completed", handler);
    window.addEventListener("cabinet:conversation-started", handler);
    return () => {
      window.removeEventListener("cabinet:conversation-completed", handler);
      window.removeEventListener("cabinet:conversation-started", handler);
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 end-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <button
          key={toast._key}
          type="button"
          onClick={() => {
            const scopedPath = toast.cabinetPath || ROOT_CABINET_PATH;
            setSection({
              type: "task",
              taskId: toast.id,
              cabinetPath: scopedPath,
            });
            dismiss(toast._key);
          }}
          className={cn(
            "group flex w-[380px] items-start gap-3 rounded-xl border px-4 py-3 text-start shadow-lg backdrop-blur-sm transition-all",
            "animate-in slide-in-from-right-5 rtl:slide-in-from-left-5 fade-in duration-300",
            toast.status === "completed" && "border-emerald-500/20 bg-card/95",
            toast.status === "failed" && "border-red-500/20 bg-card/95",
            toast.status === "running" && "border-sky-500/20 bg-card/95"
          )}
        >
          <span className="mt-0.5 text-lg leading-none">{toast.agentEmoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {toast.status === "completed" && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              )}
              {toast.status === "failed" && (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              {toast.status === "running" && (
                <Play className="h-3.5 w-3.5 shrink-0 text-sky-500" />
              )}
              <span
                className={cn(
                  "text-[11px] font-semibold uppercase tracking-wider",
                  toast.status === "completed" && "text-emerald-500",
                  toast.status === "failed" && "text-red-500",
                  toast.status === "running" && "text-sky-500"
                )}
              >
                {toast.status === "completed"
                  ? "Completed"
                  : toast.status === "failed"
                  ? "Failed"
                  : "Started"}
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] font-medium text-foreground">
              {toast.title}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {toast.status === "running" ? startToastSubtitle(toast) : toast.agentName}
            </p>
          </div>
          <div
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              dismiss(toast._key);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 hover:bg-muted"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}
