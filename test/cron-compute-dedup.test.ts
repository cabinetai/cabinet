import test from "node:test";
import assert from "node:assert/strict";
import { getScheduleEvents } from "@/lib/agents/cron-compute";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";

function makeAgent(overrides: Partial<CabinetAgentSummary> = {}): CabinetAgentSummary {
  return {
    scopedId: overrides.scopedId ?? ".::agent::calendar-keeper",
    name: "Calendar Keeper",
    slug: "calendar-keeper",
    emoji: "📅",
    role: "scheduler",
    active: true,
    department: "ops",
    type: "agent",
    heartbeat: "0 7 * * 1-5", // weekdays at 7am
    workspace: "",
    jobCount: 0,
    taskCount: 0,
    cabinetPath: ".",
    cabinetName: "Root",
    cabinetDepth: 0,
    inherited: false,
    ...overrides,
  };
}

test("getScheduleEvents emits one heartbeat event per cron occurrence", () => {
  const agent = makeAgent({ heartbeat: "0 7 * * 1-5" });
  // Mon 2026-04-20 → Sun 2026-04-26
  const start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 3, 27, 0, 0, 0));
  const events = getScheduleEvents([agent], [], start, end);
  // 0 7 * * 1-5 → 5 events over a Mon–Sun week
  assert.equal(events.length, 5, `expected 5 weekday events, got ${events.length}`);
});

test("getScheduleEvents dedups the same agent across multiple cabinet scopes (audit #070)", () => {
  // Same agent slug + same heartbeat exposed via 6 cabinets — pre-fix this
  // produced 5 occurrences × 6 cabinets = 30 stacked events, which is what
  // the audit observed as "the same week renders 6×".
  const cabinets = ["a", "b", "c", "d", "e", "f"];
  const agents = cabinets.map((c) =>
    makeAgent({
      scopedId: `${c}::agent::calendar-keeper`,
      cabinetPath: c,
      heartbeat: "0 7 * * 1-5",
    }),
  );
  const start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 3, 27, 0, 0, 0));
  const events = getScheduleEvents(agents, [], start, end);
  assert.equal(
    events.length,
    5,
    `expected 5 deduped weekday events, got ${events.length}`,
  );
});

test("getScheduleEvents keeps separate events when cron expressions differ", () => {
  // Two cabinets exposing the same slug but with different heartbeats —
  // those are genuinely different schedules; we should NOT dedup them.
  const a = makeAgent({
    scopedId: "a::agent::calendar-keeper",
    heartbeat: "0 7 * * 1-5",
  });
  const b = makeAgent({
    scopedId: "b::agent::calendar-keeper",
    heartbeat: "0 8 * * 1-5",
  });
  const start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 3, 27, 0, 0, 0));
  const events = getScheduleEvents([a, b], [], start, end);
  // 5 weekdays × 2 distinct schedules = 10 events
  assert.equal(events.length, 10);
});

test("getScheduleEvents dedups jobs with identical schedule + scopedId", () => {
  const owner = makeAgent({ heartbeat: undefined });
  const job: CabinetJobSummary = {
    scopedId: "root::job::nightly",
    id: "nightly",
    name: "Nightly digest",
    schedule: "0 22 * * *", // daily at 10pm
    enabled: true,
    ownerScopedId: owner.scopedId,
    ownerAgent: owner.slug,
    cabinetPath: ".",
    cabinetName: "Root",
  } as CabinetJobSummary;
  const start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const end = new Date(Date.UTC(2026, 3, 27, 0, 0, 0));
  // Pass the same job twice (could happen if the data layer ever
  // accidentally double-publishes a job for the same owner) — dedup by
  // sourceId + cron + time should collapse it.
  const events = getScheduleEvents([owner], [job, job], start, end);
  assert.equal(events.length, 7, `expected 7 daily events, got ${events.length}`);
});
