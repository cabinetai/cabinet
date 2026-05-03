import test from "node:test";
import assert from "node:assert/strict";
import { buildOptaleActionRunLedger } from "./action-run-ledger";

test("buildOptaleActionRunLedger projects conversations and agent actions", () => {
  const ledger = buildOptaleActionRunLedger({
    commandCenter: {
      cabinet: { path: ".", name: "Root" },
      visibilityMode: "all",
      conversations: [
        {
          id: "run-1",
          agentSlug: "research",
          cabinetPath: ".",
          title: "Research run",
          trigger: "manual",
          status: "running",
          startedAt: "2026-05-03T00:00:00.000Z",
          promptPath: ".agents/.conversations/run-1/prompt.md",
          transcriptPath: ".agents/.conversations/run-1/transcript.md",
          mentionedPaths: [],
          artifactPaths: [],
          pendingActions: [
            {
              id: "action-1",
              createdAt: "2026-05-03T00:01:00.000Z",
              action: {
                type: "LAUNCH_TASK",
                agent: "copywriter",
                title: "Draft",
                prompt: "Draft a summary.",
              },
              warnings: [],
            },
            {
              id: "action-2",
              createdAt: "2026-05-03T00:02:00.000Z",
              action: {
                type: "SCHEDULE_JOB",
                agent: "unknown",
                name: "Followup",
                schedule: "* * * * *",
                prompt: "Follow up.",
              },
              warnings: [
                {
                  code: "unknown_agent",
                  severity: "hard",
                  message: "Missing agent.",
                },
              ],
            },
          ],
          dispatchedActions: [
            {
              id: "action-3",
              action: {
                type: "SCHEDULE_TASK",
                agent: "research",
                when: "tomorrow",
                title: "Check",
                prompt: "Check status.",
              },
              status: "rejected",
              reason: "invalid_when",
              dispatchedAt: "2026-05-03T00:03:00.000Z",
            },
          ],
        },
      ],
    } as never,
  });

  assert.equal(ledger.counts.runs, 4);
  assert.equal(ledger.counts.commandRuns, 1);
  assert.equal(ledger.counts.proposalRuns, 3);
  assert.equal(ledger.counts.pendingReview, 1);
  assert.equal(ledger.counts.blocked, 1);
  assert.equal(ledger.counts.rejected, 1);
  assert.equal(ledger.operationalSpine.bindingCount, 4);
  assert.equal(ledger.operationalSpine.capabilities.audit_event.active, 4);
  assert.equal(ledger.operationalSpine.capabilities.lineage_edge.active, 4);
  assert.ok(
    ledger.runs.some(
      (run) =>
        run.id === "pending:.:run-1:action-2" &&
        run.status === "blocked" &&
        run.operationalSpine.subjectType === "action_run" &&
        run.operationalSpine.refs.policy_decision.status === "active",
    ),
  );
});
