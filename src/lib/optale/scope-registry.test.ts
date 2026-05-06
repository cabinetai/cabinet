import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type ScopeRegistry = typeof import("./scope-registry");
let registry: ScopeRegistry;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-scope-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("inferCabinetOptaleScope gives root/system, personal folders/personal, and normal cabinets/company", () => {
  assert.equal(registry.inferCabinetOptaleScope("."), "system");
  assert.equal(registry.inferCabinetOptaleScope("personal/thor"), "personal");
  assert.equal(registry.inferCabinetOptaleScope("clients/acme"), "company");
});

test("read/write cabinet Optale scope metadata is file-backed", async () => {
  const saved = await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
    policyId: "policy-acme",
    memoryNamespace: "company:acme",
    companyBrainTargetId: "optale-acme",
    labels: ["client", "client"],
  });

  assert.equal(saved.cabinetPath, "clients/acme");
  assert.equal(saved.scope, "company");
  assert.equal(saved.source, "explicit");
  assert.equal(saved.companyId, "acme");
  assert.equal(saved.companyBrainTargetId, "optale-acme");
  assert.deepEqual(saved.labels, ["client"]);

  const reread = await registry.readCabinetOptaleScope("clients/acme");
  assert.equal(reread.scope, "company");
  assert.equal(reread.memoryNamespace, "company:acme");
  assert.equal(reread.companyBrainTargetId, "optale-acme");
});

test("agent Optale scope inherits cabinet scope unless persona frontmatter overrides it", async () => {
  await registry.writeCabinetOptaleScope("clients/acme", {
    scope: "company",
    companyId: "acme",
  });

  const inherited = await registry.resolveAgentOptaleScope({
    agentSlug: "researcher",
    cabinetPath: "clients/acme",
    frontmatter: {},
  });
  assert.equal(inherited.scope, "company");
  assert.equal(inherited.companyId, "acme");
  assert.equal(inherited.source, "inherited");
  assert.equal(inherited.inheritedFromCabinet, true);

  const explicit = await registry.resolveAgentOptaleScope({
    agentSlug: "personal-assistant",
    cabinetPath: "clients/acme",
    frontmatter: {
      optaleScope: "personal",
      optaleUserId: "user-1",
      optaleLabels: ["private"],
    },
  });
  assert.equal(explicit.scope, "personal");
  assert.equal(explicit.userId, "user-1");
  assert.deepEqual(explicit.labels, ["private"]);
  assert.equal(explicit.source, "explicit");
  assert.equal(explicit.inheritedFromCabinet, false);
});
