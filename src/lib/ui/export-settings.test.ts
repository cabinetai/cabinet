import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultPaperSizeForLocales,
  resolveExportSettings,
} from "./export-settings";

test("paper size defaults from the first regional locale", () => {
  assert.equal(defaultPaperSizeForLocales(["en-US"]), "letter");
  assert.equal(defaultPaperSizeForLocales(["en-CA"]), "letter");
  assert.equal(defaultPaperSizeForLocales(["es-MX"]), "letter");
  assert.equal(defaultPaperSizeForLocales(["en-PH"]), "letter");
  assert.equal(defaultPaperSizeForLocales(["fr-FR"]), "a4");
  assert.equal(defaultPaperSizeForLocales(["en-GB"]), "a4");
});

test("paper size skips regionless and malformed locales", () => {
  assert.equal(defaultPaperSizeForLocales(["en", "fr-BE"]), "a4");
  assert.equal(defaultPaperSizeForLocales(["not a locale", "en-US"]), "letter");
  assert.equal(defaultPaperSizeForLocales([]), "a4");
});

test("saved settings override locale defaults", () => {
  assert.deepEqual(
    resolveExportSettings(
      JSON.stringify({ paperSize: "a4", orientation: "landscape" }),
      ["en-US"]
    ),
    { paperSize: "a4", orientation: "landscape" }
  );
});

test("invalid saved values fall back independently", () => {
  assert.deepEqual(
    resolveExportSettings(
      JSON.stringify({ paperSize: "legal", orientation: "sideways" }),
      ["en-US"]
    ),
    { paperSize: "letter", orientation: "auto" }
  );
  assert.deepEqual(resolveExportSettings("{", ["de-DE"]), {
    paperSize: "a4",
    orientation: "auto",
  });
});
