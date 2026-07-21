import { expect, test, type Page } from "@playwright/test";
import {
  buildHermesRuntimeInterventionFixtureInput,
} from "../src/lib/hermes/control-center-intervention-fixture";
import { buildHermesControlCenterProjection } from "../src/lib/hermes/control-center-projection";
import { emptyRuntimeExecution } from "../src/lib/hermes/runtime-execution";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
const controlledInput = buildHermesRuntimeInterventionFixtureInput({
  implementationRevision: "phase-4a-browser-contract",
  artifactGeneratedAt: "2026-07-20T04:26:28.000Z",
});
controlledInput.installedRuntime.configuredProfile = "operator-os";
controlledInput.installedRuntime.observedActiveProfile = null;
controlledInput.installedRuntime.observedProfileSource = null;
const proof = {
  observedAt: controlledInput.now,
  assertedFreshness: "fresh" as const,
  proofKind: "exact_fixture" as const,
  proofScope: "exact_fixture_path" as const,
  installedBackendVersion: "0.19.0",
  installedBackendCommit: null,
};
controlledInput.observations = [
  ...controlledInput.observations.filter((item) => !["about-updates", "command-center", "profiles", "skills"].includes(item.capabilityId)),
  {
    capabilityId: "command-center", source: "Hermes detailed health bridge", interface: "/health/detailed", outcome: "success", summary: "Hermes detailed health responded.", facts: { connectionState: "online" }, ...proof,
  },
  {
    capabilityId: "command-center", source: "Hermes runtime execution", interface: "/api/sessions + /v1/runs/{run_id}", outcome: "unavailable", summary: "Hermes Management is not configured for this review.", facts: { runtimeExecution: emptyRuntimeExecution(controlledInput.now, "Hermes Management is not configured for this review."), sourceGroup: "management" }, ...proof,
  },
  {
    capabilityId: "about-updates", source: "Hermes Agent detailed health identity", interface: "/health/detailed", outcome: "success", summary: "Runtime identity was confirmed. Update availability is unknown because no update check was performed.", facts: { reportedVersion: "0.19.0", versionSource: "GET /health/detailed", reportedRunningCommit: null, detectedAgentCheckoutCommit: "d7b36070ef80", updateCheckPerformed: false, applicationUpdateAvailability: "unknown", partialClaim: true }, ...proof,
  },
  ...["profiles", "skills"].map((capabilityId) => ({
    capabilityId, source: "Hermes Management", interface: "/api/status", outcome: "unavailable" as const, summary: "Hermes Management is not configured for this review.", facts: { sourceGroup: "management" }, ...proof,
  })),
];
const controlledProjection = buildHermesControlCenterProjection(controlledInput);
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
        observationSource: "GET /health/detailed",
        gatewayState: "running",
        checkedAt: new Date().toISOString(),
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
  await page.getByRole("button", { name: "Needs Jeremy", exact: true }).click();
  await expect(page.getByTestId("hermes-operational-exceptions")).toContainText("dependent capability observations were not collected");
  await page.getByTestId("hermes-capability-about-updates").click();
  const inspector = page.locator('[data-testid="hermes-capability-inspector"]:visible');
  await expect(inspector).toContainText("Degraded");
  await expect(inspector).not.toContainText("Connected");
  await expect(inspector.getByTestId("hermes-about-claim-scope")).toContainText("GET /health/detailed, runtime version identity only");
  await expect(inspector.getByTestId("hermes-about-claim-scope")).toContainText("Update checking was not performed");
  expect(mutationCalls()).toBe(0);
});

test("a successful footer poll followed by a timeout retains stale last-known evidence without claiming offline", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationCalls = await prepare(page);
  const online = page.getByRole("button", { name: /Hermes connected/ });
  await expect(online).toBeVisible();
  await page.unroute("**/api/hermes/health");
  await page.route("**/api/hermes/health", (route) => route.fulfill({
    json: {
      enabled: true,
      status: "probe_timeout",
      version: null,
      profile: null,
      profileSource: null,
      gatewayState: null,
      checkedAt: new Date().toISOString(),
      observationSource: "GET /health/detailed",
      message: "Hermes Agent health probe timed out.",
    },
  }));
  await online.click();
  const timedOut = page.getByRole("button", { name: /Hermes health probe timed out/ });
  await expect(timedOut).toContainText("Hermes health probe timed out");
  await expect(timedOut).toHaveAttribute("aria-label", /last confirmed.*evidence is stale/i);
  await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);
  expect(mutationCalls()).toBe(0);
});

test("390x844 reduced-motion view has no overflow and emits no mutation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mutationCalls = await prepare(page);
  await expect(page.getByTestId("hermes-runtime-empty-state")).toHaveText("Runtime execution sources are unavailable. Active-run state is unknown.");
  await expect(page.getByTestId("hermes-version-strip")).toContainText("Observed active profile Unknown. Management source unavailable.");
  await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(mutationCalls()).toBe(0);
});
