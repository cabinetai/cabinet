import test from "node:test";
import assert from "node:assert/strict";
import type { OptaleActionDefinition } from "@/lib/optale/action-registry";
import type { OptaleResourceRecord } from "@/lib/optale/resource-registry";
import type { OptaleActionRunRecord } from "@/lib/optale/action-run-ledger";
import type { OptaleAuditEventRecord } from "@/lib/optale/audit-event-log";
import type { OptaleLineageEdgeRecord } from "@/lib/optale/lineage-edge-table";
import type { OptalePolicyDecisionRecord } from "@/lib/optale/policy-decision-log";
import { buildOptaleOagObjectIdentity } from "@/lib/optale/oag-object-identity";
import {
  buildOagObjectCommandDraft,
  buildOagObjectReferenceIndex,
  buildOagObjectMatchKeys,
  resolveOagObjectReference,
  selectOagObjectActions,
  selectOagObjectRelationshipInstances,
  selectRelatedOagRecords,
} from "./oag-object-explorer-state";

function runFixture(
  input: Partial<OptaleActionRunRecord> & Pick<OptaleActionRunRecord, "id">,
): OptaleActionRunRecord {
  return {
    kind: "command",
    action: "launch_conversation",
    actionId: "command:launch_conversation",
    label: "Launch Conversation",
    status: "completed",
    source: "conversation",
    cabinetPath: ".",
    createdAt: "2026-05-03T10:00:00.000Z",
    warningCount: 0,
    hardBlocked: false,
    evidence: [],
    operationalSpine: {} as OptaleActionRunRecord["operationalSpine"],
    ...input,
  };
}

function policyFixture(
  input: Partial<OptalePolicyDecisionRecord> &
    Pick<OptalePolicyDecisionRecord, "id" | "subjectId">,
): OptalePolicyDecisionRecord {
  return {
    subjectType: "action_run",
    action: "launch_conversation",
    actionId: "command:launch_conversation",
    outcome: "allow",
    reasonCode: "command_run_allowed",
    explanation: "Allowed",
    actor: "command-center",
    cabinetPath: ".",
    evaluatedAt: "2026-05-03T10:01:00.000Z",
    evidence: [],
    operationalSpine: {} as OptalePolicyDecisionRecord["operationalSpine"],
    ...input,
  };
}

function edgeFixture(
  input: Partial<OptaleLineageEdgeRecord> &
    Pick<OptaleLineageEdgeRecord, "id" | "source" | "target">,
): OptaleLineageEdgeRecord {
  return {
    kind: "produces_run",
    cabinetPath: ".",
    createdAt: "2026-05-03T10:02:00.000Z",
    evidence: [],
    operationalSpine: {} as OptaleLineageEdgeRecord["operationalSpine"],
    ...input,
  };
}

function auditFixture(
  input: Partial<OptaleAuditEventRecord> &
    Pick<OptaleAuditEventRecord, "id" | "subjectType" | "subjectId">,
): OptaleAuditEventRecord {
  return {
    kind: "action_run_recorded",
    source: "action_run_ledger",
    severity: "info",
    actor: "command-center",
    cabinetPath: ".",
    occurredAt: "2026-05-03T10:03:00.000Z",
    summary: "Recorded",
    evidence: [],
    operationalSpine: {} as OptaleAuditEventRecord["operationalSpine"],
    ...input,
  };
}

function actionFixture(
  input: Partial<OptaleActionDefinition> &
    Pick<OptaleActionDefinition, "id" | "kind" | "action" | "label">,
): OptaleActionDefinition {
  return {
    description: input.label,
    category: "execution",
    risk: "write",
    status: "available",
    source: "command-center",
    executionPath: "POST /api/optale/command-center",
    inputs: [],
    facts: [],
    ...input,
  };
}

test("conversation object selects related run, policy, lineage, and audit records", () => {
  const conversation = {
    id: "conversation:.:run-1",
    kind: "conversation",
    label: "Run 1",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [],
  } satisfies OptaleResourceRecord;
  const run = runFixture({
    id: "command:.:run-1:launch_conversation",
    conversationId: "run-1",
  });
  const decision = policyFixture({
    id: `policy:${run.id}`,
    subjectId: run.id,
  });
  const edge = edgeFixture({
    id: "edge:run-1",
    runId: run.id,
    source: {
      kind: "conversation",
      id: conversation.id,
      label: "run-1",
    },
    target: {
      kind: "action_run",
      id: run.id,
      label: run.label,
    },
  });
  const event = auditFixture({
    id: `audit:policy:${decision.id}`,
    subjectType: "policy_decision",
    subjectId: decision.id,
  });

  const related = selectRelatedOagRecords(conversation, {
    runs: [run],
    policyDecisions: [decision],
    lineageEdges: [edge],
    auditEvents: [event],
  });

  assert.deepEqual(related.runs.map((item) => item.id), [run.id]);
  assert.deepEqual(related.policyDecisions.map((item) => item.id), [
    decision.id,
  ]);
  assert.deepEqual(related.lineageEdges.map((item) => item.id), [edge.id]);
  assert.deepEqual(related.auditEvents.map((item) => item.id), [event.id]);
});

test("agent object matches exact agent slug and agent lineage node only", () => {
  const agent = {
    id: "agent:local:writer",
    kind: "agent",
    label: "Writer",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const writerRun = runFixture({
    id: "command:.:writer-run:launch_conversation",
    conversationId: "writer-run",
    agentSlug: "writer",
  });
  const otherRun = runFixture({
    id: "command:.:other-run:launch_conversation",
    conversationId: "other-run",
    agentSlug: "analyst",
  });
  const writerEdge = edgeFixture({
    id: "edge:writer",
    runId: writerRun.id,
    source: {
      kind: "action_run",
      id: writerRun.id,
      label: writerRun.label,
    },
    target: {
      kind: "agent",
      id: "agent:writer",
      label: "writer",
    },
  });

  const related = selectRelatedOagRecords(agent, {
    runs: [writerRun, otherRun],
    policyDecisions: [],
    lineageEdges: [writerEdge],
    auditEvents: [],
  });

  assert.deepEqual(related.runs.map((item) => item.id), [writerRun.id]);
  assert.deepEqual(related.lineageEdges.map((item) => item.id), [
    writerEdge.id,
  ]);
});

test("action type object exposes command and proposal action ids as match keys", () => {
  const actionType = {
    id: "action-type:create_task",
    kind: "action_type",
    label: "Create Task",
    cabinetPath: ".",
    source: "command-center",
    facts: [{ label: "Action", value: "create_task" }],
  } satisfies OptaleResourceRecord;

  assert.deepEqual(buildOagObjectMatchKeys(actionType), [
    "action-type:create_task",
    "create_task",
    "command:create_task",
    "agent-proposal:create_task",
  ]);
});

test("reference index resolves lineage node ids to visible registry objects", () => {
  const conversation = {
    id: "conversation:.:run-1",
    kind: "conversation",
    label: "Run 1",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [],
  } satisfies OptaleResourceRecord;
  const agent = {
    id: "agent:local:writer",
    kind: "agent",
    label: "Writer",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const actionType = {
    id: "action-type:create_task",
    kind: "action_type",
    label: "Create Task",
    cabinetPath: ".",
    source: "command-center",
    facts: [{ label: "Action", value: "create_task" }],
  } satisfies OptaleResourceRecord;
  const run = runFixture({
    id: "command:.:run-1:launch_conversation",
    conversationId: "run-1",
    agentSlug: "writer",
  });
  const decision = policyFixture({
    id: `policy:${run.id}`,
    subjectId: run.id,
  });

  const index = buildOagObjectReferenceIndex(
    [conversation, agent, actionType],
    {
      runs: [run],
      policyDecisions: [decision],
    },
  );

  assert.equal(
    resolveOagObjectReference(index, ["agent:writer"])?.resourceId,
    agent.id,
  );
  assert.equal(
    resolveOagObjectReference(index, ["command:create_task"])?.resourceId,
    actionType.id,
  );
  assert.equal(resolveOagObjectReference(index, [run.id])?.resourceId, conversation.id);
  assert.equal(
    resolveOagObjectReference(index, [decision.id])?.resourceId,
    conversation.id,
  );
});

test("object action selection uses contextual actions and gated registry status", () => {
  const actions = [
    actionFixture({
      id: "command:create_task",
      kind: "command",
      action: "create_task",
      label: "Create Task",
      status: "unavailable",
    }),
    actionFixture({
      id: "command:set_agent_active",
      kind: "command",
      action: "set_agent_active",
      label: "Set Agent Active",
    }),
    actionFixture({
      id: "agent-proposal:LAUNCH_TASK",
      kind: "agent_proposal",
      action: "LAUNCH_TASK",
      label: "Launch Task",
      status: "enabled",
    }),
    actionFixture({
      id: "command:stop_conversation",
      kind: "command",
      action: "stop_conversation",
      label: "Stop Conversation",
    }),
  ];
  const agent = {
    id: "agent:local:writer",
    kind: "agent",
    label: "Writer",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "writer" }],
  } satisfies OptaleResourceRecord;

  const selected = selectOagObjectActions(agent, actions);

  assert.deepEqual(
    selected.map((action) => [action.id, action.status]),
    [
      ["command:create_task", "unavailable"],
      ["command:set_agent_active", "available"],
      ["agent-proposal:LAUNCH_TASK", "enabled"],
    ],
  );
});

test("object action selection can use OAG type schema metadata", () => {
  const actions = [
    actionFixture({
      id: "command:launch_conversation",
      kind: "command",
      action: "launch_conversation",
      label: "Launch Conversation",
    }),
    actionFixture({
      id: "command:create_task",
      kind: "command",
      action: "create_task",
      label: "Create Task",
    }),
  ];
  const source = {
    id: "brain-source:vault",
    kind: "brain_source",
    label: "Vault",
    cabinetPath: ".",
    source: "brain",
    facts: [],
    oag: buildOptaleOagObjectIdentity({
      resourceId: "brain-source:vault",
      resourceKind: "brain_source",
      resourceSource: "brain",
      cabinetPath: ".",
    }),
  } satisfies OptaleResourceRecord;

  assert.deepEqual(
    selectOagObjectActions(source, actions).map((action) => action.id),
    ["command:launch_conversation"],
  );
});

test("relationship instances expose concrete agent neighbors from facts and runs", () => {
  const agent = {
    id: "agent:local:writer",
    kind: "agent",
    label: "Writer",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const job = {
    id: "job:.::job::daily",
    kind: "job",
    label: "Daily job",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Owner", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const task = {
    id: "task:.:task-1",
    kind: "task",
    label: "Write memo",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "To", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const conversation = {
    id: "conversation:.:run-1",
    kind: "conversation",
    label: "Writer run",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Agent", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const run = runFixture({
    id: "command:.:run-1:launch_conversation",
    conversationId: "run-1",
    agentSlug: "writer",
  });

  const relationships = selectOagObjectRelationshipInstances(
    agent,
    [agent, job, task, conversation],
    {
      runs: [run],
    },
  );

  assert.deepEqual(
    relationships.map((relationship) => [
      relationship.name,
      relationship.target.resourceId,
      relationship.materializedBy,
    ]),
    [
      ["assigned_tasks", task.id, "resource_fact"],
      ["owns_jobs", job.id, "resource_fact"],
      ["produces_runs", conversation.id, "resource_fact"],
    ],
  );
});

test("relationship instances expose task, source, client, and run neighbors", () => {
  const agent = {
    id: "agent:local:research",
    kind: "agent",
    label: "Research",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "research" }],
  } satisfies OptaleResourceRecord;
  const conversation = {
    id: "conversation:.:run-1",
    kind: "conversation",
    label: "Research run",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Agent", value: "research" }],
  } satisfies OptaleResourceRecord;
  const task = {
    id: "task:.:task-1",
    kind: "task",
    label: "Map sources",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [
      { label: "To", value: "research" },
      { label: "Conversation", value: "run-1" },
    ],
  } satisfies OptaleResourceRecord;
  const source = {
    id: "brain-source:vault",
    kind: "brain_source",
    label: "Vault",
    cabinetPath: ".",
    source: "brain",
    facts: [{ label: "MCP", value: "knowledge-search" }],
  } satisfies OptaleResourceRecord;
  const server = {
    id: "mcp-server:knowledge-search",
    kind: "mcp_server",
    label: "Knowledge Search",
    cabinetPath: ".",
    source: "mcp",
    facts: [],
  } satisfies OptaleResourceRecord;
  const client = {
    id: "mcp-client:ops",
    kind: "mcp_client",
    label: "Ops Client",
    cabinetPath: ".",
    source: "mcp",
    facts: [],
  } satisfies OptaleResourceRecord;
  const policy = {
    id: "mcp-policy:.",
    kind: "mcp_policy",
    label: "MCP Policy",
    cabinetPath: ".",
    source: "mcp",
    facts: [],
  } satisfies OptaleResourceRecord;
  const actionType = {
    id: "action-type:launch_conversation",
    kind: "action_type",
    label: "Launch Conversation",
    cabinetPath: ".",
    source: "command-center",
    facts: [{ label: "Action", value: "launch_conversation" }],
  } satisfies OptaleResourceRecord;
  const run = runFixture({
    id: "command:.:run-1:launch_conversation",
    action: "launch_conversation",
    actionId: "command:launch_conversation",
    conversationId: "run-1",
    agentSlug: "research",
  });
  const decision = policyFixture({
    id: `policy:${run.id}`,
    subjectId: run.id,
    conversationId: "run-1",
  });
  const resources = [
    agent,
    conversation,
    task,
    source,
    server,
    client,
    policy,
    actionType,
  ];

  assert.deepEqual(
    selectOagObjectRelationshipInstances(task, resources, {}).map(
      (relationship) => [relationship.name, relationship.target.resourceId],
    ),
    [
      ["assigned_to", agent.id],
      ["linked_run", conversation.id],
    ],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(source, resources, {}).map(
      (relationship) => [relationship.name, relationship.target.resourceId],
    ),
    [["served_by", server.id]],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(client, resources, {}).map(
      (relationship) => [relationship.name, relationship.target.resourceId],
    ),
    [["governed_by", policy.id]],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(conversation, resources, {
      runs: [run],
      policyDecisions: [decision],
    }).map((relationship) => [relationship.name, relationship.target.resourceId]),
    [
      ["checked_by_policy", policy.id],
      ["executed_by", agent.id],
      ["invokes_action", actionType.id],
    ],
  );
});

test("source evidence materializes run source relationships", () => {
  const conversation = {
    id: "conversation:.:run-1",
    kind: "conversation",
    label: "Research run",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Agent", value: "research" }],
  } satisfies OptaleResourceRecord;
  const source = {
    id: "brain-source:vault",
    kind: "brain_source",
    label: "Vault",
    cabinetPath: ".",
    source: "brain",
    facts: [{ label: "MCP", value: "knowledge-search" }],
  } satisfies OptaleResourceRecord;
  const mcpConversation = {
    id: "conversation:.:run-2",
    kind: "conversation",
    label: "Tool run",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Agent", value: "research" }],
  } satisfies OptaleResourceRecord;
  const run = runFixture({
    id: "command:.:run-1:launch_conversation",
    conversationId: "run-1",
    agentSlug: "research",
    evidence: [
      { label: "Source", value: "brain-source:vault" },
      { label: "Source Path Count", value: 1 },
      { label: "Source Path", value: "docs/source-a.md" },
    ],
  });
  const mcpRun = runFixture({
    id: "command:.:run-2:launch_conversation",
    conversationId: "run-2",
    agentSlug: "research",
    evidence: [
      { label: "MCP Server", value: "knowledge-search" },
      { label: "MCP Source Path", value: "docs/tool-source.md" },
    ],
  });
  const resources = [conversation, mcpConversation, source];

  assert.deepEqual(buildOagObjectMatchKeys(source), [
    "brain-source:vault",
    "vault",
    "source:vault",
    "knowledge-search",
  ]);
  assert.deepEqual(
    selectRelatedOagRecords(source, {
      runs: [run, mcpRun],
      policyDecisions: [],
      lineageEdges: [],
      auditEvents: [],
    }).runs.map((item) => item.id),
    [run.id, mcpRun.id],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(conversation, resources, {
      runs: [run],
    }).map((relationship) => [
      relationship.name,
      relationship.target.resourceId,
      relationship.materializedBy,
    ]),
    [["uses_source", source.id, "lineage"]],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(mcpConversation, resources, {
      runs: [mcpRun],
    }).map((relationship) => [
      relationship.name,
      relationship.target.resourceId,
      relationship.evidence.find((item) => item.label === "MCP Source Path")
        ?.value,
    ]),
    [["uses_source", source.id, "docs/tool-source.md"]],
  );
  assert.deepEqual(
    selectOagObjectRelationshipInstances(source, resources, {
      runs: [run],
    }).map((relationship) => [
      relationship.name,
      relationship.direction,
      relationship.target.resourceId,
      relationship.evidence.find((item) => item.label === "Source Path")?.value,
    ]),
    [["used_by_runs", "inbound", conversation.id, "docs/source-a.md"]],
  );
});

test("object command drafts only execute when required context is available", () => {
  const launch = actionFixture({
    id: "command:launch_conversation",
    kind: "command",
    action: "launch_conversation",
    label: "Launch Conversation",
  });
  const createTask = actionFixture({
    id: "command:create_task",
    kind: "command",
    action: "create_task",
    label: "Create Task",
  });
  const operatorOnlyCreateTask = actionFixture({
    id: "command:create_task",
    kind: "command",
    action: "create_task",
    label: "Create Task",
    status: "unavailable",
    facts: [{ label: "Availability", value: "operator-only" }],
  });
  const agent = {
    id: "agent:local:writer",
    kind: "agent",
    label: "Writer",
    cabinetPath: ".",
    source: "agent-harness",
    facts: [{ label: "Slug", value: "writer" }],
  } satisfies OptaleResourceRecord;
  const space = {
    id: "space:.",
    kind: "space",
    label: "Home",
    cabinetPath: ".",
    source: "cabinet",
    facts: [],
  } satisfies OptaleResourceRecord;

  assert.deepEqual(buildOagObjectCommandDraft(agent, launch), {
    executable: true,
    buttonLabel: "Launch",
    payload: {
      action: "launch_conversation",
      cabinetPath: ".",
      agentSlug: "writer",
    },
    prompt: {
      field: "userMessage",
      label: "Message",
      placeholder: "Ask Writer to...",
    },
  });
  assert.equal(buildOagObjectCommandDraft(agent, createTask).executable, true);
  assert.equal(buildOagObjectCommandDraft(space, createTask).executable, false);
  assert.equal(
    buildOagObjectCommandDraft(agent, operatorOnlyCreateTask).disabledReason,
    "operator-only",
  );
});
