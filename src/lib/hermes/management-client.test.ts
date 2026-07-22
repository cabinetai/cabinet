import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HermesManagementClient } from "./management-client";
import { readHermesReadOnlyServerConfig, type HermesServerConfig } from "./server-config";

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

test("Agent API health normalizes version without returning credentials or following redirects", async () => {
  const requests: Array<{ url: string; authorization: string | null; redirect: RequestRedirect | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      authorization: new Headers(init?.headers).get("authorization"),
      redirect: init?.redirect,
    });
    if (url.endsWith("/health/detailed")) {
      return response({ status: "ok", version: "0.18.2", gateway_state: "running", raw_secret: secret });
    }
    return response({ profiles: ["default", "operator-os"], unrelated_secret: secret });
  };

  const result = await new HermesManagementClient(config, fetchImpl).health();

  assert.equal(result.status, "online");
  assert.equal(result.version, "0.18.2");
  assert.equal(result.profile, null);
  assert.equal(result.profileSource, null);
  assert.equal(result.gatewayState, "running");
  assert.equal(requests[0]?.authorization, `Bearer ${secret}`);
  assert.equal(requests[0]?.redirect, "error");
  assert.equal(requests.length, 1);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).toLowerCase().includes("authorization"));
});

test("Agent API health records an active profile only when the endpoint explicitly reports one", async () => {
  const result = await new HermesManagementClient(config, async () => response({
    status: "ok",
    version: "0.19.0",
    active_profile: "operator-os",
  })).health();
  assert.equal(result.profile, "operator-os");
  assert.equal(result.profileSource, "GET /health/detailed");
});

test("Agent API health distinguishes authentication, probe, and authoritative stopped states", async () => {
  const auth = await new HermesManagementClient(
    config,
    async () => response({ error: "invalid key" }, 401)
  ).health();
  assert.equal(auth.status, "authentication_failure");

  const unavailable = await new HermesManagementClient(config, async () => {
    throw new TypeError("connection refused");
  }).health();
  assert.equal(unavailable.status, "probe_unavailable");
  assert.match(unavailable.message, /probe is temporarily unreachable/i);

  const endpointFailure = await new HermesManagementClient(config, async () => response({}, 503)).health();
  assert.equal(endpointFailure.status, "probe_unavailable");
  assert.doesNotMatch(endpointFailure.message, /offline/i);

  const stopped = await new HermesManagementClient(config, async () => response({ status: "stopped", version: "0.19.0" })).health();
  assert.equal(stopped.status, "offline");
  assert.match(stopped.message, /explicitly reported/i);
});

test("Agent API health classifies a timeout as a probe timeout rather than offline", async () => {
  const timeout = Object.assign(new Error("timeout"), { name: "AbortError" });
  const result = await new HermesManagementClient(config, async () => { throw timeout; }).health();
  assert.equal(result.status, "probe_timeout");
  assert.match(result.message, /health probe timed out/i);
  assert.notEqual(result.status, "offline");
});

test("authenticated Agent API health remains available when management and Gateway are unconfigured", async () => {
  const partial = readHermesReadOnlyServerConfig({
    CABINET_HERMES_API_URL: "http://127.0.0.1:8642",
    CABINET_HERMES_API_KEY: "partial-api-secret",
  });
  let requests = 0;
  const client = new HermesManagementClient(partial, async (_input, init) => {
    requests += 1;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer partial-api-secret");
    assert.equal(init?.redirect, "error");
    return response({ status: "ok", version: "0.18.2" });
  });
  assert.equal((await client.health()).status, "online");
  assert.equal((await client.managementStatus()).state, "not_configured");
  assert.equal(requests, 1);
});

test("Agent-only snapshot does not treat local OpenCLI diagnostics as a configured live source", async () => {
  const partial = readHermesReadOnlyServerConfig({
    CABINET_HERMES_API_URL: "http://127.0.0.1:8642",
    CABINET_HERMES_API_KEY: "partial-api-secret",
    CABINET_HERMES_PROFILE: "operator-os",
  });
  const client = new HermesManagementClient(partial, async (input) => {
    const url = String(input);
    if (url.endsWith("/health/detailed")) {
      return response({ status: "ok", version: "0.18.2" });
    }
    if (url.endsWith("/v1/capabilities")) return response({ object: "capabilities" });
    if (url.includes("/api/sessions?")) return response({ object: "list", data: [], has_more: false });
    if (url.endsWith("/v1/models")) return response({ object: "list", data: [{ id: "advertised-only", owned_by: "catalog-owner" }] });
    throw new Error("unconfigured sources must not be fetched");
  });

  const health = await client.health();
  const snapshot = await client.snapshot(health);

  assert.equal(snapshot.openCli.available, false);
  assert.equal(snapshot.openCli.daemon, "unknown");
  assert.match(snapshot.openCli.message, /not probed/i);
  assert.equal(snapshot.operator.model.currentModel, null);
  assert.equal(snapshot.operator.model.currentProvider, null);
  assert.equal(snapshot.operator.model.advertisedModels[0]?.displayId, "advertised-only");
  assert.deepEqual(snapshot.diagnostics, [{ area: "management source", status: "degraded", message: "Hermes Management is not configured for this review." }]);
});

test("management status uses its session-token boundary and distinguishes source outcomes", async () => {
  const requests: Array<{ token: string | null; redirect: RequestRedirect | undefined }> = [];
  const successful = await new HermesManagementClient(config, async (_input, init) => {
    requests.push({
      token: new Headers(init?.headers).get("x-hermes-session-token"),
      redirect: init?.redirect,
    });
    return response({ profiles: ["operator-os"], gateway_state: "running", session_token: secret, authorization: `Bearer ${secret}` });
  }).managementStatus();
  assert.equal(successful.state, "success");
  assert.equal(requests[0]?.token, config.managementToken);
  assert.equal(requests[0]?.redirect, "error");
  assert.doesNotMatch(JSON.stringify(successful), new RegExp(`${secret}|session_token|authorization`, "i"));

  let missingRequests = 0;
  const missing = await new HermesManagementClient(
    { ...config, managementToken: null },
    async () => { missingRequests += 1; return response({}); },
  ).managementStatus();
  assert.equal(missing.state, "not_configured");
  assert.equal(missingRequests, 0);

  const rejected = await new HermesManagementClient(config, async () => response({ detail: `bad ${secret}` }, 401)).managementStatus();
  assert.equal(rejected.state, "authentication_failure");
  assert.doesNotMatch(JSON.stringify(rejected), new RegExp(secret));

  const unknown = await new HermesManagementClient(config, async () => response({ profiles: ["default"] })).managementStatus();
  assert.equal(unknown.state, "unknown_profile");

  const failed = await new HermesManagementClient(config, async () => response({}, 422)).managementStatus();
  assert.equal(failed.state, "endpoint_failure");

  const redirectSecret = "management-redirect-secret";
  const redirected = await new HermesManagementClient(
    config,
    async () => new Response(null, { status: 302, headers: { Location: `https://example.com/?token=${redirectSecret}` } }),
  ).managementStatus();
  assert.equal(redirected.state, "endpoint_failure");
  assert.doesNotMatch(JSON.stringify(redirected), new RegExp(`${redirectSecret}|example\\.com`));

  const unavailable = await new HermesManagementClient(config, async () => { throw new TypeError("connection refused"); }).managementStatus();
  assert.equal(unavailable.state, "unavailable");
});

test("credential-bearing Agent API redirects fail closed without reaching the destination", async () => {
  let sourceRequests = 0;
  let destinationRequests = 0;
  const destination = createServer((_request, response) => {
    destinationRequests += 1;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ version: "redirected" }));
  });
  await new Promise<void>((resolve) => destination.listen(0, "127.0.0.1", resolve));
  const destinationAddress = destination.address();
  assert.ok(destinationAddress && typeof destinationAddress !== "string");
  const source = createServer((_request, response) => {
    sourceRequests += 1;
    response.writeHead(302, { Location: `http://127.0.0.1:${destinationAddress.port}/secret-destination` });
    response.end();
  });
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  const sourceAddress = source.address();
  assert.ok(sourceAddress && typeof sourceAddress !== "string");
  try {
    const redirected = await new HermesManagementClient({
      ...config,
      apiBaseUrl: `http://127.0.0.1:${sourceAddress.port}`,
    }).health();
    assert.equal(redirected.status, "probe_unavailable");
    assert.doesNotMatch(redirected.message, /offline/i);
    assert.equal(sourceRequests, 1);
    assert.equal(destinationRequests, 0);
    assert.doesNotMatch(JSON.stringify(redirected), /secret-destination|management-secret|HERMES_BROWSER_LEAK_CANARY/);
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => destination.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});

test("Kanban run intervention client uses exact installed contracts and keeps claim identity server-side", async () => {
  const requests: Array<{ url: string; method: string; body: unknown; token: string | null; redirect: RequestRedirect | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
      token: new Headers(init?.headers).get("x-hermes-session-token"),
      redirect: init?.redirect,
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
  assert.ok(requests.every((item) => item.redirect === "error"));
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

test("authenticated management collection remains available when Agent API and Gateway are unconfigured", async () => {
  const partial = readHermesReadOnlyServerConfig({
    CABINET_HERMES_MANAGEMENT_URL: "http://127.0.0.1:56314",
    CABINET_HERMES_MANAGEMENT_TOKEN: "partial-management-secret",
    CABINET_HERMES_PROFILE: "operator-os",
  });
  const requests: string[] = [];
  const client = new HermesManagementClient(partial, async (input, init) => {
    requests.push(String(input));
    assert.equal(new Headers(init?.headers).get("x-hermes-session-token"), "partial-management-secret");
    assert.equal(init?.redirect, "error");
    if (String(input).endsWith("/api/status")) return response({ profiles: ["operator-os"] });
    if (String(input).endsWith("/api/profiles")) return response({ profiles: [] });
    return response([]);
  });
  const health = await client.health();
  assert.equal(health.status, "misconfigured");
  assert.equal(requests.length, 0);
  const result = await client.snapshot(health);
  assert.equal(result.profile, "operator-os");
  assert.ok(requests.length > 1);
  assert.ok(requests.every((url) => url.startsWith("http://127.0.0.1:56314/")));
  assert.doesNotMatch(JSON.stringify(result), /partial-management-secret/);
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
  const health = { enabled: true, status: "online" as const, version: "0.18.2", profile: "operator-os", profileSource: "GET /health/detailed", gatewayState: "running", checkedAt: "2026-07-19T20:00:00Z", observationSource: "GET /health/detailed", message: "online" };
  const result = await new HermesManagementClient(config, fetchImpl).snapshot(health);

  assert.equal(result.operator.agents.active[0]?.task, "Review invoices");
  assert.equal(result.operator.agents.recent[0]?.result, "No conflict");
  assert.equal(result.operator.messaging[0]?.accountOrChannel, "Operations");
  assert.equal(result.operator.sessions[0]?.profile, "operator-os");
  assert.equal(result.operator.artifacts[0]?.kind, "report");
  assert.equal(result.operator.memoryGraph.edges[0]?.relationship, "supports");
  assert.equal(result.operator.model.currentModel, "model-a");
  assert.equal(result.operator.model.currentProvider, "provider-a");
  assert.equal(result.operator.providers[0]?.authenticated, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("TELEGRAM_BOT_TOKEN"), false);
});

test("Desktop management rejects Skills mutations while job attachments remain profile-scoped", async () => {
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

  await assert.rejects(() => client.perform("skill.install", { identifier: "official/gifs/gif-search" }), /governed native CLI route/i);
  await client.perform("job.create", {
    name: "Daily intake",
    prompt: "Review intake",
    schedule: "every day at 9am",
    skills: ["research", "summarize"],
  });

  assert.equal(requests[0]?.url, "http://hermes.test:56314/api/cron/jobs?profile=operator-os");
  assert.deepEqual(requests[0]?.body, {
    name: "Daily intake",
    prompt: "Review intake",
    schedule: "every day at 9am",
    skills: ["research", "summarize"],
    deliver: "local",
  });
});
