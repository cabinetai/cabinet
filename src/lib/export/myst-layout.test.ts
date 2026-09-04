import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  applyLayoutToDocumentXml,
  applyLayoutToDocx,
  buildMystLatexTemplate,
  parseExportLayout,
  resolvedFixedOrientation,
} from "./myst-layout";

test("validates export layout request values", () => {
  assert.deepEqual(parseExportLayout("a4", "auto"), {
    paperSize: "a4",
    orientation: "auto",
  });
  assert.deepEqual(parseExportLayout("letter", "landscape"), {
    paperSize: "letter",
    orientation: "landscape",
  });
  assert.equal(parseExportLayout("legal", "portrait"), null);
  assert.equal(parseExportLayout("a4", "sideways"), null);
});

test("fixed-layout exporters resolve automatic orientation to portrait", () => {
  assert.equal(resolvedFixedOrientation("auto"), "portrait");
  assert.equal(resolvedFixedOrientation("portrait"), "portrait");
  assert.equal(resolvedFixedOrientation("landscape"), "landscape");
});

test("LaTeX template contains selected paper and orientation options", () => {
  assert.match(
    buildMystLatexTemplate({ paperSize: "a4", orientation: "auto" }),
    /\\documentclass\[a4paper\]\{article\}/
  );
  assert.match(
    buildMystLatexTemplate({ paperSize: "letter", orientation: "portrait" }),
    /\\documentclass\[letterpaper\]\{article\}/
  );
  assert.match(
    buildMystLatexTemplate({ paperSize: "letter", orientation: "landscape" }),
    /\\documentclass\[letterpaper,landscape\]\{article\}/
  );
});

test("DOCX XML updates existing and missing section page sizes", () => {
  const xml =
    '<w:document><w:body><w:sectPr><w:headerReference/><w:pgSz w:w="1" w:h="2"/></w:sectPr><w:sectPr/></w:body></w:document>';
  const updated = applyLayoutToDocumentXml(xml, {
    paperSize: "letter",
    orientation: "landscape",
  });
  assert.equal(
    updated.match(/<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"\/>/g)?.length,
    2
  );
  assert.match(updated, /<w:headerReference\/>/);
});

test("DOCX package preserves content while applying portrait A4 dimensions", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="1" w:h="2" w:orient="landscape"/></w:sectPr></w:body></w:document>'
  );
  zip.file("word/media/image.bin", Buffer.from([1, 2, 3]));
  const input = await zip.generateAsync({ type: "nodebuffer" });
  const output = await applyLayoutToDocx(input, {
    paperSize: "a4",
    orientation: "portrait",
  });
  const result = await JSZip.loadAsync(output);
  const document = await result.file("word/document.xml")!.async("string");
  const image = await result.file("word/media/image.bin")!.async("nodebuffer");
  assert.match(document, /<w:t>Hello<\/w:t>/);
  assert.match(document, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.doesNotMatch(document, /w:orient=/);
  assert.deepEqual([...image], [1, 2, 3]);
});
