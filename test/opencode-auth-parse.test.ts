import test from "node:test";
import assert from "node:assert/strict";
import { parseOpenCodeAuth } from "../src/lib/agents/providers/opencode";

// Verbatim `opencode auth list` shape, including the ANSI SGR codes the CLI
// emits (\x1b[0m / \x1b[90m). 0 stored credentials, 2 env-var providers.
const REAL_ANSI_OUTPUT = [
  "\x1b[0m",
  "\x1b[1m┌\x1b[0m  Credentials \x1b[90m~/.local/share/opencode/auth.json",
  "│",
  "└  0 credentials",
  "",
  "┌  Environment",
  "│",
  "●  OpenAI \x1b[90mOPENAI_API_KEY",
  "│",
  "●  Google \x1b[90mGEMINI_API_KEY",
  "│",
  "└  2 environment variables",
].join("\n");

test("parses env-var providers through ANSI codes (configured)", () => {
  const a = parseOpenCodeAuth(REAL_ANSI_OUTPUT);
  assert.equal(a.credentials, 0);
  assert.equal(a.envProviders, 2);
  assert.equal(a.configured, true);
});

test("zero credentials AND zero env vars → not configured (Zen-free only)", () => {
  const a = parseOpenCodeAuth(
    ["└  0 credentials", "└  0 environment variables"].join("\n")
  );
  assert.deepEqual(a, { credentials: 0, envProviders: 0, configured: false });
});

test("stored credentials count as configured", () => {
  const a = parseOpenCodeAuth(
    ["└  3 credentials", "└  0 environment variables"].join("\n")
  );
  assert.equal(a.credentials, 3);
  assert.equal(a.configured, true);
});

test("singular grammar (1 credential / 1 environment variable)", () => {
  const a = parseOpenCodeAuth("1 credential\n1 environment variable");
  assert.equal(a.credentials, 1);
  assert.equal(a.envProviders, 1);
  assert.equal(a.configured, true);
});

test("empty / unparseable output → conservatively not configured", () => {
  for (const input of ["", "   ", null, undefined, "totally unexpected"]) {
    assert.deepEqual(parseOpenCodeAuth(input), {
      credentials: 0,
      envProviders: 0,
      configured: false,
    });
  }
});
