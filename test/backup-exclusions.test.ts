import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { isCLIProxyStateRelative } from "../src/lib/system/backup";

test("backup filters always exclude managed CLI connector secrets", () => {
  assert.equal(isCLIProxyStateRelative(path.join(".cabinet-state", "cli-proxy")), true);
  assert.equal(
    isCLIProxyStateRelative(path.join("data", "cabinet", ".cabinet-state", "cli-proxy", "auth", "token.json")),
    true
  );
  assert.equal(isCLIProxyStateRelative(path.join(".cabinet-state", "logs", "daemon.log")), false);
  assert.equal(isCLIProxyStateRelative(path.join("cli-proxy", "auth", "token.json")), false);
});
