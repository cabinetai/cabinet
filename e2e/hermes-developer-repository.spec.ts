import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildHermesRepositoryFixtureProjection, HERMES_REPOSITORY_FIXTURE_ID } from "../src/lib/hermes/control-center-repository-fixture";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;
const evidenceDir = path.resolve("docs/evidence/hermes-developer-repository");
const implementationRevision = process.env.HERMES_EVIDENCE_IMPLEMENTATION_REVISION ?? "0".repeat(40);
const artifactGeneratedAt = process.env.HERMES_EVIDENCE_GENERATED_AT ?? "2026-07-20T01:30:00.000Z";
const fixture = buildHermesRepositoryFixtureProjection({ implementationRevision, artifactGeneratedAt });
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page, mobile = false) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.18.2", profile: "operator-os", gatewayState: "running", checkedAt: fixture.provenance.capturedAt, message: "Acceptance fixture health bridge." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: fixture }));
  await page.goto(`${cabinet.appUrl}/hermes?mode=developer`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await useDefault.click();
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(`${cabinet.appUrl}/hermes?mode=developer`);
  await page.addStyleTag({ content: '[aria-label="Status bar"] { display: none !important; }' });
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  await expect(page.getByTestId("hermes-fixture-provenance")).toContainText(HERMES_REPOSITORY_FIXTURE_ID);
  await expect(page.getByTestId("hermes-developer-repository-context")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/private-owner|github_pat_secret|oauth-secret|fixture-secret|Authorization: Bearer|C:\\Users\\/i);
  if (mobile) await expect(page.getByRole("button", { name: "More Hermes sections" })).toBeVisible();
}

async function select(page: Page, id: "projects" | "worktrees" | "source-review") {
  await page.getByTestId(`hermes-capability-${id}`).click();
  await expect(page.getByTestId("hermes-capability-inspector")).toBeVisible();
  await expect(page.getByTestId("hermes-repository-facts")).toBeVisible();
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("desktop repository context and all inspectors stay bounded", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  const context = page.getByTestId("hermes-developer-repository-context");
  await expect(context).toContainText("Hermes Cabinet");
  await expect(context).toContainText("Multiple marked current");
  await expect(context).toContainText("Changes present");
  await page.screenshot({ path: path.join(evidenceDir, "developer-repository-overview-1440x900.png"), fullPage: true });

  await select(page, "projects");
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("active session and repository association");
  await page.screenshot({ path: path.join(evidenceDir, "projects-inspector.png"), fullPage: true });

  await select(page, "worktrees");
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("multiple records marked current");
  await page.screenshot({ path: path.join(evidenceDir, "worktrees-inspector.png"), fullPage: true });

  await select(page, "source-review");
  const inspector = page.getByTestId("hermes-capability-inspector");
  await expect(inspector).toContainText("staged");
  await expect(inspector).toContainText("unavailable");
  await page.screenshot({ path: path.join(evidenceDir, "source-control-review-inspector.png"), fullPage: true });
  await page.screenshot({ path: path.join(evidenceDir, "unavailable-review-source.png"), fullPage: true });

  await select(page, "projects");
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("no associated repository");
  const projectViewport = page.getByTestId("hermes-capability-inspector").locator('[data-radix-scroll-area-viewport]');
  await projectViewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: path.join(evidenceDir, "connected-empty-project-state.png"), fullPage: true });
});

test("390x844 mobile and reduced motion keep summary and inspector reachable without overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page, true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-developer-390x844.png"), fullPage: true });
  await page.getByTestId("hermes-capability-projects").click();
  await expect(page.getByRole("dialog")).toContainText("Projects");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-projects-inspector-390x844.png"), fullPage: true });
  const inspectorOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(inspectorOverflow).toBeLessThanOrEqual(0);
});
