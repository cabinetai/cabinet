import { test } from "node:test";
import assert from "node:assert";
import { markdownToHtml } from "../src/lib/markdown/to-html";
import { htmlToMarkdown } from "../src/lib/markdown/to-markdown";

test("MyST directives remain code until a real parser is integrated", async () => {
  const markdown = `
\`\`\`{note} My Admonition Title
This is a MyST note!
\`\`\`

\`\`\`{figure} mountains.png
:label: my-fig
:align: center

My mountain.
\`\`\`
  `.trim();

  const html = await markdownToHtml(markdown);

  assert.match(html, /<code class="language-\{note\}">/);
  assert.match(html, /<code class="language-\{figure\}">/);
  assert.doesNotMatch(html, /data-callout/);
  assert.doesNotMatch(html, /<figure/);
});

test("MyST roles remain literal until a real parser is integrated", async () => {
  const markdown = "This is {sub}`subscript`, {sup}`superscript`, and {math}`E=mc^2`.";

  const html = await markdownToHtml(markdown);

  assert.match(html, /\{sub\}<code>subscript<\/code>/);
  assert.match(html, /\{sup\}<code>superscript<\/code>/);
  assert.match(html, /\{math\}<code>E=mc\^2<\/code>/);
  assert.doesNotMatch(html, /<sub>|<sup>|data-type="inlineMath"/);
});

test("Cabinet callouts round-trip as HTML instead of MyST directives", async () => {
  const html = `
<div data-callout="true" data-callout-type="warning">
<p>This is <strong>warning</strong> text!</p>
</div>
  `.trim();

  const markdown = htmlToMarkdown(html);

  assert.match(markdown, /<div data-callout="true" data-callout-type="warning">/);
  assert.doesNotMatch(markdown, /\`\`\`\{warning\}/);

  const rendered = await markdownToHtml(markdown);
  assert.match(rendered, /<div data-callout="true" data-callout-type="warning">/);
  assert.match(rendered, /<p>This is <strong>warning<\/strong> text!<\/p>/);
});
