import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildHermesAcceptanceFixtureProjection } from "../src/lib/hermes/control-center-acceptance-fixture";
import { buildHermesSkillsAcceptanceSnapshot } from "../src/lib/hermes/skills-management-fixture";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;
const evidenceDir = path.resolve("docs/evidence/hermes-skills-management");
const projection = buildHermesAcceptanceFixtureProjection({ implementationRevision: "phase-5a-browser", artifactGeneratedAt: "2026-07-21T20:00:00.000Z" });
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  let commits = 0;
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.19.0", profile: "operator-os", gatewayState: "running", checkedAt: projection.provenance.capturedAt, message: "Skills acceptance fixture." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: projection }));
  await page.route("**/api/hermes/skills-management**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: buildHermesSkillsAcceptanceSnapshot() });
    const body = route.request().postDataJSON() as Record<string, string>;
    if (body.stage === "prepare") return route.fulfill({ json: { ok: true, preview: {
      previewId: "hermes-skills-browser-fixture",
      requestIdentity: "hermes-skills-browser-fixture",
      action: body.action,
      targetIdentity: body.targetIdentity,
      targetName: "enabled-skill",
      currentState: { identity: "operator-os:enabled-skill", name: "enabled-skill", installed: true, enabled: true, version: null, source: "bundled", provenance: "bundled", profile: "operator-os", updateAvailable: null },
      targetState: "Installed and disabled in Hermes",
      profile: "operator-os",
      expectedConsequence: "Hermes will stop loading enabled-skill for new work in the selected profile.",
      reversibility: "Reversible by a separately confirmed enable action.",
      sourceEvidence: "Hermes Agent 0.19.0 authenticated API",
      evidenceObservedAt: "2026-07-21T20:00:00.000Z",
      expiresAt: "2026-07-21T20:02:00.000Z",
      confirmationPhrase: "DISABLE SKILL enabled-skill IN operator-os",
      reason: body.reason,
      phase: "prepared",
    } } });
    if (body.stage === "commit") {
      commits += 1;
      return route.fulfill({ json: { ok: true, result: {
        requestIdentity: "hermes-skills-browser-fixture",
        action: "disable",
        targetIdentity: "operator-os:enabled-skill",
        targetName: "enabled-skill",
        profile: "operator-os",
        status: "verified_success",
        phase: "verified",
        summary: "Hermes readback verifies the requested skill state.",
        mutationAttempted: true,
        mutationResponseReceived: true,
        retryAttempted: false,
        verificationObservedAt: "2026-07-21T20:01:00.000Z",
        completedAt: "2026-07-21T20:01:00.000Z",
      } } });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture stage." } });
  });
  await page.goto(`${cabinet.appUrl}/hermes?skillsFixture=acceptance`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await useDefault.click();
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(`${cabinet.appUrl}/hermes?skillsFixture=acceptance`);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  return () => commits;
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("Operator is action-oriented and completes preview, typed confirmation, and verified result", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const commits = await prepare(page);
  await expect(page.getByTestId("hermes-capability-list")).toHaveCount(0);
  await expect(page.getByTestId("hermes-parity-metrics")).toHaveCount(0);
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await expect(page.getByTestId("hermes-skills-fixture-label")).toContainText("Acceptance fixture — no live Hermes mutation performed");
  await page.getByTestId("hermes-skill-enabled-skill").getByRole("button", { name: "Disable" }).click();
  const dialog = page.getByTestId("hermes-skill-confirmation-dialog");
  await dialog.getByLabel("Reason").fill("Disable during the governed acceptance fixture.");
  await dialog.getByRole("button", { name: "Prepare preview" }).click();
  await expect(dialog.getByTestId("hermes-skill-preview")).toContainText("Hermes Agent 0.19.0 authenticated API");
  await expect(dialog.getByRole("button", { name: "Commit through Hermes" })).toBeDisabled();
  await dialog.getByTestId("hermes-skill-confirmation-input").fill("DISABLE SKILL enabled-skill IN operator-os");
  await dialog.getByRole("button", { name: "Commit through Hermes" }).click();
  await expect(dialog.getByTestId("hermes-skill-result-verified_success")).toContainText("verified success");
  expect(commits()).toBe(1);
  await page.screenshot({ path: path.join(evidenceDir, "operator-skills-verified-1440x900.png"), fullPage: true });
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
