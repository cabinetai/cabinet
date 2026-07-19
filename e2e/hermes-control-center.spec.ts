import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;
const evidenceDir = path.resolve("docs/evidence/hermes-truth-state");

const capabilities = [
  ["chat", "Chat and sessions", "Sessions", "operator", "Operator", "mapped", "connected"],
  ["agents-subagents", "Agents and subagents", "Agents", "operator", "Operator", "visible_read_only", "available"],
  ["messaging", "Messaging", "Messaging", "operator", "Operator", "visible_read_only", "degraded"],
  ["browser-opencli", "Browser and OpenCLI", "Tools", "operator", "Operator", "visible_read_only", "connected"],
  ["billing", "Billing", "Providers and models", "management", "Operator", "unsupported", "unsupported"],
  ["terminal", "Terminal", "Developer", "developer", "Developer", "mapped", "available"],
  ["raw-logs", "Raw logs", "Developer", "developer", "Developer", "diagnostic_only", "available"],
].map(([id, name, group, audience, mode, parityState, status]) => ({
  id, name, group, audience, mode, parityState, status,
  desktopSource: "/installed", installedVersionSupport: id === "billing" ? "Not installed" : "Supported", installedSupported: id !== "billing",
  interface: "/api/safe", cabinetSurface: "Hermes", cabinetHref: "/hermes", readWriteRisk: "read_only",
  missingWork: id === "billing" ? "Upgrade and re-audit." : "Owner review remains open.", testEvidence: "fixture", keywords: [name.toLowerCase()],
  statusDetail: id === "browser-opencli" ? "OpenCLI daemon, extension, and browser profile are connected." : id === "messaging" ? "Telegram: Fatal polling conflict. Another poller is active." : id === "raw-logs" ? "Diagnostic only. Full Cabinet management is intentionally unavailable." : "Live capability status.",
  installedSupport: { supported: id !== "billing", detail: id === "billing" ? "Not installed" : "Supported" },
  surfaceState: parityState,
  operationalHealth: id === "messaging" ? "degraded" : id === "raw-logs" ? "unknown" : id === "billing" ? "unavailable" : "healthy",
  operationalDetail: id === "messaging" ? "Telegram: Fatal polling conflict. Another poller is active." : "Fresh projection succeeded.",
  evidence: [{ source: "exact browser fixture", observedAt: new Date().toISOString(), stale: false, proofKind: "exact_fixture", outcome: id === "messaging" ? "failure" : "success", summary: id === "messaging" ? "Telegram: Fatal polling conflict. Another poller is active." : "Exact fixture projection succeeded.", installedBackendVersion: "0.18.2", installedBackendCommit: "installed-test" }],
  credit: { discoverability: true, liveVisibility: id !== "billing", governedManagement: id === "chat", liveProven: id === "browser-opencli" },
}));

const gatewayCapability = {
  ...capabilities.find((item) => item.id === "browser-opencli")!,
  id: "gateway", name: "Gateway", group: "Runtime", parityState: "visible_read_only", surfaceState: "visible_read_only",
  operationalHealth: "conflicting_evidence", status: "degraded",
  operationalDetail: "Health bridge observed running at 2026-07-19T20:00:00Z; management status observed stopped at 2026-07-19T20:00:03Z.",
  statusDetail: "Health bridge and management status disagree. Inspect both timestamped observations.",
  evidence: [{ source: "Hermes gateway observations", observedAt: "2026-07-19T20:00:03Z", stale: false, proofKind: "exact_fixture", outcome: "conflict", summary: "Health bridge observed running at 2026-07-19T20:00:00Z; management status observed stopped at 2026-07-19T20:00:03Z.", installedBackendVersion: "0.18.2", installedBackendCommit: "installed-test" }],
};
capabilities.push(gatewayCapability);

const fixture = {
  checkedAt: new Date().toISOString(),
  installed: { desktopVersion: "0.17.0", desktopCommit: null, backendVersion: "0.18.2", backendCommit: "installed-test", cabinetCommit: "test", adapter: "desktop-0.18", upstreamAudit: { auditedAt: new Date().toISOString(), auditedCommit: "upstream-test", installedBackendVersion: "0.18.2", commitsBehind: 328, stale: false } },
  health: { runtime: "online", gateway: "conflicting evidence", profile: "operator-os", openCli: "connected" },
  exceptions: [
    { capabilityId: "messaging", title: "Messaging", health: "degraded", summary: "Telegram: Fatal polling conflict. Another poller is active." },
    { capabilityId: "gateway", title: "Gateway", health: "conflicting_evidence", summary: "Health bridge observed running while management status observed stopped." },
  ],
  summary: { available: 3, connected: 2, degraded: 2, disabled: 0, unsupported: 1, needs_setup: 0 },
  capabilities,
  parity: {
    discoverability: { covered: 7, total: 7, percentage: 100 }, liveVisibility: { covered: 6, total: 7, percentage: 86 }, governedManagement: { covered: 1, total: 7, percentage: 14 }, liveProven: { covered: 1, total: 7, percentage: 14 },
    byAudience: Object.fromEntries(["operator", "management", "developer"].map((audience) => [audience, { discoverability: { covered: 1, total: 1, percentage: 100 }, liveVisibility: { covered: 1, total: 1, percentage: 100 }, governedManagement: { covered: 0, total: 1, percentage: 0 }, liveProven: { covered: 0, total: 1, percentage: 0 } }])),
  },
  live: {
    profiles: 1, skills: 12, jobs: 0, mcpServers: 2, plugins: 1, openCliProfiles: 1, openCliVersion: "1.8.5", openCliBinaryLocation: "/opt/homebrew/bin/opencli", openCliCapabilities: { screenshot: true, domRead: true, formInteraction: true, download: true }, memoryProvider: "supermemory", memoryNamespace: "operator-os:supermemory", diagnostics: [],
    operator: {
      runtime: { gatewayMode: "local", gatewayState: "stopped", gatewayRunning: false, gatewayBusy: false, lastConnection: new Date().toISOString(), observedAt: new Date().toISOString(), activeAgentCount: 1, activeSessionCount: 2 },
      agents: { available: true, active: [{ id: "worker-1", parentSessionId: "session-1", runId: "run-1", task: "Review parity evidence", profile: "operator-os", state: "running", currentAction: "Reading capability API", startedAt: new Date().toISOString(), result: null, error: null, canInterrupt: true }], recent: [] },
      messaging: [{ id: "telegram", name: "Telegram", configured: true, enabled: true, connectionState: "failed", accountOrChannel: "Operations", incomingTriggers: true, outboundDelivery: "permitted", lastSuccessfulEvent: null, lastError: "Fatal polling conflict. Another poller is active." }],
      sessions: [{ id: "session-1", title: "Parity review", profile: "operator-os", source: "desktop", status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false, pinned: null, model: "glm-5.2", preview: "Reviewing current capability evidence" }],
      artifacts: [{ id: "file-1", name: "parity-report.md", kind: "report", path: "/safe/parity-report.md", mimeType: "text/markdown", size: 2048, createdAt: new Date().toISOString(), sessionId: "session-1", runId: "run-1", capability: "artifacts", agent: "worker-1" }],
      memoryGraph: { nodes: [], edges: [], stats: { nodes: 0, edges: 0 } },
      providers: [{ id: "ollama-cloud", name: "Ollama Cloud", authenticated: true, current: true, models: ["glm-5.2"], totalModels: 1, warning: null }],
      model: { provider: "ollama-cloud", model: "glm-5.2", contextLength: null, supportsTools: true, supportsVision: null, supportsReasoning: null },
      voice: { transcriptionAvailable: true, speechAvailable: true, transcriptionInterface: "/api/audio/transcribe", speechInterface: "/api/audio/speak" },
    },
  },
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

test.beforeAll(async () => { mkdirSync(evidenceDir, { recursive: true }); cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } }); });
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await page.getByRole("tab", { name: "Developer" }).click();
  await expect(page.getByTestId("hermes-capability-terminal")).toBeVisible();
  await expect(page.getByTestId("hermes-capability-chat")).toHaveCount(0);
  await expect(page.getByTestId("hermes-capability-raw-logs")).toContainText("Diagnostic only");
  await page.screenshot({ path: path.join(evidenceDir, "developer-diagnostic-only.png"), fullPage: true });
});

test("Overview exceptions open bounded Messaging and Gateway evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  const exceptions = page.getByTestId("hermes-operational-exceptions");
  await expect(exceptions).toContainText("Telegram");
  await expect(exceptions).toContainText("Conflicting evidence");
  await page.screenshot({ path: path.join(evidenceDir, "overview-operational-exceptions.png"), fullPage: true });
  await exceptions.getByRole("button").filter({ hasText: "Gateway" }).click();
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("Health bridge observed running");
  await expect(page.getByTestId("hermes-capability-inspector")).toContainText("management status observed stopped");
  await page.screenshot({ path: path.join(evidenceDir, "gateway-conflicting-evidence.png"), fullPage: true });
});

test("OpenCLI module and 390px layout expose safe connection details without overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-more-picker.png"), fullPage: true });
  await page.getByRole("button", { name: "More Hermes sections" }).click();
  const sectionPicker = page.getByRole("dialog", { name: "Hermes sections" });
  await expect(sectionPicker).toBeVisible();
  await sectionPicker.getByRole("button", { name: "Messaging" }).click();
  await expect(page.getByTestId("hermes-live-messaging-platforms")).toContainText("Fatal polling conflict");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByPlaceholder("Search Hermes").fill("OpenCLI");
  await page.getByTestId("hermes-capability-browser-opencli").click();
  await expect(page.getByRole("dialog", { name: "Browser and OpenCLI" }).getByTestId("opencli-module")).toContainText("/opt/homebrew/bin/opencli");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("live operator modules expose exact fixture data while mutations remain unavailable", async ({ page }) => {
  await prepare(page);
  await page.getByRole("button", { name: "Agents", exact: true }).first().click();
  await expect(page.getByTestId("hermes-live-runtime-agents")).toContainText("Review parity evidence");
  await expect(page.getByRole("button", { name: "Interrupt" })).toBeDisabled();

  await page.getByRole("button", { name: "Messaging", exact: true }).first().click();
  await expect(page.getByTestId("hermes-live-messaging-platforms")).toContainText("Telegram");
  await expect(page.getByTestId("hermes-live-messaging-platforms")).not.toContainText("token");
  await page.screenshot({ path: path.join(evidenceDir, "messaging-telegram-fatal.png"), fullPage: true });

  await page.getByRole("button", { name: "Tools", exact: true }).first().click();
  await expect(page.getByTestId("hermes-live-browser-and-opencli")).toContainText("1 connected");
  await expect(page.getByRole("button", { name: "Restart or reconnect" })).toBeDisabled();
});
