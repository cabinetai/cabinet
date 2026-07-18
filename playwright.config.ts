import { defineConfig } from "@playwright/test";

/**
 * The harness (test/support/harness.ts) boots the app + daemon itself, per
 * test file, against an isolated temp CABINET_DATA_DIR on ephemeral ports.
 * That's deliberate: a shared `webServer` here would force every test to share
 * one mutable state root, which is exactly the ambient-state problem this suite
 * exists to eliminate.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["list"]] : [["list"]],
  // Booting a real app + daemon is slower than a typical component test.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
