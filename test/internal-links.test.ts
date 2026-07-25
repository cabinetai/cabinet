import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveInternalLink,
  type InternalLinkNode,
} from "@/lib/markdown/internal-links";

const nodes: InternalLinkNode[] = [
  {
    name: "projects",
    path: "projects",
    children: [
      {
        name: "locations",
        path: "projects/locations",
      },
      {
        name: "thesis.md",
        path: "projects/thesis",
      },
    ],
  },
  {
    name: "research",
    path: "research",
    children: [
      {
        name: "acquisitions",
        path: "research/acquisitions",
      },
    ],
  },
  {
    name: "other",
    path: "other",
    children: [
      {
        name: "locations",
        path: "other/locations",
      },
    ],
  },
];

test("resolves folder links relative to a folder index page", () => {
  assert.equal(
    resolveInternalLink("./locations/", "projects", nodes),
    "projects/locations",
  );
  assert.equal(
    resolveInternalLink("./locations/index.md", "projects", nodes),
    "projects/locations",
  );
});

test("resolves markdown pages and strips heading fragments", () => {
  assert.equal(
    resolveInternalLink("./thesis.md", "projects", nodes),
    "projects/thesis",
  );
  assert.equal(
    resolveInternalLink("thesis.md#heading", "projects", nodes),
    "projects/thesis",
  );
});

test("normalizes parent segments without basename fallback", () => {
  assert.equal(
    resolveInternalLink("../research/acquisitions/", "projects", nodes),
    "research/acquisitions",
  );
  assert.equal(resolveInternalLink("./missing/locations/", "projects", nodes), null);
});
