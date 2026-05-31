"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  MessageCircleQuestion,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskMeta } from "@/types/tasks";
import type { LaneKey } from "./lane-rules";
import { IconHint } from "./icon-hint";

/**
 * One of six visual states a card can carry. Derived from `TaskMeta.status`
 * (and whether the task has started), NOT from the backend directly — the
 * UI owns the semantic grouping (e.g. "handoff" and "idle" share a lane).
 */
export type CardState =
  | "running"
  | "ask"
  | "failed"
  | "just-done"
  | "handoff"
  | "idle";

// "handoff" (an unstarted inbox task) is intentionally absent — it renders
// no glyph (see StatusIcon). The old violet download-style arrow read as a
// confusing clickable button, so waiting-to-start cards now show nothing.
const STATUS_STYLE: Record<
  Exclude<CardState, "handoff">,
  { icon: LucideIcon; color: string; label: string; animate?: string }
> = {
  running: {
    icon: Loader2,
    color: "text-sky-500",
    label: "Running — the agent is working on this now",
    animate: "animate-spin [animation-duration:1.6s]",
  },
  ask: {
    icon: MessageCircleQuestion,
    color: "text-amber-500",
    label: "Your turn — the agent asked a question or needs approval",
  },
  failed: {
    icon: AlertCircle,
    color: "text-red-500",
    label: "Failed — the last run ended with an error (Restart to retry)",
  },
  "just-done": {
    icon: CheckCircle2,
    color: "text-emerald-500",
    label: "Just finished — completed within the last hour",
  },
  idle: {
    icon: Circle,
    color: "text-muted-foreground/50",
    label: "Idle — no activity yet",
  },
};

export function deriveCardState(task: TaskMeta, lane: LaneKey): CardState {
  if (lane === "running") return "running";
  if (task.status === "failed") return "failed";
  if (task.status === "awaiting-input") return "ask";
  if (lane === "done") return "just-done";
  if (lane === "inbox") {
    const hasActivity = !!task.lastActivityAt;
    return hasActivity ? "idle" : "handoff";
  }
  return "idle";
}

export function StatusIcon({ state, size = "sm" }: { state: CardState; size?: "sm" | "md" }) {
  // Unstarted inbox tasks carry no status glyph.
  if (state === "handoff") return null;
  const meta = STATUS_STYLE[state];
  const Icon = meta.icon;
  return (
    <IconHint label={meta.label}>
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", meta.color)}
        aria-label={meta.label}
      >
        <Icon
          className={cn(size === "md" ? "size-4" : "size-3.5", meta.animate)}
          strokeWidth={2.25}
        />
      </span>
    </IconHint>
  );
}
