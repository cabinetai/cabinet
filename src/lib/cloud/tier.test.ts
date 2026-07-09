import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cabinetTier, storageCapMb, isOverCap, aiDisabled } from "./tier";

const env = process.env;
afterEach(() => {
  delete env.CABINET_TIER;
  delete env.CABINET_CLOUD;
  delete env.CABINET_STORAGE_CAP_MB;
});

const MB = 1024 * 1024;

describe("tier", () => {
  it("cabinetTier: only explicit 'free' is free; unset/other = pro (fail open)", () => {
    assert.equal(cabinetTier(), "pro");
    env.CABINET_TIER = "free";
    assert.equal(cabinetTier(), "free");
    env.CABINET_TIER = "garbage";
    assert.equal(cabinetTier(), "pro");
  });

  it("aiDisabled only when cloud AND free", () => {
    env.CABINET_TIER = "free";
    assert.equal(aiDisabled(), false); // not cloud
    env.CABINET_CLOUD = "1";
    assert.equal(aiDisabled(), true);
    env.CABINET_TIER = "pro";
    assert.equal(aiDisabled(), false);
  });

  it("storageCapMb parses positive ints, else null", () => {
    assert.equal(storageCapMb(), null);
    env.CABINET_STORAGE_CAP_MB = "20";
    assert.equal(storageCapMb(), 20);
    env.CABINET_STORAGE_CAP_MB = "0";
    assert.equal(storageCapMb(), null);
    env.CABINET_STORAGE_CAP_MB = "nope";
    assert.equal(storageCapMb(), null);
  });

  it("isOverCap threshold (>= cap blocks; unknown never blocks)", () => {
    assert.equal(isOverCap(null, 20), false);
    assert.equal(isOverCap(100, null), false);
    assert.equal(isOverCap(19 * MB, 20), false);
    assert.equal(isOverCap(20 * MB, 20), true);
    assert.equal(isOverCap(21 * MB, 20), true);
  });
});
