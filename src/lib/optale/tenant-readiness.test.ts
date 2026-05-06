import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleIdentitySnapshot } from "./identity-shared";
import { permissionsForOptaleRole } from "./identity-shared";

const ENV_KEYS = [
  "CABINET_DATA_DIR",
  "OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT",
  "OPTALE_BRAIN_FIXTURE_AUDIT_ROOT",
  "OPTALE_BRAIN_SEMANTIC_AUDIT_ROOT",
  "OPTALE_HARNESS_API_URL",
  "OPTALE_SLACK_ENABLED",
  "OPTALE_AZURE_WORKER_JOB",
  "OPTALE_GRAPH_NAMESPACE",
  "GRAPH_GROUP_ID",
  "OPTALE_ENTITY_NAMESPACE",
  "OPTALE_COMPANY_BRAIN_TARGET",
  "OPTALE_QMD_PROFILE",
  "OPTALE_GRAPH_PROFILE",
  "OPTALE_ENTITY_PROFILE",
  "OPTALE_MCP_CLIENT_PROFILE",
  "OPTALE_SECRETS_REF",
] as const;

let tempRoot: string;
let originalEnv: Map<string, string | undefined>;
type ReadinessModule = typeof import("./tenant-readiness");
type ScopeRegistryModule = typeof import("./scope-registry");
type MemberRegistryModule = typeof import("./member-registry");
let readiness: ReadinessModule;
let registry: ScopeRegistryModule;
let members: MemberRegistryModule;

function identity(
  provider: OptaleIdentitySnapshot["provider"] = "cabinet-password",
): OptaleIdentitySnapshot {
  return {
    authenticated: true,
    provider,
    source: provider === "authelia" ? "trusted-proxy" : "legacy-password",
    subject: "thor",
    email: "thor@optale.no",
    name: "Thor Haaland",
    groups: provider === "authelia" ? ["optale", "admin"] : ["local"],
    role: "admin",
    permissions: permissionsForOptaleRole("admin"),
  };
}

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT = path.join(tempRoot, ".members");
  process.env.OPTALE_BRAIN_FIXTURE_AUDIT_ROOT = path.join(tempRoot, ".fixtures");
  process.env.OPTALE_BRAIN_SEMANTIC_AUDIT_ROOT = path.join(tempRoot, ".semantic");
  process.env.OPTALE_HARNESS_API_URL = "https://harness.test";
  process.env.OPTALE_SLACK_ENABLED = "1";
  process.env.OPTALE_AZURE_WORKER_JOB = "agent-harness-ingest-worker";
}

async function writeScopes(): Promise<void> {
  await registry.writeCabinetOptaleScope(".", {
    scope: "company",
    companyId: "optale",
    ownerId: "optale-team",
    policyId: "optale-internal",
    memoryNamespace: "company:optale",
    companyBrainTargetId: "optale-company",
  });
  await registry.writeCabinetOptaleScope("personal/thor", {
    scope: "personal",
    companyId: "optale",
    userId: "thor",
    ownerId: "thor",
    policyId: "optale-internal",
    memoryNamespace: "personal:thor",
    companyBrainTargetId: "optale-company",
  });
}

async function writeCurrentAdmin(): Promise<void> {
  await members.createOptaleConsoleMember({
    principal: "Thor Haaland",
    email: "thor@optale.no",
    role: "admin",
  });
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-tenant-readiness-test-"));
  clearEnv();
  readiness = await import("./tenant-readiness");
  registry = await import("./scope-registry");
  members = await import("./member-registry");
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.mkdir(tempRoot, { recursive: true });
  clearEnv();
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("tenant readiness allows fixture rehearsal but warns before real partner onboarding", async () => {
  await writeScopes();
  await writeCurrentAdmin();

  const payload = await readiness.buildOptaleTenantReadinessPayload(identity(), {
    now: new Date("2026-05-05T21:20:00.000Z"),
    personalCabinetPath: "personal/thor",
  });

  assert.equal(payload.generatedAt, "2026-05-05T21:20:00.000Z");
  assert.equal(payload.readiness.fixtureRehearsalReady, true);
  assert.equal(payload.readiness.realOnboardingReady, false);
  assert.equal(payload.readiness.red, 0);
  assert.ok(payload.readiness.yellow >= 1);
  assert.equal(
    payload.checks.find((entry) => entry.id === "auth-provider-external")?.status,
    "yellow",
  );
  assert.equal(
    payload.checks.find((entry) => entry.id === "member-partner-ready")?.status,
    "yellow",
  );
});

test("tenant readiness reaches real onboarding green with external auth and partner member", async () => {
  await writeScopes();
  await writeCurrentAdmin();
  await members.createOptaleConsoleMember({
    principal: "Backup Admin",
    email: "backup@optale.no",
    role: "admin",
  });

  const payload = await readiness.buildOptaleTenantReadinessPayload(identity("authelia"), {
    personalCabinetPath: "personal/thor",
  });

  assert.equal(payload.readiness.fixtureRehearsalReady, true);
  assert.equal(payload.readiness.realOnboardingReady, true);
  assert.equal(payload.readiness.red, 0);
  assert.equal(payload.readiness.yellow, 0);
  assert.equal(payload.tenant.humanMembers, 2);
  assert.equal(payload.tenant.activeAdmins, 2);
});

test("tenant readiness blocks when explicit scopes are missing", async () => {
  await writeCurrentAdmin();

  const payload = await readiness.buildOptaleTenantReadinessPayload(identity("authelia"), {
    personalCabinetPath: "personal/thor",
  });

  assert.equal(payload.readiness.fixtureRehearsalReady, false);
  assert.equal(payload.readiness.realOnboardingReady, false);
  assert.ok(payload.readiness.red > 0);
  assert.equal(
    payload.checks.find((entry) => entry.id === "company-scope-explicit")?.status,
    "red",
  );
  assert.equal(
    payload.checks.find((entry) => entry.id === "brain-isolation-green")?.status,
    "red",
  );
});
