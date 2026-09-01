import assert from "node:assert/strict";
import test from "node:test";

import { configFingerprint, isGatewayEnabled, parseAccounts } from "../server/whatsapp/config";

test("parseAccounts handles ids, labels, slugging, and duplicates", () => {
  assert.deepEqual(parseAccounts(null), []);
  assert.deepEqual(parseAccounts("personal"), [{ id: "personal" }]);
  assert.deepEqual(parseAccounts("personal, biz:Store front"), [
    { id: "personal" },
    { id: "biz", label: "Store front" },
  ]);
  // Ids become auth-store directory names: lowercased, unsafe chars collapsed.
  assert.deepEqual(parseAccounts("My Phone!"), [{ id: "my-phone" }]);
  assert.deepEqual(parseAccounts("a, a, a:Again"), [{ id: "a" }]);
  assert.deepEqual(parseAccounts(" ,, :, "), []);
});

test("gateway is off with no accounts", () => {
  assert.equal(
    isGatewayEnabled({ accounts: [], channel: "whatsapp", includeFromMe: false }),
    false
  );
  assert.equal(
    isGatewayEnabled({ accounts: [{ id: "a" }], channel: "whatsapp", includeFromMe: false }),
    true
  );
});

test("fingerprint changes when any knob changes", () => {
  const base = { accounts: [{ id: "a" }], channel: "whatsapp", includeFromMe: false };
  const fp = configFingerprint(base);
  assert.notEqual(fp, configFingerprint({ ...base, accounts: [{ id: "b" }] }));
  assert.notEqual(fp, configFingerprint({ ...base, channel: "wa" }));
  assert.notEqual(fp, configFingerprint({ ...base, includeFromMe: true }));
  assert.equal(fp, configFingerprint({ ...base }));
});
