import test from "node:test";
import assert from "node:assert/strict";
import { parseHashForTest as parseHash } from "@/hooks/use-hash-route";

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

test("parseHash treats #/cabinet/<path>/<slug> (no /data/) as a page deep-link, not home", () => {
  const route = parseHash("#/cabinet/./getting-started");
  // Audit #021: this form is what the audit called out as broken — it
  // silently fell through to the home route. We now interpret it as a
  // page under the named cabinet.
  assert.equal(route.section.type, "page");
  assert.equal(route.section.cabinetPath, ".");
  assert.equal(route.pagePath, "getting-started");
});
