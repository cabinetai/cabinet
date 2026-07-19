import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHermesActivity } from "./activity";

test("normalizes tools and stable governed requests without sensitive response values", () => {
  const snapshot = normalizeHermesActivity([
    {
      seq: 1,
      type: "runtime.event",
      runtimeType: "tool.start",
      runId: "run-1",
      payload: { tool_id: "tool-1", name: "read_file", context: "README.md" },
    },
    {
      seq: 2,
      type: "runtime.event",
      runtimeType: "tool.complete",
      runId: "run-1",
      payload: { tool_id: "tool-1", name: "read_file", summary: "Read 20 lines" },
    },
    {
      seq: 3,
      type: "runtime.event",
      runtimeType: "secret.request",
      runId: "run-1",
      sessionId: "session-1",
      requestId: "secret-1",
      payload: { request_id: "secret-1", env_var: "SERVICE_KEY", prompt: "Enter key" },
    },
    {
      seq: 4,
      type: "runtime.decision",
      kind: "secret",
      requestId: "secret-1",
      requestEventSeq: 3,
      sessionId: "session-1",
      status: "resolved",
      decision: "provided",
    },
  ]);

  assert.deepEqual(snapshot.tools[0], {
    id: "tool-1",
    name: "read_file",
    status: "completed",
    runId: "run-1",
    eventSeq: 2,
    context: "README.md",
    preview: null,
    summary: "Read 20 lines",
    error: null,
    durationSeconds: null,
    inlineDiff: null,
    artifacts: [],
    screenshots: [],
    links: [],
    retryable: false,
  });
  assert.equal(snapshot.decisions[0].status, "resolved");
  assert.equal(snapshot.decisions[0].decision, "provided");
  assert.equal(JSON.stringify(snapshot).includes("SERVICE_KEY"), true);
  assert.equal(JSON.stringify(snapshot).includes("secret-value"), false);
});

test("only marks failed read-only tools as directly retryable", () => {
  const snapshot = normalizeHermesActivity([
    {
      seq: 0,
      type: "runtime.event",
      runtimeType: "tool.generating",
      payload: { name: "search_files" },
    },
    {
      seq: 1,
      type: "runtime.event",
      runtimeType: "tool.complete",
      payload: {
        tool_id: "read-1",
        name: "search_files",
        args: { pattern: "package.json" },
        result: { error: "temporary failure" },
      },
    },
    {
      seq: 2,
      type: "runtime.event",
      runtimeType: "tool.complete",
      payload: { tool_id: "write-1", name: "send_email", error: "temporary failure" },
    },
    {
      seq: 3,
      type: "runtime.event",
      runtimeType: "tool.complete",
      payload: {
        tool_id: "unsafe-prefix-1",
        name: "read_and_delete",
        result: { error: "temporary failure" },
      },
    },
  ]);
  assert.equal(snapshot.tools.length, 3);
  assert.equal(snapshot.tools[0].retryable, true);
  assert.match(snapshot.tools[0].preview || "", /package\.json/);
  assert.match(snapshot.tools[0].summary || "", /temporary failure/);
  assert.equal(snapshot.tools[1].retryable, false);
  assert.equal(snapshot.tools[2].retryable, false);
});
