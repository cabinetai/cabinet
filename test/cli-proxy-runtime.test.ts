import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCLIProxyProcessEnv,
  CLI_PROXY_VERSION,
  getCLIProxyPaths,
  renderCLIProxyConfig,
  resolveCLIProxyAsset,
  validateCLIProxyOAuthStart,
} from "../src/lib/agents/cli-proxy-runtime";

test("selects pinned portable artifacts for Cabinet platforms", () => {
  const linux = resolveCLIProxyAsset("linux", "x64");
  assert.equal(
    linux.name,
    `CLIProxyAPI_${CLI_PROXY_VERSION}_linux_amd64_no-plugin.tar.gz`
  );
  assert.match(linux.sha256, /^[a-f0-9]{64}$/);

  assert.equal(
    resolveCLIProxyAsset("darwin", "arm64").name,
    `CLIProxyAPI_${CLI_PROXY_VERSION}_darwin_aarch64.tar.gz`
  );
  assert.equal(
    resolveCLIProxyAsset("win32", "x64").name,
    `CLIProxyAPI_${CLI_PROXY_VERSION}_windows_amd64.zip`
  );
  assert.throws(() => resolveCLIProxyAsset("freebsd", "x64"), /not supported/);
  assert.throws(() => resolveCLIProxyAsset("linux", "ia32"), /not supported/);
});

test("renders a loopback-only, authenticated, plugin-disabled config", () => {
  const paths = getCLIProxyPaths(path.join(os.tmpdir(), "cabinet cli proxy test"));
  const config = renderCLIProxyConfig(paths, {
    version: 1,
    port: 43210,
    apiKey: "model-secret",
    managementKey: "management-secret",
    routingEnabled: true,
    autoStart: true,
  });

  assert.match(config, /^host: "127\.0\.0\.1"$/m);
  assert.match(config, /^port: 43210$/m);
  assert.match(config, /api-keys:\n  - "model-secret"/);
  assert.match(config, /allow-remote: false/);
  assert.match(config, /secret-key: "management-secret"/);
  assert.match(config, /disable-control-panel: true/);
  assert.match(config, /plugins:\n  enabled: false/);
  assert.match(config, /usage-statistics-enabled: false/);
  assert.match(config, /ws-auth: true/);
  assert.doesNotMatch(config, /^host: ""$/m);
});

test("passes only required operating-system variables to the sidecar", () => {
  const env = buildCLIProxyProcessEnv({
    PATH: "/bin",
    HOME: "/home/test",
    HTTPS_PROXY: "http://proxy.test",
    OPENAI_API_KEY: "do-not-leak",
    GITHUB_TOKEN: "do-not-leak",
  });
  assert.deepEqual(env, {
    PATH: "/bin",
    HOME: "/home/test",
    HTTPS_PROXY: "http://proxy.test",
  });
});

test("accepts only bounded HTTPS OAuth redirects", () => {
  const result = validateCLIProxyOAuthStart({
    status: "ok",
    url: "https://example.com/oauth?client=cabinet",
    state: "safe_state-123",
  });
  assert.equal(result.url, "https://example.com/oauth?client=cabinet");
  assert.throws(
    () => validateCLIProxyOAuthStart({ url: "javascript:alert(1)", state: "safe" }),
    /unsafe OAuth URL/
  );
  assert.throws(
    () => validateCLIProxyOAuthStart({ url: "http://example.com", state: "safe" }),
    /unsafe OAuth URL/
  );
  assert.throws(
    () => validateCLIProxyOAuthStart({ url: "https://example.com", state: "bad state" }),
    /invalid OAuth state/
  );
});

test("keeps binaries and credentials under Cabinet internal state", () => {
  const root = path.join(os.tmpdir(), "cabinet-cliproxy-root");
  const paths = getCLIProxyPaths(root);
  assert.equal(paths.root, root);
  assert.equal(paths.authDir, path.join(root, "auth"));
  assert.equal(paths.binaryDir, path.join(root, "bin", CLI_PROXY_VERSION));
  assert.ok(paths.binaryPath.startsWith(paths.binaryDir));
  assert.equal(paths.licensePath, path.join(paths.binaryDir, "LICENSE"));
  assert.equal(paths.installManifestPath, path.join(paths.binaryDir, "install.json"));
});
