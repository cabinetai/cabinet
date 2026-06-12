export interface JobPostAction {
  action: "git_commit" | "update_page" | "notify";
  message?: string;
  path?: string;
  channel?: string;
}

export interface JobConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  provider: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  ownerAgent?: string;
  agentSlug?: string;
  workdir?: string;
  timeout?: number;
  prompt: string;
  on_complete?: JobPostAction[];
  on_failure?: JobPostAction[];
  cabinetPath?: string;
  createdAt: string;
  updatedAt: string;
  /** One-shot job: auto-disable after first successful fire. */
  oneShot?: boolean;
  /** ISO datetime this job was created to run at. Canonical instant for a
   *  one-off (the cron expression is just the trigger). */
  runAfter?: string;
  /** Per-occurrence exceptions (iCalendar EXDATE): ISO instants of recurring
   *  occurrences that have been moved/suppressed. The calendar hides these and
   *  the run handler skips them server-side. */
  exceptions?: string[];
  /** Recurring-series window bounds (iCalendar DTSTART / UNTIL). A recurring
   *  job emits no occurrences before `since` (inclusive lower bound) or at/after
   *  `until` (exclusive upper bound). Used by "this and following": the original
   *  series is capped with `until` at the split instant and a forked series is
   *  created carrying `since` at the same instant, so the two halves partition
   *  cleanly with no overlap. node-cron has no end-date, so the bounds are
   *  enforced in the run handler (like `exceptions`), not by the cron itself. */
  since?: string;
  until?: string;
  /** Conversation id that dispatched this job via an agent action. */
  ownerTaskId?: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  duration?: number;
  output: string;
}
