import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { bootIsolatedCabinet, type IsolatedCabinet } from "./isolated-cabinet";
import { AcceptanceRecorder, classifyHttpIssue, scanIndicators } from "./recorder";
import { DeliberateFailureTransport } from "./transport";
import {
  classifyHermesHealthProjection,
  sampleHermesHealthProjection,
} from "./health-observation";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

let cabinet: IsolatedCabinet;

test.beforeAll(async () => {
  expect(
    execFileSync("git", ["merge-base", "HEAD", "b02c9d7c4430ae89026182d1cbf5567553b189ad"], {
      encoding: "utf8",
    }).trim(),
  ).toBe("b02c9d7c4430ae89026182d1cbf5567553b189ad");
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

test("deliberate provider-gate failure sends no follow-up route or model request", async ({ page }) => {
  const transport = new DeliberateFailureTransport();
  await expect(transport.runTwoTurnContract()).rejects.toThrow(
    "deliberate conversation failure",
  );
  expect(page.url()).toBe("about:blank");
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

test("health projection sampling remains readable after browser history navigation", async ({ page }) => {
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
      },
    }),
  );
  await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
  await page.goto(`${cabinet.appUrl}/cockpit`);
  await page.goBack();
  await page.goForward();

  await expect(
    sampleHermesHealthProjection(page, cabinet.appUrl),
  ).resolves.toBeNull();
});

test("explicit health projection sampling remains fail-closed for malformed JSON", async () => {
  expect(classifyHermesHealthProjection(200, "{")).toEqual({
    path: "/api/hermes/health",
    severity: "error",
    summary: "Hermes health returned an unreadable projection.",
    expectedUnavailableProjection: false,
  });
  expect(classifyHermesHealthProjection(200, "null")).toEqual({
    path: "/api/hermes/health",
    severity: "error",
    summary: "Hermes health returned an unreadable projection.",
    expectedUnavailableProjection: false,
  });
});

test("controlled restart transport errors require explicit phase correlation", async () => {
  const recorder = new AcceptanceRecorder();
  recorder.stage("restart-route-persistence");
  recorder.browserIssue({
    source: "request",
    severity: "warning",
    summary: "expected_read_only_listener_loss",
    expectedControlledRestartTransport: true,
  });
  expect(recorder.browserIssues).toHaveLength(1);
  expect(recorder.relevantBrowserIssues()).toEqual([]);
});
