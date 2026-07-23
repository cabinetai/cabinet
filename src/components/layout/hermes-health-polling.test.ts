import assert from "node:assert/strict";
import test from "node:test";
import {
  HERMES_HEALTH_POLL_BASE_MS,
  HERMES_HEALTH_POLL_MAX_MS,
  nextHermesHealthPollDelay,
} from "./hermes-health-polling";

test("healthy polling stays bounded at the normal interval", () => {
  assert.equal(nextHermesHealthPollDelay("online", 0), HERMES_HEALTH_POLL_BASE_MS);
});

test("repeated unavailable and timeout projections back off to a bounded maximum", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((count) =>
      nextHermesHealthPollDelay("probe_unavailable", count),
    ),
    [10_000, 20_000, 40_000, 60_000, 60_000],
  );
  assert.equal(
    nextHermesHealthPollDelay("probe_timeout", 99),
    HERMES_HEALTH_POLL_MAX_MS,
  );
});

test("configuration and authentication failures use the maximum bounded interval", () => {
  assert.equal(
    nextHermesHealthPollDelay("misconfigured", 1),
    HERMES_HEALTH_POLL_MAX_MS,
  );
  assert.equal(
    nextHermesHealthPollDelay("authentication_failure", 1),
    HERMES_HEALTH_POLL_MAX_MS,
  );
});

test("recovery immediately restores the normal interval", () => {
  assert.equal(
    nextHermesHealthPollDelay("online", 8),
    HERMES_HEALTH_POLL_BASE_MS,
  );
});
