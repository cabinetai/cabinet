import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAgentDefinitionV2Preview,
  validateAgentDefinitionV2PreviewManifest,
  type AgentDefinitionV2Preview,
} from "./agent-definition-v2";
import {
  buildAgentDefinitionV2PreviewManifest,
  mapAgentDefinitionToV2Preview,
} from "./agent-definition-v2-preview";
import type { OptaleAgentScope } from "@/lib/optale/product";
import {
  OPTALE_META_AGENT_IDS,
  OPTALE_META_AGENT_MANIFEST,
} from "./optale-meta-manifest";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function previewFor(id: string): AgentDefinitionV2Preview {
  const agent = OPTALE_META_AGENT_MANIFEST.agents.find((entry) => entry.id === id);
  assert.ok(agent, `missing agent ${id}`);
  return mapAgentDefinitionToV2Preview(OPTALE_META_AGENT_MANIFEST, agent);
}

test("v2 preview manifest validates from the current v1 Harness manifest", () => {
  const previewManifest = buildAgentDefinitionV2PreviewManifest(
    OPTALE_META_AGENT_MANIFEST
  );
  const result = validateAgentDefinitionV2PreviewManifest(previewManifest);

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(previewManifest.schemaVersion, 2);
  assert.equal(previewManifest.sourceManifestId, OPTALE_META_AGENT_MANIFEST.id);
  assert.equal(previewManifest.agents.length, 9);
  assert.equal(
    previewManifest.agents[0].sourceDefinition.manifestSchemaVersion,
    OPTALE_META_AGENT_MANIFEST.schemaVersion
  );
});

test("v2 preview records Sense Memory bindings and Honcho as internal-only", () => {
  const preview = previewFor(OPTALE_META_AGENT_IDS.research);
  const result = validateAgentDefinitionV2Preview(preview);

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(preview.senseMemory.ingestion.provider, "cognee");
  assert.equal(preview.senseMemory.ingestion.status, "planned");
  assert.equal(preview.senseMemory.ontology.provider, "open-foundry-oag");
  assert.equal(preview.senseMemory.ontology.status, "bridge-only");
  assert.equal(preview.senseMemory.temporalFacts.provider, "graphiti");
  assert.equal(preview.senseMemory.temporalFacts.status, "bridge-only");
  assert.equal(
    preview.senseMemory.personalMemory.provider,
    "proprietary-personal-memory"
  );
  assert.equal(preview.senseMemory.personalMemory.replaces, "honcho");
  assert.equal(preview.senseMemory.internalLegacyMemory?.provider, "honcho");
  assert.equal(preview.senseMemory.internalLegacyMemory?.internalOnly, true);
  assert.equal(preview.senseMemory.internalLegacyMemory?.bridgeOnly, true);
  assert.equal(preview.scopeProfile.privacyBoundary, "system");
});

test("v2 validator enforces Honcho internal-only metadata", () => {
  const broken = clone(previewFor(OPTALE_META_AGENT_IDS.research));
  const legacy = broken.senseMemory.internalLegacyMemory as {
    internalOnly: boolean;
    status: string;
  };
  legacy.internalOnly = false;
  legacy.status = "bridge-only";

  const result = validateAgentDefinitionV2Preview(broken);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.path === "agent.senseMemory.internalLegacyMemory.internalOnly"
    ),
    JSON.stringify(result.issues, null, 2)
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.path === "agent.senseMemory.internalLegacyMemory.status"
    ),
    JSON.stringify(result.issues, null, 2)
  );
});

test("v2 validator accepts private, company, and system scope profile shapes", () => {
  const scopes: OptaleAgentScope[] = ["personal", "company", "system"];

  for (const scope of scopes) {
    const preview = clone(previewFor(OPTALE_META_AGENT_IDS.research));
    preview.scopeProfile.scope = scope;
    preview.scopeProfile.subjectType = scope;
    preview.scopeProfile.privacyBoundary =
      scope === "personal" ? "private" : scope;
    preview.scopeProfile.memoryNamespace = `optale.${scope}.memory`;
    preview.scopeProfile.vaultNamespace = `optale.${scope}.vault`;
    preview.scopeProfile.graphNamespace = `optale.${scope}.graph`;
    preview.scopeProfile.entityNamespace = `optale.${scope}.entities`;
    if (scope === "personal") preview.scopeProfile.userId = "user_test";
    if (scope === "company") preview.scopeProfile.companyId = "company_test";

    const result = validateAgentDefinitionV2Preview(preview);
    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  }

  const mismatched = clone(previewFor(OPTALE_META_AGENT_IDS.research));
  mismatched.scopeProfile.scope = "personal";
  mismatched.scopeProfile.subjectType = "company";
  mismatched.scopeProfile.privacyBoundary = "company";
  const result = validateAgentDefinitionV2Preview(mismatched);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((issue) => issue.path === "agent.scopeProfile.subjectType"),
    JSON.stringify(result.issues, null, 2)
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.path === "agent.scopeProfile.privacyBoundary"
    ),
    JSON.stringify(result.issues, null, 2)
  );
});

test("v2 validator keeps LibreChat projection metadata bridge-only", () => {
  const preview = previewFor(OPTALE_META_AGENT_IDS.codex);

  assert.equal(preview.projection.legacyLibreChatBridge?.status, "temporary-bridge");
  assert.equal(preview.projection.legacyLibreChatBridge?.bridgeOnly, true);
  assert.equal(preview.runtime.model, "gpt-5.4");
  assert.equal(preview.projection.legacyLibreChatBridge?.model, "gpt-5.5");

  const broken = clone(preview);
  const legacy = broken.projection.legacyLibreChatBridge as { bridgeOnly: boolean };
  legacy.bridgeOnly = false;

  const result = validateAgentDefinitionV2Preview(broken);

  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (issue) => issue.path === "agent.projection.legacyLibreChatBridge.bridgeOnly"
    ),
    JSON.stringify(result.issues, null, 2)
  );
});
