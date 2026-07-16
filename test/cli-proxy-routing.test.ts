import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaudeCLIProxyEnv,
  buildCodexCLIProxyArgs,
  buildCodexCLIProxyEnv,
  CLI_PROXY_CODEX_API_KEY_ENV,
  wantsCLIProxy,
} from "../src/lib/agents/cli-proxy-routing";

const connection = { baseUrl: "http://127.0.0.1:43123", apiKey: "local-secret" };

test("CLIProxyAPI routing is explicit per adapter run", () => {
  assert.equal(wantsCLIProxy({}), false);
  assert.equal(wantsCLIProxy({ connector: "direct" }), false);
  assert.equal(wantsCLIProxy({ connector: "cli-proxy" }), true);
});

test("builds child-scoped Claude proxy environment", () => {
  assert.deepEqual(buildClaudeCLIProxyEnv(connection), {
    ANTHROPIC_BASE_URL: "http://127.0.0.1:43123",
    ANTHROPIC_AUTH_TOKEN: "local-secret",
    ANTHROPIC_API_KEY: "",
  });
});

test("builds per-invocation Codex Responses provider without global config writes", () => {
  const args = buildCodexCLIProxyArgs(connection);
  assert.deepEqual(args, [
    "-c", 'model_provider="cabinet-cliproxy"',
    "-c", 'model_providers.cabinet-cliproxy.name="Cabinet CLIProxyAPI"',
    "-c", 'model_providers.cabinet-cliproxy.base_url="http://127.0.0.1:43123/v1"',
    "-c", 'model_providers.cabinet-cliproxy.wire_api="responses"',
    "-c", `model_providers.cabinet-cliproxy.env_key="${CLI_PROXY_CODEX_API_KEY_ENV}"`,
  ]);
  assert.deepEqual(buildCodexCLIProxyEnv(connection), {
    [CLI_PROXY_CODEX_API_KEY_ENV]: "local-secret",
  });
});
