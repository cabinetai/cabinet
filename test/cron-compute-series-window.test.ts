import test from "node:test";
import assert from "node:assert/strict";
import { getScheduleEvents } from "@/lib/agents/cron-compute";
import { withinSeriesWindow } from "@/lib/agents/one-off";
import type { CabinetAgentSummary, CabinetJobSummary } from "@/types/cabinets";

// "This and following" splits a recurring series at an instant: the original
// series is capped with `until` (exclusive) and a fork carries `since`
// (inclusive). These tests pin the window math that keeps the two halves from
// overlapping. Dates are built in LOCAL time so the local-hour cron matcher and
// the instant bounds are interpreted in the same timezone on any machine.

function owner(): CabinetAgentSummary {
  return {
    scopedId: ".::agent::planner",
    name: "Planner",
    slug: "planner",
    emoji: "🗓️",
    role: "ops",
    active: true,
    department: "ops",
    type: "agent",
    heartbeat: undefined,
    workspace: "",
    jobCount: 0,
    taskCount: 0,
    cabinetPath: ".",
    cabinetName: "Root",
    cabinetDepth: 0,
    inherited: false,
  };
}

function job(overrides: Partial<CabinetJobSummary>): CabinetJobSummary {
  return {
    scopedId: "root::job::x",
    id: "x",
    name: "Daily standup",
    schedule: "0 9 * * *",
    enabled: true,
    ownerScopedId: ".::agent::planner",
    ownerAgent: "planner",
    cabinetPath: ".",
    cabinetName: "Root",
    cabinetDepth: 0,
    inherited: false,
    ...overrides,
  } as CabinetJobSummary;
}

// 7-day local window: Jun 8 00:00 → Jun 15 00:00, 2026.
const start = new Date(2026, 5, 8, 0, 0, 0);
const end = new Date(2026, 5, 15, 0, 0, 0);
// Split at Jun 11 09:00 (the dragged occurrence's original instant).
const split = new Date(2026, 5, 11, 9, 0, 0).toISOString();
const dayOf = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local

test("withinSeriesWindow: until is an exclusive upper bound", () => {
  const before = new Date(2026, 5, 10, 9, 0, 0).toISOString();
  const after = new Date(2026, 5, 12, 9, 0, 0).toISOString();
  assert.equal(withinSeriesWindow({ until: split }, before), true);
  assert.equal(withinSeriesWindow({ until: split }, split), false); // exclusive
  assert.equal(withinSeriesWindow({ until: split }, after), false);
});

test("withinSeriesWindow: since is an inclusive lower bound", () => {
  const before = new Date(2026, 5, 10, 9, 0, 0).toISOString();
  const after = new Date(2026, 5, 12, 9, 0, 0).toISOString();
  assert.equal(withinSeriesWindow({ since: split }, before), false);
  assert.equal(withinSeriesWindow({ since: split }, split), true); // inclusive
  assert.equal(withinSeriesWindow({ since: split }, after), true);
});

test("withinSeriesWindow: open bounds are unbounded", () => {
  assert.equal(withinSeriesWindow({}, split), true);
});

test("capped series (until) emits only occurrences before the split", () => {
  const capped = job({ until: split }); // daily 9:00, ends at Jun 11 09:00
  const events = getScheduleEvents([owner()], [capped], start, end);
  // Jun 8, 9, 10 at 09:00 — Jun 11 09:00 is excluded, Jun 12-14 too.
  assert.equal(events.length, 3, `expected 3, got ${events.length}`);
  assert.ok(events.every((e) => new Date(e.time).getTime() < new Date(split).getTime()));
});

test("forked series (since) emits nothing before the split — no backward leak", () => {
  // Fork cadence shifted to 14:30; without `since` a daily cron would paint
  // Jun 8-10 at 14:30 too, double-booking days the original still owns.
  const leaky = job({ scopedId: "root::job::fork", id: "fork", schedule: "30 14 * * *" });
  const fork = job({
    scopedId: "root::job::fork",
    id: "fork",
    schedule: "30 14 * * *",
    since: split,
  });
  const leakyEvents = getScheduleEvents([owner()], [leaky], start, end);
  const forkEvents = getScheduleEvents([owner()], [fork], start, end);
  assert.equal(leakyEvents.length, 7, "control: unbounded fork paints all 7 days");
  // With since: Jun 11, 12, 13, 14 at 14:30 → 4 events.
  assert.equal(forkEvents.length, 4, `expected 4, got ${forkEvents.length}`);
  assert.ok(forkEvents.every((e) => new Date(e.time).getTime() >= new Date(split).getTime()));
});

test("split halves partition the week with no day double-booked", () => {
  const capped = job({ scopedId: "root::job::orig", id: "orig", until: split });
  const fork = job({
    scopedId: "root::job::fork",
    id: "fork",
    schedule: "30 14 * * *",
    since: split,
  });
  const events = getScheduleEvents([owner()], [capped, fork], start, end);
  assert.equal(events.length, 7, `expected 7 total, got ${events.length}`);
  const origDays = new Set(
    events.filter((e) => e.sourceId === "root::job::orig").map((e) => dayOf(new Date(e.time))),
  );
  const forkDays = new Set(
    events.filter((e) => e.sourceId === "root::job::fork").map((e) => dayOf(new Date(e.time))),
  );
  const overlap = [...origDays].filter((d) => forkDays.has(d));
  assert.deepEqual(overlap, [], `no day should appear in both halves, got ${overlap}`);
});
