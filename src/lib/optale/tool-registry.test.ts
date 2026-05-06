import test from "node:test";
import assert from "node:assert/strict";
import {
  findOptaleProductTool,
  isProductFacingToolName,
  listOptaleProductTools,
  optaleToolNameAllowedByList,
  productFacingToolName,
  resolveOptaleToolName,
  toProductFacingTool,
  toProductFacingToolOrNull,
} from "./tool-registry";

test("Tool Registry defines the product alias for qmd knowledge search", () => {
  const [tool] = listOptaleProductTools();

  assert.equal(tool?.productName, "sense_search_knowledge");
  assert.equal(tool?.productLabel, "Docs / Knowledge Search");
  assert.equal(tool?.executionConfig.internalTarget, "qmd__query");
  assert.equal(
    findOptaleProductTool("qmd__query")?.productName,
    "sense_search_knowledge",
  );
});

test("Tool Registry defines product aliases for Graphiti relationship graph tools", () => {
  const tools = listOptaleProductTools();
  const names = tools.map((tool) => tool.productName);

  assert.deepEqual(
    names.filter((name) => name.startsWith("sense_")),
    [
      "sense_search_knowledge",
      "sense_search_graph_nodes",
      "sense_search_graph_facts",
      "sense_graph_entity_edge",
      "sense_graph_episodes",
      "sense_graph_status",
    ],
  );
  assert.equal(
    findOptaleProductTool("graphiti__search_nodes")?.productName,
    "sense_search_graph_nodes",
  );
  assert.equal(
    findOptaleProductTool("graphiti__search_memory_facts")?.productName,
    "sense_search_graph_facts",
  );
});

test("Tool Registry defines product aliases for read-only OAG action graph tools", () => {
  const tools = listOptaleProductTools();
  const names = tools.map((tool) => tool.productName);

  assert.deepEqual(
    names.filter((name) => name.startsWith("objects_")),
    [
      "objects_action_graph_status",
      "objects_entity_graph",
      "objects_context_assemble",
      "objects_entity_context",
      "objects_task_bridge_status",
    ],
  );
  assert.equal(
    findOptaleProductTool("oag__graph")?.productName,
    "objects_entity_graph",
  );
  assert.equal(
    findOptaleProductTool("oag__context_assemble")?.productName,
    "objects_context_assemble",
  );
});

test("resolveOptaleToolName maps product and internal names to the same target", () => {
  assert.deepEqual(resolveOptaleToolName("sense_search_knowledge"), {
    requestedToolName: "sense_search_knowledge",
    internalToolName: "qmd__query",
    internalServerId: "qmd",
    productToolName: "sense_search_knowledge",
    productToolLabel: "Docs / Knowledge Search",
    productDescription:
      "Search Optale knowledge sources for relevant notes, docs, and source artifacts.",
  });

  assert.deepEqual(resolveOptaleToolName("qmd__query"), {
    requestedToolName: "qmd__query",
    internalToolName: "qmd__query",
    internalServerId: "qmd",
    productToolName: "sense_search_knowledge",
    productToolLabel: "Docs / Knowledge Search",
    productDescription:
      "Search Optale knowledge sources for relevant notes, docs, and source artifacts.",
  });

  assert.deepEqual(resolveOptaleToolName("sense_search_graph_nodes"), {
    requestedToolName: "sense_search_graph_nodes",
    internalToolName: "graphiti__search_nodes",
    internalServerId: "graphiti",
    productToolName: "sense_search_graph_nodes",
    productToolLabel: "Relationship Graph / Node Search",
    productDescription:
      "Search Optale relationship graph entities by name, topic, and attributes.",
  });

  assert.deepEqual(resolveOptaleToolName("objects_entity_graph"), {
    requestedToolName: "objects_entity_graph",
    internalToolName: "oag__graph",
    internalServerId: "oag",
    productToolName: "objects_entity_graph",
    productToolLabel: "Objects / Entity Graph",
    productDescription:
      "Read the Action Graph entity graph with Cytoscape-ready elements.",
  });
});

test("allowed tool lists accept either product aliases or internal bridge names", () => {
  assert.equal(
    optaleToolNameAllowedByList("qmd__query", ["sense_search_knowledge"]),
    true,
  );
  assert.equal(
    optaleToolNameAllowedByList("sense_search_knowledge", ["qmd__query"]),
    true,
  );
  assert.equal(
    optaleToolNameAllowedByList("qmd__status", ["sense_search_knowledge"]),
    false,
  );
  assert.equal(
    optaleToolNameAllowedByList("graphiti__search_nodes", [
      "sense_search_graph_nodes",
    ]),
    true,
  );
  assert.equal(
    optaleToolNameAllowedByList("sense_search_graph_facts", [
      "graphiti__search_memory_facts",
    ]),
    true,
  );
  assert.equal(
    optaleToolNameAllowedByList("oag__graph", ["objects_entity_graph"]),
    true,
  );
  assert.equal(
    optaleToolNameAllowedByList("objects_context_assemble", [
      "oag__context_assemble",
    ]),
    true,
  );
});

test("toProductFacingTool hides internal bridge names from exposed tool definitions", () => {
  const exposed = toProductFacingTool({
    name: "qmd__query",
    description: "[qmd] search vault",
    inputSchema: { type: "object" },
  });

  assert.equal(exposed.name, "sense_search_knowledge");
  assert.equal(
    exposed.description,
    "Search Optale knowledge sources for relevant notes, docs, and source artifacts.",
  );
  assert.deepEqual(exposed.inputSchema, { type: "object" });
});

test("product-facing helpers hide unaliased internal MCP names", () => {
  assert.equal(productFacingToolName("qmd__query"), "sense_search_knowledge");
  assert.equal(
    productFacingToolName("graphiti__search_nodes"),
    "sense_search_graph_nodes",
  );
  assert.equal(
    productFacingToolName("sense_search_knowledge"),
    "sense_search_knowledge",
  );
  assert.equal(productFacingToolName("oag__graph"), "objects_entity_graph");
  assert.equal(
    productFacingToolName("objects_context_assemble"),
    "objects_context_assemble",
  );
  assert.equal(productFacingToolName("qmd__status"), null);
  assert.equal(isProductFacingToolName("sense_search_knowledge"), true);
  assert.equal(isProductFacingToolName("qmd__query"), false);

  assert.deepEqual(
    toProductFacingToolOrNull({
      name: "qmd__status",
      description: "index status",
      inputSchema: { type: "object" },
    }),
    null,
  );
});
