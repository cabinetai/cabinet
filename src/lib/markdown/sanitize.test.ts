import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "@/lib/markdown/to-html";

// #66: raw HTML pass-through used to reach the browser verbatim, and the output
// is rendered via dangerouslySetInnerHTML on chat / agent messages. Any of the
// payloads below could smuggle JS into Cabinet's origin — where the daemon auth
// token lives — so lock in the sanitizer.

test("strips onerror/onclick event handlers on injected tags", async () => {
  const html = await markdownToHtml('<img src="x" onerror="alert(1)">');
  assert.ok(!html.includes("onerror"), `event handler survived sanitize: ${html}`);
  assert.ok(!html.toLowerCase().includes("alert"), `alert() payload survived: ${html}`);
});

test("strips javascript: URLs from links", async () => {
  const html = await markdownToHtml('<a href="javascript:alert(1)">click</a>');
  assert.ok(!html.toLowerCase().includes("javascript:"), `javascript: href survived: ${html}`);
  assert.ok(!html.toLowerCase().includes("alert"), `alert() survived: ${html}`);
});

test("drops <script> tags entirely", async () => {
  const html = await markdownToHtml("Hello <script>alert(1)</script> world");
  assert.ok(!html.toLowerCase().includes("<script"), `script tag survived: ${html}`);
  assert.ok(!html.toLowerCase().includes("alert"), `alert() survived: ${html}`);
});

test("drops <iframe> from raw HTML (embed path adds trusted iframes downstream)", async () => {
  const html = await markdownToHtml('<iframe src="https://evil.example.com"></iframe>');
  assert.ok(!html.toLowerCase().includes("<iframe"), `raw iframe survived: ${html}`);
});

test("drops inline <style> and on* attributes on legitimate tags", async () => {
  const html = await markdownToHtml('<div onclick="alert(1)" style="x:y">hi</div>');
  assert.ok(!html.toLowerCase().includes("onclick"), `onclick survived: ${html}`);
  assert.ok(!html.toLowerCase().includes("alert"), `alert() survived: ${html}`);
});

// The pieces the pipeline legitimately produces must still make it through
// sanitize; otherwise everything from wiki-links to task lists to LaTeX embeds
// silently degrades on agent-authored text.

test("wiki-link markup survives sanitize", async () => {
  const html = await markdownToHtml("See [[Some Page]] for context");
  assert.ok(html.includes('data-wiki-link="true"'), `wiki-link marker stripped: ${html}`);
  assert.ok(html.includes('data-page-name="Some Page"'), `page name stripped: ${html}`);
  assert.ok(html.includes("wiki-link"), `wiki-link class stripped: ${html}`);
});

test("LaTeX embed marker survives sanitize", async () => {
  const html = await markdownToHtml("![[proof.tex]]");
  assert.ok(html.includes('data-latex-embed="true"'), `latex marker stripped: ${html}`);
  assert.ok(html.includes('data-path="proof.tex"'), `latex path stripped: ${html}`);
});

test("GFM task-list checkbox input survives sanitize (post-processing depends on it)", async () => {
  const html = await markdownToHtml("- [ ] todo\n- [x] done\n");
  // The task-list post-processor runs after sanitize; if the input got stripped
  // here, downstream Tiptap-shape wrappers would render an empty label.
  assert.ok(html.includes('data-type="taskItem"'), `taskItem wrapper missing: ${html}`);
  assert.ok(html.includes('data-checked="true"'), `checked state missing: ${html}`);
  assert.ok(html.includes('type="checkbox"'), `checkbox input missing: ${html}`);
});

test("safe href protocols round-trip: http/https/mailto", async () => {
  const html = await markdownToHtml(
    "[web](https://example.com) [mail](mailto:a@b.co) [rel](/api/foo)"
  );
  assert.ok(html.includes('href="https://example.com"'), `https href stripped: ${html}`);
  assert.ok(html.includes('href="mailto:a@b.co"'), `mailto href stripped: ${html}`);
  assert.ok(html.includes('href="/api/foo"'), `relative href stripped: ${html}`);
});

test("standard prose markup still renders", async () => {
  const html = await markdownToHtml("**bold** _italic_ `code`\n\n> quote");
  assert.ok(/<strong>bold<\/strong>/.test(html), `bold stripped: ${html}`);
  assert.ok(/<em>italic<\/em>/.test(html), `italic stripped: ${html}`);
  assert.ok(/<code>code<\/code>/.test(html), `code stripped: ${html}`);
  assert.ok(/<blockquote/.test(html), `blockquote stripped: ${html}`);
});
