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
