import test from "node:test";
import assert from "node:assert/strict";
import { HermesRunClient, HermesRunError } from "./run-client";
import { HermesRunBridge } from "./run-bridge";
import type { HermesServerConfig } from "./server-config";

const config: HermesServerConfig = {
  apiBaseUrl: "http://hermes.test", apiKey: "api-secret", managementBaseUrl: "http://management.test",
  managementToken: "management-secret", gatewayBaseUrl: "http://gateway.test", gatewayToken: "gateway-secret",
  profile: "operator-os", timeoutMs: 1_000,
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

test("run bridge preserves context, ordered evidence, result, and reconciliation", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/v1/runs")) return json({ run_id: "run_1", status: "started" }, 202);
    if (url.endsWith("/events")) return new Response('data: {"event":"tool.started","run_id":"run_1","timestamp":1,"tool":"search"}\n\ndata: {"event":"run.completed","run_id":"run_1","timestamp":2,"output":"done","usage":{"total_tokens":7}}\n\n');
    return json({ object: "hermes.run", run_id: "run_1", status: "completed", output: "done", usage: { total_tokens: 7 } });
  };
  const bridge = new HermesRunBridge(new HermesRunClient(config, fetchImpl));
  const started = await bridge.start({ input: "work", context: "cockpit:item-1", capability: "research", idempotencyKey: "start-1" });
  assert.equal(started.context, "cockpit:item-1");
  for (let index = 0; index < 50 && bridge.get("run_1")?.status !== "completed"; index += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  const run = bridge.get("run_1");
  assert.equal(run?.status, "completed");
  assert.equal(run?.result, "done");
  assert.deepEqual(run?.events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal(run?.events.at(-1)?.event, "bridge.reconciled");
});

test("run bridge rejects approval when the stable pending identity is absent", async () => {
  const client = new HermesRunClient(config, async () => json({ run_id: "run_2", status: "started" }, 202));
  const bridge = new HermesRunBridge(client);
  await bridge.start({ input: "work", context: "test", idempotencyKey: "start-2" });
  await assert.rejects(() => bridge.approve("run_2", "stale", "once"), (error: unknown) => error instanceof HermesRunError && error.status === 409);
});
