import test from "node:test";
import assert from "node:assert/strict";
import { parseAllowedUsers } from "../server/telegram/config";
import {
  chunkText,
  escapeMarkdownV2,
  previewText,
  renderMarkdownV2,
} from "../server/telegram/format";
import {
  BOOT_BACKLOG_MAX_AGE_MS,
  parseAtMention,
  splitBootBacklog,
} from "../server/telegram/parse";
import {
  checkAndRecordRate,
  getChatState,
  clearAllChatState,
  switchRoom,
  RATE_LIMIT_MAX,
} from "../server/telegram/session-store";
import type { TgUpdate } from "../server/telegram/bot-api";

// ---------------------------------------------------------------------------
// Allowlist parsing
// ---------------------------------------------------------------------------

test("parseAllowedUsers accepts comma/space separated numeric ids", () => {
  assert.deepEqual(parseAllowedUsers("123456789, 987654321 555"), [
    123456789, 987654321, 555,
  ]);
});

test("parseAllowedUsers drops junk, negatives, and dupes; empty input → []", () => {
  assert.deepEqual(parseAllowedUsers("abc, -5, 42, 42, @user"), [42]);
  assert.deepEqual(parseAllowedUsers(""), []);
  assert.deepEqual(parseAllowedUsers(null), []);
});

// ---------------------------------------------------------------------------
// @slug parsing
// ---------------------------------------------------------------------------

test("parseAtMention extracts slug + rest and lowercases the slug", () => {
  assert.deepEqual(parseAtMention("@Editor fix the typo"), {
    slug: "editor",
    rest: "fix the typo",
  });
});

test("parseAtMention rejects bare @slug and non-mention text", () => {
  assert.equal(parseAtMention("@editor"), null);
  assert.equal(parseAtMention("hello @editor"), null);
  assert.equal(parseAtMention("email me at @ once"), null);
});

// ---------------------------------------------------------------------------
// MarkdownV2 rendering + chunking
// ---------------------------------------------------------------------------

test("escapeMarkdownV2 escapes every special character", () => {
  assert.equal(escapeMarkdownV2("a.b-c!d(e)"), "a\\.b\\-c\\!d\\(e\\)");
});

test("renderMarkdownV2 converts bold, inline code, and links", () => {
  const out = renderMarkdownV2("**bold** and `code` and [docs](https://x.dev/a_b)");
  assert.ok(out.includes("*bold*"));
  assert.ok(out.includes("`code`"));
  assert.ok(out.includes("[docs](https://x.dev/a_b)"));
});

test("renderMarkdownV2 keeps fenced code blocks intact and escapes around them", () => {
  const out = renderMarkdownV2("Run this:\n```js\nconst a = 1;\n```\nDone.");
  assert.ok(out.includes("```\nconst a = 1;\n```"));
  assert.ok(out.includes("Done\\."));
});

test("chunkText is a no-op under the limit", () => {
  assert.deepEqual(chunkText("short", 100), ["short"]);
});

test("chunkText splits at paragraph boundaries and respects the limit", () => {
  const para = "x".repeat(400);
  const text = [para, para, para].join("\n\n");
  const chunks = chunkText(text, 500);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.length <= 500);
});

test("chunkText reopens code fences across chunk boundaries", () => {
  const code = "```\n" + "line of code\n".repeat(100) + "```";
  const chunks = chunkText(code, 400);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    const fences = (c.match(/```/g) || []).length;
    assert.equal(fences % 2, 0, `chunk has unbalanced fences: ${JSON.stringify(c.slice(0, 40))}`);
  }
});

test("previewText flattens whitespace and truncates with an ellipsis", () => {
  assert.equal(previewText("a  b\nc"), "a b c");
  assert.equal(previewText("x".repeat(100), 10).length, 10);
  assert.ok(previewText("x".repeat(100), 10).endsWith("…"));
});

// ---------------------------------------------------------------------------
// Boot fast-forward
// ---------------------------------------------------------------------------

function updateAt(id: number, ageMs: number, now: number): TgUpdate {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor((now - ageMs) / 1000),
      text: "hi",
      chat: { id: 1, type: "private" },
      from: { id: 7, is_bot: false },
    },
  };
}

test("splitBootBacklog drops stale updates and keeps fresh ones", () => {
  const now = 1_750_000_000_000;
  const updates = [
    updateAt(1, 60 * 60 * 1000, now), // 1h old → stale
    updateAt(2, BOOT_BACKLOG_MAX_AGE_MS + 1000, now), // just past cutoff → stale
    updateAt(3, 30 * 1000, now), // 30s old → fresh
  ];
  const { fresh, staleCount } = splitBootBacklog(updates, now);
  assert.equal(staleCount, 2);
  assert.deepEqual(fresh.map((u) => u.update_id), [3]);
});

test("splitBootBacklog treats updates without a message date as stale", () => {
  const now = 1_750_000_000_000;
  const { fresh, staleCount } = splitBootBacklog([{ update_id: 9 }], now);
  assert.equal(fresh.length, 0);
  assert.equal(staleCount, 1);
});

// ---------------------------------------------------------------------------
// Session store: rate limit + room switch invalidation
// ---------------------------------------------------------------------------

test("rate limit allows a burst then trips, and the window rolls", () => {
  clearAllChatState();
  const state = getChatState(100);
  const t0 = 1_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal(checkAndRecordRate(state, t0 + i), true, `hit ${i} should pass`);
  }
  assert.equal(checkAndRecordRate(state, t0 + RATE_LIMIT_MAX), false);
  // 61s later the window has rolled.
  assert.equal(checkAndRecordRate(state, t0 + 61_000), true);
});

test("switchRoom clears the conversation pointer and cached orchestrator", () => {
  clearAllChatState();
  const state = getChatState(200);
  state.conversationId = "conv-1";
  state.orchestratorSlug = "brain";
  switchRoom(state, "acme");
  assert.equal(state.roomPath, "acme");
  assert.equal(state.conversationId, null);
  assert.equal(state.orchestratorSlug, null);
});
