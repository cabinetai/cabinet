import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
type BrainSummary = typeof import("./brain-summary");
let brain: BrainSummary;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-summary-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;

  await fs.writeFile(
    path.join(tempRoot, ".cabinet"),
    [
      "schemaVersion: 1",
      "id: brain-test",
      "name: Brain Test",
      "kind: root",
      "",
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(tempRoot, "index.md"), "# Brain Test\n", "utf8");
  await fs.mkdir(path.join(tempRoot, "notes"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "notes", "brief.md"), "Brief\n", "utf8");
  await fs.writeFile(path.join(tempRoot, "notes", "data.csv"), "a,b\n", "utf8");
  await fs.mkdir(path.join(tempRoot, ".agents", "editor", "memory"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(tempRoot, ".agents", "editor", "persona.md"),
    [
      "---",
      "name: Editor",
      "role: Editor",
      "provider: claude-code",
      "active: false",
      "---",
      "Editor.",
      "",
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tempRoot, ".agents", "editor", "memory", "context.md"),
    "Memory\n",
    "utf8"
  );

  brain = await import("./brain-summary");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("readOptaleBrainSummary returns vault, memory, policy, and source status", async () => {
  const summary = await brain.readOptaleBrainSummary(".");

  assert.equal(summary.cabinet.name, "Brain Test");
  assert.equal(summary.cabinet.scope.scope, "system");
  assert.equal(summary.context.subjectType, "system");
  assert.equal(summary.context.cabinetPath, ".");
  assert.equal(summary.context.vaultNamespace, "vault:root");
  assert.equal(summary.counts.files, 3);
  assert.equal(summary.counts.markdown, 2);
  assert.equal(summary.counts.memoryFiles, 1);
  assert.equal(summary.counts.agents, 1);
  assert.equal(summary.mcpPolicy.defaultDecision, "deny");
  assert.ok(summary.mcpPolicy.enabledServers > 0);
  assert.ok(summary.sources.find((source) => source.id === "vault"));
  assert.equal(
    summary.sources.find((source) => source.id === "vault")?.status,
    "enabled"
  );
  assert.equal(
    summary.sources.some((source) => "mcpServerId" in source),
    false
  );
  assert.equal(JSON.stringify(summary).includes("qmd__"), false);
  assert.equal(JSON.stringify(summary).includes("graphiti__"), false);
});
