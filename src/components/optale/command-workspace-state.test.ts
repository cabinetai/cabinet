import test from "node:test";
import assert from "node:assert/strict";
import {
  commandViewFromSlug,
  selectRecordById,
} from "./command-workspace-state";

test("commandViewFromSlug maps deep-linked command views", () => {
  assert.equal(commandViewFromSlug("runs"), "runs");
  assert.equal(commandViewFromSlug("policy"), "policy");
  assert.equal(commandViewFromSlug("lineage"), "lineage");
  assert.equal(commandViewFromSlug("audit"), "audit");
});

test("commandViewFromSlug falls back to actions for missing or unknown slugs", () => {
  assert.equal(commandViewFromSlug(undefined), "actions");
  assert.equal(commandViewFromSlug("actions"), "actions");
  assert.equal(commandViewFromSlug("unknown"), "actions");
});

test("selectRecordById preserves selection or falls back to the first visible record", () => {
  const records = [
    { id: "run-1", label: "First" },
    { id: "run-2", label: "Second" },
  ];

  assert.equal(selectRecordById(records, "run-2"), records[1]);
  assert.equal(selectRecordById(records, "missing"), records[0]);
  assert.equal(selectRecordById(records, null), records[0]);
  assert.equal(selectRecordById([], "missing"), null);
});
