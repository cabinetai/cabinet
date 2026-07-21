import type {
  CockpitAction,
  CockpitActionRecord,
  CockpitCard,
  CockpitPotentialMiss,
  CockpitRunSummary,
  CockpitSourceStatus,
  DailyBusinessCockpit,
} from "@/lib/hermes/cockpit-types";

export type CockpitView = "today" | "queue" | "radar" | "risks" | "systems" | "history";

export const ACTION_LABELS: Record<CockpitAction, string> = {
  investigate: "Investigate",
  draft_response: "Draft response",
  approve: "Approve",
  reject: "Reject",
  comment: "Comment",
  snooze: "Snooze",
  schedule: "Schedule",
  ask_why: "Ask why",
};

export const SECONDARY_ACTIONS: CockpitAction[] = ["draft_response", "ask_why", "comment", "snooze", "schedule"];

export function formatExactTime(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatRelativeTime(value: string | null, now = Date.now()): string {
  if (!value) return "Not yet";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const minutes = Math.round((timestamp - now) / 60_000);
  const absolute = Math.abs(minutes);
  if (absolute < 1) return "Just now";
  if (absolute < 60) return minutes > 0 ? `In ${absolute}m` : `${absolute}m ago`;
  const hours = Math.round(absolute / 60);
  if (hours < 24) return minutes > 0 ? `In ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return minutes > 0 ? `In ${days}d` : `${days}d ago`;
}

export function formatCompactDate(value: string | null): string {
  if (!value) return "No intake yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function sourceLabel(source: CockpitCard["sourceType"]): string {
  return source.replaceAll("_", " ");
}

export function cardConsequence(card: CockpitCard): string {
  const sentence = card.whyItMatters.split(/(?<=[.!?])\s/)[0]?.trim();
  return sentence || card.summary;
}

export function primaryAction(card: CockpitCard): CockpitAction {
  return card.approval.state === "pending" ? "approve" : card.recommendedAction;
}

export function associatedRun(card: CockpitCard, runs: CockpitRunSummary[]): CockpitRunSummary | undefined {
  return runs.find((run) => run.context.includes(`cockpit:card:${card.id}:`));
}

export function isBrokenStatus(status: CockpitSourceStatus): boolean {
  return status === "error" || status === "unavailable" || status === "partial";
}

export function radarCategory(item: CockpitPotentialMiss): "stale" | "owner" | "duplicate" | "suppressed" | "low-confidence" {
  const haystack = `${item.title} ${item.whyPotentiallyMissed}`.toLowerCase();
  if (haystack.includes("stale-evidence") || haystack.includes("stale evidence")) return "stale";
  if (haystack.includes("owner reported") || haystack.includes("owner-reported")) return "owner";
  if (haystack.includes("duplicate") || haystack.includes("grouped")) return "duplicate";
  if (haystack.includes("suppress")) return "suppressed";
  return "low-confidence";
}

export function momentum(cockpit: DailyBusinessCockpit) {
  const completed = { decide: 0, protect: 0, verify: 0 };
  const selected = { decide: 0, protect: 0, verify: 0 };
  for (const loop of cockpit.momentumPlan?.loops ?? []) {
    selected[loop.category] += 1;
    if (loop.status === "completed") completed[loop.category] += 1;
  }
  const done = completed.decide + completed.protect + completed.verify;
  const total = selected.decide + selected.protect + selected.verify;
  return { completed, selected, done, total, percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

export function historyLabel(record: CockpitActionRecord): string {
  if (record.action === "risk_resolved") return "Risk resolved";
  if (record.action === "intake_completed") return "Intake completed";
  if (record.action === "intake_started") return "Intake started";
  if (record.action === "risk_added") return "Risk tracked";
  if (record.action === "viewed") return "Cockpit opened";
  return ACTION_LABELS[record.action];
}
