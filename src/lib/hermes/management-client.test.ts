import test from "node:test";
import assert from "node:assert/strict";
import { HermesManagementClient } from "./management-client";
import type { HermesServerConfig } from "./server-config";

const secret = "HERMES_BROWSER_LEAK_CANARY_7f4d9c";
const config: HermesServerConfig = {
  apiBaseUrl: "http://hermes.test:8642",
  apiKey: secret,
  managementBaseUrl: "http://hermes.test:56314",
  managementToken: "management-secret",
  gatewayBaseUrl: "http://hermes.test:8645",
  gatewayToken: "gateway-secret",
  profile: "operator-os",
  timeoutMs: 1_000,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("management health normalizes version and profile without returning credentials", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    if (url.endsWith("/health/detailed")) {
      return response({ status: "ok", version: "0.18.2", gateway_state: "running", raw_secret: secret });
    }
    return response({ profiles: ["default", "operator-os"], unrelated_secret: secret });
  };

  const result = await new HermesManagementClient(config, fetchImpl).health();

  assert.equal(result.status, "online");
  assert.equal(result.version, "0.18.2");
  assert.equal(result.profile, "operator-os");
  assert.equal(result.gatewayState, "running");
  assert.equal(requests[0]?.authorization, `Bearer ${secret}`);
  assert.equal(requests[1]?.authorization, null);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).toLowerCase().includes("authorization"));
});

test("management health distinguishes authentication, profile, and connection failures", async () => {
  const auth = await new HermesManagementClient(
    config,
    async () => response({ error: "invalid key" }, 401)
  ).health();
  assert.equal(auth.status, "authentication_failure");

  const unavailable = await new HermesManagementClient(
    config,
    async (input) =>
      String(input).endsWith("/health/detailed")
        ? response({ status: "ok", version: "0.18.2" })
        : response({ profiles: ["default"] })
  ).health();
  assert.equal(unavailable.status, "unavailable_profile");

  const offline = await new HermesManagementClient(config, async () => {
    throw new TypeError("connection refused");
  }).health();
  assert.equal(offline.status, "offline");
});

test("Kanban run intervention client uses exact installed contracts and keeps claim identity server-side", async () => {
  const requests: Array<{ url: string; method: string; body: unknown; token: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
      token: new Headers(init?.headers).get("x-hermes-session-token"),
    });
    if (url.endsWith("/terminate")) return response({ ok: true, run_id: 17, task_id: 23, token: secret });
    return response({ run: { id: 17, task_id: 23, status: "running", claim_lock: secret, started_at: "2026-07-20T03:20:00Z", ended_at: null } });
  };
  const client = new HermesManagementClient(config, fetchImpl);
  const run = await client.readKanbanRun("17");
  const result = await client.terminateKanbanRun("17", "Stop the duplicate worker safely");
  assert.equal(run.runId, "17");
  assert.equal(run.claimIdentity, secret);
  assert.deepEqual(result, { runId: "17", taskId: "23" });
  assert.deepEqual(requests.map((item) => [item.method, item.url]), [
    ["GET", "http://hermes.test:56314/api/plugins/kanban/runs/17"],
    ["POST", "http://hermes.test:56314/api/plugins/kanban/runs/17/terminate"],
  ]);
  assert.deepEqual(requests[1]?.body, { reason: "Stop the duplicate worker safely" });
  assert.ok(requests.every((item) => item.token === config.managementToken));
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("management snapshot normalizes canonical surfaces and never returns its session token", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/health/detailed")) return response({ version: "0.18.2" });
    if (url.endsWith("/api/status")) return response({ profiles: ["operator-os"] });
    if (url.includes("/soul")) return response({ exists: true, content: "Operator rules" });
    if (url.includes("/api/profiles")) return response({ profiles: [{ name: "operator-os", skill_count: 2, has_env: true }] });
    if (url.includes("/api/skills")) return response([{ name: "research", enabled: true, provenance: "agent", usage: 3 }]);
    if (url.includes("/api/cron/jobs")) return response([{ id: "job_1", name: "Daily", enabled: true, schedule_display: "daily" }]);
    if (url.includes("/api/memory")) return response({ active: "supermemory", providers: [{ name: "supermemory", configured: true, available: true }], builtin_files: {} });
    if (url.includes("/api/mcp/servers")) return response({ servers: [{ name: "files", command: "server", enabled: true }] });
    if (url.includes("/api/tools/toolsets")) return response([{ name: "executor", label: "Executor", enabled: true, configured: true, tools: ["run"] }]);
    return response([{ name: "opencli", label: "OpenCLI", version: "1.0", source: "bundled" }]);
  };
  const result = await new HermesManagementClient(config, fetchImpl).snapshot();
  assert.equal(result.profile, "operator-os");
  assert.equal(result.skills[0]?.name, "research");
  assert.equal(result.agentManifest.content, "Operator rules");
  assert.equal(result.memory.namespace, "operator-os:supermemory");
  assert.equal(result.memory.recallHealth, "healthy");
  assert.equal(result.toolsets[0]?.toolCount, 1);
  assert.ok(config.managementToken && !JSON.stringify(result).includes(config.managementToken));
});

test("operator projection returns exact live records while stripping credential fields", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/plugins/kanban/workers/active")) return response({ workers: [{ id: "worker_1", run_id: "run_1", session_id: "session_1", task: "Review invoices", profile: "operator-os", state: "running", current_tool: "browser", started_at: 1_784_400_000 }] });
    if (url.includes("/api/plugins/kanban/board")) return response({ columns: [{ name: "Done", tasks: [{ id: "worker_0", task: "Check calendar", profile: "operator-os", status: "completed", result: "No conflict" }] }] });
    if (url.includes("/api/messaging/platforms")) return response({ platforms: [{ id: "telegram", name: "Telegram", enabled: true, configured: true, state: "connected", updated_at: "2026-07-19T20:00:00Z", home_channel: "Operations", env_vars: [{ key: "TELEGRAM_BOT_TOKEN", redacted_value: secret }] }] });
    if (url.includes("/api/sessions?")) return response({ sessions: [{ id: "session_1", title: "Invoice review", profile_name: "operator-os", source: "cabinet", is_active: true, started_at: 1_784_400_000, last_active: 1_784_400_300, archived: false, model: "model-a", preview: "Review the invoice" }] });
    if (url.includes("/api/learning/graph")) return response({ nodes: [{ id: "node_1", label: "Tax deadline", source: "manual", profile: "operator-os", updated_at: "2026-07-19T20:00:00Z" }], edges: [{ source: "node_1", target: "node_2", relationship: "supports" }] });
    if (url.includes("/api/model/info")) return response({ provider: "provider-a", model: "model-a", effective_context_length: 128_000, capabilities: { supports_tools: true, supports_vision: false, supports_reasoning: true }, api_key: secret });
    if (url.includes("/api/model/options")) return response({ providers: [{ slug: "provider-a", name: "Provider A", authenticated: true, is_current: true, models: ["model-a"], total_models: 1, access_token: secret }] });
    if (url.includes("/api/files")) return response({ entries: [{ name: "invoice-report.pdf", path: "/safe/invoice-report.pdf", mime_type: "application/pdf", size: 42, mtime: 1_784_400_000, is_directory: false }] });
    if (url.endsWith("/api/status")) return response({ profiles: ["operator-os"], gateway_mode: "single", gateway_state: "running", gateway_running: true, gateway_updated_at: "2026-07-19T20:00:00Z", active_agents: 1, active_sessions: 1 });
    if (url.includes("/api/profiles")) return response({ profiles: [{ name: "operator-os" }] });
    if (url.includes("/soul")) return response({ exists: true, content: "Operator rules" });
    if (url.includes("/api/memory")) return response({ active: "supermemory", providers: [{ name: "supermemory", configured: true, available: true }], builtin_files: {} });
    if (url.includes("/api/mcp/servers")) return response({ servers: [] });
    return response([]);
  };
  const health = { enabled: true, status: "online" as const, version: "0.18.2", profile: "operator-os", gatewayState: "running", checkedAt: "2026-07-19T20:00:00Z", message: "online" };
  const result = await new HermesManagementClient(config, fetchImpl).snapshot(health);

  assert.equal(result.operator.agents.active[0]?.task, "Review invoices");
  assert.equal(result.operator.agents.recent[0]?.result, "No conflict");
  assert.equal(result.operator.messaging[0]?.accountOrChannel, "Operations");
  assert.equal(result.operator.sessions[0]?.profile, "operator-os");
  assert.equal(result.operator.artifacts[0]?.kind, "report");
  assert.equal(result.operator.memoryGraph.edges[0]?.relationship, "supports");
  assert.equal(result.operator.model.model, "model-a");
  assert.equal(result.operator.providers[0]?.authenticated, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("TELEGRAM_BOT_TOKEN"), false);
});

test("management writes scope hub installs and job skill attachments to the active profile", async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return response({ ok: true });
  };
  const client = new HermesManagementClient(config, fetchImpl);

  await client.perform("skill.install", { identifier: "official/gifs/gif-search" });
  await client.perform("job.create", {
    name: "Daily intake",
    prompt: "Review intake",
    schedule: "every day at 9am",
    skills: ["research", "summarize"],
  });

  assert.equal(requests[0]?.url, "http://hermes.test:56314/api/skills/hub/install");
  assert.deepEqual(requests[0]?.body, { identifier: "official/gifs/gif-search", profile: "operator-os" });
  assert.equal(requests[1]?.url, "http://hermes.test:56314/api/cron/jobs?profile=operator-os");
  assert.deepEqual(requests[1]?.body, {
    name: "Daily intake",
    prompt: "Review intake",
    schedule: "every day at 9am",
    skills: ["research", "summarize"],
    deliver: "local",
  });
});
