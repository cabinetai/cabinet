import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOptaleCompanyBrainReviewerAddon } from "./brain-company-brain-addon";
import type { OptaleBrainContext } from "./brain-context";
import type { OptaleCabinetScopeMetadata } from "./scope-registry";

const context: OptaleBrainContext = {
  subjectType: "personal",
  tenantId: "optale",
  companyId: "optale",
  personId: "thor",
  ownerId: "thor",
  cabinetPath: ".",
  dataRoot: "[server-side]",
  vaultNamespace: "vault:root",
  memoryNamespace: "thor-individual",
  graphNamespace: "thor-individual",
  entityNamespace: "personal:thor",
  qmdProfile: "thor",
  graphProfile: "thor",
  entityProfile: "thor",
  companyBrainTargetId: "optale-global",
  mcpPolicyId: "optale-thor",
  mcpClientProfile: "thor",
  secretsRef: "thor",
  allowedScopes: ["personal"],
  source: "explicit",
};

const scope: OptaleCabinetScopeMetadata = {
  cabinetPath: ".",
  scope: "personal",
  source: "explicit",
  ownerId: "thor",
  userId: "thor",
  companyId: "optale",
  policyId: "optale-thor",
  memoryNamespace: "thor-individual",
  companyBrainTargetId: "optale-global",
};

test("Company Brain reviewer add-on is disabled by default", () => {
  const addon = evaluateOptaleCompanyBrainReviewerAddon({
    context,
    scope,
    env: {},
  });

  assert.equal(addon.enabled, false);
  assert.equal(addon.source, "disabled");
  assert.equal(addon.targetId, "optale-global");
});

test("Company Brain reviewer add-on can be enabled by scope label", () => {
  const addon = evaluateOptaleCompanyBrainReviewerAddon({
    context,
    scope: { ...scope, labels: ["personal-brain", "company-brain-reviewer"] },
    env: {},
  });

  assert.equal(addon.enabled, true);
  assert.equal(addon.source, "scope-label");
});

test("Company Brain reviewer add-on can be enabled by scoped allowlist", () => {
  const addon = evaluateOptaleCompanyBrainReviewerAddon({
    context,
    scope,
    env: { OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW: "user:thor,target:other" },
  });

  assert.equal(addon.enabled, true);
  assert.equal(addon.source, "env-allowlist");
});

test("Company Brain reviewer global disable wins over labels and allowlist", () => {
  const addon = evaluateOptaleCompanyBrainReviewerAddon({
    context,
    scope: { ...scope, labels: ["company-brain-reviewer"] },
    env: {
      OPTALE_COMPANY_BRAIN_REVIEWER_ENABLED: "false",
      OPTALE_COMPANY_BRAIN_REVIEWER_ALLOW: "user:thor",
    },
  });

  assert.equal(addon.enabled, false);
  assert.equal(addon.source, "disabled");
});
