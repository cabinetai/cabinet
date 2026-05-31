import test from "node:test";
import assert from "node:assert/strict";
import { parseTranscript } from "@/lib/agents/transcript-parser";

test("markdown bullet list is text, not a diff block", () => {
  const raw = [
    "**המסלול בקצרה:**",
    "- **ימים 1-4**: אורלנדו — דיסני וורלד ויוניברסל",
    "- **יום 5**: קנדי ספייס סנטר",
    "- **ימים 6-7**: חוף המפרץ — קלירווטר וטמפה",
    "- **יום 14**: חזרה ויציאה",
  ].join("\n");
  const blocks = parseTranscript(raw);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
  assert.ok(
    blocks[0].type === "text" && blocks[0].content.includes("ימים 1-4")
  );
});

test("English bullet list with dashes stays text", () => {
  const raw = "Plan:\n- buy milk\n- walk dog\n- write code\n- ship it";
  const blocks = parseTranscript(raw);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
});

test("a real header-less hunk (has @@) still renders as a diff", () => {
  const raw = [
    "@@ -1,3 +1,3 @@",
    "-const a = 1;",
    "+const a = 2;",
    " const b = 3;",
  ].join("\n");
  const blocks = parseTranscript(raw);
  assert.ok(blocks.some((b) => b.type === "diff"));
});

test("a diff with +++/--- file markers still renders as a diff", () => {
  const raw = [
    "--- a/foo.ts",
    "+++ b/foo.ts",
    "-old line",
    "+new line",
  ].join("\n");
  const blocks = parseTranscript(raw);
  assert.ok(blocks.some((b) => b.type === "diff"));
});

test("prose that happens to start lines with a dash is not a diff", () => {
  const raw =
    "Notes:\n- first thought\n- second thought\nMore prose here without dashes.";
  const blocks = parseTranscript(raw);
  assert.equal(blocks[0].type, "text");
  assert.ok(!blocks.some((b) => b.type === "diff"));
});
