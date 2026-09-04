import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "./sanitize";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { renderLatexToHtml } from "@/components/editor/latex-render";

// Two halves, and both matter.
//
// The attack half is the point of #66: raw HTML reached `dangerouslySetInnerHTML`
// verbatim, inside the origin that holds the daemon auth token.
//
// The survival half is what makes the fix shippable. A sanitizer that quietly
// eats wiki-links, task lists, mermaid styling, or video embeds is a content
// regression across every existing user vault, and it would land looking green.

// Deliberately tag-scoped rather than a substring match. The same characters
// sitting in TEXT content are inert — the wiki-link case below legitimately
// renders `x" onmouseover="alert(1)` as the link's visible text — and a naive
// `includes("onmouseover")` would call that a vulnerability. What actually
// matters is whether a handler survived as an ATTRIBUTE.
const HANDLER_ATTR = /<[^>]*\son[a-z]+\s*=/i;
const SCRIPT_TAG = /<script/i;
const JS_URI_ATTR = /<[^>]*\s(?:href|src|xlink:href)\s*=\s*["']?\s*javascript:/i;
const SRCDOC_ATTR = /<[^>]*\ssrcdoc\s*=/i;

const XSS = (html: string) =>
  HANDLER_ATTR.test(html) ||
  SCRIPT_TAG.test(html) ||
  JS_URI_ATTR.test(html) ||
  SRCDOC_ATTR.test(html);

// ---------------------------------------------------------------- rich (prose)

test("rich: strips script tags, event handlers, and javascript: URLs", () => {
  const payloads = [
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">click</a>',
    "Hello <script>alert(1)</script> world",
    '<div onclick="alert(1)">hi</div>',
    '<svg onload="alert(1)"></svg>',
    '<body onload="alert(1)">',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<form action="/x"><button formaction="javascript:alert(1)">go</button></form>',
    '<a href="jAvAsCrIpT:alert(1)">case</a>',
    '<img src=x onerror=alert(1)>',
  ];
  for (const payload of payloads) {
    const clean = sanitizeHtml(payload, "rich");
    assert.ok(!XSS(clean), `payload survived: ${payload} -> ${clean}`);
    assert.ok(!clean.toLowerCase().includes("alert"), `alert() survived: ${payload} -> ${clean}`);
  }
});

// The markdown pipeline builds `data-page-name="${pageName}"` by hand, and
// pageName is `[^\]]+` — a quote in a page title breaks straight out of the
// attribute. This is an injection point that has nothing to do with raw HTML
// pass-through, which is exactly why sanitizing at the render boundary (rather
// than inside the remark pipeline) is the right layer.
test("rich: an attribute breakout via a wiki-link page name is neutralized", async () => {
  const html = await markdownToHtml('[[x" onmouseover="alert(1)]]');
  assert.ok(
    HANDLER_ATTR.test(html),
    `precondition: the raw pipeline emits a live onmouseover attribute — got ${html}`
  );

  const clean = sanitizeHtml(html, "rich");
  assert.ok(!XSS(clean), `handler survived sanitize: ${clean}`);
  // The hostile page name lives on as inert link TEXT, which is fine and is why
  // this assertion is attribute-scoped rather than a substring check.
  assert.ok(clean.includes("<a"), `the wiki-link itself should still render: ${clean}`);
});

test("rich: a data: URI is allowed on <img> but refused on <a>", () => {
  const img = sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">', "rich");
  assert.ok(img.includes("data:image/png"), `inline image was dropped: ${img}`);

  const anchor = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>', "rich");
  assert.ok(!anchor.toLowerCase().includes("data:text/html"), `data: navigation survived: ${anchor}`);
});

test("rich: prose, links, and file:// URLs round-trip", async () => {
  const html = await markdownToHtml(
    "**bold** _italic_ `code`\n\n> quote\n\n[web](https://example.com) [mail](mailto:a@b.co) [rel](/api/foo)"
  );
  const clean = sanitizeHtml(html, "rich");
  assert.match(clean, /<strong>bold<\/strong>/);
  assert.match(clean, /<em>italic<\/em>/);
  assert.match(clean, /<code>code<\/code>/);
  assert.match(clean, /<blockquote/);
  assert.ok(clean.includes('href="https://example.com"'), `https href stripped: ${clean}`);
  assert.ok(clean.includes('href="mailto:a@b.co"'), `mailto href stripped: ${clean}`);
  assert.ok(clean.includes('href="/api/foo"'), `relative href stripped: ${clean}`);

  // encodeFileUrls() exists to make these work; sanitize must not undo it.
  const fileLink = sanitizeHtml('<a href="file:///home/u/My%20File.pdf">f</a>', "rich");
  assert.ok(fileLink.includes("file:///home/u/My%20File.pdf"), `file:// link stripped: ${fileLink}`);
});

test("rich: wiki-link, LaTeX embed, and task-list markup survive", async () => {
  const wiki = sanitizeHtml(await markdownToHtml("See [[Some Page]] for context"), "rich");
  assert.ok(wiki.includes('data-wiki-link="true"'), `wiki-link marker stripped: ${wiki}`);
  assert.ok(wiki.includes('data-page-name="Some Page"'), `page name stripped: ${wiki}`);

  const latex = sanitizeHtml(await markdownToHtml("![[proof.tex]]"), "rich");
  assert.ok(latex.includes('data-latex-embed="true"'), `latex marker stripped: ${latex}`);
  assert.ok(latex.includes('data-path="proof.tex"'), `latex path stripped: ${latex}`);

  const tasks = sanitizeHtml(await markdownToHtml("- [ ] todo\n- [x] done\n"), "rich");
  assert.ok(tasks.includes('data-type="taskItem"'), `taskItem wrapper missing: ${tasks}`);
  assert.ok(tasks.includes('data-checked="true"'), `checked state missing: ${tasks}`);
  assert.ok(tasks.includes('type="checkbox"'), `checkbox input missing: ${tasks}`);
});

// upgradeProviderVideos heals <video src="youtube-url"> into a real iframe. If
// sanitize drops iframes, every video embed in every note goes blank.
test("rich: a healed provider iframe embed survives, but not with srcdoc", async () => {
  const html = await markdownToHtml('<video src="https://youtu.be/dQw4w9WgXcQ"></video>');
  const clean = sanitizeHtml(html, "rich");
  assert.ok(clean.includes("<iframe"), `embed iframe was stripped: ${clean}`);
  assert.ok(clean.includes("allowfullscreen"), `allowfullscreen stripped: ${clean}`);

  const evil = sanitizeHtml('<iframe src="https://ok.example" srcdoc="<script>alert(1)</script>"></iframe>', "rich");
  assert.ok(evil.includes("<iframe"), "the iframe itself is still allowed");
  assert.ok(!evil.toLowerCase().includes("srcdoc"), `srcdoc survived: ${evil}`);
});

test("rich: inline style is dropped (overlay/clickjacking vector, unused by the pipeline)", () => {
  const clean = sanitizeHtml('<div style="position:fixed;inset:0">x</div>', "rich");
  assert.ok(!clean.includes("style"), `inline style survived: ${clean}`);
});

test("latex: preserves KaTeX layout styles for superscripts and fractions", () => {
  const rendered = renderLatexToHtml(String.raw`$$\frac{x^2}{y_1}$$`);
  const clean = sanitizeHtml(rendered.html, "latex");
  assert.match(clean, /style="[^"]*(?:top|vertical-align):/);
  assert.match(clean, /class="[^"]*frac-line/);
});

test("latex: still strips active content and refuses KaTeX HTML extensions", () => {
  const rendered = renderLatexToHtml(String.raw`$$\htmlStyle{position:fixed;inset:0}{X}$$`);
  const clean = sanitizeHtml(`${rendered.html}<script>alert(1)</script><img src=x onerror=alert(1)>`, "latex");
  assert.ok(!XSS(clean), `active content survived: ${clean}`);
  assert.doesNotMatch(clean, /style="[^"]*position\s*:/, `untrusted KaTeX style survived: ${clean}`);
});

// ------------------------------------------------------------------------ svg

// Both mermaid call sites use securityLevel: "loose", so mermaid does NOT
// sanitize its own output and permits HTML labels. This profile is the only
// thing between an agent-authored diagram and the DOM.
test("svg: strips script and handlers from a mermaid-shaped payload", () => {
  const payloads = [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg><g onclick="alert(1)"><rect width="10" height="10"/></g></svg>',
    '<svg><foreignObject><img src=x onerror="alert(1)"></foreignObject></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><animate onbegin="alert(1)" attributeName="x"/></svg>',
  ];
  for (const payload of payloads) {
    const clean = sanitizeHtml(payload, "svg");
    assert.ok(!XSS(clean), `payload survived: ${payload} -> ${clean}`);
    assert.ok(!clean.toLowerCase().includes("alert"), `alert() survived: ${payload} -> ${clean}`);
  }
});

test("svg: mermaid's real output shape survives — <style>, foreignObject labels, paths", () => {
  const mermaidish =
    '<svg id="d1" width="200" height="100" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">' +
    "<style>#d1 .node rect{fill:#eee;stroke:#333}</style>" +
    '<g class="node"><rect x="1" y="1" width="80" height="40" rx="4"/>' +
    '<foreignObject width="80" height="40"><div class="label"><b>Start</b></div></foreignObject></g>' +
    '<path d="M10 10 L90 90" stroke="#333" marker-end="url(#arrow)"/>' +
    '<marker id="arrow"><path d="M0 0 L10 5 L0 10 z"/></marker></svg>';

  const clean = sanitizeHtml(mermaidish, "svg");
  assert.ok(clean.includes("<style"), `mermaid <style> stripped — diagrams render unstyled: ${clean}`);
  assert.ok(clean.includes("foreignObject") || clean.includes("foreignobject"), `HTML labels stripped: ${clean}`);
  assert.ok(clean.includes("<path"), `paths stripped: ${clean}`);
  assert.ok(clean.includes("<marker") , `markers (arrowheads) stripped: ${clean}`);
  assert.ok(clean.includes("Start"), `label text stripped: ${clean}`);
});

// ----------------------------------------------------------------------- code

test("code: keeps lowlight spans, drops everything else", () => {
  const clean = sanitizeHtml('<span class="hljs-keyword">const</span> x = 1;', "code");
  assert.equal(clean, '<span class="hljs-keyword">const</span> x = 1;');

  const evil = sanitizeHtml('<span class="hljs-x" onclick="alert(1)">x</span><img src=x onerror=alert(1)>', "code");
  assert.ok(!XSS(evil), `handler survived in code profile: ${evil}`);
  assert.ok(!evil.includes("<img"), `img survived in code profile: ${evil}`);
});

// ---------------------------------------------------------------------- table

test("table: keeps SheetJS table structure, drops script and handlers", () => {
  const clean = sanitizeHtml(
    '<table><tr><td id="A1">1</td><td colspan="2"><a href="https://x.example">link</a></td></tr></table>',
    "table"
  );
  assert.ok(clean.includes("<table"), `table stripped: ${clean}`);
  assert.ok(clean.includes('colspan="2"'), `colspan stripped: ${clean}`);
  assert.ok(clean.includes('href="https://x.example"'), `hyperlink stripped: ${clean}`);

  const evil = sanitizeHtml('<table><tr><td onmouseover="alert(1)"><script>alert(1)</script>x</td></tr></table>', "table");
  assert.ok(!XSS(evil), `payload survived in table profile: ${evil}`);
});
