import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSlackCreateUrl,
  buildSlackManifest,
  buildSlackManifestJson,
} from "./slack-manifest";

const OPTIONS = {
  appName: "Cabinet",
  scopes: "chat:write channels:read channels:history users:read search:read.public search:read.users",
  callbackPort: 8765,
};

test("the manifest turns the MCP server on — the whole point of the deep link", () => {
  assert.equal(buildSlackManifest(OPTIONS).settings.is_mcp_enabled, true);
});

test("the redirect URL is derived from callbackPort, so the two can never drift", () => {
  const manifest = buildSlackManifest({ ...OPTIONS, callbackPort: 9999 });
  assert.deepEqual(manifest.oauth_config.redirect_urls, ["http://localhost:9999/callback"]);
});

test("scopes are the catalog's space-separated string, split into Slack's user-scope array", () => {
  assert.deepEqual(buildSlackManifest(OPTIONS).oauth_config.scopes.user, [
    "chat:write",
    "channels:read",
    "channels:history",
    "users:read",
    "search:read.public",
    "search:read.users",
  ]);
});

test("irregular whitespace in the scope string doesn't produce empty scopes", () => {
  const manifest = buildSlackManifest({ ...OPTIONS, scopes: "  chat:write   channels:read \n" });
  assert.deepEqual(manifest.oauth_config.scopes.user, ["chat:write", "channels:read"]);
});

test("the app name reaches Slack's display_information", () => {
  assert.equal(buildSlackManifest({ ...OPTIONS, appName: "Cabinet Dev" }).display_information.name, "Cabinet Dev");
});

test("the create URL round-trips: what Slack decodes is exactly the manifest we built", () => {
  const url = new URL(buildSlackCreateUrl(OPTIONS));
  assert.equal(url.origin + url.pathname, "https://api.slack.com/apps");
  assert.equal(url.searchParams.get("new_app"), "1");
  assert.deepEqual(
    JSON.parse(url.searchParams.get("manifest_json") ?? "null"),
    buildSlackManifest(OPTIONS),
  );
});

test("the copy-paste fallback is human-readable, indented JSON of the same manifest", () => {
  const json = buildSlackManifestJson(OPTIONS);
  assert.ok(json.includes("\n  "), "expected indented JSON for the copy chip");
  assert.deepEqual(JSON.parse(json), buildSlackManifest(OPTIONS));
});
