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
      "urgency": "high",
      "sourceType": "gmail",
      "sourceId": "message-123",
      "createdAt": "2026-07-18T15:30:00-07:00",
      "evidence": [{ "source": "gmail", "label": "Important email", "reference": "message-123", "occurredAt": "2026-07-18T15:30:00-07:00" }],
      "approval": { "state": "not_required", "runId": null, "requestId": null }
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
});

test("cockpit intake rejects prose without a JSON contract", () => {
  assert.throws(() => parseCockpitIntake("Here is your morning update.", "run_bad"), /JSON object/);
});

test("intake prompt enforces read-only behavior and explicit unavailable coverage", () => {
  const prompt = buildIntakePrompt({ now: "2026-07-18T16:00:00-07:00", timezone: "America/Vancouver", manualRisks: [], jobs: [], recentRuns: [] });
  assert.match(prompt, /Do not send, modify, schedule, approve, reject/);
  assert.match(prompt, /If Gmail or Calendar is unavailable/);
  assert.match(prompt, /gws gmail users messages list\/get/);
  assert.match(prompt, /Never use send, modify, insert, update, delete/);
  assert.match(prompt, /Return exactly one JSON object/);
});
