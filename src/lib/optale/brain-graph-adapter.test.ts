import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OptaleBrainDownstreamCall } from "@/lib/optale/brain-adapters";
import type { OptaleBrainGraphToolCallInput } from "./brain-graph-adapter";

type GraphModule = typeof import("./brain-graph-adapter");
type ScopeRegistryModule = typeof import("./scope-registry");

let tempRoot: string;
let graph: GraphModule;
let registry: ScopeRegistryModule;

const envKeys = [
  "CABINET_DATA_DIR",
  "OPTALE_GRAPH_NAMESPACE",
  "GRAPH_GROUP_ID",
  "OPTALE_COMMAND_BRAIN_ORIGIN",
  "OPTALE_COMMAND_BRAIN_AUTH_MODE",
] as const;
let originalEnv: Map<string, string | undefined>;

before(async () => {
  originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "optale-brain-graph-test-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  delete process.env.OPTALE_GRAPH_NAMESPACE;
  delete process.env.GRAPH_GROUP_ID;
  delete process.env.OPTALE_COMMAND_BRAIN_ORIGIN;
  delete process.env.OPTALE_COMMAND_BRAIN_AUTH_MODE;
  graph = await import("./brain-graph-adapter");
  registry = await import("./scope-registry");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function okCall(name: string, json: unknown): OptaleBrainDownstreamCall {
  return {
    name,
    ok: true,
    status: "ok",
    text: JSON.stringify(json),
    json,
  };
}

test("normalizeGraphitiNodes and normalizeGraphitiFacts support Graphiti-style payloads", () => {
  const nodes = graph.normalizeGraphitiNodes({
    nodes: [
      {
        uuid: "person-thor",
        name: "Thor",
        entity_type: "Person",
        summary: "Keeps notes in /home/thor/private.md",
      },
    ],
    total_nodes: 1,
  });
  const facts = graph.normalizeGraphitiFacts({
    edges: [
      {
        uuid: "fact-1",
        fact: "Thor works on Optale",
        source_node_uuid: "person-thor",
        target_node_uuid: "company-optale",
        source_node_name: "Thor",
        target_node_name: "Optale",
      },
    ],
  });

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0]?.id, "person-thor");
  assert.equal(nodes[0]?.kind, "Person");
  assert.equal(JSON.stringify(nodes[0]?.raw).includes("/home/thor"), false);
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.sourceId, "person-thor");
  assert.equal(facts[0]?.targetLabel, "Optale");
});

test("readOptaleBrainGraph scopes read-only Graphiti calls and returns a native contract", async () => {
  await registry.writeCabinetOptaleScope(".", {
    scope: "personal",
    ownerId: "thor",
    userId: "thor",
    policyId: "optale-thor",
    memoryNamespace: "thor-individual",
  });
  const calls: OptaleBrainGraphToolCallInput[] = [];
  const callTool = async (
    input: OptaleBrainGraphToolCallInput
  ): Promise<OptaleBrainDownstreamCall> => {
    calls.push(input);
    if (input.name === "graphiti__get_status") {
      return okCall(input.name, { ok: true, status: "ready" });
    }
    if (input.name === "graphiti__search_nodes") {
      return okCall(input.name, {
        message: "nodes loaded",
        nodes: [
          {
            uuid: "person-thor",
            name: "Thor",
            entity_type: "Person",
            created_at: "2026-05-01T00:00:00.000Z",
          },
        ],
        total_nodes: 1,
      });
    }
    return okCall(input.name, {
      message: "facts loaded",
      edges: [
        {
          uuid: "fact-1",
          fact: "Thor works on Optale",
          source_node_uuid: "person-thor",
          target_node_uuid: "company-optale",
          source_node_name: "Thor",
          target_node_name: "Optale",
        },
      ],
      total_facts: 1,
    });
  };

  const response = await graph.readOptaleBrainGraph({
    cabinetPath: ".",
    query: "Optale",
    limit: 4,
    callTool,
  });

  assert.equal(response.version, 1);
  assert.equal(response.source.id, "memory-graph");
  assert.equal(response.namespace, "thor-individual");
  assert.equal(response.profile, "thor");
  assert.equal(response.stats.graphitiEnabled, true);
  assert.equal(response.stats.scopedByNamespace, true);
  assert.equal(response.semantic.nodes.length, 1);
  assert.equal(response.semantic.facts.length, 1);
  assert.equal(response.graph.counts.entity, 2);
  assert.equal(response.graph.counts.fact, 1);
  assert.equal(response.graph.edges.length, 1);
  assert.deepEqual(
    calls.find((call) => call.name === "graphiti__search_nodes")?.args,
    { query: "Optale", max_nodes: 4, group_ids: ["thor-individual"] }
  );
  assert.deepEqual(
    calls.find((call) => call.name === "graphiti__search_memory_facts")?.args,
    { query: "Optale", max_facts: 4, group_ids: ["thor-individual"] }
  );
});
