import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type EntitiesModule = typeof import("./brain-entities-adapter");
type ScopeRegistryModule = typeof import("./scope-registry");

let tempRoot: string;
let entities: EntitiesModule;
let registry: ScopeRegistryModule;

const envKeys = [
  "CABINET_DATA_DIR",
  "OPTALE_ENTITY_API_URL",
  "OPTALE_OAG_API_URL",
  "ENTITY_API_URL",
  "OAG_API_BASE_URL",
  "OPTALE_COMMAND_BRAIN_ORIGIN",
  "OPTALE_COMMAND_BRAIN_AUTH_MODE",
] as const;
let originalEnv: Map<string, string | undefined>;

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-entities-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  for (const key of envKeys) {
    if (key !== "CABINET_DATA_DIR") delete process.env[key];
  }
  entities = await import("./brain-entities-adapter");
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("normalizeOagEntityGraph supports OAG graph payloads and redacts raw fields", () => {
  const graph = entities.normalizeOagEntityGraph(
    {
      graph: {
        nodes: [
          {
            id: "node-1",
            title: "Optale",
            type: "company",
            category: "entity",
            vault_path: "Business/Clients/Optale.md",
            source_preview: {
              snippet: "Private source at /home/thor/AI-OS/Business/Clients/Optale.md",
            },
            lens: {
              health: { key: "healthy", label: "Healthy", severity: "ok" },
            },
          },
        ],
        edges: [
          {
            id: "edge-1",
            source: "node-1",
            target: "node-2",
            type: "relates_to",
            fact: "Optale relates to Observatory",
          },
        ],
        clusters: [
          {
            id: "company",
            label: "Company",
            node_count: 1,
            edge_count: 1,
            relationship_types: { relates_to: 1 },
          },
        ],
      },
      meta: {
        graph_name: "optale_vault",
        edge_count: 1,
        node_count: 1,
        cluster_count: 1,
        limit: 10,
        offset: 0,
        total_edge_count: 100,
        has_next: true,
        available_lenses: [{ key: "type", label: "Type" }],
      },
    },
    10,
    0
  );

  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0]?.title, "Optale");
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.clusters[0]?.label, "Company");
  assert.equal(graph.meta.hasNext, true);
  assert.equal(JSON.stringify(graph.nodes[0]?.raw).includes("/home/thor"), false);
});

test("readOptaleBrainEntities reads OAG through scoped server adapter", async () => {
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
    if (rendered.endsWith("/api/oag/status")) {
      return Response.json({
        status: "ok",
        graph_name: "optale_vault",
        graph_nodes: 2,
      });
    }
    return Response.json({
      graph: {
        nodes: [
          { id: "node-1", title: "Observatory", type: "product" },
          { id: "node-2", title: "Optale", type: "company" },
        ],
        edges: [
          {
            id: "edge-1",
            source: "node-1",
            target: "node-2",
            type: "parent",
            fact: "Observatory belongs to Optale",
          },
        ],
        clusters: [{ id: "product", label: "Product", node_count: 1, edge_count: 1 }],
      },
      meta: {
        graph_name: "optale_vault",
        edge_count: 1,
        node_count: 2,
        cluster_count: 1,
        limit: 5,
        offset: 0,
        total_edge_count: 1,
        has_next: false,
      },
    });
  };

  const response = await entities.readOptaleBrainEntities({
    cabinetPath: ".",
    query: "Observatory",
    limit: 5,
    apiBaseUrl: "http://entity.local",
    fetchImpl: fakeFetch,
  });

  assert.equal(response.version, 1);
  assert.equal(response.source.id, "action-graph");
  assert.equal(response.namespace, "personal:thor");
  assert.equal(response.profile, "thor");
  assert.equal(response.stats.entitiesEnabled, true);
  assert.equal(response.stats.nodesLoaded, 2);
  assert.equal(response.stats.edgesLoaded, 1);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.some((call) =>
      call === "http://entity.local/api/oag/graph?limit=5&q=Observatory"
    )
  );
});
