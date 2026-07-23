import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { bootIsolatedCabinet, type IsolatedCabinet } from "./isolated-cabinet";
import { AcceptanceRecorder, classifyHttpIssue, scanIndicators } from "./recorder";
import { DeliberateFailureTransport } from "./transport";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

let cabinet: IsolatedCabinet;

test.beforeAll(async () => {
  expect(
    execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
      encoding: "utf8",
    }).trim(),
  ).toBe("6854d52eb6697c96d1355f1c7f4d443076d68602");
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

test("private-content indicator scan rejects local paths and secret-shaped values", async () => {
  const safe = scanIndicators("Acceptance Cabinet fixture skills-management");
  expect(safe.secretIndicators).toEqual([]);
  expect(safe.localPathIndicators).toEqual([]);

  const unsafe = scanIndicators(
    "/Users/example/private Authorization: Bearer fixture-secret-value"
  );
  expect(unsafe.secretIndicators).toHaveLength(1);
  expect(unsafe.localPathIndicators).toHaveLength(1);
});

test("Cockpit identity remains deterministic when multiple alerts exist", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.wizard-done", "1");
    window.localStorage.setItem("cabinet.tour-done", "1");
  });
  await page.route("**/api/hermes/cockpit", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Daily Business Intake is unavailable." },
    }),
  );
  await page.goto(`${cabinet.appUrl}/cockpit`);
  await expect(page.getByTestId("daily-business-cockpit")).toBeVisible();
  await page.evaluate(() => {
    const duplicate = document.createElement("div");
    duplicate.setAttribute("role", "alert");
    duplicate.textContent = "Independent fixture alert";
    document.body.appendChild(duplicate);
  });
  expect(await page.getByRole("alert").count()).toBeGreaterThanOrEqual(2);
  await expect(
    page
      .getByTestId("daily-business-cockpit")
      .getByRole("heading", { name: "Today", exact: true }),
  ).toHaveCount(1);
});

test("deliberate conversation failure does not prevent independent route checks", async ({ page }) => {
  const transport = new DeliberateFailureTransport();
  await expect(transport.runTwoTurnContract()).rejects.toThrow(
    "deliberate conversation failure",
  );
  await page.goto(`${cabinet.appUrl}/tasks`);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
});

test("typed unavailable projections are attached but excluded from relevant errors", async () => {
  const recorder = new AcceptanceRecorder();
  recorder.stage("health-poll");
  recorder.browserIssue({
    source: "http",
    ...classifyHttpIssue({
      path: "/api/hermes/health",
      status: 200,
      typedProjection: true,
      projectionState: "unavailable",
    }),
  });
  expect(recorder.browserIssues).toHaveLength(1);
  expect(recorder.relevantBrowserIssues()).toEqual([]);
});

test("controlled restart transport errors stay attributed without failing console health", async () => {
  const recorder = new AcceptanceRecorder();
  recorder.stage("restart-route-persistence");
  recorder.browserIssue({
    source: "console",
    severity: "error",
    summary: "Failed to load resource: net::ERR_CONNECTION_REFUSED",
  });
  expect(recorder.browserIssues).toHaveLength(1);
  expect(recorder.relevantBrowserIssues()).toEqual([]);
});
