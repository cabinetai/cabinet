import { expect, test, type Page } from "@playwright/test";
import {
  buildHermesRuntimeInterventionFixtureProjection,
} from "../src/lib/hermes/control-center-intervention-fixture";
import { emptyRuntimeExecution } from "../src/lib/hermes/runtime-execution";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
const fixture = buildHermesRuntimeInterventionFixtureProjection({
  implementationRevision: "phase-4a-browser-contract",
  artifactGeneratedAt: "2026-07-20T04:26:28.000Z",
});
const controlledProjection = structuredClone(fixture);
controlledProjection.provenance = {
  kind: "live_runtime",
  label: "Live runtime projection",
  capturedAt: "2026-07-20T04:26:28.000Z",
  fixtureId: null,
};
controlledProjection.health.configuredProfile = "operator-os";
controlledProjection.health.observedActiveProfile = null;
controlledProjection.health.observedProfileSource = null;
controlledProjection.health.profile = "unknown";
controlledProjection.installed.observedRunningAgentVersion = "0.19.0";
controlledProjection.installed.observedRunningAgentVersionSource = "GET /health/detailed";
controlledProjection.installed.observedRunningAgentObservedAt = controlledProjection.provenance.capturedAt;
controlledProjection.installed.observedRunningAgentCommit = null;
controlledProjection.installed.observedRunningAgentCommitSource = null;
controlledProjection.installed.detectedAgentCheckoutCommit = "d7b36070ef80";
controlledProjection.installed.detectedAgentCheckoutCommitSource = "local installation metadata";
controlledProjection.runtimeExecution = emptyRuntimeExecution(controlledProjection.provenance.capturedAt, "Hermes Management is not configured for this review.");
controlledProjection.exceptions = [{
  kind: "source_group",
  capabilityId: null,
  sourceGroup: "management",
  dependentCount: 18,
  title: "Management unavailable",
  health: "unavailable",
  summary: "18 dependent capability observations were not collected. Hermes Management is not configured for this review.",
}];
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  let mutationCalls = 0;
  await page.route("**/api/hermes/runtime-interventions", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { enabled: false } });
    }
    mutationCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Mutation route must remain unused." } });
  });
  await page.route("**/api/hermes/health", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        status: "online",
        version: "0.19.0",
        profile: null,
        profileSource: null,
        gatewayState: "running",
        checkedAt: fixture.provenance.capturedAt,
        message: "Controlled browser contract.",
      },
    }),
  );
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: controlledProjection }));

  await page.goto(cabinet.appUrl + "/hermes");
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await skipTour.click();
  }
  await page.goto(cabinet.appUrl + "/hermes");
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  return () => mutationCalls;
}

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
      CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test("desktop preserves honest unavailable runtime visibility while interventions are owner-disabled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationCalls = await prepare(page);
  await expect(page.getByTestId("hermes-runtime-empty-state")).toBeVisible();
  await expect(page.getByRole("button", { name: /prepare|approve|cancel|retry|resume/i })).toHaveCount(0);
  expect(mutationCalls()).toBe(0);
});

test("partial Agent-only review keeps configured and observed identity, grouped exceptions, and About scope honest", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationCalls = await prepare(page);
  await expect(page.getByTestId("hermes-version-strip")).toContainText("Configured profile operator-os");
  await expect(page.getByTestId("hermes-version-strip")).toContainText("Observed active profile Unknown. Management source unavailable.");
  await expect(page.getByTestId("hermes-runtime-empty-state")).toHaveText("Runtime execution sources are unavailable. Active-run state is unknown.");
  await expect(page.getByTestId("hermes-operational-exceptions")).toContainText("18 dependent capability observations were not collected");
  await page.getByTestId("hermes-capability-about-updates").click();
  const inspector = page.locator('[data-testid="hermes-capability-inspector"]:visible');
  await expect(inspector.getByTestId("hermes-about-claim-scope")).toContainText("GET /health/detailed, runtime version identity only");
  await expect(inspector.getByTestId("hermes-about-claim-scope")).toContainText("Update checking was not performed");
  expect(mutationCalls()).toBe(0);
});

test("390x844 reduced-motion view has no overflow and emits no mutation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mutationCalls = await prepare(page);
  await expect(page.getByTestId("hermes-runtime-empty-state")).toHaveText("Runtime execution sources are unavailable. Active-run state is unknown.");
  await expect(page.getByTestId("hermes-version-strip")).toContainText("Observed active profile Unknown. Management source unavailable.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(mutationCalls()).toBe(0);
});
