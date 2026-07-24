import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildHermesAcceptanceFixtureProjection } from "../src/lib/hermes/control-center-acceptance-fixture";
import {
  bootIsolatedCabinet,
  type IsolatedCabinet,
} from "./production-acceptance/isolated-cabinet";

test.describe.configure({ mode: "serial" });
let cabinet: IsolatedCabinet;
let appUrl: string;
const evidenceDir = path.resolve("docs/evidence/hermes-skills-management");
const fixtureProjection = buildHermesAcceptanceFixtureProjection({ implementationRevision: "phase-5a-browser", artifactGeneratedAt: "2026-07-21T20:00:00.000Z" });
const projection = {
  ...fixtureProjection,
  installed: {
    ...fixtureProjection.installed,
    backendVersion: "0.19.0",
    observedRunningAgentVersion: "0.19.0",
    observedRunningAgentVersionSource: "Phase 5A simulated contract identity",
  },
};
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  let mutationRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() !== "GET"
      && new URL(request.url()).pathname === "/api/hermes/skills-management"
    ) {
      mutationRequests += 1;
    }
  });
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.19.0", profile: "operator-os", gatewayState: "running", checkedAt: projection.provenance.capturedAt, message: "Skills acceptance fixture." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: projection }));
  await page.goto(`${appUrl}/hermes`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await useDefault.click();
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(`${appUrl}/hermes`);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  return () => mutationRequests;
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  const externalUrl = process.env.CABINET_SKILLS_ACCEPTANCE_URL;
  if (externalUrl) {
    appUrl = new URL(externalUrl).origin;
  } else {
    cabinet = await bootIsolatedCabinet(process.cwd());
    appUrl = cabinet.appUrl;
  }
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("Operator renders the process-selected fixture with zero mutation surface", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationRequests = await prepare(page);
  await expect(page.getByTestId("hermes-capability-list")).toHaveCount(0);
  await expect(page.getByTestId("hermes-parity-metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.getByTestId("hermes-skills-fixture-label")).toContainText("Acceptance fixture — no live Hermes mutation performed");
  await expect(page.getByTestId("hermes-skills-fixture-label")).toContainText("read-only");
  await expect(page.getByTestId("hermes-skill-removable-skill").getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(page.getByTestId("hermes-skill-unsupported-bundled").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Install|Remove|Enable|Disable|Update)$/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Available" }).click();
  await expect(page.getByTestId("hermes-skill-installable-skill")).toContainText("Read-only acceptance fixture");
  expect(mutationRequests()).toBe(0);
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/(?:file:\/\/|\/Users\/|credential)/i);
  await page.screenshot({ path: path.join(evidenceDir, "operator-skills-read-only-1440x900.png"), fullPage: true });
});

test("Developer retains all 48 capability diagnostics", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-list")).toBeVisible();
  await expect(page.getByTestId("hermes-capability-list").locator('button[data-testid^="hermes-capability-"]')).toHaveCount(48);
  await expect(page.getByTestId("hermes-parity-metrics")).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "developer-capability-diagnostics-1440x900.png"), fullPage: true });
});

test("390x844 reduced motion Skills flow has zero horizontal overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.getByTestId("hermes-skills-management")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(evidenceDir, "operator-skills-mobile-390x844.png"), fullPage: true });
});
