import test from "node:test";
import assert from "node:assert/strict";
import { HermesRunClient, HermesRunError } from "./run-client";
import type { HermesServerConfig } from "./server-config";

const config: HermesServerConfig = {
  apiBaseUrl: "http://hermes.test:8642", apiKey: "server-secret",
  managementBaseUrl: "http://hermes.test:56314", managementToken: "management-secret", gatewayBaseUrl: "http://hermes.test:8645",
  gatewayToken: "gateway-secret", profile: "operator-os", timeoutMs: 1_000,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("run client starts, polls, approves by stable identity, and stops", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, body: String(init?.body ?? "") });
    if (url.endsWith("/v1/runs")) return json({ run_id: "run_1", status: "started" }, 202);
    if (url.endsWith("/approval")) return json({ run_id: "run_1", choice: "once", resolved: 1 });
    if (url.endsWith("/stop")) return json({ run_id: "run_1", status: "stopping" });
    return json({ object: "hermes.run", run_id: "run_1", session_id: "session_1", status: "waiting_for_approval", pending_decision: { request_id: "req_1", command: "redacted", choices: ["once", "deny"] } });
  };
  const client = new HermesRunClient(config, fetchImpl);
  assert.deepEqual(await client.start({ input: "inspect" }), { runId: "run_1", status: "started" });
  assert.ok(calls[0]?.url.includes("/p/operator-os/v1/runs"));
  assert.equal((await client.get("run_1")).pendingDecision?.requestId, "req_1");
  assert.equal((await client.approve("run_1", "req_1", "once")).resolved, 1);
  assert.equal((await client.stop("run_1")).status, "stopping");
  assert.ok(calls.every((call) => !call.body.includes("server-secret")));
});

test("run client rejects stale approval identity before writing", async () => {
  const client = new HermesRunClient(config, async () => json({ run_id: "run_1", status: "waiting_for_approval", pending_decision: { request_id: "new" } }));
  await assert.rejects(() => client.approve("run_1", "old", "once"), (error: unknown) => error instanceof HermesRunError && error.code === "terminal");
});

test("run client assigns projection order to SSE and supports reconnect offsets", async () => {
  const stream = "data: {\"event\":\"tool.started\",\"run_id\":\"run_1\",\"timestamp\":1}\n\n: keepalive\n\ndata: {\"event\":\"run.completed\",\"run_id\":\"run_1\",\"timestamp\":2}\n\n";
  const client = new HermesRunClient(config, async () => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
  const events = [];
  for await (const event of client.stream("run_1", { startingSequence: 7 })) events.push(event);
  assert.deepEqual(events.map((event) => [event.sequence, event.event]), [[8, "tool.started"], [9, "run.completed"]]);
});

test("run client normalizes retryable and authentication failures", async () => {
  const auth = new HermesRunClient(config, async () => json({ error: { message: "bad key" } }, 401));
  await assert.rejects(() => auth.get("run_1"), (error: unknown) => error instanceof HermesRunError && error.code === "authentication_failure" && !error.retryable);
  const retry = new HermesRunClient(config, async () => json({}, 503));
  await assert.rejects(() => retry.get("run_1"), (error: unknown) => error instanceof HermesRunError && error.code === "retryable" && error.retryable);
  const profile = new HermesRunClient(config, async () => json({ error: { message: "Unknown or unconfigured profile" } }, 404));
  await assert.rejects(() => profile.get("run_1"), (error: unknown) => error instanceof HermesRunError && error.code === "unavailable_profile");
});
