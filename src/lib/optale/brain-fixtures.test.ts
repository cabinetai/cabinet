import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleIdentitySnapshot } from "./identity-shared";

const ENV_KEYS = [
  "CABINET_DATA_DIR",
  "OPTALE_BRAIN_FIXTURE_AUDIT_ROOT",
] as const;

const ACTOR: OptaleIdentitySnapshot = {
  authenticated: true,
  provider: "local",
  source: "local-dev",
  subject: "thor",
  email: "thor@optale.no",
  name: "Thor Haaland",
  groups: ["local"],
  role: "admin",
  permissions: [],
};

let tempRoot: string;
let originalEnv: Map<string, string | undefined>;
type FixtureModule = typeof import("./brain-fixtures");
let fixtures: FixtureModule;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_BRAIN_FIXTURE_AUDIT_ROOT = path.join(tempRoot, ".fixture-audit");
}

function fixtureRoot(): string {
  return path.join(tempRoot, "company-brain", "canary", "2026-05-05");
}

before(async () => {
  originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-fixture-test-"));
  clearEnv();
  fixtures = await import("./brain-fixtures");
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

test("Brain fixture lifecycle starts absent", { concurrency: false }, async () => {
  const lifecycle = await fixtures.readOptaleBrainFixtureLifecycle();

  assert.equal(lifecycle.state.status, "absent");
  assert.equal(lifecycle.state.fixture.synthetic, true);
  assert.equal(lifecycle.state.counts.presentFiles, 0);
  assert.equal(lifecycle.state.safety.semanticDatasetTouched, false);
  assert.equal(lifecycle.counts.records, 0);
});

test("Brain fixture lifecycle seeds known synthetic company files", { concurrency: false }, async () => {
  const record = await fixtures.seedOptaleBrainCompanyFixture({ actor: ACTOR });
  const lifecycle = await fixtures.readOptaleBrainFixtureLifecycle();

  assert.equal(record.action, "fixture_seeded");
  assert.equal(record.status, "present");
  assert.equal(record.result.filesWritten, 4);
  assert.equal(record.result.realDataIncluded, false);
  assert.equal(lifecycle.state.status, "present");
  assert.equal(lifecycle.state.counts.expectedFiles, 4);
  assert.equal(lifecycle.state.counts.matchingFiles, 4);
  assert.equal(lifecycle.state.counts.unexpectedFiles, 0);
  assert.equal(lifecycle.state.manifest.present, true);
  assert.equal(lifecycle.records[0]?.id, record.id);
});

test("Brain fixture lifecycle removes only known synthetic company files", { concurrency: false }, async () => {
  await fixtures.seedOptaleBrainCompanyFixture({ actor: ACTOR });

  const record = await fixtures.removeOptaleBrainCompanyFixture({ actor: ACTOR });
  const lifecycle = await fixtures.readOptaleBrainFixtureLifecycle();

  assert.equal(record.action, "fixture_removed");
  assert.equal(record.status, "absent");
  assert.equal(record.result.filesRemoved, 4);
  assert.equal(record.result.semanticDatasetTouched, false);
  assert.equal(lifecycle.state.status, "absent");
  assert.equal(lifecycle.state.counts.presentFiles, 0);
  assert.equal(await exists(path.join(fixtureRoot(), "manifest.json")), false);
});

test("Brain fixture lifecycle refuses unexpected files", { concurrency: false }, async () => {
  await fixtures.seedOptaleBrainCompanyFixture({ actor: ACTOR });
  await fs.writeFile(path.join(fixtureRoot(), "unexpected.md"), "# Unexpected\n");

  await assert.rejects(
    () => fixtures.removeOptaleBrainCompanyFixture({ actor: ACTOR }),
    /unexpected files/,
  );

  const lifecycle = await fixtures.readOptaleBrainFixtureLifecycle();
  assert.equal(lifecycle.state.status, "dirty");
  assert.equal(lifecycle.state.counts.unexpectedFiles, 1);
});

test("Brain fixture lifecycle refuses modified expected files", { concurrency: false }, async () => {
  await fixtures.seedOptaleBrainCompanyFixture({ actor: ACTOR });
  await fs.writeFile(path.join(fixtureRoot(), "optale-console-canary.md"), "# Changed\n");

  await assert.rejects(
    () => fixtures.seedOptaleBrainCompanyFixture({ actor: ACTOR }),
    /modified expected files/,
  );

  await assert.rejects(
    () => fixtures.removeOptaleBrainCompanyFixture({ actor: ACTOR }),
    /modified expected files/,
  );
});

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}
