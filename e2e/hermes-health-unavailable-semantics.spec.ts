import { expect, test, type Page } from "@playwright/test";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";
import type { HermesConnectionState, HermesHealthSnapshot } from "../src/lib/hermes/types";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
const browserErrors = new WeakMap<Page, string[]>();

function projection(status: HermesConnectionState): HermesHealthSnapshot {
  const messages: Record<HermesConnectionState, string> = {
    online: "Hermes Agent API is online.",
    offline: "Hermes Agent explicitly reported that the runtime is stopped.",
    probe_unavailable: "Hermes Agent health probe is temporarily unreachable.",
    probe_timeout: "Hermes Agent health probe timed out.",
    authentication_failure: "Hermes rejected the configured server credential.",
    unavailable_profile: "Hermes profile could not be observed.",
    misconfigured: "Hermes Agent API is not configured.",
  };
  return {
    enabled: true,
    status,
    version: status === "online" ? "0.19.0" : null,
    profile: null,
    profileSource: null,
    gatewayState: status === "online" ? "running" : null,
    checkedAt: new Date().toISOString(),
    observationSource:
      status === "misconfigured"
        ? "Cabinet server configuration"
        : "GET /health/detailed",
    message: messages[status],
  };
}

async function dismissOnboarding(page: Page) {
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (
    await useDefault
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await useDefault.click();
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (
    await skipTour
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await skipTour.click();
  }
}

async function prepare(
  page: Page,
  initial: HermesConnectionState,
  expectGlobalHealthControl = true,
) {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  let state = initial;
  let polls = 0;
  await page.route("**/api/hermes/health", (route) => {
    polls += 1;
    return route.fulfill({ status: 200, json: projection(state) });
  });
  await page.goto(cabinet.appUrl);
  await dismissOnboarding(page);
  await page.goto(cabinet.appUrl);
  if ((page.viewportSize()?.width ?? 1440) <= 640) {
    const collapseSidebar = page.getByRole("button", { name: "Collapse sidebar" });
    await expect(collapseSidebar).toBeVisible();
    await collapseSidebar.click();
  }
  const health = page.locator("[data-hermes-probe-source]");
  if (expectGlobalHealthControl) await expect(health).toBeVisible();
  return {
    health,
    setState: (next: HermesConnectionState) => {
      state = next;
    },
    polls: () => polls,
  };
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

test("desktop presents expected unavailable states without a false green, false offline, or red wall", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const controller = await prepare(page, "misconfigured");

  await expect(controller.health).toContainText("Hermes not configured");
  await expect(controller.health).toHaveAttribute(
    "data-hermes-probe-source",
    "Cabinet server configuration",
  );
  await expect(controller.health).toHaveAttribute(
    "data-hermes-probe-observed-at",
    /\d{4}-\d{2}-\d{2}T/,
  );
  await expect(controller.health).not.toHaveClass(/text-green/);
  await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);

  for (const [state, label] of [
    ["probe_unavailable", "Hermes status probe unavailable"],
    ["probe_timeout", "Hermes health probe timed out"],
  ] as const) {
    controller.setState(state);
    await controller.health.click();
    await expect(controller.health).toContainText(label);
    await expect(controller.health).not.toHaveClass(/text-red/);
    await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);
  }

  controller.setState("authentication_failure");
  await controller.health.click();
  await expect(controller.health).toContainText("Hermes authentication failed");
  await expect(page.getByText("Authentication failed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /server status/i }).click();
  const row = page.getByTestId("status-hermes-agent-row");
  await expect(row).toContainText("Authentication rejected");
  await expect(row).toContainText("Source GET /health/detailed, observed");
  expect(controller.polls()).toBeGreaterThanOrEqual(4);
});

test("a prior success becomes stale on timeout and a later success recovers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const controller = await prepare(page, "online");
  await expect(controller.health).toContainText("Hermes connected");

  controller.setState("probe_timeout");
  await controller.health.click();
  await expect(controller.health).toContainText("Hermes health probe timed out");
  await expect(controller.health).toHaveAttribute(
    "aria-label",
    /last confirmed.*evidence is stale/i,
  );
  await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);

  controller.setState("online");
  await controller.health.click();
  await expect(controller.health).toContainText("Hermes connected");
  await expect(controller.health).toHaveClass(/text-green/);
});

test("390x844 remains usable and contained while the Agent health source is unavailable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const controller = await prepare(page, "probe_unavailable", false);
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/hermes/health", { cache: "no-store" });
    return {
      status: result.status,
      body: (await result.json()) as HermesHealthSnapshot,
    };
  });
  expect(response.status).toBe(200);
  expect(response.body.status).toBe("probe_unavailable");
  expect(controller.polls()).toBeGreaterThanOrEqual(1);
  await expect(controller.health).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByText("Hermes offline", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
