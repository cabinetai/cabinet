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

test("parseHash handles Resource Registry routes", () => {
  const root = parseHash("#/resources");
  assert.equal(root.section.type, "resources");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/resources");
  assert.equal(cabinet.section.type, "resources");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
});

test("parseHash handles Action Registry routes", () => {
  const root = parseHash("#/actions");
  assert.equal(root.section.type, "actions");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/actions");
  assert.equal(cabinet.section.type, "actions");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
});

test("parseHash handles Optale Command view routes", () => {
  const root = parseHash("#/actions/audit");
  assert.equal(root.section.type, "actions");
  assert.equal(root.section.cabinetPath, ".");
  assert.equal(root.section.slug, "audit");

  const cabinet = parseHash("#/cabinet/clients%2Facme/actions/lineage");
  assert.equal(cabinet.section.type, "actions");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
  assert.equal(cabinet.section.slug, "lineage");

  const invalid = parseHash("#/actions/unknown");
  assert.equal(invalid.section.type, "actions");
  assert.equal(invalid.section.slug, undefined);
});

test("parseHash handles Brain, Vault, and Graph as native Brain routes", () => {
  for (const type of ["brain", "vault", "graph"] as const) {
    const root = parseHash(`#/${type}`);
    assert.equal(root.section.type, type);
    assert.equal(root.section.cabinetPath, ".");

    const cabinet = parseHash(`#/cabinet/clients%2Facme/${type}`);
    assert.equal(cabinet.section.type, type);
    assert.equal(cabinet.section.cabinetPath, "clients/acme");
  }
});

test("parseHash handles Memory as a native Brain sub-route", () => {
  const root = parseHash("#/memory");
  assert.equal(root.section.type, "memory");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/memory");
  assert.equal(cabinet.section.type, "memory");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
});

test("parseHash handles Entities as a native Brain sub-route", () => {
  const root = parseHash("#/entities");
  assert.equal(root.section.type, "entities");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/entities");
  assert.equal(cabinet.section.type, "entities");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
});

test("parseHash handles Dreams as a native Brain sub-route", () => {
  const root = parseHash("#/dreams");
  assert.equal(root.section.type, "dreams");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/dreams");
  assert.equal(cabinet.section.type, "dreams");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
});

test("parseHash handles Company Brain as a gated Brain add-on route", () => {
  const root = parseHash("#/company-brain");
  assert.equal(root.section.type, "company-brain");
  assert.equal(root.section.cabinetPath, ".");

  const cabinet = parseHash("#/cabinet/clients%2Facme/company-brain");
  assert.equal(cabinet.section.type, "company-brain");
  assert.equal(cabinet.section.cabinetPath, "clients/acme");
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
