import type { TaskMeta } from "@/types/tasks";

export type TriggerIconKind =
  | "bot"
  | "clock"
  | "heartbeat"
  | "telegram"
  | "unknown";

export interface TriggerBadgeStyle {
  label: string;
  className: string;
  icon: TriggerIconKind;
}

// Audit #134: badges used to ride saturated 500-tier sky/emerald/pink/
// violet, which fought the warm paper theme. Now they share a single
// muted/theme-aware look — the icon shape carries the trigger meaning, and
// the badge just sits politely on whatever surface the active theme paints.
const BADGE_CLASS = "bg-muted text-muted-foreground ring-1 ring-border/60";

const TRIGGER_STYLES: Record<
  NonNullable<TaskMeta["trigger"]>,
  TriggerBadgeStyle
> = {
  manual: { label: "Manual", className: BADGE_CLASS, icon: "bot" },
  job: { label: "Job", className: BADGE_CLASS, icon: "clock" },
  heartbeat: { label: "Heartbeat", className: BADGE_CLASS, icon: "heartbeat" },
  agent: { label: "Agent", className: BADGE_CLASS, icon: "heartbeat" },
  telegram: { label: "Telegram", className: BADGE_CLASS, icon: "telegram" },
  channel: { label: "Channel", className: BADGE_CLASS, icon: "heartbeat" },
};

/**
 * Resolve the badge style for a task trigger, or null when there is nothing
 * to render.
 *
 * `trigger` is typed as a closed union, but task metadata is persisted to
 * disk by agents and by older Cabinet versions, so at runtime it can hold any
 * string. An unrecognised value gets a neutral badge labelled with the raw
 * trigger rather than crashing the board (issue #85). `Object.hasOwn` keeps
 * inherited keys like `constructor` out of the known set — they are truthy on
 * a plain object literal but carry no label, className, or icon.
 */
export function resolveTriggerBadge(
  trigger: string | null | undefined
): TriggerBadgeStyle | null {
  if (!trigger) return null;
  if (Object.hasOwn(TRIGGER_STYLES, trigger)) {
    return TRIGGER_STYLES[trigger as NonNullable<TaskMeta["trigger"]>];
  }
  return { label: trigger, className: BADGE_CLASS, icon: "unknown" };
}
