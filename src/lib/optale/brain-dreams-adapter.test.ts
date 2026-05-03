import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type DreamsModule = typeof import("./brain-dreams-adapter");
type ScopeRegistryModule = typeof import("./scope-registry");

let tempRoot: string;
let dreams: DreamsModule;
let registry: ScopeRegistryModule;

const envKeys = [
  "CABINET_DATA_DIR",
  "OPTALE_DREAMS_API_URL",
  "OPTALE_VAULT_APP_URL",
  "DOCS_API_BASE",
  "BRAIN_DOCS_API_BASE",
  "VAULT_API_BASE",
  "OPTALE_COMMAND_BRAIN_ORIGIN",
  "OPTALE_COMMAND_BRAIN_AUTH_MODE",
] as const;
let originalEnv: Map<string, string | undefined>;

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-dreams-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  for (const key of envKeys) {
    if (key !== "CABINET_DATA_DIR") delete process.env[key];
  }
  dreams = await import("./brain-dreams-adapter");
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("normalizeDreamProposals normalizes and redacts proposal payloads", () => {
  const proposals = dreams.normalizeDreamProposals({
    proposals: [
      {
        file: "belief.md",
        path: "_proposals/belief.md",
        target: "Personal/Identity/beliefs/belief.md",
        summary: "Private file /home/thor/AI-OS/private.md",
        confidence: "0.72",
        levels: ["dream"],
        source_ids: ["source-1"],
        created: "2026-05-02",
        body: "## Proposed belief\n\nSensitive path /home/thor/AI-OS/private.md",
      },
    ],
  });

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.confidence, 0.72);
  assert.equal(proposals[0]?.levels[0], "dream");
  assert.equal(JSON.stringify(proposals[0]).includes("/home/thor"), false);
});

test("readOptaleBrainDreams reads the Dream dashboard through scoped server adapter", async () => {
  await registry.writeCabinetOptaleScope(".", {
    scope: "personal",
    ownerId: "thor",
    userId: "thor",
    policyId: "optale-thor",
    memoryNamespace: "thor-individual",
  });
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (url) => {
    const rendered = String(url);
    calls.push(rendered);
    if (rendered.endsWith("/api/honcho/dashboard/stats")) {
      return Response.json({
        messages: 10,
        sessions: 2,
        observations_by_level: { explicit: 8, dream: 1 },
        queue: { representation: { pending: 3, done: 4 } },
        active_rejections: 1,
        new_explicit_24h: 2,
      });
    }
    if (rendered.endsWith("/api/honcho/proposals")) {
      return Response.json({
        proposals: [
          {
            file: "optale.md",
            path: "_proposals/optale.md",
            target: "Business/Optale.md",
            summary: "Optale Observatory owns Brain review",
            confidence: 0.6,
            levels: ["dream"],
            source_ids: ["s1"],
            body: "## Proposed belief\n\nOptale Observatory owns Brain review.",
          },
        ],
      });
    }
    if (rendered.endsWith("/api/honcho/dashboard/rejections")) {
      return Response.json({ rejections: [] });
    }
    return Response.json({
      rules: {
        proposal_generation: {
          MIN_CONFIDENCE: "0.4",
          description: "Minimum confidence",
        },
      },
    });
  };

  const response = await dreams.readOptaleBrainDreams({
    cabinetPath: ".",
    query: "Observatory",
    limit: 5,
    apiBaseUrl: "http://dreams.local",
    fetchImpl: fakeFetch,
  });

  assert.equal(response.version, 1);
  assert.equal(response.source.id, "dreams");
  assert.equal(response.namespace, "thor-individual");
  assert.equal(response.profile, "thor");
  assert.equal(response.stats.dreamsEnabled, true);
  assert.equal(response.dashboard.stats.messages, 10);
  assert.equal(response.dashboard.proposals.length, 1);
  assert.equal(response.dashboard.rules[0]?.id, "proposal_generation");
  assert.equal(calls.length, 4);
});

test("readOptaleBrainDreams counts beyond compact downstream preview", async () => {
  const proposals = Array.from({ length: 35 }, (_, index) => ({
    file: `belief-${index}.md`,
    path: `_proposals/belief-${index}.md`,
    summary: `Belief ${index}`,
    confidence: 0.5,
    levels: ["dream"],
    source_ids: [`s${index}`],
    body: `## Proposed belief\n\nBelief ${index}.`,
  }));
  const fakeFetch: typeof fetch = async (url) => {
    const rendered = String(url);
    if (rendered.endsWith("/api/honcho/dashboard/stats")) {
      return Response.json({ messages: 1, sessions: 1, observations_by_level: {} });
    }
    if (rendered.endsWith("/api/honcho/proposals")) {
      return Response.json({ proposals });
    }
    if (rendered.endsWith("/api/honcho/dashboard/rejections")) {
      return Response.json({ rejections: [] });
    }
    return Response.json({ rules: {} });
  };

  const response = await dreams.readOptaleBrainDreams({
    cabinetPath: ".",
    limit: 50,
    apiBaseUrl: "http://dreams.local",
    fetchImpl: fakeFetch,
  });

  assert.equal(response.dashboard.proposalTotal, 35);
  assert.equal(response.dashboard.proposals.length, 35);
  const proposalsPreview = response.downstream.find(
    (call) => call.name === "sense_dream_proposals"
  )?.json as { proposals?: unknown[] } | undefined;
  assert.equal(proposalsPreview?.proposals?.length, 25);
  assert.equal(JSON.stringify(response.downstream).includes("Belief 34"), false);
});

test("submitOptaleBrainDreamProposalAction validates path and forwards actor", async () => {
  let capturedUser = "";
  let capturedBody = "";
  const fakeFetch: typeof fetch = async (_url, init) => {
    capturedUser = new Headers(init?.headers).get("Remote-User") || "";
    capturedBody = String(init?.body || "");
    return Response.json({ ok: true, action: "reject-soft" });
  };

  const rejected = await dreams.submitOptaleBrainDreamProposalAction({
    cabinetPath: ".",
    proposalPath: "../bad.md",
    action: "reject-soft",
    apiBaseUrl: "http://dreams.local",
    fetchImpl: fakeFetch,
  });
  assert.equal(rejected.status, 400);

  const response = await dreams.submitOptaleBrainDreamProposalAction({
    cabinetPath: ".",
    proposalPath: "_proposals/optale.md",
    action: "reject-soft",
    apiBaseUrl: "http://dreams.local",
    fetchImpl: fakeFetch,
  });

  assert.equal(response.ok, true);
  assert.equal(capturedUser, "thor");
  assert.equal(JSON.parse(capturedBody).proposalPath, "_proposals/optale.md");
});
