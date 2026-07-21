import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let agentApi: Server;
let cabinet: CabinetInstance;
let hermesFixtureHome: string;
const upstreamMethods: string[] = [];

test.beforeAll(async () => {
  agentApi = createServer((request, response) => {
    upstreamMethods.push(request.method ?? "UNKNOWN");
    const url = request.url ?? "/";
    response.setHeader("Content-Type", "application/json");
    if (url === "/health/detailed") {
      response.end(JSON.stringify({ status: "ok", version: "0.19.0" }));
      return;
    }
    if (url.startsWith("/api/sessions?")) {
      response.end(JSON.stringify({ object: "list", data: [], has_more: false, limit: 100, offset: 0 }));
      return;
    }
    response.end(JSON.stringify({ object: "list", data: [] }));
  });
  await new Promise<void>((resolve) => agentApi.listen(0, "127.0.0.1", resolve));
  const address = agentApi.address();
  if (!address || typeof address === "string") throw new Error("Agent API smoke fixture did not bind a loopback port.");

  hermesFixtureHome = await mkdtemp(path.join(tmpdir(), "cabinet-hermes-metadata-"));
  const profileRoot = path.join(hermesFixtureHome, ".hermes", "profiles", "operator-os");
  const pluginRoot = path.join(hermesFixtureHome, ".hermes", "hermes-agent", "plugins", "memory", "supermemory");
  await mkdir(profileRoot, { recursive: true });
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(path.join(profileRoot, "config.yaml"), "memory:\n  provider: supermemory\n", "utf8");
  await writeFile(path.join(pluginRoot, "plugin.yaml"), "name: supermemory\n", "utf8");

  cabinet = await bootCabinet({
    startDaemon: false,
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_API_URL: `http://127.0.0.1:${address.port}`,
      CABINET_HERMES_API_KEY: "production-smoke-secret",
      CABINET_HERMES_PROFILE: "operator-os",
      CABINET_HERMES_MANAGEMENT_URL: "",
      CABINET_HERMES_MANAGEMENT_TOKEN: "",
      CABINET_HERMES_GATEWAY_URL: "",
      CABINET_HERMES_GATEWAY_TOKEN: "",
      CABINET_HERMES_INTERVENTIONS_ENABLED: "false",
      HOME: hermesFixtureHome,
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
  await new Promise<void>((resolve, reject) => agentApi.close((error) => error ? reject(error) : resolve()));
  if (hermesFixtureHome) await rm(hermesFixtureHome, { recursive: true, force: true });
});

async function completeOnboarding(page: import("@playwright/test").Page): Promise<void> {
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await page.goto(`${cabinet.appUrl}/cockpit`);
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) await skipTour.click();
}

test("real production route keeps Today usable without Hermes Management", async ({ page }) => {
  const consoleIssues: string[] = [];
  const unexpectedServerIssues: string[] = [];
  let daemonHealthRequests = 0;
  let daemonSearchRequests = 0;
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/health/daemon") daemonHealthRequests += 1;
    if (pathname === "/api/search") daemonSearchRequests += 1;
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    unexpectedServerIssues.push(`${response.status()} ${response.url()}`);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${cabinet.appUrl}/cockpit`);
  await completeOnboarding(page);

  const root = page.getByTestId("daily-business-cockpit");
  await expect(root).toBeVisible();
  await expect(root.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(root.getByTestId("cockpit-management-unavailable")).toContainText(
    "Hermes Management is not configured. Management-backed intelligence is unavailable.",
  );
  await expect(root).not.toContainText("Missing server configuration");
  await expect(root).not.toContainText("CABINET_HERMES_MANAGEMENT_URL");
  await expect(root.getByText("The path is clear")).toBeVisible();
  await expect(page.getByText("Cabinet agent daemon is unavailable")).toHaveCount(0);
  await page.getByRole("button", { name: "Server status. Click for details" }).click();
  await expect(page.getByTestId("status-hermes-agent-row")).toContainText("Connected — 0.19.0");
  await expect(page.getByText("Not running — daemon-only features unavailable")).toBeVisible();
  await expect(page.getByText("Legacy daemon state is contextual only and does not affect Hermes-mode operability.")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("hermes-terminal-unavailable")).toBeVisible();
  await page.keyboard.press("Control+`");
  await expect(page.locator("[data-testid=terminal-tabs]")).toHaveCount(0);

  await page.keyboard.press("Meta+k");
  await page.getByRole("textbox").fill("quarterly plan");
  await expect(page.getByTestId("hermes-daemon-search-unavailable")).toBeVisible();
  await page.keyboard.press("Escape");

  await root.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Systems" }).click();
  await expect(root.getByTestId("cockpit-systems-view")).toContainText(/hermes jobs/i);
  await expect(root.getByTestId("cockpit-systems-view")).toContainText("unavailable");
  await expect(root.getByTestId("cockpit-systems-view").getByRole("heading", { name: "supermemory" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await root.getByRole("button", { name: "Today", exact: true }).click();
  await expect(root.getByRole("navigation", { name: "Cockpit mobile" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const firstViewItems = root.locator(".cockpit-first-view > *");
  expect(await firstViewItems.first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${cabinet.appUrl}/hermes`);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();
  await expect(page.getByText("Cabinet agent daemon is unavailable")).toHaveCount(0);
  await page.getByRole("button", { name: "Needs Jeremy", exact: true }).click();
  await expect(page.getByTestId("hermes-operational-exceptions")).toContainText("Management unavailable");
  await expect(page.getByTestId("hermes-operational-exceptions").locator("[role=alert]").first()).not.toHaveClass(/border-destructive/);
  await page.getByPlaceholder(/Search capabilities/i).fill("Memory and context");
  await page.getByRole("button", { name: /Memory and context/i }).first().click();
  await expect(page.getByTestId("hermes-memory-truth-boundary")).toContainText("Not inspected — credentials remain owned by Hermes");
  await expect(page.getByTestId("hermes-memory-truth-boundary")).toContainText("Supermemory — detected in the configured profile metadata");
  await expect(page.getByTestId("hermes-memory-truth-boundary")).toContainText("Detected in the local Hermes installation");
  await expect(page.getByTestId("hermes-memory-truth-boundary")).toContainText("Configuration metadata is not live runtime proof");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByTestId("hermes-control-center")).toBeVisible();

  expect(daemonHealthRequests).toBe(0);
  expect(daemonSearchRequests).toBe(0);
  expect(consoleIssues).toEqual([]);
  expect(unexpectedServerIssues).toEqual([]);
  expect(upstreamMethods.length).toBeGreaterThan(0);
  expect(upstreamMethods.every((method) => method === "GET")).toBe(true);
  expect(await page.locator("body").innerText()).not.toMatch(/production-smoke-secret|\/Users\/|[A-Za-z]:\\Users\\/);
});
