import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleBrainContext } from "@/lib/optale/brain-context";

type MemoryAdapterModule = typeof import("./brain-memory-adapter");
type MemoryConfigModule = typeof import("./brain-memory-config");

let tempRoot: string;
let memoryAdapter: MemoryAdapterModule;
let memoryConfig: MemoryConfigModule;

const envKeys = [
  "CABINET_DATA_DIR",
  "OPTALE_MEMORY_BASE_URL",
  "OPTALE_MEMORY_WORKSPACE",
  "OPTALE_MEMORY_PEER",
  "MEMORY_PEER",
  "BRAIN_MEMORY_PEER",
  "HONCHO_PEER",
] as const;
let originalEnv: Map<string, string | undefined>;

function context(overrides: Partial<OptaleBrainContext> = {}): OptaleBrainContext {
  return {
    subjectType: "company",
    tenantId: "acme",
    companyId: "acme",
    cabinetPath: ".",
    dataRoot: "/server-side",
    vaultNamespace: "vault:root",
    memoryNamespace: "company:acme",
    graphNamespace: "company:acme",
    entityNamespace: "company:acme",
    qmdProfile: "acme",
    graphProfile: "acme",
    entityProfile: "acme",
    companyBrainTargetId: "optale-acme",
    mcpClientProfile: "acme",
    secretsRef: "acme",
    allowedScopes: ["company"],
    source: "explicit",
    ...overrides,
  };
}

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-memory-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.OPTALE_MEMORY_BASE_URL = "http://memory.local";
  process.env.OPTALE_MEMORY_WORKSPACE = "memory-test";
  delete process.env.OPTALE_MEMORY_PEER;
  delete process.env.MEMORY_PEER;
  delete process.env.BRAIN_MEMORY_PEER;
  delete process.env.HONCHO_PEER;
  memoryAdapter = await import("./brain-memory-adapter");
  memoryConfig = await import("./brain-memory-config");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("resolveOptaleBrainMemoryConfig derives workspace without a hard-coded personal peer", () => {
  const config = memoryConfig.resolveOptaleBrainMemoryConfig(context());

  assert.equal(config.enabled, true);
  assert.equal(config.workspace, "memory-test");
  assert.equal(config.defaultPeer, undefined);
  assert.equal(config.namespace, "company:acme");
});

test("readOptaleBrainMemory loads Honcho memory through a server-side read adapter", async () => {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (url) => {
    const rendered = String(url);
    calls.push(rendered);
    if (rendered.includes("/peers/list")) {
      return Response.json({
        items: [{ id: "peer-a", metadata: { path: "/home/thor/private" } }],
        total: 1,
      });
    }
    if (rendered.includes("/queue/status")) {
      return Response.json({ pending: 0 });
    }
    if (rendered.includes("/card")) {
      return Response.json({
        peer_card: ["stable memory", "/home/thor/private/card.md"],
      });
    }
    if (rendered.includes("/context")) {
      return Response.json({
        matches: ["Optale"],
        path: "/tmp/context.md",
      });
    }
    if (rendered.includes("/sessions")) {
      return Response.json({
        items: [{ id: "session-1", is_active: true, metadata: {} }],
      });
    }
    if (rendered.includes("/conclusions/list")) {
      return Response.json({
        items: [
          {
            id: "c1",
            content: "Optale memory from /mnt/data/private.md",
            observer_id: "peer-a",
          },
        ],
      });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  };

  const response = await memoryAdapter.readOptaleBrainMemory({
    cabinetPath: ".",
    query: "optale",
    limit: 4,
    fetchImpl: fakeFetch,
  });

  assert.equal(response.version, 1);
  assert.equal(response.workspace, "memory-test");
  assert.equal(response.defaultPeer, "");
  assert.equal(response.selectedPeer, "peer-a");
  assert.equal(response.peers.length, 1);
  assert.equal(response.detail?.sessions.length, 1);
  assert.equal(response.detail?.conclusions.length, 1);
  assert.equal(response.detail?.card.some((entry) => entry.includes("/home/thor")), false);
  assert.equal(JSON.stringify(response.detail?.context).includes("/tmp"), false);
  assert.equal(response.detail?.conclusions[0].content.includes("/mnt/data"), false);
  assert.equal(response.downstream.length, 6);
  assert.ok(calls.every((call) => call.startsWith("http://memory.local")));
});
