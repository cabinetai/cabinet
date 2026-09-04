import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildPrintPageRule,
  printableHeightMm,
  printableWidthMm,
  resolvePrintOrientation,
  sanitizePdfFilename,
} from "./print-export";

test("builds A4 and Letter page rules with explicit orientation", () => {
  assert.equal(
    buildPrintPageRule("a4", "portrait"),
    "@page { size: A4 portrait; margin: 15mm; }"
  );
  assert.equal(
    buildPrintPageRule("letter", "landscape"),
    "@page { size: Letter landscape; margin: 15mm; }"
  );
});

test("calculates printable dimensions after page margins", () => {
  assert.equal(printableWidthMm("a4"), 180);
  assert.equal(printableHeightMm("a4", "portrait"), 267);
  assert.equal(printableHeightMm("a4", "landscape"), 180);
  assert.equal(printableWidthMm("letter"), 185.9);
  assert.equal(printableHeightMm("letter", "portrait"), 249.4);
  assert.equal(printableHeightMm("letter", "landscape"), 185.9);
});

test("automatic orientation reacts only to genuinely wide fixed content", () => {
  const settings = { paperSize: "a4" as const, orientation: "auto" as const };
  assert.equal(resolvePrintOrientation(settings, []), "portrait");
  assert.equal(resolvePrintOrientation(settings, [800]), "portrait");
  assert.equal(resolvePrintOrientation(settings, [950]), "landscape");
});

test("explicit orientation overrides fixed content width", () => {
  assert.equal(
    resolvePrintOrientation({ paperSize: "letter", orientation: "portrait" }, [2000]),
    "portrait"
  );
  assert.equal(
    resolvePrintOrientation({ paperSize: "letter", orientation: "landscape" }, []),
    "landscape"
  );
});

test("sanitizes suggested PDF filenames", () => {
  assert.equal(sanitizePdfFilename("Quarterly / Review"), "Quarterly _ Review.pdf");
  assert.equal(sanitizePdfFilename("report.PDF"), "report.PDF");
  assert.equal(sanitizePdfFilename("..."), "page.pdf");
  assert.equal(sanitizePdfFilename(""), "page.pdf");
});

test("print CSS keeps atomic media and rows whole without freezing paragraphs", () => {
  const css = fs.readFileSync(
    path.join(process.cwd(), "src/app/globals.css"),
    "utf8"
  );
  const printCss = css.slice(css.indexOf("#cabinet-pdf-print-root"));
  assert.match(printCss, /img,[\s\S]*break-inside: avoid-page/);
  assert.match(printCss, /tr,[\s\S]*break-inside: avoid-page/);
  assert.match(printCss, /height: auto !important;/);
  assert.match(printCss, /max-height: var\(--cabinet-printable-height\)/);
  assert.match(printCss, /p \{[\s\S]*orphans: 2;[\s\S]*widows: 2;/);
  assert.doesNotMatch(printCss, /#cabinet-pdf-print-root p[^}]*break-inside/);
});
