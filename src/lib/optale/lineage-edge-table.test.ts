import test from "node:test";
import assert from "node:assert/strict";
import { buildOptaleLineageEdgeTableFromCommandCenter } from "./lineage-edge-table";

test("buildOptaleLineageEdgeTable projects runs, decisions, and outputs", () => {
  const table = buildOptaleLineageEdgeTableFromCommandCenter({
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
              status: "dispatched",
              conversationId: "child-run-1",
              dispatchedAt: "2026-05-03T00:03:00.000Z",
            },
            {
              id: "action-4",
              action: {
                type: "SCHEDULE_JOB",
                agent: "research",
                name: "Weekly",
                schedule: "0 9 * * 1",
                prompt: "Prepare weekly notes.",
              },
              status: "dispatched",
              jobId: "job-1",
              dispatchedAt: "2026-05-03T00:04:00.000Z",
            },
          ],
        },
      ],
    } as never,
  });

  assert.equal(table.counts.byKind.produces_run, 5);
  assert.equal(table.counts.byKind.invokes, 5);
  assert.equal(table.counts.byKind.targets_agent, 5);
  assert.equal(table.counts.byKind.produces_decision, 5);
  assert.equal(table.counts.byKind.created_child_run, 1);
  assert.equal(table.counts.byKind.created_job, 1);
  assert.equal(table.counts.edges, 22);
  assert.equal(table.operationalSpine.bindingCount, 22);
  assert.equal(table.operationalSpine.capabilities.lineage_edge.active, 22);
  assert.ok(
    table.edges.some(
      (edge) =>
        edge.kind === "produces_decision" &&
        edge.runId === "pending:.:run-1:action-2" &&
        edge.policyDecisionId === "policy:pending:.:run-1:action-2",
    ),
  );
  assert.ok(
    table.edges.some(
      (edge) =>
        edge.kind === "created_child_run" &&
        edge.source.kind === "action_run" &&
        edge.target.kind === "conversation" &&
        edge.target.label === "child-run-1",
    ),
  );
  assert.ok(
    table.edges.some(
      (edge) =>
        edge.kind === "created_job" &&
        edge.source.kind === "action_run" &&
        edge.target.kind === "job" &&
        edge.target.label === "job-1",
    ),
  );
});
