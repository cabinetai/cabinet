import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { htmlToMarkdown } from "@/lib/markdown/to-markdown";

// Regression: editor saves run htmlToMarkdown over Tiptap's `<label>`-wrapped
// task items. turndown-plugin-gfm only handles `<input>` directly under `<li>`,
// so without our taskItem rule, `- [ ]` degraded to a plain `-` on every save.

test("htmlToMarkdown converts Tiptap task items to GFM checkboxes", () => {
  const html =
    '<ul data-type="taskList" class="task-list">' +
    '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>todo</p></div></li>' +
    '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>done</p></div></li>' +
    "</ul>";
  const md = htmlToMarkdown(html);
  assert.match(md, /- \[ \] todo/);
  assert.match(md, /- \[x\] done/);
});

test("task list survives a full markdown round-trip", async () => {
  const md = "# T\n\n- [ ] todo\n- [x] done\n";
  const back = htmlToMarkdown(await markdownToHtml(md, "p"));
  assert.match(back, /- \[ \] todo/);
  assert.match(back, /- \[x\] done/);
  // …and re-renders to a real task list (idempotent), not a plain bullet list.
  const html2 = await markdownToHtml(back, "p");
  assert.ok(html2.includes('data-type="taskList"'));
  assert.ok(html2.includes('data-checked="true"'));
});
