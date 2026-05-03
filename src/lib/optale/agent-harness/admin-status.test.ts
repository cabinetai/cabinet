import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { buildAgentHarnessAdminSnapshot } from "./admin-status";
import type { AgentDefinitionManifest } from "./agent-definition";
import {
  OPTALE_META_AGENT_IDS,
  OPTALE_META_AGENT_MANIFEST,
} from "./optale-meta-manifest";
import {
  mapAgentDefinitionToPersona,
  renderProjectedPersonaMarkdown,
} from "./persona-projection";

function singleAgentManifest(id: string): AgentDefinitionManifest {
  const agent = OPTALE_META_AGENT_MANIFEST.agents.find((entry) => entry.id === id);
  assert.ok(agent, `missing agent ${id}`);
  return {
    ...OPTALE_META_AGENT_MANIFEST,
    agents: [agent],
  };
}

async function writeProjectedPersona(input: {
  manifest: AgentDefinitionManifest;
  targetAgentsDir: string;
  mutate?: (data: Record<string, unknown>) => void;
}) {
  const agent = input.manifest.agents[0];
  const document = mapAgentDefinitionToPersona(input.manifest, agent, {
    projectedAt: "2026-05-02T00:00:00.000Z",
  });
  const targetPath = path.join(input.targetAgentsDir, document.slug, "persona.md");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  if (!input.mutate) {
    await fs.writeFile(targetPath, renderProjectedPersonaMarkdown(document), "utf8");
    return targetPath;
  }

  const parsed = matter(renderProjectedPersonaMarkdown(document));
  input.mutate(parsed.data as Record<string, unknown>);
  await fs.writeFile(targetPath, matter.stringify(parsed.content, parsed.data), "utf8");
  return targetPath;
}

test("Harness admin snapshot marks missing generated personas", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-harness-admin-"));
  try {
    const manifest = singleAgentManifest(OPTALE_META_AGENT_IDS.research);
    const snapshot = await buildAgentHarnessAdminSnapshot({
      manifest,
      targetAgentsDir: path.join(tempRoot, ".agents"),
    });

    assert.equal(snapshot.rows.length, 1);
    assert.equal(snapshot.rows[0].definitionId, OPTALE_META_AGENT_IDS.research);
    assert.equal(snapshot.rows[0].projection.slug, "optale-research-context");
    assert.equal(snapshot.rows[0].persona.exists, false);
    assert.equal(snapshot.rows[0].status, "missing");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("Harness admin snapshot marks stable generated personas in sync", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-harness-admin-"));
  try {
    const targetAgentsDir = path.join(tempRoot, ".agents");
    const manifest = singleAgentManifest(OPTALE_META_AGENT_IDS.research);
    await writeProjectedPersona({ manifest, targetAgentsDir });

    const snapshot = await buildAgentHarnessAdminSnapshot({
      manifest,
      targetAgentsDir,
    });
    const row = snapshot.rows[0];

    assert.equal(row.status, "in_sync");
    assert.deepEqual(row.issues, []);
    assert.equal(row.persona.exists, true);
    assert.equal(row.persona.active, false);
    assert.equal(row.persona.state, "paused");
    assert.equal(row.persona.provider, "openrouter");
    assert.equal(row.persona.model, "anthropic/claude-sonnet-4");
    assert.equal(row.mcp.allowedServerCount, manifest.agents[0].mcp.servers.length);
    assert.equal(row.framework.schemaVersion, 2);
    assert.equal(row.framework.scopeProfile.scope, "system");
    assert.equal(row.framework.scopeProfile.privacyBoundary, "system");
    assert.equal(
      row.framework.scopeProfile.promotionBoundary,
      "private-to-company gated"
    );
    assert.equal(row.framework.senseMemory.cognee, "planned");
    assert.equal(row.framework.senseMemory.openFoundryOag, "bridge-only");
    assert.equal(row.framework.senseMemory.graphiti, "bridge-only");
    assert.equal(row.framework.senseMemory.proprietaryPersonalMemory, "planned");
    assert.equal(row.framework.senseMemory.honchoInternalOnly, true);
    assert.equal(row.framework.bridgeOnly, true);
    assert.equal(row.framework.runtimeStatus, "planned");
    assert.equal(
      row.legacyLibreChatBridge?.agentId,
      "agent_optale_meta_research"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("Harness admin snapshot reports drift unknown for changed stable fields", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-harness-admin-"));
  try {
    const targetAgentsDir = path.join(tempRoot, ".agents");
    const manifest = singleAgentManifest(OPTALE_META_AGENT_IDS.research);
    await writeProjectedPersona({
      manifest,
      targetAgentsDir,
      mutate(data) {
        data.provider = "claude-code";
        data.active = true;
      },
    });

    const snapshot = await buildAgentHarnessAdminSnapshot({
      manifest,
      targetAgentsDir,
    });
    const row = snapshot.rows[0];

    assert.equal(row.status, "drift_unknown");
    assert.equal(row.persona.exists, true);
    assert.equal(row.persona.active, true);
    assert.ok(row.issues.includes("provider mismatch"));
    assert.ok(row.issues.includes("active mismatch"));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
