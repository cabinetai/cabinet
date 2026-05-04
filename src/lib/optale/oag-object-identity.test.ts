import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOptaleOagObjectIdentity,
  optaleOagObjectTypeForResourceKind,
} from "./oag-object-identity";

test("maps registry resource kinds to canonical OAG object types", () => {
  assert.equal(optaleOagObjectTypeForResourceKind("space"), "Space");
  assert.equal(optaleOagObjectTypeForResourceKind("conversation"), "Run");
  assert.equal(optaleOagObjectTypeForResourceKind("brain_source"), "Source");
  assert.equal(optaleOagObjectTypeForResourceKind("mcp_client"), "ToolClient");
  assert.equal(optaleOagObjectTypeForResourceKind("action_type"), "ActionType");
});

test("buildOptaleOagObjectIdentity derives scope, visibility, and memory lane", () => {
  assert.deepEqual(
    buildOptaleOagObjectIdentity({
      resourceId: "space:personal/thor",
      resourceKind: "space",
      resourceSource: "cabinet",
      cabinetPath: "personal/thor",
    }),
    {
      canonicalId: "oag:Space:space:personal/thor",
      objectType: "Space",
      objectId: "space:personal/thor",
      sourceRef: "space:personal/thor",
      sourceSystem: "cabinet",
      cabinetPath: "personal/thor",
      scope: "personal",
      visibility: "private",
      memoryLane: "partner_scoped_memory",
      temporalMode: "current_state",
      ontologyVersion: "oag-v0",
      schemaRef: "oag.schema.Space.v0",
    },
  );

  const system = buildOptaleOagObjectIdentity({
    resourceId: "action-type:review_actions",
    resourceKind: "action_type",
    resourceSource: "command-center",
    cabinetPath: ".",
  });
  assert.equal(system.scope, "system");
  assert.equal(system.visibility, "operator_only");
  assert.equal(system.memoryLane, "operator_company_brain");
});
