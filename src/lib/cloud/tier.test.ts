import { describe, it, expect, afterEach } from "vitest";
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
    expect(cabinetTier()).toBe("pro");
    env.CABINET_TIER = "free";
    expect(cabinetTier()).toBe("free");
    env.CABINET_TIER = "garbage";
    expect(cabinetTier()).toBe("pro");
  });

  it("aiDisabled only when cloud AND free", () => {
    env.CABINET_TIER = "free";
    expect(aiDisabled()).toBe(false); // not cloud
    env.CABINET_CLOUD = "1";
    expect(aiDisabled()).toBe(true);
    env.CABINET_TIER = "pro";
    expect(aiDisabled()).toBe(false);
  });

  it("storageCapMb parses positive ints, else null", () => {
    expect(storageCapMb()).toBeNull();
    env.CABINET_STORAGE_CAP_MB = "20";
    expect(storageCapMb()).toBe(20);
    env.CABINET_STORAGE_CAP_MB = "0";
    expect(storageCapMb()).toBeNull();
    env.CABINET_STORAGE_CAP_MB = "nope";
    expect(storageCapMb()).toBeNull();
  });

  it("isOverCap threshold (>= cap blocks; unknown never blocks)", () => {
    expect(isOverCap(null, 20)).toBe(false);
    expect(isOverCap(100, null)).toBe(false);
    expect(isOverCap(19 * MB, 20)).toBe(false);
    expect(isOverCap(20 * MB, 20)).toBe(true);
    expect(isOverCap(21 * MB, 20)).toBe(true);
  });
});
