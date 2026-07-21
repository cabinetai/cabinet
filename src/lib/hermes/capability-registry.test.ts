import assert from "node:assert/strict";
import test from "node:test";
import { HERMES_CAPABILITY_REGISTRY, parityPercentage } from "./capability-registry";
import { HERMES_PARITY_STATES } from "./control-center-types";

test("every Hermes capability has a complete and valid parity record", () => {
  const ids = new Set<string>();
  for (const capability of HERMES_CAPABILITY_REGISTRY) {
    assert.ok(!ids.has(capability.id), `duplicate capability ${capability.id}`);
    ids.add(capability.id);
    assert.ok(HERMES_PARITY_STATES.includes(capability.parityState));
    for (const field of ["name", "desktopSource", "installedVersionSupport", "interface", "cabinetSurface", "cabinetHref", "missingWork", "testEvidence"] as const) {
      assert.ok(capability[field].trim(), `${capability.id} is missing ${field}`);
    }
  }
  assert.equal(ids.size, 48);
});

test("operator and developer visibility are intentionally distinct", () => {
  const operator = HERMES_CAPABILITY_REGISTRY.filter((item) => item.mode === "Operator");
  const developer = HERMES_CAPABILITY_REGISTRY.filter((item) => item.mode === "Developer");
  assert.ok(operator.length > 0);
  assert.ok(developer.length > 0);
  assert.ok(operator.every((item) => item.mode !== "Developer"));
  assert.ok(developer.every((item) => item.group === "Developer"));
});

test("parity percentages include unsupported and diagnostic capabilities", () => {
  for (const audience of ["operator", "management", "developer"] as const) {
    const percentage = parityPercentage(audience);
    assert.ok(percentage > 0 && percentage < 100);
  }
  assert.equal(HERMES_CAPABILITY_REGISTRY.find((item) => item.id === "billing")?.parityState, "unsupported");
  assert.equal(HERMES_CAPABILITY_REGISTRY.find((item) => item.id === "notifications")?.parityState, "diagnostic_only");
});

test("read-only registry data contains no secret material", () => {
  const serialized = JSON.stringify(HERMES_CAPABILITY_REGISTRY).toLowerCase();
  for (const forbidden of ["bearer ", "api_server_key=", "session_token=", "gateway_token="]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
