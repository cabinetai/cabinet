export const ALLOWED_EVENTS = [
  "app.launched",
  "app.exited",
  "onboarding.step",
  "onboarding.locale_autodetected",
  "onboarding.completed",
  "page.opened",
  "agent.run.started",
  "agent.run.completed",
  "agent.run.failed",
  "task.created",
  "task.completed",
  "doctor.run",
  "error.unhandled",
  "provider.verified",
  "cabinet.switched",
  "template.installed",
  "theme.changed",
] as const;

export type EventName = (typeof ALLOWED_EVENTS)[number];

export function isAllowedEvent(name: string): name is EventName {
  return (ALLOWED_EVENTS as readonly string[]).includes(name);
}

export type EventPayload = Record<string, string | number | boolean | null | undefined>;

/**
 * Per-event payload-key allowlists. Keys outside this list are stripped in
 * `emit()`, with a dev-only console.warn. Defends against a future PR
 * accidentally adding a path, prompt, or stack to a payload. When adding a new
 * key to an event, update both this map and TELEMETRY.md in the same commit.
 */
export const EVENT_PAYLOAD_KEYS: Record<EventName, readonly string[]> = {
  "app.launched": [],
  "app.exited": [],
  "onboarding.step": ["step"],
  "onboarding.locale_autodetected": ["locale"],
  "onboarding.completed": ["roomType", "provider"],
  "page.opened": ["ext"],
  "agent.run.started": ["provider", "adapterType"],
  "agent.run.completed": ["provider", "adapterType", "success", "durationMs"],
  "agent.run.failed": ["provider", "adapterType", "durationMs", "errorCode"],
  "task.created": ["source"],
  "task.completed": ["durationMs", "status"],
  "doctor.run": [],
  "error.unhandled": ["where", "errorCode"],
  "provider.verified": ["provider", "success", "durationMs"],
  "cabinet.switched": [],
  "template.installed": ["templateKind", "templateSlug"],
  "theme.changed": ["themeName"],
};
