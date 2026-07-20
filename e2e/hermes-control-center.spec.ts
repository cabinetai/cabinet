import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildHermesAcceptanceFixtureProjection, HERMES_ACCEPTANCE_FIXTURE_ID } from "../src/lib/hermes/control-center-acceptance-fixture";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;
const evidenceDir = path.resolve("docs/evidence/hermes-truth-state");
const fixture = buildHermesAcceptanceFixtureProjection();
expect(JSON.stringify(fixture)).not.toContain("fixture-secret");
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${message.text()} ${message.location().url}`.trim()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.18.2", profile: "operator-os", gatewayState: "running", checkedAt: fixture.provenance.capturedAt, message: "Acceptance fixture health bridge." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: fixture }));
  await page.goto(`${cabinet.appUrl}/hermes`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await expect(useDefault).toBeHidden();
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(`${cabinet.appUrl}/hermes`);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  await expect(page.getByTestId("hermes-fixture-provenance")).toContainText("Acceptance fixture — not live runtime");
  await expect(page.getByTestId("hermes-fixture-provenance")).toContainText(`Fixture ID: ${HERMES_ACCEPTANCE_FIXTURE_ID}`);
  await expect(page.locator("body")).not.toContainText("fixture-secret");
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("full 48-capability Overview derives totals and exceptions from the shared fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  expect(fixture.capabilities).toHaveLength(48);
  expect(Object.values(fixture.summary).reduce((sum, count) => sum + count, 0)).toBe(48);
  await expect(page.getByTestId("hermes-operational-exceptions")).toContainText("Telegram");
  await expect(page.getByTestId("hermes-operational-exceptions")).toContainText("Conflicting evidence");
  await expect(page.getByTestId("hermes-parity-metrics")).toContainText(`Discoverable ${fixture.parity.discoverability.percentage}%`);
  await page.screenshot({ path: path.join(evidenceDir, "overview-operational-exceptions.png"), fullPage: true });
});

test("Messaging failure inspector shows exact fixture failure without current visibility credit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await page.getByTestId("hermes-operational-exceptions").getByRole("button").filter({ hasText: "Messaging" }).click();
  const inspector = page.getByTestId("hermes-capability-inspector");
  await expect(inspector).toContainText("Fatal polling conflict");
  await expect(inspector).toContainText("exact fixture");
  await expect(inspector.getByText("Current live visibility").locator("..")).toContainText("Not credited");
  await expect(inspector.getByText("Live-Proven").locator("..")).toContainText("Not credited");
  await expect(inspector.getByTestId("hermes-fixture-path-proof")).toContainText("Exact fixture path");
  await expect(inspector.getByTestId("hermes-fixture-path-proof")).toContainText("Proven");
  await expect(inspector).not.toContainText(/Bearer|api\.telegram\.org\/bot|Authorization:/i);
  await page.screenshot({ path: path.join(evidenceDir, "messaging-telegram-fatal.png"), fullPage: true });
});

test("Gateway conflict inspector preserves both source facts without current visibility credit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await page.getByTestId("hermes-operational-exceptions").getByRole("button").filter({ hasText: "Gateway" }).click();
  const inspector = page.getByTestId("hermes-capability-inspector");
  await expect(inspector).toContainText("Hermes health bridge observed running");
  await expect(inspector).toContainText("Hermes management status observed stopped");
  await expect(inspector.getByText("Current live visibility").locator("..")).toContainText("Not credited");
  await expect(inspector.getByText("Live-Proven").locator("..")).toContainText("Not credited");
  await expect(inspector.getByTestId("hermes-fixture-path-proof")).toContainText("Proven");
  await page.screenshot({ path: path.join(evidenceDir, "gateway-conflicting-evidence.png"), fullPage: true });
});

test("Developer mode preserves Diagnostic only in unknown and unavailable health states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-advanced-config")).toContainText("Diagnostic only");
  await expect(page.getByTestId("hermes-capability-raw-logs")).toContainText("Diagnostic only");
  await expect(page.getByTestId("hermes-capability-gateway-diagnostics")).toContainText("Diagnostic only");
  await page.screenshot({ path: path.join(evidenceDir, "developer-diagnostic-only.png"), fullPage: true });
});

test("390x844 reduced-motion More sheet stays reachable without horizontal overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.getByRole("button", { name: "More Hermes sections" }).click();
  const picker = page.getByRole("dialog", { name: "Hermes sections" });
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId("hermes-mobile-fixture-provenance")).toContainText(`Fixture ID: ${HERMES_ACCEPTANCE_FIXTURE_ID}`);
  await expect(picker.getByRole("button", { name: "Messaging" })).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, "mobile-more-picker.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await picker.getByRole("button", { name: "Messaging" }).click();
  await expect(page.getByTestId("hermes-live-messaging-platforms")).toContainText("Fatal polling conflict");
});
