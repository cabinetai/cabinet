import test from "node:test";
import assert from "node:assert/strict";
import { isAgentProviderSelectable } from "./provider-filters";

test("provider selection is based on adapter registration, not transport type", () => {
  assert.equal(
    isAgentProviderSelectable({
      defaultAdapterType: "gemini_api",
      adapters: [{ type: "gemini_api" }],
    }),
    true
  );
  assert.equal(
    isAgentProviderSelectable({
      defaultAdapterType: "gemini_local",
      adapters: [{ type: "gemini_local" }],
    }),
    true
  );
  assert.equal(
    isAgentProviderSelectable({
      defaultAdapterType: "missing",
      adapters: [{ type: "gemini_api" }],
    }),
    false
  );
});
