import { expect, test, type Page } from "@playwright/test";
import { buildHermesRuntimeInterventionFixtureInput } from "../src/lib/hermes/control-center-intervention-fixture";
import { buildHermesControlCenterProjection } from "../src/lib/hermes/control-center-projection";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
const input = buildHermesRuntimeInterventionFixtureInput({
  implementationRevision: "phase-4c-browser-contract",
  artifactGeneratedAt: "2026-07-20T18:00:00.000Z",
});
const proof = {
  observedAt: input.now,
  assertedFreshness: "fresh" as const,
  proofKind: "exact_fixture" as const,
  proofScope: "exact_fixture_path" as const,
  installedBackendVersion: "0.19.0",
  installedBackendCommit: null,
};
input.installedRuntime.live.skillCatalog = {
  state: "success",
  observedAt: input.now,
  summary: "Hermes Agent reported two bounded skill catalog records.",
  interface: "/v1/skills",
  totalCount: 2,
  duplicateCount: 0,
  truncated: false,
  items: [
    { displayId: "Skill 1", name: "browser-operator", category: "Browser", provenance: null, enabled: null },
    { displayId: "Skill 2", name: "research", category: "Productivity", provenance: null, enabled: null },
  ],
};
input.installedRuntime.live.toolsetCatalog = {
  state: "success",
  observedAt: input.now,
  summary: "Hermes Agent reported two bounded toolset catalog records.",
  interface: "/v1/toolsets",
  platform: "api_server",
  totalCount: 2,
  duplicateCount: 0,
  truncated: false,
  items: [
    { displayId: "Toolset 1", label: "Browser", enabled: true, configured: true, toolCount: 4, provenance: "api_server" },
    { displayId: "Toolset 2", label: "Executor", enabled: true, configured: false, toolCount: 3, provenance: "api_server" },
  ],
};
input.observations = [
  ...input.observations.filter((item) => !["skills", "executor", "api-keys-tools"].includes(item.capabilityId)),
  {
    capabilityId: "skills", source: "Hermes Agent API skill catalog", interface: "/v1/skills", outcome: "success", summary: "Two bounded skill catalog records are visible.", facts: { count: 2, partialClaim: true, limitation: "Per-skill enabled state and provenance are not reported." }, ...proof,
  },
  ...["executor", "api-keys-tools"].map((capabilityId) => ({
    capabilityId, source: "Hermes Agent API toolset catalog", interface: "/v1/toolsets", outcome: "success" as const, summary: "Two bounded toolset catalog records are visible.", facts: { count: 2, partialClaim: true, limitation: "Catalog presence does not prove operational or credential state." }, ...proof,
  })),
];
const projection = buildHermesControlCenterProjection(input);
const browserErrors = new WeakMap<Page, string[]>();

async function prepare(page: Page) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  let mutationCalls = 0;
  await page.route("**/api/hermes/runtime-interventions", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { enabled: false } });
    mutationCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Mutation route must remain unused." } });
  });
  await page.route("**/api/hermes/health", (route) => route.fulfill({ json: { enabled: true, status: "online", version: "0.19.0", profile: null, profileSource: null, gatewayState: null, checkedAt: projection.provenance.capturedAt, message: "Catalog browser contract." } }));
  await page.route("**/api/hermes/control-center", (route) => route.fulfill({ json: projection }));
  await page.goto(`${cabinet.appUrl}/hermes`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await useDefault.click();
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) await skipTour.click();
  await page.goto(`${cabinet.appUrl}/hermes`);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  return () => mutationCalls;
}

test.beforeAll(async () => {
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os", CABINET_HERMES_INTERVENTIONS_ENABLED: "false" } });
});
test.afterAll(async () => { await cabinet?.close(); });
test.afterEach(async ({ page }) => { expect(browserErrors.get(page) ?? []).toEqual([]); });

test("desktop keeps Agent catalog evidence in Developer diagnostics without implying health", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationCalls = await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-skills")).toContainText("Degraded");
  await expect(page.getByTestId("hermes-capability-executor")).toContainText("Degraded");
  await expect(page.getByTestId("hermes-capability-list").locator('button[data-testid^="hermes-capability-"]')).toHaveCount(48);
  await expect(page.getByText(/credential-secret/i)).toHaveCount(0);
  expect(mutationCalls()).toBe(0);
});

test("skill and Executor inspectors preserve partial proof without current-live credit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mutationCalls = await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  for (const capabilityId of ["skills", "executor"]) {
    await page.getByTestId(`hermes-capability-${capabilityId}`).click();
    const inspector = page.locator('[data-testid="hermes-capability-inspector"]:visible');
    await expect(inspector).toContainText("Degraded");
    await expect(inspector.getByText("Current live visibility").locator("..")).toContainText("Not credited");
    await expect(inspector.getByText("Live-Proven").locator("..")).toContainText("Not credited");
  }
  expect(mutationCalls()).toBe(0);
});

test("390x844 reduced-motion Developer diagnostics and capability sheet have zero overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mutationCalls = await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-list")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByTestId("hermes-capability-skills").click();
  await expect(page.locator('[data-testid="hermes-capability-inspector"]:visible')).toContainText("Current live visibility");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(mutationCalls()).toBe(0);
});
