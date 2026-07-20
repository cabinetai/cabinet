import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  buildHermesRuntimeInterventionFixtureProjection,
  HERMES_RUNTIME_INTERVENTION_FIXTURE_ID,
  HERMES_RUNTIME_INTERVENTION_FIXTURE_LABEL,
} from "../src/lib/hermes/control-center-intervention-fixture";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;
const evidenceDir = path.resolve("docs/evidence/hermes-governed-runtime-interventions");
const implementationRevision = process.env.HERMES_EVIDENCE_IMPLEMENTATION_REVISION ?? "0".repeat(40);
const artifactGeneratedAt = process.env.HERMES_EVIDENCE_GENERATED_AT ?? "2026-07-20T04:00:00.000Z";
const fixture = buildHermesRuntimeInterventionFixtureProjection({ implementationRevision, artifactGeneratedAt });
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  let mutationRequests = 0;
  await page.route("**/api/hermes/runtime-interventions", (route) => {
    mutationRequests += 1;
    return route.fulfill({ status: 500, json: { error: "Fixture must never reach this route." } });
  });
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.18.2", profile: "operator-os", gatewayState: "running", checkedAt: fixture.provenance.capturedAt, message: "Acceptance fixture health bridge." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: fixture }));
  await page.goto(cabinet.appUrl + "/hermes");
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await useDefault.click();
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(cabinet.appUrl + "/hermes");
  await page.addStyleTag({ content: '[aria-label="Status bar"] { display: none !important; }' });
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  await expect(page.getByTestId("hermes-fixture-provenance")).toContainText(HERMES_RUNTIME_INTERVENTION_FIXTURE_ID);
  await expect(page.getByTestId("hermes-fixture-provenance")).toContainText(HERMES_RUNTIME_INTERVENTION_FIXTURE_LABEL);
  await expect(page.locator("body")).not.toContainText(/private-claim|fixture-secret|worker_pid|task_title|authorization|api_key/i);
  return () => mutationRequests;
}

async function openFixturePreview(page: Page) {
  await page.getByTestId("hermes-runtime-run-list").getByRole("button").filter({ hasText: "Run 17" }).click();
  const inspector = page.locator('[data-testid="hermes-run-inspector"]:visible');
  await expect(inspector).toContainText("Governed intervention");
  await inspector.getByRole("button", { name: "Review safety preview" }).click();
  const dialog = page.getByTestId("hermes-intervention-dialog");
  await expect(dialog).toContainText(HERMES_RUNTIME_INTERVENTION_FIXTURE_LABEL);
  await dialog.getByLabel("Reason").fill("Stop the duplicate worker safely");
  await dialog.getByRole("button", { name: "Prepare preview" }).click();
  await expect(dialog.getByTestId("hermes-intervention-preview")).toContainText("Run 17");
  await expect(dialog.getByTestId("hermes-intervention-preview")).toContainText("TERMINATE RUN 17");
  await expect(dialog.getByRole("button", { name: "Confirm and terminate" })).toBeDisabled();
  return dialog;
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("desktop shows the two-stage safety preview while fixture execution stays impossible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationRequests = await prepare(page);
  await page.screenshot({ path: path.join(evidenceDir, "runtime-intervention-overview-1440x900.png"), fullPage: true });
  const dialog = await openFixturePreview(page);
  await expect(dialog).toContainText("Opening and previewing this dialog performs no mutation.");
  expect(mutationRequests()).toBe(0);
  await page.screenshot({ path: path.join(evidenceDir, "governed-termination-preview-1440x900.png"), fullPage: true });
});

test("390x844 reduced-motion safety preview has zero overflow and no mutation request", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mutationRequests = await prepare(page);
  await openFixturePreview(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(mutationRequests()).toBe(0);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-governed-termination-preview-390x844.png"), fullPage: true });
});

test("fixture demonstrates unknown outcome and read-only reconciliation without a request", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationRequests = await prepare(page);
  const dialog = await openFixturePreview(page);
  await dialog.getByRole("button", { name: "Show unknown-outcome example" }).click();
  await expect(dialog.getByTestId("hermes-intervention-result")).toContainText("Outcome unknown");
  await expect(dialog.getByTestId("hermes-intervention-result")).toContainText("Mutation attemptedYes");
  await expect(dialog.getByTestId("hermes-intervention-result")).toContainText("RetryNo");
  await expect(dialog.getByRole("button", { name: "Recheck outcome" })).toBeDisabled();
  expect(mutationRequests()).toBe(0);
  await page.screenshot({ path: path.join(evidenceDir, "unknown-outcome-reconciliation-1440x900.png"), fullPage: true });
});
