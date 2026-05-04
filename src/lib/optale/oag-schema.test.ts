import test from "node:test";
import assert from "node:assert/strict";
import {
  optaleOagActionContractForAction,
  optaleOagActionContractsForObjectType,
  optaleOagObjectSchemaForType,
  optaleOagObjectSchemaProjectionForType,
  optaleOagSchemaRefForObjectType,
} from "./oag-schema";

test("object schemas expose first-class fields, relationships, and actions", () => {
  const agent = optaleOagObjectSchemaForType("Agent");

  assert.equal(agent.schemaRef, "oag.schema.Agent.v0");
  assert.equal(agent.primaryKey, "canonicalId");
  assert.ok(agent.fields.some((field) => field.name === "slug"));
  assert.ok(agent.fields.some((field) => field.name === "visibility"));
  assert.ok(
    agent.relationships.some(
      (relationship) =>
        relationship.name === "assigned_tasks" &&
        relationship.targetTypes.includes("Task"),
    ),
  );
  assert.ok(agent.actions.includes("set_agent_active"));
});

test("action contracts describe targets, inputs, results, and approval", () => {
  const createTask = optaleOagActionContractForAction("create_task");

  assert.equal(createTask?.approval, "prompt");
  assert.deepEqual(createTask?.targetObjectTypes, ["Space", "Agent"]);
  assert.ok(createTask?.inputRefs.includes("toAgent"));
  assert.deepEqual(createTask?.resultObjectTypes, ["Task"]);
  assert.equal(optaleOagSchemaRefForObjectType("Run"), "oag.schema.Run.v0");
});

test("schema projections keep registry payloads compact", () => {
  const projection = optaleOagObjectSchemaProjectionForType("ActionType");

  assert.equal(projection.schemaRef, "oag.schema.ActionType.v0");
  assert.equal(projection.category, "action");
  assert.ok(projection.fieldCount > 0);
  assert.ok(projection.relationshipCount > 0);
  assert.ok(projection.actionCount > 0);
});

test("object type action lookup is driven by action contracts", () => {
  assert.deepEqual(
    optaleOagActionContractsForObjectType("Job").map((contract) => contract.action),
    ["run_job", "toggle_job"],
  );
});
