import test from "node:test";
import assert from "node:assert/strict";
import {
  clampBrainAdapterLimit,
  isBrainAdapterReadEnabled,
  normalizeBrainDownstreamError,
  productBrainDownstreamName,
  redactBrainTextForClient,
  redactBrainValueForClient,
  trimBrainAdapterString,
} from "./brain-adapters";

test("brain adapter helpers normalize query strings and limits", () => {
  assert.equal(trimBrainAdapterString("  alpha  "), "alpha");
  assert.equal(trimBrainAdapterString(null), "");
  assert.equal(clampBrainAdapterLimit(undefined), 12);
  assert.equal(clampBrainAdapterLimit(0), 1);
  assert.equal(clampBrainAdapterLimit(500), 50);
});

test("redactBrainTextForClient removes absolute server paths", () => {
  const redacted = redactBrainTextForClient(
    "Found /home/thor/private/a.md and /mnt/data/private/b.md"
  );

  assert.equal(redacted.includes("/home/thor"), false);
  assert.equal(redacted.includes("/mnt/data"), false);
  assert.match(redacted, /\[server-path\]/);
});

test("redactBrainValueForClient redacts nested strings without flattening objects", () => {
  const redacted = redactBrainValueForClient({
    path: "/home/thor/private/a.md",
    nested: [{ value: "/tmp/private/b.md" }],
    count: 2,
  }) as { path: string; nested: Array<{ value: string }>; count: number };

  assert.equal(redacted.path, "[server-path]");
  assert.equal(redacted.nested[0].value, "[server-path]");
  assert.equal(redacted.count, 2);
});

test("normalizeBrainDownstreamError classifies aborts as retryable", () => {
  const error = normalizeBrainDownstreamError("This operation was aborted");

  assert.equal(error.code, "DownstreamRequestAborted");
  assert.equal(error.retryable, true);
  assert.match(error.message, /aborted/);
});

test("isBrainAdapterReadEnabled requires healthy source and read permission", () => {
  assert.equal(
    isBrainAdapterReadEnabled({ status: "healthy", permissions: ["read"] }),
    true
  );
  assert.equal(
    isBrainAdapterReadEnabled({ status: "blocked", permissions: ["read"] }),
    false
  );
  assert.equal(
    isBrainAdapterReadEnabled({ status: "healthy", permissions: [] }),
    false
  );
});

test("productBrainDownstreamName hides internal MCP and legacy memory names", () => {
  assert.equal(productBrainDownstreamName("qmd__query"), "sense_search_knowledge");
  assert.equal(productBrainDownstreamName("graphiti__search_nodes"), "sense_search_graph_nodes");
  assert.equal(productBrainDownstreamName("honcho__peer_card"), "sense_memory_profile");
  assert.equal(productBrainDownstreamName("oag__graph"), "ontology_entity_graph");
  assert.equal(productBrainDownstreamName("dreams__stats"), "sense_dream_stats");
  assert.equal(productBrainDownstreamName("unknown__private_tool"), "sense_downstream_call");
});
