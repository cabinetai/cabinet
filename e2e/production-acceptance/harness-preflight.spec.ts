import { expect, test } from "@playwright/test";

import { bootIsolatedCabinet, type IsolatedCabinet } from "./isolated-cabinet";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

let cabinet: IsolatedCabinet;

test.beforeAll(async () => {
  cabinet = await bootIsolatedCabinet(process.cwd());
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("isolated fixture bypasses onboarding and tour before drawer interaction", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.wizard-done", "1");
    window.localStorage.setItem("cabinet.tour-done", "1");
  });
  await page.route("**/api/hermes/health", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        status: "online",
        version: "fixture",
        profile: "operator-os",
        gatewayState: "running",
        checkedAt: "2026-07-23T00:00:00.000Z",
        message: "Harness preflight fixture.",
      },
    })
  );
  await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const team = page.getByRole("tab", { name: /Team drawer/ });
  await expect(team).toBeVisible();
  await team.click({ timeout: 10_000 });
  await expect(team).toHaveAttribute("aria-selected", "true");
});
