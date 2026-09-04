import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { htmlToMarkdown } from "@/lib/markdown/to-markdown";

test("code block survives a full markdown round-trip without adding empty lines", async () => {
  const md = "# Code Block Test\n\n```javascript\nconst x = 1;\nconsole.log(x);\n```\n";
  const html1 = await markdownToHtml(md, "test-page");
  const md1 = htmlToMarkdown(html1);

  // Assert no extra newline/empty line at the end of the code block
  assert.ok(!md1.includes("console.log(x);\n\n```"), "Should not contain extra trailing newline inside the code block");
  assert.ok(md1.includes("console.log(x);\n```"), "Should end code block immediately after the statement");

  // Run another roundtrip to verify idempotency
  const html2 = await markdownToHtml(md1, "test-page");
  const md2 = htmlToMarkdown(html2);
  assert.ok(!md2.includes("console.log(x);\n\n```"), "Should not contain extra trailing newline inside the code block after second round-trip");
  assert.ok(md2.includes("console.log(x);\n```"), "Should end code block immediately after the statement after second round-trip");
});

test("code block with intentional trailing empty lines preserves them exactly", async () => {
  const md = "# Code Block Test\n\n```javascript\nconst x = 1;\n\n\n\n```\n";
  const html1 = await markdownToHtml(md, "test-page");
  const md1 = htmlToMarkdown(html1);

  // Should have exactly 3 empty lines at the end (represented by 3 newlines before the closing fence)
  assert.ok(md1.includes("const x = 1;\n\n\n\n```"), "Should preserve exactly 3 trailing newlines inside the code block");

  // Run another roundtrip to verify idempotency
  const html2 = await markdownToHtml(md1, "test-page");
  const md2 = htmlToMarkdown(html2);
  assert.ok(md2.includes("const x = 1;\n\n\n\n```"), "Should still preserve exactly 3 trailing newlines after second round-trip");
});

test("code block with internal empty lines preserves them exactly", async () => {
  const md = "# Code Block Test\n\n```javascript\nconst x = 1;\n\n\nconsole.log(x);\n```\n";
  const html1 = await markdownToHtml(md, "test-page");
  const md1 = htmlToMarkdown(html1);

  assert.ok(md1.includes("const x = 1;\n\n\nconsole.log(x);\n```"), "Should preserve exactly 2 internal empty lines");

  // Run another roundtrip to verify idempotency
  const html2 = await markdownToHtml(md1, "test-page");
  const md2 = htmlToMarkdown(html2);
  assert.ok(md2.includes("const x = 1;\n\n\nconsole.log(x);\n```"), "Should still preserve exactly 2 internal empty lines");
});
