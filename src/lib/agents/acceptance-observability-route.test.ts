import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAgentTurn,
  appendConversationTranscript,
  appendUserTurn,
  createConversation,
  deleteConversation,
  finalizeConversation,
  writeSession,
} from "@/lib/agents/conversation-store";
import {
  clearAcceptanceRuntimeObservation,
  recordAcceptanceRuntimeObservation,
} from "@/lib/agents/acceptance-observability";
import { GET } from "@/app/api/agents/conversations/[id]/acceptance-observability/route";

function setAcceptanceEnvironment(): () => void {
  const previous = {
    enabled: process.env.CABINET_ACCEPTANCE_OBSERVABILITY,
    isolated: process.env.CABINET_ACCEPTANCE_ISOLATED,
    mode: process.env.CABINET_RUNTIME_MODE,
  };
  process.env.CABINET_ACCEPTANCE_OBSERVABILITY = "1";
  process.env.CABINET_ACCEPTANCE_ISOLATED = "1";
  process.env.CABINET_RUNTIME_MODE = "hermes";
  return () => {
    if (previous.enabled === undefined) delete process.env.CABINET_ACCEPTANCE_OBSERVABILITY;
    else process.env.CABINET_ACCEPTANCE_OBSERVABILITY = previous.enabled;
    if (previous.isolated === undefined) delete process.env.CABINET_ACCEPTANCE_ISOLATED;
    else process.env.CABINET_ACCEPTANCE_ISOLATED = previous.isolated;
    if (previous.mode === undefined) delete process.env.CABINET_RUNTIME_MODE;
    else process.env.CABINET_RUNTIME_MODE = previous.mode;
  };
}

test("acceptance observability route is indistinguishable from missing when disabled", async () => {
  const previous = process.env.CABINET_ACCEPTANCE_OBSERVABILITY;
  delete process.env.CABINET_ACCEPTANCE_OBSERVABILITY;
  try {
    const response = await GET(new Request("http://127.0.0.1/"), {
      params: Promise.resolve({ id: "not-visible" }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  } finally {
    if (previous === undefined) delete process.env.CABINET_ACCEPTANCE_OBSERVABILITY;
    else process.env.CABINET_ACCEPTANCE_OBSERVABILITY = previous;
  }
});

test("acceptance observability returns content-free 2/2 counts and provider diagnostics", async () => {
  const restore = setAcceptanceEnvironment();
  const meta = await createConversation({
    agentSlug: "general",
    title: "private title",
    trigger: "manual",
    prompt: "private initial prompt",
    providerId: "hermes",
    adapterType: "hermes_runtime",
  });
  try {
    await appendConversationTranscript(meta.id, "private initial response");
    await writeSession(meta.id, {
      kind: "hermes_runtime",
      resumeId: "private-native-session",
      alive: true,
    });
    await finalizeConversation(meta.id, {
      status: "completed",
      exitCode: 0,
      output: "private initial response",
    });
    await appendUserTurn(meta.id, {
      content: "private follow-up prompt",
      requestId: "private-follow-up-request",
    });
    await appendAgentTurn(meta.id, {
      content: "private follow-up response",
      requestId: "private-follow-up-request",
      exitCode: 0,
    });
    recordAcceptanceRuntimeObservation(meta.id, {
      readinessState: "ready",
      provider: "ollama-cloud",
      model: "glm-5.2",
      modelRequestsAttempted: 2,
      providerRetries: 0,
      fallbackAttempts: 0,
      lastProviderHttpStatus: "2xx",
      lastFailureClass: "none",
      acpChildState: "running",
    });

    const response = await GET(new Request("http://127.0.0.1/"), {
      params: Promise.resolve({ id: meta.id }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body.durableStoreCounts, {
      user: 2,
      assistant: 2,
      running: 0,
      failed: 0,
      completed: 4,
      completedAssistant: 2,
      total: 4,
    });
    assert.deepEqual(body.inMemoryCounts, body.durableStoreCounts);
    assert.equal(body.pendingRequiredWrites, 0);
    assert.equal(body.provider, "ollama-cloud");
    assert.equal(body.model, "glm-5.2");
    assert.equal(body.modelRequestsAttempted, 2);
    assert.equal(body.providerRetries, 0);
    assert.equal(body.fallbackAttempts, 0);
    assert.doesNotMatch(
      JSON.stringify(body),
      /private|prompt|response|content|header|endpoint|environment|path/i,
    );
  } finally {
    clearAcceptanceRuntimeObservation(meta.id);
    await deleteConversation(meta.id);
    restore();
  }
});
