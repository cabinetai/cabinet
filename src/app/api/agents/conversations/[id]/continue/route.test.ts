import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { agentAdapterRegistry } from "@/lib/agents/adapters/registry";
import type { AgentExecutionAdapter } from "@/lib/agents/adapters/types";

let tempRoot: string;
let store: typeof import("@/lib/agents/conversation-store");
let route: typeof import("./route");

before(async () => {
  tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cabinet-continue-route-test-")
  );
  process.env.CABINET_DATA_DIR = tempRoot;
  process.env.CABINET_TASK_RUNNER = "inprocess";
  store = await import("@/lib/agents/conversation-store");
  route = await import("./route");
});

after(async () => {
  agentAdapterRegistry.unregisterExternal("hermes_runtime");
  await store?.closeConversationStore();
  delete process.env.CABINET_TASK_RUNNER;
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("concurrent Hermes continue requests claim one durable prompt and never expose completed 2/1", async () => {
  let releaseExecution!: () => void;
  const executionGate = new Promise<void>((resolve) => {
    releaseExecution = resolve;
  });
  let executions = 0;
  const adapter: AgentExecutionAdapter = {
    type: "hermes_runtime",
    name: "Hermes acceptance fixture",
    executionEngine: "structured_cli",
    providerId: "hermes",
    supportsSessionResume: true,
    async testEnvironment() {
      return {
        adapterType: "hermes_runtime",
        status: "pass",
        checks: [],
        testedAt: new Date().toISOString(),
      };
    },
    async preflight() {
      return {
        contract: "hermes.conversation.readiness",
        schema_version: 1,
        profile: "operator-os",
        provider: "fixture",
        model: "fixture-model",
        model_source: "profile",
        credential_state: "present",
        endpoint_class: "local",
        ready: true,
        blocked_reason: null,
        attempts: {
          model_requests_attempted: 0,
          provider_retries: 0,
          fallback_attempts: 0,
          last_provider_http_status: null,
        },
      };
    },
    async execute() {
      executions += 1;
      await executionGate;
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        output: "Follow-up.\n```cabinet\nSUMMARY: follow-up\n```",
        sessionId: "native-session-stable",
        usage: { inputTokens: 10, outputTokens: 4 },
      };
    },
  };
  agentAdapterRegistry.registerExternal(adapter);

  const meta = await store.createConversation({
    agentSlug: "general",
    title: "Concurrent route acceptance",
    trigger: "manual",
    prompt: "User request:\ninitial",
    providerId: "hermes",
    adapterType: "hermes_runtime",
  });
  await store.appendConversationTranscript(
    meta.id,
    "Initial.\n```cabinet\nSUMMARY: initial\n```"
  );
  await store.writeSession(meta.id, {
    kind: "hermes_runtime",
    resumeId: "native-session-stable",
    alive: true,
  });
  await store.finalizeConversation(meta.id, {
    status: "completed",
    exitCode: 0,
    output: "Initial.\n```cabinet\nSUMMARY: initial\n```",
  });

  const request = () =>
    new NextRequest(
      `http://127.0.0.1:4315/api/agents/conversations/${encodeURIComponent(meta.id)}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessage: "follow-up" }),
      }
    );
  const params = { params: Promise.resolve({ id: meta.id }) };
  const responses = await Promise.all([
    route.POST(request(), params),
    route.POST(request(), params),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [202, 409],
    "one concurrent submission must be accepted and one must be rejected"
  );

  for (let index = 0; index < 50 && executions === 0; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(executions, 1, "only the accepted prompt may reach Hermes");

  const during = await store.readConversationDetail(meta.id, undefined, {
    withTurns: true,
  });
  assert.equal(during?.meta.status, "running");
  assert.equal(
    during?.turns?.filter((turn) => turn.role === "user").length,
    2
  );
  assert.equal(
    during?.turns?.filter((turn) => turn.role === "agent").length,
    2,
    "the second assistant identity exists only as a pending placeholder"
  );
  assert.equal(
    during?.turns?.filter(
      (turn) => turn.role === "agent" && !turn.pending
    ).length,
    1,
    "completed state must not be observable with only one durable assistant"
  );

  releaseExecution();
  let completed = await store.readConversationDetail(meta.id, undefined, {
    withTurns: true,
  });
  for (
    let index = 0;
    index < 100 && completed?.meta.status !== "completed";
    index += 1
  ) {
    const completedAssistantCount =
      completed?.turns?.filter(
        (turn) => turn.role === "agent" && !turn.pending
      ).length ?? 0;
    assert.equal(
      completed?.meta.status === "completed" &&
        (completedAssistantCount !== 2 ||
          completed.session?.resumeId !== "native-session-stable"),
      false,
      "completed must remain hidden until assistant and native session durability"
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
    completed = await store.readConversationDetail(meta.id, undefined, {
      withTurns: true,
    });
  }
  assert.equal(completed?.meta.status, "completed");
  assert.equal(
    completed?.turns?.filter((turn) => turn.role === "user").length,
    2
  );
  assert.equal(
    completed?.turns?.filter(
      (turn) => turn.role === "agent" && !turn.pending
    ).length,
    2
  );
  assert.equal(completed?.session?.resumeId, "native-session-stable");
  assert.equal(
    new Set(
      completed?.turns
        ?.filter((turn) => turn.turn === 2)
        .map((turn) => turn.requestId)
    ).size,
    1,
    "accepted user and assistant must share one prompt request identity"
  );
});

test("blocked Hermes readiness persists no running follow-up and dispatches no prompt", async () => {
  let executions = 0;
  agentAdapterRegistry.registerExternal({
    type: "hermes_runtime",
    name: "Hermes blocked readiness fixture",
    executionEngine: "structured_cli",
    providerId: "hermes",
    supportsSessionResume: true,
    async testEnvironment() {
      return {
        adapterType: "hermes_runtime",
        status: "fail",
        checks: [],
        testedAt: new Date().toISOString(),
      };
    },
    async preflight() {
      throw new Error("No effective Hermes model is configured for operator-os.");
    },
    async execute() {
      executions += 1;
      throw new Error("must not execute");
    },
  });
  const meta = await store.createConversation({
    agentSlug: "general",
    title: "Blocked readiness",
    trigger: "manual",
    prompt: "User request:\ninitial",
    providerId: "hermes",
    adapterType: "hermes_runtime",
  });
  await store.appendConversationTranscript(meta.id, "Initial response.");
  await store.finalizeConversation(meta.id, {
    status: "completed",
    exitCode: 0,
    output: "Initial response.",
  });

  const response = await route.POST(
    new NextRequest(
      `http://127.0.0.1:4315/api/agents/conversations/${encodeURIComponent(meta.id)}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessage: "must remain unaccepted" }),
      },
    ),
    { params: Promise.resolve({ id: meta.id }) },
  );
  assert.equal(response.status, 503);
  assert.equal(executions, 0);
  const detail = await store.readConversationDetail(meta.id, undefined, {
    withTurns: true,
  });
  assert.equal(detail?.meta.status, "completed");
  assert.equal(detail?.turns?.filter((turn) => turn.role === "user").length, 1);
  assert.equal(detail?.turns?.filter((turn) => turn.role === "agent").length, 1);
});
