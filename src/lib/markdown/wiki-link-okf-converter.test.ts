import test from "node:test";
import assert from "node:assert/strict";
import { convertWikiLinksToOkf } from "./wiki-link-okf-converter";
import type { TreeNode } from "@/types";

const mockTree: TreeNode[] = [
  {
    name: "getting-started",
    path: "getting-started",
    type: "directory",
    children: [
      {
        name: "index.md",
        path: "getting-started/index",
        type: "file",
      },
    ],
  },
  {
    name: "apps-and-repos.md",
    path: "apps-and-repos",
    type: "file",
  },
  {
    name: "delegating-between-agents.md",
    path: "delegating-between-agents",
    type: "file",
  },
];

test("convertWikiLinksToOkf - single wiki-link", () => {
  const markdown = "See [[Getting Started]] for more info.";
  const result = convertWikiLinksToOkf(markdown, mockTree);
  assert.equal(
    result.content,
    "See [Getting Started](/getting-started/index.md) for more info."
  );
  assert.equal(result.converted, 1);
});

test("convertWikiLinksToOkf - multiple wiki-links", () => {
  const markdown =
    "See [[Getting Started]], [[Apps and Repos]], and [[Delegating Between Agents]].";
  const result = convertWikiLinksToOkf(markdown, mockTree);
  assert.equal(
    result.content,
    "See [Getting Started](/getting-started/index.md), [Apps and Repos](/apps-and-repos.md), and [Delegating Between Agents](/delegating-between-agents.md)."
  );
  assert.equal(result.converted, 3);
});

test("convertWikiLinksToOkf - mixed resolved and unresolved links", () => {
  const markdown = "See [[Getting Started]] and [[Non-existent Page]].";
  const result = convertWikiLinksToOkf(markdown, mockTree);
  assert.equal(
    result.content,
    "See [Getting Started](/getting-started/index.md) and [[Non-existent Page]]."
  );
  assert.equal(result.converted, 1);
});

test("convertWikiLinksToOkf - no wiki-links", () => {
  const markdown = "# No wiki-links here\n\nJust regular text.";
  const result = convertWikiLinksToOkf(markdown, mockTree);
  assert.equal(result.content, markdown);
  assert.equal(result.converted, 0);
});

test("convertWikiLinksToOkf - empty markdown", () => {
  const markdown = "";
  const result = convertWikiLinksToOkf(markdown, mockTree);
  assert.equal(result.content, "");
  assert.equal(result.converted, 0);
});
