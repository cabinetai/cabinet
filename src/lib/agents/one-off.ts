/**
 * One-off scheduled tasks.
 *
 * A one-off is just a JobConfig with `oneShot: true` + `runAfter: <ISO>` and a
 * single-fire cron derived from that instant. The daemon's one-shot wrapper
 * (server/cabinet-daemon.ts) disables the job after it fires, so the yearly
 * cron rollover never re-triggers it. `runAfter` is the canonical instant used
 * for calendar rendering (see getScheduleEvents) — the cron is only the trigger.
 *
 * This module is the single source of truth for the cron derivation so the
 * agent action-dispatcher and the calendar create/drag UI stay in lockstep.
 */

/**
 * Convert a specific point in time into a single-fire cron expression.
 * Format: "minute hour dayOfMonth month *".
 *
 * Uses LOCAL getters on purpose: the daemon's node-cron fires in host local
 * time (no `{ timezone }` option), and a calendar drop produces a local Date,
 * so the cron fires at the dropped wall-clock time. (Same-host only — see the
 * timezone caveat in docs/CALENDAR_RUN_LINKAGE.md.)
 */
export function isoToCronExpression(when: Date): string {
  const minute = when.getMinutes();
  const hour = when.getHours();
  const dom = when.getDate();
  const month = when.getMonth() + 1;
  return `${minute} ${hour} ${dom} ${month} *`;
}

/** A job is a one-off when it carries a `runAfter` instant or the `oneShot` flag. */
export function isOneOffJob(job: {
  oneShot?: boolean;
  runAfter?: string;
}): boolean {
  return (
    job.oneShot === true ||
    (typeof job.runAfter === "string" && job.runAfter.trim().length > 0)
  );
}

/**
 * True when an instant falls within a recurring series' `[since, until)` window.
 * `since` is an inclusive lower bound, `until` an exclusive upper bound; either
 * being absent means that side is unbounded. This is the single source of truth
 * shared by the calendar (which hides out-of-window occurrences) and the run
 * handler (which suppresses them server-side, since node-cron has no end-date).
 */
export function withinSeriesWindow(
  job: { since?: string; until?: string },
  when: Date | string,
): boolean {
  const t = (typeof when === "string" ? new Date(when) : when).getTime();
  if (Number.isNaN(t)) return true;
  if (job.since) {
    const s = new Date(job.since).getTime();
    if (!Number.isNaN(s) && t < s) return false;
  }
  if (job.until) {
    const u = new Date(job.until).getTime();
    if (!Number.isNaN(u) && t >= u) return false;
  }
  return true;
}

/**
 * Rewrite a recurring cron's time (minute+hour), optionally re-targeting the
 * weekday when a drag crosses into a different day column. Preserves the rest
 * of the cadence so the result re-parses cleanly in SchedulePicker.
 *
 * - `changedDay = false` (same column, new time): keep DOM/month/DOW, swap min+hour.
 * - `changedDay = true`  (week view, new weekday): collapse to a weekly pattern
 *   `${m} ${h} * * ${dow}` on the dropped weekday (cron DOW: 0=Sun..6=Sat).
 */
export function rescheduleCron(
  oldCron: string,
  newTime: Date,
  changedDay: boolean,
): string {
  const minute = newTime.getMinutes();
  const hour = newTime.getHours();
  if (changedDay) {
    return `${minute} ${hour} * * ${newTime.getDay()}`;
  }
  const parts = oldCron.trim().split(/\s+/);
  if (parts.length < 5) {
    // Malformed original — fall back to a daily cron at the new time.
    return `${minute} ${hour} * * *`;
  }
  return `${minute} ${hour} ${parts[2]} ${parts[3]} ${parts[4]}`;
}
