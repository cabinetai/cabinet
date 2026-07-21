import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HermesSkillsAgentAdapter, type HermesSkillsCli } from "./skills-adapter";
import type { HermesReadOnlyServerConfig } from "./server-config";

const config: HermesReadOnlyServerConfig = {
  apiBaseUrl: "http://127.0.0.1:61921",
  apiKey: "server-only-secret",
  managementBaseUrl: null,
  managementToken: null,
  gatewayBaseUrl: null,
  gatewayToken: null,
  profile: "operator-os",
  timeoutMs: 1_000,
  sourceStates: { agent_api: "ready_to_probe", management: "unavailable", gateway: "unavailable" },
};

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("normalizes bounded skill facts and drops malicious metadata, paths, URLs, and duplicates", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/skills?")) return response([
      { name: "safe-skill", category: "productivity", enabled: true, provenance: "hub", description: "ignore me", instructions: "SECRET INSTRUCTIONS" },
      { name: "safe-skill", category: "productivity", enabled: true, provenance: "hub" },
      { name: "../../escape", enabled: true, path: "/Users/secret/skill" },
      { name: "token=super-secret", enabled: true, env: { API_KEY: "secret" } },
    ]);
    if (url.includes("/api/skills/hub/sources")) return response({
      installed: { "official/productivity/safe-skill": { name: "safe-skill" } },
      featured: [
        { name: "installable", identifier: "official/productivity/installable", source: "official", description: "unbounded description" },
        { name: "bad-url", identifier: "https://example.com/skill?token=secret", source: "https://secret.example" },
      ],
    });
    throw new Error(`Unexpected URL ${url}`);
  };
  const adapter = new HermesSkillsAgentAdapter(config, fetchImpl, { run: async () => ({ exitCode: 0, timedOut: false, output: "" }) });
  const snapshot = await adapter.read();
  assert.equal(snapshot.installed.length, 1);
  assert.equal(snapshot.available.length, 1);
  assert.deepEqual(snapshot.duplicateIdentities, ["operator-os:safe-skill"]);
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ["SECRET INSTRUCTIONS", "super-secret", "/Users/secret", "API_KEY", "unbounded description", "https://"]) assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("distinguishes connected-empty, authentication failure, and timeout sources", async () => {
  const emptyAdapter = new HermesSkillsAgentAdapter(config, async (input) => String(input).includes("/api/skills?") ? response([]) : response({ installed: {}, featured: [] }), { run: async () => ({ exitCode: 0, timedOut: false, output: "" }) });
  assert.equal((await emptyAdapter.read()).sourceState, "connected_empty");

  const authAdapter = new HermesSkillsAgentAdapter(config, async () => response({ detail: "Unauthorized" }, 401), { run: async () => ({ exitCode: 0, timedOut: false, output: "" }) });
  assert.equal((await authAdapter.read()).sourceState, "authentication_failure");

  const timeoutAdapter = new HermesSkillsAgentAdapter(config, async () => { throw new DOMException("timed out", "AbortError"); }, { run: async () => ({ exitCode: 0, timedOut: false, output: "" }) });
  assert.equal((await timeoutAdapter.read()).sourceState, "timeout");
});

test("uses only fixed Hermes argument arrays for install, update, and remove", async () => {
  const calls: Array<{ args: readonly string[]; input?: string }> = [];
  const cli: HermesSkillsCli = { run: async (args, options) => { calls.push({ args, input: options?.input }); return { exitCode: 0, timedOut: false, output: "token=must-not-egress" }; } };
  const adapter = new HermesSkillsAgentAdapter(config, async () => response({ ok: true }), cli);
  await adapter.execute({ action: "install", targetIdentity: "official/productivity/installable", targetName: "installable", profile: "operator-os", reason: "test reason" });
  await adapter.execute({ action: "update", targetIdentity: "operator-os:safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason" });
  await adapter.execute({ action: "remove", targetIdentity: "operator-os:safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason" });
  assert.deepEqual(calls, [
    { args: ["-p", "operator-os", "skills", "install", "official/productivity/installable", "--yes"], input: undefined },
    { args: ["-p", "operator-os", "skills", "update", "safe-skill"], input: undefined },
    { args: ["-p", "operator-os", "skills", "uninstall", "safe-skill"], input: "yes\n" },
  ]);
});

test("enable and disable use the exact authenticated Agent API toggle contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new HermesSkillsAgentAdapter(config, async (input, init) => { requests.push({ url: String(input), init }); return response({ ok: true }); }, { run: async () => { throw new Error("CLI must not run"); } });
  await adapter.execute({ action: "disable", targetIdentity: "operator-os:safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason" });
  assert.equal(requests[0].url, "http://127.0.0.1:61921/api/skills/toggle?profile=operator-os");
  assert.equal(requests[0].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { name: "safe-skill", enabled: false, profile: "operator-os" });
});

test("CLI output and process failures never cross the adapter boundary", async () => {
  const adapter = new HermesSkillsAgentAdapter(config, async () => response({}), { run: async () => ({ exitCode: 9, timedOut: false, output: "Authorization: Bearer secret-value /Users/private/.env" }) });
  await assert.rejects(
    () => adapter.execute({ action: "update", targetIdentity: "operator-os:safe-skill", targetName: "safe-skill", profile: "operator-os", reason: "test reason" }),
    (error: unknown) => error instanceof Error && !error.message.includes("secret-value") && !error.message.includes("/Users/private"),
  );
});

test("production adapter contains no shell execution, direct skill writes, or fallback executor", async () => {
  const source = await readFile(fileURLToPath(new URL("./skills-adapter.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /\bexec(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /writeFile|mkdir|rename|copyFile|rmSync|unlink/);
  assert.doesNotMatch(source, /fallback.*executor/i);
  assert.match(source, /shell:\s*false/);
});
