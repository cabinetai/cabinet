import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVirtualPath } from "../src/lib/virtual-paths";
import { buildPageApiUrl } from "../src/lib/api/client";

test("normalizeVirtualPath converts Windows separators to cabinet paths", () => {
  assert.equal(
    normalizeVirtualPath("\\recherches_forma\\dossier\\fichier.pdf"),
    "recherches_forma/dossier/fichier.pdf"
  );
  assert.equal(
    normalizeVirtualPath("/recherches_forma//dossier/"),
    "recherches_forma/dossier"
  );
});

test("buildPageApiUrl normalizes and encodes page paths", () => {
  assert.equal(buildPageApiUrl(""), "/api/pages");
  assert.equal(
    buildPageApiUrl("\\recherches_forma\\révision IA.pdf"),
    "/api/pages/recherches_forma/r%C3%A9vision%20IA.pdf"
  );
});
