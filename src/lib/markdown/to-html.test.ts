import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToHtml } from "@/lib/markdown/to-html";

test("relative markdown hrefs remain available to internal navigation", async () => {
  const html = await markdownToHtml(
    "[child](./hypotheses/index.md) [section](./hypotheses/index.md#risks)",
    "good-place-os/product",
  );

  assert.match(html, /href="\.\/hypotheses\/index\.md"/);
  assert.match(html, /href="\.\/hypotheses\/index\.md#risks"/);
  assert.doesNotMatch(html, /\/api\/assets\/.*hypotheses\/index\.md/);
});

test("relative asset hrefs and sources still use the asset endpoint", async () => {
  const html = await markdownToHtml(
    "[spec](./spec.pdf) ![diagram](./diagram.png)",
    "good-place-os/product",
  );

  assert.match(html, /href="\/api\/assets\/good-place-os\/product\/spec\.pdf"/);
  assert.match(html, /src="\/api\/assets\/good-place-os\/product\/diagram\.png"/);
});
