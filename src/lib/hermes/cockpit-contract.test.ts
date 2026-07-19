import assert from "node:assert/strict";
import test from "node:test";
import { buildIntakePrompt, parseCockpitIntake } from "./cockpit-contract";

test("cockpit intake normalizes decisions and source coverage from fenced Hermes JSON", () => {
  const output = `\`\`\`json
  {
    "generatedAt": "2026-07-18T16:00:00-07:00",
    "sourceCoverage": {
      "gmail": { "status": "connected", "message": "2 important messages", "evidenceCount": 2 },
      "calendar": { "status": "unavailable", "message": "No connector", "evidenceCount": 0 },
      "hermesJobs": { "status": "connected", "message": "1 job", "evidenceCount": 1 },
      "manualRisks": { "status": "connected", "message": "1 risk", "evidenceCount": 1 },
      "supermemory": { "status": "connected", "message": "Healthy", "evidenceCount": 1 }
    },
    "cards": [{
      "kind": "needs_jeremy",
      "title": "Approve client response",
      "summary": "A reply is due today.",
      "whyItMatters": "The client is blocked.",
      "recommendedNextStep": "Review the draft.",
      "relatedItemCount": 2,
      "relatedItemDates": ["2026-07-17T15:30:00-07:00", "2026-07-18T15:30:00-07:00"],
      "missingFacts": ["Exact balance", "Specific due date"],
      "contextNotes": ["Two reminders were grouped"],
      "rankingRationale": "A payment obligation requires operator action.",
      "urgency": "high",
      "sourceType": "gmail",
      "sourceId": "message-123",
      "createdAt": "2026-07-18T15:30:00-07:00",
      "evidence": [{ "source": "gmail", "label": "Important email", "reference": "message-123", "occurredAt": "2026-07-18T15:30:00-07:00" }],
      "approval": { "state": "not_required", "runId": null, "requestId": null }
    }],
    "potentiallyMissed": [{
      "title": "Inventory alert",
      "sourceType": "gmail",
      "sourceId": "inventory-1",
      "whyPotentiallyMissed": "Activity status is unknown.",
      "reviewQuestion": "Is this inventory still active?",
      "createdAt": "2026-07-18T15:00:00-07:00",
      "evidence": []
    }]
  }
  \`\`\``;
  const snapshot = parseCockpitIntake(output, "run_123");
  assert.equal(snapshot.runId, "run_123");
  assert.equal(snapshot.sourceCoverage.gmail.status, "connected");
  assert.equal(snapshot.sourceCoverage.calendar.status, "unavailable");
  assert.equal(snapshot.cards.length, 1);
  assert.equal(snapshot.cards[0]?.kind, "needs_jeremy");
  assert.equal(snapshot.cards[0]?.sourceId, "message-123");
  assert.equal(snapshot.cards[0]?.evidence[0]?.reference, "message-123");
  assert.equal(snapshot.cards[0]?.relatedItemCount, 2);
  assert.deepEqual(snapshot.cards[0]?.missingFacts, ["Exact balance", "Specific due date"]);
  assert.equal(snapshot.cards[0]?.rankingRationale, "A payment obligation requires operator action.");
  assert.equal(snapshot.potentiallyMissed?.[0]?.sourceId, "inventory-1");
});

test("cockpit intake rejects prose without a JSON contract", () => {
  assert.throws(() => parseCockpitIntake("Here is your morning update.", "run_bad"), /JSON object/);
});

test("cockpit intake clamps a future-skewed generated timestamp to run time", () => {
  const runTime = new Date("2026-07-19T04:55:35Z");
  const output = `{"generatedAt":"2026-07-19T11:53:29Z","sourceCoverage":{},"cards":[],"potentiallyMissed":[]}`;
  const snapshot = parseCockpitIntake(output, "run_future", runTime);
  assert.equal(snapshot.generatedAt, runTime.toISOString());
});

test("cockpit intake narrowly repairs an extra delimiter after ranking rationale", () => {
  const output = `{"generatedAt":"2026-07-19T04:48:43Z","sourceCoverage":{},"cards":[{"kind":"needs_jeremy","title":"Review account","sourceType":"gmail","sourceId":"message-1","rankingRationale":"This outranked routine receipts."],"evidence":[],"approval":{"state":"not_required","runId":null,"requestId":null}}],"potentiallyMissed":[]}`;
  const snapshot = parseCockpitIntake(output, "run_repaired");
  assert.equal(snapshot.cards[0]?.rankingRationale, "This outranked routine receipts.");
});

test("cockpit intake narrowly repairs a missing colon on missingFacts", () => {
  const output = `{"generatedAt":"2026-07-19T04:53:29Z","sourceCoverage":{},"cards":[{"kind":"needs_jeremy","title":"Review meeting","sourceType":"calendar","sourceId":"event-1","missingFacts"["Agenda"],"evidence":[],"approval":{"state":"not_required","runId":null,"requestId":null}}],"potentiallyMissed":[]}`;
  const snapshot = parseCockpitIntake(output, "run_repaired_colon");
  assert.deepEqual(snapshot.cards[0]?.missingFacts, ["Agenda"]);
});

test("cockpit intake narrowly repairs a missing quote and colon on missingFacts", () => {
  const output = `{"generatedAt":"2026-07-19T04:53:29Z","sourceCoverage":{},"cards":[{"kind":"needs_jeremy","title":"Review meeting","sourceType":"calendar","sourceId":"event-1","missingFacts["Agenda"],"evidence":[],"approval":{"state":"not_required","runId":null,"requestId":null}}],"potentiallyMissed":[]}`;
  const snapshot = parseCockpitIntake(output, "run_repaired_quote_colon");
  assert.deepEqual(snapshot.cards[0]?.missingFacts, ["Agenda"]);
});

test("cockpit intake limits missing array separators to named schema fields", () => {
  const output = `{"generatedAt":"2026-07-19T04:53:29Z","sourceCoverage":{},"cards":[{"kind":"needs_jeremy","title":"Review meeting","sourceType":"calendar","sourceId":"event-1","contextNotes["Recurring series"],"evidence":[],"approval":{"state":"not_required","runId":null,"requestId":null}}],"potentiallyMissed":[]}`;
  const snapshot = parseCockpitIntake(output, "run_repaired_named_array");
  assert.deepEqual(snapshot.cards[0]?.contextNotes, ["Recurring series"]);
});

test("intake prompt enforces read-only behavior and explicit unavailable coverage", () => {
  const prompt = buildIntakePrompt({ now: "2026-07-18T16:00:00-07:00", timezone: "America/Vancouver", manualRisks: [], jobs: [], recentRuns: [] });
  assert.match(prompt, /Do not send, modify, schedule, approve, reject/);
  assert.match(prompt, /If a live operation fails authentication/);
  assert.match(prompt, /gws gmail users messages list\/get/);
  assert.match(prompt, /Never use send, modify, insert, update, delete/);
  assert.match(prompt, /Freshness is mandatory/);
  assert.match(prompt, /Never inspect credential files/);
  assert.match(prompt, /Do not pipe, redirect, interpolate/);
  assert.match(prompt, /must not request a governed shell approval/);
  assert.match(prompt, /manual risk is canonical/);
  assert.match(prompt, /Never recommend creating, copying, duplicating, or storing a Supermemory entry/);
  assert.match(prompt, /fee type or amount is absent/);
  assert.match(prompt, /connected_empty/);
  assert.match(prompt, /potentiallyMissed/);
  assert.match(prompt, /next seven days/);
  assert.match(prompt, /Return exactly one syntactically valid JSON object/);
  assert.match(prompt, /full response parses as JSON/);
});
