import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHashForTest as parseHash,
  buildHashForTest as buildHash,
} from "@/hooks/use-hash-route";
import { buildPath, parsePath } from "@/lib/navigation/route-scheme";

test("parseHash handles canonical agents route under root cabinet", () => {
  const route = parseHash("#/cabinet/./agents");
  assert.equal(route.section.type, "agents");
  assert.equal(route.section.cabinetPath, ".");
});

test("parseHash handles canonical tasks route under root cabinet", () => {
  const route = parseHash("#/cabinet/./tasks");
  assert.equal(route.section.type, "tasks");
  assert.equal(route.section.cabinetPath, ".");
});

test("Daily Business Intake cockpit has a canonical route", () => {
  assert.deepEqual(parseHash("#/cockpit"), {
    section: { type: "cockpit" },
    pagePath: null,
  });
  assert.equal(buildHash({ type: "cockpit" }, null), "#/cockpit");
  assert.deepEqual(parsePath("/cockpit"), { kind: "cockpit" });
  assert.equal(buildPath({ type: "cockpit" }, null), "/cockpit");
});

test("parseHash handles canonical page-with-cabinet form", () => {
  const route = parseHash("#/cabinet/./data/getting-started");
  assert.equal(route.section.type, "page");
  assert.equal(route.section.cabinetPath, ".");
  assert.equal(route.pagePath, "getting-started");
});

test("parseHash handles bare page form", () => {
  const route = parseHash("#/page/getting-started");
  assert.equal(route.section.type, "page");
  assert.equal(route.pagePath, "getting-started");
});

// --- Nested-cabinet reload bug (the fix): marker-scan parsing ---

test("parseHash: deep cabinet root round-trips (no marker = cabinet root)", () => {
  const route = parseHash("#/cabinet/a/b/c/d");
  assert.equal(route.section.type, "cabinet");
  assert.equal(route.section.cabinetPath, "a/b/c/d");
  assert.equal(route.pagePath, null);
});

test("parseHash: deep page with the real 'doubled' path stays put", () => {
  // The production repro: cabinetPath and pagePath both deep, with `data` as
  // the structural separator. Previously this collapsed to cabinet `a`.
  const route = parseHash("#/cabinet/a/b/c/d/data/a/b/c/d/index");
  assert.equal(route.section.type, "page");
  assert.equal(route.section.cabinetPath, "a/b/c/d");
  assert.equal(route.pagePath, "a/b/c/d/index");
});

test("parseHash: a page path that itself contains 'data' still works", () => {
  // First marker wins: the structural `data` (idx 1) splits; the `data` inside
  // the page path is taken verbatim.
  const route = parseHash("#/cabinet/foo/data/foo/data/notes");
  assert.equal(route.section.type, "page");
  assert.equal(route.section.cabinetPath, "foo");
  assert.equal(route.pagePath, "foo/data/notes");
});

test("parseHash: deep agents list", () => {
  const route = parseHash("#/cabinet/a/b/c/agents");
  assert.equal(route.section.type, "agents");
  assert.equal(route.section.cabinetPath, "a/b/c");
});

test("parseHash: deep agents sub-tab", () => {
  const route = parseHash("#/cabinet/a/b/c/agents/routines");
  assert.equal(route.section.type, "agents");
  assert.equal(route.section.cabinetPath, "a/b/c");
  assert.equal(route.section.agentsTab, "routines");
});

test("parseHash: deep agent detail", () => {
  const route = parseHash("#/cabinet/a/b/c/agents/harel");
  assert.equal(route.section.type, "agent");
  assert.equal(route.section.cabinetPath, "a/b/c");
  assert.equal(route.section.slug, "harel");
  assert.equal(route.section.agentScopedId, "a/b/c::agent::harel");
});

test("parseHash: deep tasks list + task detail", () => {
  const list = parseHash("#/cabinet/a/b/c/tasks");
  assert.equal(list.section.type, "tasks");
  assert.equal(list.section.cabinetPath, "a/b/c");
  const detail = parseHash("#/cabinet/a/b/c/tasks/t-123");
  assert.equal(detail.section.type, "task");
  assert.equal(detail.section.cabinetPath, "a/b/c");
  assert.equal(detail.section.taskId, "t-123");
});

// --- Round-trip property: buildHash ∘ parseHash is identity for nested paths ---

test("round-trip: nested cabinet root", () => {
  const route = parseHash(buildHash({ type: "cabinet", cabinetPath: "a/b/c" }, null));
  assert.equal(route.section.type, "cabinet");
  assert.equal(route.section.cabinetPath, "a/b/c");
});

test("round-trip: nested page", () => {
  const hash = buildHash({ type: "page", cabinetPath: "a/b/c" }, "a/b/c/sub/page");
  const route = parseHash(hash);
  assert.equal(route.section.type, "page");
  assert.equal(route.section.cabinetPath, "a/b/c");
  assert.equal(route.pagePath, "a/b/c/sub/page");
});

test("round-trip: nested agents sub-tab and task", () => {
  const a = parseHash(buildHash({ type: "agents", cabinetPath: "a/b", agentsTab: "routines" }, null));
  assert.equal(a.section.type, "agents");
  assert.equal(a.section.cabinetPath, "a/b");
  assert.equal(a.section.agentsTab, "routines");
  const t = parseHash(buildHash({ type: "task", cabinetPath: "a/b", taskId: "t-9" }, null));
  assert.equal(t.section.type, "task");
  assert.equal(t.section.cabinetPath, "a/b");
  assert.equal(t.section.taskId, "t-9");
});
