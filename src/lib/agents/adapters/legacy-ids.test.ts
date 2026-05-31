import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_ADAPTER_TYPES,
  isLegacyAdapterType,
} from "./legacy-ids";
import { LEGACY_ADAPTER_BY_PROVIDER_ID } from "./registry";

test("legacy-ids covers every provider registered on the server", () => {
  const serverLegacyTypes = Object.values(LEGACY_ADAPTER_BY_PROVIDER_ID).sort();
  const clientLegacyTypes = [...LEGACY_ADAPTER_TYPES].sort();
  // The client-safe mirror must stay in sync with the server registry
  // so the UI never misclassifies a legacy adapter as native.
  assert.deepEqual(clientLegacyTypes, serverLegacyTypes);
});

test("isLegacyAdapterType flags every registered legacy type", () => {
  for (const type of LEGACY_ADAPTER_TYPES) {
    assert.equal(isLegacyAdapterType(type), true, `${type} should be legacy`);
  }
});

test("isLegacyAdapterType returns false for structured adapters and junk input", () => {
  assert.equal(isLegacyAdapterType("claude_local"), false);
  assert.equal(isLegacyAdapterType("codex_local"), false);
  assert.equal(isLegacyAdapterType("gemini_local"), false);
  assert.equal(isLegacyAdapterType("unknown_type"), false);
  assert.equal(isLegacyAdapterType(""), false);
  assert.equal(isLegacyAdapterType(undefined), false);
  assert.equal(isLegacyAdapterType(null), false);
});
