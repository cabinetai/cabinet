import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type ContractsModule = typeof import("./brain-contracts");
type ContextModule = typeof import("./brain-context");
type ScopeRegistryModule = typeof import("./scope-registry");
let contracts: ContractsModule;
let context: ContextModule;
let registry: ScopeRegistryModule;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-contracts-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  contracts = await import("./brain-contracts");
  context = await import("./brain-context");
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("buildProvisioningProfile never copies personal vault or memory by default", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
    policyId: "policy-acme",
    memoryNamespace: "company:acme",
  });
  const resolved = await context.resolveOptaleBrainContext("clients/acme");
  const profile = contracts.buildProvisioningProfile(resolved);

  assert.equal(profile.version, 1);
  assert.equal(profile.subjectType, "company");
  assert.equal(profile.companyId, "acme");
  assert.equal(profile.vaultNamespace, "vault:clients-acme");
  assert.equal(profile.memoryNamespace, "company:acme");
  assert.equal(profile.companyBrainTargetId, "optale-acme");
  assert.equal(profile.copyPersonalVault, false);
  assert.equal(profile.copyPersonalMemory, false);
});

test("buildPromotionBoundary encodes no automatic private-to-company writes", () => {
  const boundary = contracts.buildPromotionBoundary();

  assert.equal(boundary.privateToCompanyAutomaticWrite, false);
  assert.equal(boundary.browserDirectSourceWrites, false);
  assert.equal(boundary.companyWritesRequirePromotion, true);
  assert.equal(boundary.companyWritesRequireAgentReview, true);
  assert.equal(boundary.companyWritesRequireHumanApproval, true);
  assert.equal(boundary.companyWritesRequireReadBackVerification, true);
  assert.deepEqual(boundary.enabledWriteCapabilities, []);
});

test("normalizeBrainActorClaims intersects allowed scopes with Brain context", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
  });
  const resolved = await context.resolveOptaleBrainContext("clients/acme");
  const actor = contracts.normalizeBrainActorClaims(
    {
      actorType: "user",
      source: "command-jwt",
      actorId: "user-1",
      role: "admin",
      allowedScopes: ["company", "personal"],
      allowedTargetIds: ["optale-acme", "other-target"],
      requestId: "req-1",
    },
    resolved
  );

  assert.equal(actor.actorType, "user");
  assert.equal(actor.source, "command-jwt");
  assert.equal(actor.actorId, "user-1");
  assert.equal(actor.role, "admin");
  assert.equal(actor.tenantId, "acme");
  assert.deepEqual(actor.allowedScopes, ["company"]);
  assert.deepEqual(actor.allowedTargetIds, ["optale-acme"]);
  assert.equal(actor.requestId, "req-1");
});

test("buildSystemBrainActor uses minimum current-scope access", async () => {
  const resolved = await context.resolveOptaleBrainContext(".");
  const actor = contracts.buildSystemBrainActor(resolved, "req-system");

  assert.equal(actor.actorType, "system");
  assert.deepEqual(actor.allowedScopes, ["system"]);
  assert.deepEqual(actor.allowedTargetIds, []);
  assert.equal(actor.requestId, "req-system");
});
