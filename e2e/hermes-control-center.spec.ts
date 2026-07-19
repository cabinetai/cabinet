import { expect, test, type Page } from "@playwright/test";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;

const capabilities = [
  ["chat", "Chat and sessions", "Sessions", "operator", "Operator", "mapped", "connected"],
  ["agents-subagents", "Agents and subagents", "Agents", "operator", "Operator", "visible_read_only", "available"],
  ["messaging", "Messaging", "Messaging", "operator", "Operator", "visible_read_only", "available"],
  ["browser-opencli", "Browser and OpenCLI", "Tools", "operator", "Operator", "visible_read_only", "connected"],
  ["billing", "Billing", "Providers and models", "management", "Operator", "unsupported", "unsupported"],
  ["terminal", "Terminal", "Developer", "developer", "Developer", "mapped", "available"],
  ["raw-logs", "Raw logs", "Developer", "developer", "Developer", "diagnostic_only", "disabled"],
].map(([id, name, group, audience, mode, parityState, status]) => ({
  id, name, group, audience, mode, parityState, status,
  desktopSource: "/installed", installedVersionSupport: id === "billing" ? "Not installed" : "Supported", installedSupported: id !== "billing",
  interface: "/api/safe", cabinetSurface: "Hermes", cabinetHref: "/hermes", readWriteRisk: "read_only",
  missingWork: id === "billing" ? "Upgrade and re-audit." : "Owner review remains open.", testEvidence: "fixture", keywords: [name.toLowerCase()],
  statusDetail: id === "browser-opencli" ? "OpenCLI daemon, extension, and browser profile are connected." : "Live capability status.",
}));

const fixture = {
  checkedAt: new Date().toISOString(),
  installed: { desktopVersion: "0.17.0", desktopCommit: "311a5b0a552b", backendVersion: "0.18.2", upstreamCommit: "e361c5e20402", upstreamAheadBy: 325, cabinetCommit: "test", adapter: "desktop-0.18", updateAvailable: true },
  health: { runtime: "online", gateway: "running", profile: "operator-os", openCli: "connected" },
  summary: { available: 3, connected: 2, degraded: 0, disabled: 1, unsupported: 1, needs_setup: 0 },
  parity: { operator: 71, management: 60, developer: 78 }, capabilities,
  live: { profiles: 1, skills: 12, jobs: 0, mcpServers: 2, plugins: 1, openCliProfiles: 1, openCliVersion: "1.8.5", openCliBinaryLocation: "/opt/homebrew/bin/opencli", openCliCapabilities: { screenshot: true, domRead: true, formInteraction: true, download: true }, memoryProvider: "supermemory", memoryNamespace: "operator-os:supermemory", diagnostics: [] },
};

async function prepare(page: Page) {
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
}

test.beforeAll(async () => { cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } }); });
test.afterAll(async () => { await cabinet?.close(); });

test("operator search and inspection keep unsupported capabilities visible", async ({ page }) => {
  await prepare(page);
  await expect(page.getByTestId("hermes-capability-terminal")).toHaveCount(0);
  await page.getByPlaceholder("Search capabilities, tools, models...").fill("billing");
  await expect(page.getByTestId("hermes-capability-billing")).toBeVisible();
  await page.getByTestId("hermes-capability-billing").click();
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("unsupported");
});

test("developer mode exposes technical surfaces without operator rows", async ({ page }) => {
  await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-terminal")).toBeVisible();
  await expect(page.getByTestId("hermes-capability-chat")).toHaveCount(0);
});

test("OpenCLI module and 390px layout expose safe connection details without overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.getByPlaceholder("Search Hermes").fill("OpenCLI");
  await page.getByTestId("hermes-capability-browser-opencli").click();
  await expect(page.getByRole("dialog", { name: "Browser and OpenCLI" }).getByTestId("opencli-module")).toContainText("/opt/homebrew/bin/opencli");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
