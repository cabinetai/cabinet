import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as runtimeGet } from "@/app/api/optale/slack-agent-policy/route";
import {
  isValidOptaleSlackPolicyServiceRequest,
  normalizeOptaleSlackAgentPolicy,
  readOptaleSlackAgentPolicy,
  writeOptaleSlackAgentPolicy,
} from "./slack-agent-policy";

async function withPolicyRoot<T>(callback: () => Promise<T>): Promise<T> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-slack-policy-"),
  );
  const previousRoot = process.env.OPTALE_SLACK_AGENT_POLICY_ROOT;
  const previousToken = process.env.OPTALE_CONSOLE_POLICY_API_KEY;
  process.env.OPTALE_SLACK_AGENT_POLICY_ROOT = tempRoot;

  try {
    return await callback();
  } finally {
    if (previousRoot === undefined) {
      delete process.env.OPTALE_SLACK_AGENT_POLICY_ROOT;
    } else {
      process.env.OPTALE_SLACK_AGENT_POLICY_ROOT = previousRoot;
    }
    if (previousToken === undefined) {
      delete process.env.OPTALE_CONSOLE_POLICY_API_KEY;
    } else {
      process.env.OPTALE_CONSOLE_POLICY_API_KEY = previousToken;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("normalizes Slack policy bounds and booleans", () => {
  const policy = normalizeOptaleSlackAgentPolicy({
    enabled: false,
    responseMode: "observe",
    context: {
      currentThread: false,
      maxThreadMessages: 500,
      maxReferencedThreads: -10,
    },
    tools: {
      postReplies: false,
      runCommand: true,
    },
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.responseMode, "observe");
  assert.equal(policy.context.currentThread, false);
  assert.equal(policy.context.maxThreadMessages, 20);
  assert.equal(policy.context.maxReferencedThreads, 0);
  assert.equal(policy.tools.postReplies, false);
  assert.equal(policy.tools.runCommand, true);
  assert.equal(policy.memory.companyBrain, true);
});

test("persists Slack policy updates", async () => {
  await withPolicyRoot(async () => {
    const written = await writeOptaleSlackAgentPolicy(
      {
        responseMode: "observe",
        context: { maxThreadMessages: 8 },
        memory: { clientBrain: true },
      },
      { now: new Date("2026-05-05T15:00:00.000Z") },
    );
    assert.equal(written.responseMode, "observe");
    assert.equal(written.context.maxThreadMessages, 8);
    assert.equal(written.memory.clientBrain, true);

    const reread = await readOptaleSlackAgentPolicy();
    assert.equal(reread.responseMode, "observe");
    assert.equal(reread.context.maxThreadMessages, 8);
    assert.equal(reread.updatedAt, "2026-05-05T15:00:00.000Z");
  });
});

test("runtime Slack policy endpoint requires service bearer token", async () => {
  await withPolicyRoot(async () => {
    process.env.OPTALE_CONSOLE_POLICY_API_KEY = "service-token";
    await writeOptaleSlackAgentPolicy({ enabled: false });

    const unauthorized = await runtimeGet(
      new NextRequest("https://console.optale.no/api/optale/slack-agent-policy"),
    );
    assert.equal(unauthorized.status, 401);

    const authorizedRequest = new NextRequest(
      "https://console.optale.no/api/optale/slack-agent-policy",
      { headers: { Authorization: "Bearer service-token" } },
    );
    assert.equal(
      isValidOptaleSlackPolicyServiceRequest(authorizedRequest.headers),
      true,
    );
    const authorized = await runtimeGet(authorizedRequest);
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.equal(body.policy.enabled, false);
  });
});
