import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";
import type { ConversationMeta, ConversationStatus } from "@/types/conversations";
import { AGENT_PALETTE } from "@/lib/themes";

/* ─── Cron → next run computation ─── */

export function computeNextCronRun(cronExpr: string, after: Date): Date | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const parseField = (field: string, max: number): number[] | null => {
    if (field === "*") return null; // any
    const values: number[] = [];
    for (const part of field.split(",")) {
      const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
      if (stepMatch) {
        const step = parseInt(stepMatch[2]);
        const rangeMatch = stepMatch[1].match(/^(\d+)-(\d+)$/);
        const start = stepMatch[1] === "*" ? 0 : rangeMatch ? parseInt(rangeMatch[1]) : parseInt(stepMatch[1]);
        const end = rangeMatch ? parseInt(rangeMatch[2]) : max;
        for (let i = start; i <= end; i += step) values.push(i);
      } else {
        const rangeMatch = part.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          for (let i = parseInt(rangeMatch[1]); i <= parseInt(rangeMatch[2]); i++) values.push(i);
        } else {
          values.push(parseInt(part));
        }
      }
    }
    return values;
  };

  const minutes = parseField(parts[0], 59);
  const hours = parseField(parts[1], 23);
  const doms = parseField(parts[2], 31);
  const months = parseField(parts[3], 12);
  const dows = parseField(parts[4], 6);

  const matches = (d: Date) => {
    if (minutes && !minutes.includes(d.getMinutes())) return false;
    if (hours && !hours.includes(d.getHours())) return false;
    if (doms && !doms.includes(d.getDate())) return false;
    if (months && !months.includes(d.getMonth() + 1)) return false;
    if (dows && !dows.includes(d.getDay())) return false;
    return true;
  };

  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Search up to 35 days ahead (for month view)
  const limit = after.getTime() + 35 * 24 * 60 * 60 * 1000;
  while (candidate.getTime() < limit) {
    if (matches(candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return null;
}

/* ─── Scheduled-run lookup key ─── */

export function minuteIso(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(Math.round(d.getTime() / 60000) * 60000).toISOString();
}

export function buildScheduledKey(
  agentSlug: string,
  sourceType: "job" | "heartbeat",
  jobId: string | undefined | null,
  when: Date | string,
): string {
  return `${agentSlug}::${sourceType}::${jobId || "-"}::${minuteIso(when)}`;
}

/* ─── Schedule event type ─── */

export type ScheduleSourceType = "job" | "heartbeat" | "manual";

export interface ScheduleEvent {
  id: string;
  sourceType: ScheduleSourceType;
  sourceId: string;
  label: string;
  agentEmoji: string;
  agentName: string;
  agentSlug: string;
  enabled: boolean;
  /**
   * Cron expression that produced this event. Empty string for manual events
   * (they're one-off, not recurring).
   */
  cronExpr: string;
  time: Date;
  jobRef?: CabinetJobSummary;
  agentRef?: CabinetAgentSummary;
  /**
   * Present only for `sourceType === "manual"`. Points back at the
   * ConversationMeta so click handlers can route straight to the task viewer.
   */
  conversationId?: string;
  /** Terminal status of the backing conversation (for "manual" events). */
  conversationStatus?: ConversationStatus;
}

/* ─── Generate events for a date range ─── */

export function getScheduleEvents(
  agents: CabinetAgentSummary[],
  jobs: CabinetJobSummary[],
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleEvent[] {
  const agentMap = new Map<string, CabinetAgentSummary>();
  for (const a of agents) {
    agentMap.set(a.scopedId, a);
    agentMap.set(a.slug, a);
  }

  // Audit #070/#116: in multi-cabinet "all" views, the same agent appears
  // once per cabinet that exposes it. The events loop below previously
  // generated one heartbeat-event per (agent, occurrence), so a heartbeat
  // visible across N cabinets produced N copies in the same time slot —
  // which read as "the same week renders 6× in the calendar". Dedup by a
  // logical-event key (agentSlug + sourceType + sourceId + ISO time +
  // cronExpr) so cross-cabinet duplicates collapse into one rendered pill.
  const seen = new Set<string>();
  const dedupKey = (
    agentSlug: string,
    sourceType: ScheduleEvent["sourceType"],
    sourceId: string,
    time: Date,
    cronExpr: string,
  ): string =>
    `${agentSlug}|${sourceType}|${sourceId}|${time.toISOString()}|${cronExpr}`;

  const events: ScheduleEvent[] = [];
  const MAX_EVENTS_PER_SOURCE = 500;

  // Jobs
  for (const job of jobs) {
    const owner = job.ownerScopedId
      ? agentMap.get(job.ownerScopedId)
      : job.ownerAgent
      ? agentMap.get(job.ownerAgent)
      : undefined;

    let cursor = new Date(rangeStart.getTime() - 60000); // 1 minute before range
    let count = 0;
    while (count < MAX_EVENTS_PER_SOURCE) {
      const next = computeNextCronRun(job.schedule, cursor);
      if (!next || next.getTime() >= rangeEnd.getTime()) break;
      if (next.getTime() >= rangeStart.getTime()) {
        const slug = owner?.slug || job.ownerAgent || "";
        const key = dedupKey(slug, "job", job.scopedId, next, job.schedule);
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            id: `job:${job.scopedId}:${next.toISOString()}`,
            sourceType: "job",
            sourceId: job.scopedId,
            label: job.name,
            agentEmoji: owner?.emoji || "🤖",
            agentName: owner?.name || job.ownerAgent || "Unknown",
            agentSlug: slug,
            // Effective enable: agent must be active too. Stopping the agent
            // dims every routine even though `job.enabled` stays true on disk.
            enabled: job.enabled && (owner?.active !== false),
            cronExpr: job.schedule,
            time: next,
            jobRef: job,
            agentRef: owner,
          });
        }
      }
      cursor = next;
      count++;
    }
  }

  // Heartbeats
  for (const agent of agents) {
    if (!agent.heartbeat) continue;

    let cursor = new Date(rangeStart.getTime() - 60000);
    let count = 0;
    while (count < MAX_EVENTS_PER_SOURCE) {
      const next = computeNextCronRun(agent.heartbeat, cursor);
      if (!next || next.getTime() >= rangeEnd.getTime()) break;
      if (next.getTime() >= rangeStart.getTime()) {
        // Heartbeat dedup key uses slug (not scopedId): two cabinets each
        // exposing the same agent with the same heartbeat are the same
        // logical event; we don't want one pill per cabinet stacked at the
        // same minute.
        const key = dedupKey(
          agent.slug,
          "heartbeat",
          agent.slug,
          next,
          agent.heartbeat,
        );
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            id: `hb:${agent.scopedId}:${next.toISOString()}`,
            sourceType: "heartbeat",
            sourceId: agent.scopedId,
            label: agent.name,
            agentEmoji: agent.emoji || "🤖",
            agentName: agent.name,
            agentSlug: agent.slug,
            // Effective enable: master switch AND per-heartbeat toggle.
            enabled: agent.active && agent.heartbeatEnabled !== false,
            cronExpr: agent.heartbeat,
            time: next,
            agentRef: agent,
          });
        }
      }
      cursor = next;
      count++;
    }
  }

  events.sort((a, b) => a.time.getTime() - b.time.getTime());
  return events;
}

/* ─── Manual conversations → ScheduleEvent ─── */

/**
 * Synthesize ScheduleEvent rows for past manual conversations that fall
 * inside the visible window. Manual runs aren't cron-driven so they have
 * no future tail — they only paint in past slots.
 */
export function getManualScheduleEvents(
  conversations: ConversationMeta[],
  agents: CabinetAgentSummary[],
  rangeStart: Date,
  rangeEnd: Date
): ScheduleEvent[] {
  if (conversations.length === 0) return [];

  const agentMap = new Map<string, CabinetAgentSummary>();
  for (const a of agents) {
    agentMap.set(a.scopedId, a);
    agentMap.set(a.slug, a);
  }

  const events: ScheduleEvent[] = [];
  for (const convo of conversations) {
    if (convo.trigger !== "manual") continue;
    const when = convo.startedAt ? new Date(convo.startedAt) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    if (when.getTime() < rangeStart.getTime()) continue;
    if (when.getTime() >= rangeEnd.getTime()) continue;

    const owner = agentMap.get(convo.agentSlug);
    const label = convo.title || convo.summary || "Manual run";

    events.push({
      id: `manual:${convo.id}`,
      sourceType: "manual",
      sourceId: convo.id,
      label,
      agentEmoji: owner?.emoji || "💬",
      agentName: owner?.name || convo.agentSlug || "Manual",
      agentSlug: owner?.slug || convo.agentSlug || "editor",
      enabled: convo.status !== "cancelled",
      cronExpr: "",
      time: when,
      agentRef: owner,
      conversationId: convo.id,
      conversationStatus: convo.status,
    });
  }

  events.sort((a, b) => a.time.getTime() - b.time.getTime());
  return events;
}

/* ─── Date range helpers ─── */

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  d.setDate(d.getDate() + diff);
  return d;
}

export function getViewRange(
  mode: "day" | "week" | "month",
  anchor: Date,
): { start: Date; end: Date } {
  if (mode === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (mode === "week") {
    const start = getWeekStart(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  // month
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { start, end };
}

/* ─── Agent color palette ─── */

export function getAgentColor(slug: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length];
}

// Derive the tinted { bg, text } pair from a user-picked hex color.
// Mirrors the existing palette look: 8% alpha bg, full-saturation text.
export function tintFromHex(hex: string): { bg: string; text: string } {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    return AGENT_PALETTE[0];
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.08)`,
    text: `rgb(${r}, ${g}, ${b})`,
  };
}
