import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type VaultModule = typeof import("./brain-vault-adapter");
let vault: VaultModule;

const envKeys = ["CABINET_DATA_DIR", "OPTALE_COMMAND_BRAIN_ORIGIN", "OPTALE_COMMAND_BRAIN_AUTH_MODE"] as const;
let originalEnv: Map<string, string | undefined>;

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-vault-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  delete process.env.OPTALE_COMMAND_BRAIN_ORIGIN;
  delete process.env.OPTALE_COMMAND_BRAIN_AUTH_MODE;

  await fs.writeFile(
    path.join(tempRoot, ".cabinet"),
    ["schemaVersion: 1", "id: vault-test", "name: Vault Test", "kind: root", ""].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tempRoot, "alpha.md"),
    ["---", "title: Alpha Plan", "---", "", "Alpha launch notes."].join("\n"),
    "utf8"
  );
  await fs.mkdir(path.join(tempRoot, "nested"), { recursive: true });
  await fs.writeFile(
    path.join(tempRoot, "nested", "beta.md"),
    "Beta memo with launch details.\n",
    "utf8"
  );
  await fs.mkdir(path.join(tempRoot, ".hidden"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, ".hidden", "secret.md"), "Hidden launch\n", "utf8");

  vault = await import("./brain-vault-adapter");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("readOptaleBrainVault returns contract-backed local Vault results", async () => {
  const response = await vault.readOptaleBrainVault({
    cabinetPath: ".",
    query: "launch",
    limit: 10,
    includeDownstream: false,
  });

  assert.equal(response.version, 1);
  assert.equal(response.source.id, "vault");
  assert.equal(response.source.source, "native");
  assert.equal(response.request.brain.dataRoot, "[server-side]");
  assert.equal(response.request.brain.secretsRef, "[configured]");
  assert.equal(response.stats.qmdEnabled, true);
  assert.equal(response.stats.downstreamCalls, 0);
  assert.equal(response.stats.scannedLocalFiles, 2);
  assert.deepEqual(
    response.documents.map((document) => document.path).sort(),
    ["alpha.md", "nested/beta.md"]
  );
  assert.ok(response.documents.every((document) => document.source === "local-vault"));
});

test("readLocalVaultDocuments clamps limits and ignores hidden files", async () => {
  const result = await vault.readLocalVaultDocuments({
    cabinetPath: ".",
    query: "launch",
    limit: 1,
  });

  assert.equal(result.scannedLocalFiles, 2);
  assert.equal(result.documents.length, 1);
  assert.notEqual(result.documents[0]?.path, ".hidden/secret.md");
});

test("redactBrainVaultTextForClient removes absolute server paths", () => {
  const redacted = vault.redactBrainVaultTextForClient(
    "Indexed /home/thor/AI-OS/file.md and /mnt/data/private/doc.md"
  );

  assert.equal(redacted.includes("/home/thor"), false);
  assert.equal(redacted.includes("/mnt/data"), false);
  assert.match(redacted, /\[server-path\]/);
});
