import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { buildManualConversationPrompt } from "../src/lib/agents/conversation-runner";
import {
  parseCabinetBlock,
  transcriptShowsCompletedRun,
} from "../src/lib/agents/conversation-store";

test("parseCabinetBlock strips Claude spinner noise from artifact lines", () => {
  const parsed = parseCabinetBlock([
    "SUMMARY: Created Harry Potter 10-character relationship diagram ───────────────────────❯",
    "CONTEXT: New KB section for Harry Potter character overview",
    "ARTIFACT: harry-potter/characters.mermaid",
    "ARTIFACT: harry-potter/index.md ✽Undulating… (41s · ↓ 1.1k tokens)",
  ].join("\n"));

  assert.equal(
    parsed.summary,
    "Created Harry Potter 10-character relationship diagram"
  );
  assert.equal(
    parsed.contextSummary,
    "New KB section for Harry Potter character overview"
  );
  assert.deepEqual(parsed.artifactPaths, [
    "harry-potter/characters.mermaid",
    "harry-potter/index.md",
  ]);
});

test("manual cabinet-scoped prompts explicitly pin work to the cabinet root", async () => {
  const prompt = await buildManualConversationPrompt({
    agentSlug: "general",
    userMessage: "Make a diagram",
    cabinetPath: "demo-cabinet",
  });

  assert.equal(
    prompt.cwd,
    path.join(DATA_DIR, "demo-cabinet")
  );
  assert.match(
    prompt.prompt,
    /Work only inside the cabinet-scoped knowledge base rooted at \/data\/demo-cabinet\./
  );
  assert.match(
    prompt.prompt,
    /Do not create or modify files in sibling cabinets or the global \/data root/
  );
  assert.match(
    prompt.prompt,
    /Prefer Mermaid edge labels like `A -->\|label\| B` or `A -\.\->\|label\| B`/
  );
});

test("parseCabinetBlock ignores echoed cabinet template placeholders from Claude prompt echo", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
    "4. **Brand voice** — maintain consistent tone and messaging",
    "## Working Style",
  ].join("\n");

  const parsed = parseCabinetBlock(
    [
      "SUMMARY: oneshortsummaryline",
      "CONTEXT: optionallightweightmemory/contextsummary",
      "ARTIFACT: relative/path/to/file1 4. **Brand voice** — maintain consistent tone and messaging ## Working Style",
      "❯",
    ].join("\n"),
    prompt
  );

  assert.equal(parsed.summary, undefined);
  assert.equal(parsed.contextSummary, undefined);
  assert.deepEqual(parsed.artifactPaths, []);
});

test("transcriptShowsCompletedRun waits for a real Claude cabinet result before the idle prompt", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  const transcript = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: oneshortsummaryline",
    "CONTEXT: optionallightweightmemory/contextsummary",
    "ARTIFACT: relative/path/to/file",
    "❯",
  ].join("\n");

  assert.equal(transcriptShowsCompletedRun(transcript, prompt), false);
});

test("transcriptShowsCompletedRun accepts a real Claude cabinet result once the prompt returns", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  const transcript = [
    "Here are three short Harry Potter poems saved to the cabinet.",
    "SUMMARY: Wrote three Harry Potter poems",
    "CONTEXT: Added a whimsical draft for future expansion",
    "ARTIFACT: marketing/drafts/harry-potter-poems.md",
    "❯",
  ].join("\n");

  assert.equal(transcriptShowsCompletedRun(transcript, prompt), true);
});

test("transcriptShowsCompletedRun accepts Claude's idle prompt banner after fragmented result output", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  const transcript = [
    "SUMMARY: Added 10 new Harry Potter poems (11-20)",
    "❯",
    "⏵⏵bypasspermissionson (shift+tabtocycle·",
    "CONTEXT: Harry Potter poems collection now has 20 total poems",
    "❯",
    "⏵⏵bypasspermissionson (shift+tabtocycle·",
    "ARTIFACT: harry-potter/poems/index.md",
    "ARTIFACT: harry-potter/index.md",
    "✢",
    "Brewed for 1m 43s",
    "❯",
    "⏵⏵ bypass permissions on (shift+tab to cycle)",
    "",
  ].join("\n");

  assert.equal(transcriptShowsCompletedRun(transcript, prompt), true);
});

test("transcriptShowsCompletedRun stays running when Claude is still interruptible after a partial result", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  const transcript = [
    "SUMMARY: Added 10 new Harry Potter poems (11-20)",
    "ARTIFACT: harry-potter/poems/index.md",
    "❯",
    "⏵⏵bypasspermissionson (shift+tabtocycle)·esctointerrupt●high·/effort",
    "✳ Churning… (1m 43s · ↓2.4k tokens)",
  ].join("\n");

  assert.equal(transcriptShowsCompletedRun(transcript, prompt), false);
});

test("transcriptShowsCompletedRun detects completion when timing verb and prompt merge onto one line", () => {
  const prompt = [
    "At the end of your response, include a ```cabinet block with these fields:",
    "SUMMARY: one short summary line",
    "CONTEXT: optional lightweight memory/context summary",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  const transcript = [
    "SUMMARY: Added second Hagrid poem",
    "ARTIFACT: garden/hagrid/index.md",
    "⏵⏵bypasspermissionson (shift+tabtocycle·",
    "✻Sautéed for 31s",
    "───────────────────────────────────────────────────",
    "❯   ⏵⏵ bypass permissions on (shift+tab to cycle)",
  ].join("\n");

  assert.equal(transcriptShowsCompletedRun(transcript, prompt), true);
});

test("transcriptShowsCompletedRun handles any cooking verb in the completion timing line", () => {
  const prompt = [
    "SUMMARY: one short summary line",
    "ARTIFACT: relative/path/to/file for every KB file you created or updated",
  ].join("\n");

  for (const verb of ["Brewed", "Sautéed", "Baked", "Churned", "Crunched", "Searched"]) {
    const transcript = [
      "SUMMARY: Created a page about dragons",
      "ARTIFACT: dragons/index.md",
      `✻ ${verb} for 1m 43s`,
      "❯",
    ].join("\n");

    assert.equal(
      transcriptShowsCompletedRun(transcript, prompt),
      true,
      `should detect completion with timing verb "${verb}"`,
    );
  }
});
