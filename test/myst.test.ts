import { test } from "node:test";
import assert from "node:assert";
import { markdownToHtml } from "../src/lib/markdown/to-html";
import { htmlToMarkdown } from "../src/lib/markdown/to-markdown";

test("MyST Markdown Parser - Admonitions", async () => {
  const markdown = `
\`\`\`{note} My Admonition Title
This is a MyST note!
\`\`\`

:::{warning}
This is a MyST warning!
:::
  `.trim();

  const html = await markdownToHtml(markdown);

  // Should parse notes into callout divs
  assert.match(html, /data-callout-type="info"/);
  assert.match(html, /data-callout-type="warning"/);
  assert.match(html, /My Admonition Title/);
  assert.match(html, /This is a MyST note!/);
  assert.match(html, /This is a MyST warning!/);
});

test("MyST Markdown Parser - Roles", async () => {
  const markdown = `
This is {sub}\`subscript\` and {sup}\`superscript\`.
Inline math is {math}\`E=mc^2\`.
  `.trim();

  const html = await markdownToHtml(markdown);

  assert.match(html, /<sub>subscript<\/sub>/);
  assert.match(html, /<sup>superscript<\/sup>/);
  assert.match(html, /\$E=mc\^2\$/);
});

test("MyST Markdown Serializer - Callouts to Admonitions", () => {
  const html = `
<div data-callout="true" data-callout-type="warning">
This is warning text!
</div>
  `.trim();

  const markdown = htmlToMarkdown(html);

  assert.match(markdown, /```\{warning\}/);
  assert.match(markdown, /This is warning text!/);
});
