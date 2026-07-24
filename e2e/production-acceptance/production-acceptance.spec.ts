import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { buildHermesAcceptanceFixtureProjection } from "../../src/lib/hermes/control-center-acceptance-fixture";
import type {
  AcceptanceStatus,
  RouteChecklistEntry,
} from "./contracts";
import { bootIsolatedCabinet, type IsolatedCabinet } from "./isolated-cabinet";
import {
  AcceptanceRecorder,
  markRoute,
  scanIndicators,
  writeAcceptanceArtifacts,
} from "./recorder";
import { discoverRouteManifest } from "./route-discovery";
import {
  assertAcceptanceNonce,
  TRANSPORT_NONCE,
  selectTransport,
  type AcceptanceConversation,
} from "./transport";
import {
  assertMessageFidelityEvidence,
  captureMessageFidelityEvidence,
} from "./message-exactness";
import { assertLiveConversationEvidence } from "./conversation-gate";
import {
  ControlledRestartTracker,
  type RestartRequest,
} from "./restart-handling";
import { sampleHermesHealthProjection } from "./health-observation";

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const CHECK_TIMEOUT_MS = 45_000;
const INTERACTION_TIMEOUT_MS = 15_000;
const appPort = Number(process.env.CABINET_ACCEPTANCE_PORT ?? 4344);
const repoRoot = process.cwd();
const acceptanceBaseRef = process.env.CABINET_ACCEPTANCE_BASE_REVISION ?? "origin/main";
const acceptanceBaseRevision = execFileSync("git", ["rev-parse", acceptanceBaseRef], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const outputDir = path.resolve(
  process.env.CABINET_ACCEPTANCE_OUTPUT_DIR ??
    "docs/research/parallel/acceptance-harness"
);
const screenshotDir = path.join(outputDir, "screenshots");
const recorder = new AcceptanceRecorder();
const transport = selectTransport();
const allowIntegrationDiff =
  process.env.CABINET_ACCEPTANCE_ALLOW_INTEGRATION_DIFF === "1";
const skillsMode = process.env.CABINET_ACCEPTANCE_SKILLS_MODE;
if (skillsMode !== "fixture" && skillsMode !== "production") {
  throw new Error(
    "CABINET_ACCEPTANCE_SKILLS_MODE must be explicitly set to fixture or production.",
  );
}
const projection = buildHermesAcceptanceFixtureProjection({
  implementationRevision: acceptanceBaseRevision,
  artifactGeneratedAt: "2026-07-23T00:00:00.000Z",
});
let cabinet: IsolatedCabinet;
let routes: RouteChecklistEntry[] = [];
let controlledRestart: ControlledRestartTracker | null = null;
const restartRequests = new WeakMap<import("@playwright/test").Request, RestartRequest>();
let providerGateConversation: AcceptanceConversation | null = null;

function addCheck(
  id: string,
  area: string,
  status: AcceptanceStatus,
  summary: string,
  evidence?: Record<string, unknown>
) {
  recorder.check({ id, area, status, summary, evidence });
}

function conciseError(value: string): string {
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

async function observed<T>(
  id: string,
  area: string,
  operation: () => Promise<T>,
  passSummary: (value: T) => string,
  failSummary: (error: unknown) => string,
  blocker?: { id: string; reproduction: string[]; ownerHint?: string },
  timeoutMs = CHECK_TIMEOUT_MS
): Promise<T | null> {
  let timeout: NodeJS.Timeout | undefined;
  recorder.stage(id);
  try {
    const value = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Check ${id} exceeded its ${timeoutMs}ms budget.`)),
          timeoutMs
        );
      }),
    ]);
    addCheck(id, area, "passed", passSummary(value), typeof value === "object" && value ? value as Record<string, unknown> : undefined);
    return value;
  } catch (error) {
    const summary = conciseError(failSummary(error));
    addCheck(id, area, "failed", summary);
    if (blocker) {
      recorder.blocker({
        id: blocker.id,
        area,
        summary,
        reproduction: blocker.reproduction,
        ownerHint: blocker.ownerHint,
      });
    }
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function notRun(id: string, area: string, summary: string): void {
  addCheck(id, area, "not_run", summary);
}

async function installPageObservation(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.wizard-done", "1");
    window.localStorage.setItem("cabinet.tour-done", "1");
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(cabinet.appUrl).origin) {
      recorder.request(request.method(), url.pathname);
      restartRequests.set(request, {
        method: request.method(),
        path: url.pathname,
        startedPhase: controlledRestart?.phase ?? null,
      });
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(cabinet.appUrl).origin) {
      const errorText = request.failure()?.errorText ?? "request failed";
      recorder.requestFailed(
        request.method(),
        url.pathname,
        errorText,
      );
      const restartRequest = restartRequests.get(request);
      if (controlledRestart && restartRequest) {
        const classification = controlledRestart.requestFailed(
          restartRequest,
          errorText,
        );
        recorder.browserIssue({
          source: "request",
          severity: classification.expected ? "warning" : "error",
          path: url.pathname,
          summary: classification.reason,
          expectedControlledRestartTransport: classification.expected,
        });
      }
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== new URL(cabinet.appUrl).origin) return;
    if (url.pathname === "/api/hermes/health" && response.status() === 200) {
      return;
    }
    if (
      (url.pathname === "/api/hermes/cockpit" && response.status() === 502) ||
      (url.pathname === "/api/hermes/runs" && response.status() === 500)
    ) {
      recorder.browserIssue({
        source: "http",
        severity: "warning",
        path: url.pathname,
        summary: "Expected read-only source unavailability rendered by its owning surface.",
        expectedUnavailableProjection: true,
      });
      return;
    }
    if (response.status() >= 400) {
      recorder.browserIssue({
        source: "http",
        severity: "error",
        path: url.pathname,
        summary: `Unexpected HTTP ${response.status()}.`,
      });
    }
  });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const expectedRestartTransport =
        message.type() === "error" &&
        controlledRestart?.consoleTransportFailure(message.text()) === true;
      const prefix = expectedRestartTransport
        ? `expected-restart-${message.type()}`
        : message.type();
      recorder.scanText.push(`${prefix}: ${message.text()}`);
      recorder.browserIssue({
        source: "console",
        severity: expectedRestartTransport
          ? "warning"
          : message.type() === "error"
            ? "error"
            : "warning",
        summary: conciseError(message.text()),
        expectedControlledRestartTransport: expectedRestartTransport,
      });
    }
  });
  page.on("pageerror", (error) => {
    controlledRestart?.unhandledError();
    recorder.scanText.push(`pageerror: ${error.message}`);
    recorder.browserIssue({
      source: "pageerror",
      severity: "error",
      summary: conciseError(error.message),
    });
  });

  if (transport.sendsLiveModelMessages) return;

  await page.route("**/api/hermes/health", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        status: "online",
        version: "0.19.0",
        profile: "operator-os",
        gatewayState: "running",
        checkedAt: projection.provenance.capturedAt,
        message: "Acceptance fixture health. No live transport selected.",
      },
    })
  );
  await page.route("**/api/hermes/control-center", (route) =>
    route.fulfill({ json: projection })
  );
}

async function pageIdentity(page: Page, route: string, meaningful: RegExp) {
  await page.goto(`${cabinet.appUrl}${route}`);
  await expect(page.locator("body")).toContainText(meaningful);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  recorder.scanText.push(await page.locator("body").innerText());
}

async function screenshot(
  page: Page,
  id: string,
  route: string,
  purpose: string,
  reducedMotion = false
) {
  const currentUrl = new URL(page.url());
  const isolatedOrigin = new URL(cabinet.appUrl).origin;
  if (currentUrl.origin !== isolatedOrigin) {
    throw new Error(`Refusing screenshot outside isolated Cabinet origin: ${currentUrl.origin}`);
  }
  const visibleText = await page.locator("body").innerText({ timeout: INTERACTION_TIMEOUT_MS });
  const indicators = scanIndicators(`${page.url()}\n${visibleText}`);
  if (indicators.secretIndicators.length || indicators.localPathIndicators.length) {
    throw new Error("Refusing screenshot because private-content indicators were detected.");
  }
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const file = `screenshots/${id}.png`;
  await page.screenshot({ path: path.join(outputDir, file), fullPage: false });
  recorder.screenshots.push({ id, file, viewport, reducedMotion, route, purpose });
}

test.beforeAll(async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(screenshotDir, { recursive: true });
  routes = await discoverRouteManifest(repoRoot);
  cabinet = await bootIsolatedCabinet(repoRoot);
});

test.afterAll(async () => {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const changed = execFileSync("git", ["diff", "--name-only", acceptanceBaseRevision], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const applicationDiff = changed.filter(
    (file) =>
      !file.startsWith("e2e/production-acceptance/") &&
      !file.startsWith("scripts/production-acceptance/") &&
      !file.startsWith("docs/research/parallel/acceptance-harness/") &&
      file !== "PROGRESS.md"
  );
  if (applicationDiff.length && !allowIntegrationDiff) {
    recorder.blocker({
      id: "application-diff-outside-owned-lane",
      area: "safety",
      summary: `Application or shared files differ from acceptance base ${acceptanceBaseRevision}.`,
      reproduction: [
        `Run git diff --name-only ${acceptanceBaseRevision}.`,
        "Inspect paths outside the acceptance lane.",
      ],
      ownerHint: "integration coordinator",
    });
  }
  await writeAcceptanceArtifacts(outputDir, {
    stream: "acceptance-harness",
    branch,
    testedBaseRevision: acceptanceBaseRevision,
    applicationDiffFromBase: applicationDiff,
    environment: {
      url: `http://127.0.0.1:${appPort}`,
      appPort,
      runtimeMode: "hermes",
      data: "isolated",
      productionTouched: false,
      liveModelMessagesSent: recorder.network.modelMessageRequests,
      transport: transport.id,
      skillsMode,
      browserPath: process.env.CABINET_ACCEPTANCE_BROWSER_PATH ?? "Playwright runner",
    },
    routes,
    visibleNavigation: recorder.navigation,
    checks: recorder.checks,
    blockers: recorder.blockers,
    network: recorder.network,
    browserIssues: recorder.browserIssues,
    conversationPersistence: recorder.conversationPersistence,
    messageFidelity: recorder.messageFidelity,
    screenshots: recorder.screenshots,
    productionTouched: false,
  }, recorder.scanText.join("\n"));
  await cabinet?.close();
});

test("two-turn provider gate", async ({ page }) => {
  await installPageObservation(page);
  providerGateConversation = await observed(
    transport.sendsLiveModelMessages
      ? "live-two-turn-contract"
      : "fixture-two-turn-contract",
    "conversation",
    async () => {
      const result = await transport.runTwoTurnContract(
        cabinet,
        (evidence) => recorder.recordConversationPersistence(evidence),
        (method, pathname) => recorder.request(method, pathname),
      );
      if (transport.sendsLiveModelMessages) {
        const fidelity = await captureMessageFidelityEvidence(
          page,
          cabinet.appUrl,
          result,
        );
        recorder.recordMessageFidelity(fidelity);
        assertMessageFidelityEvidence(fidelity);
        assertLiveConversationEvidence(recorder.conversationPersistence);
      } else {
        assertAcceptanceNonce(result.firstResponse, "initial");
        assertAcceptanceNonce(result.secondResponse, "follow-up");
      }
      expect(result.sameSession).toBe(true);
      expect(result.userTurns).toBe(2);
      expect(result.completedAssistantTurns).toBe(2);
      if (transport.sendsLiveModelMessages) expect(result.cabinetRestart).toBe(true);
      return result;
    },
    (result) =>
      `${transport.id} returned the exact nonce once per response with two user and two completed assistant turns` +
      `${result.cabinetRestart ? " across a Cabinet restart" : ""}.`,
    (error) => `Two-turn provider gate failed: ${String(error)}`,
    {
      id: "live-two-turn-contract-failed",
      reproduction: [
        "Dispatch the bounded initial acceptance message once.",
        "Continue the persisted native session once.",
        "Verify the same session after the isolated Cabinet restart.",
      ],
      ownerHint: "ACP provider/model resolution",
    },
    300_000,
  );
  if (!transport.sendsLiveModelMessages) {
    addCheck(
      "live-two-turn-contract",
      "conversation",
      "blocked",
      "No live transport was selected; zero live model messages were sent.",
    );
  }
});

test("authoritative isolated production acceptance", async ({ page }) => {
  if (!providerGateConversation) {
    for (const route of routes) {
      route.exercised = false;
      route.status = "not_run";
      route.note = "NOT_RUN because the two-turn provider gate did not pass.";
    }
    notRun(
      "full-route-harness",
      "routes",
      "NOT_RUN because the two-turn provider gate did not pass; no additional conversation or model call was made.",
    );
    return;
  }

  await installPageObservation(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const orgChartRoute = await observed(
    "route-manifest",
    "routes",
    async () => {
      expect(routes.some((entry) => entry.route === "/*")).toBe(true);
      expect(routes.some((entry) => entry.route === "/tasks")).toBe(true);
      expect(routes.some((entry) => entry.route === "/agents/conversations/:id")).toBe(true);
      return { count: routes.length };
    },
    ({ count }) => `Discovered ${count} application and SPA routes from exact source.`,
    (error) => `Route discovery failed: ${String(error)}`
  );

  await observed(
    "desktop-navigation",
    "navigation",
    async () => {
      await pageIdentity(page, "/room/acceptance-cabinet", /acceptance-cabinet/i);
      await expect(
        page.getByRole("heading", { name: "Acceptance Cabinet" })
      ).toBeVisible({ timeout: INTERACTION_TIMEOUT_MS });
      const labels = await page.getByRole("button").allTextContents();
      const normalized = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
      recorder.navigation.desktop = normalized.slice(0, 80);
      markRoute(routes, "/room/acceptance-cabinet", "passed");
      return { count: normalized.length };
    },
    ({ count }) => `Discovered ${count} visible desktop button labels.`,
    (error) => `Desktop navigation discovery failed: ${String(error)}`,
    {
      id: "desktop-navigation-unavailable",
      reproduction: ["Open /room/acceptance-cabinet at 1440x900.", "Inspect visible navigation."],
    }
  );
  await screenshot(page, "desktop-room", "/room/acceptance-cabinet", "Desktop room and navigation");

  await observed(
    "drawers-data-team",
    "drawers",
    async () => {
      const data = page.getByRole("tab", { name: /Data drawer/ });
      const team = page.getByRole("tab", { name: /Team drawer/ });
      await expect(data).toBeVisible();
      await expect(team).toBeVisible();
      await team.click({ timeout: 10_000 });
      await expect(team).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("main")).toContainText(/Operator|Team|Agent/);
      markRoute(routes, "/room/acceptance-cabinet/-/agents", "passed");
      await data.click({ timeout: 10_000 });
      await expect(data).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("main")).toContainText("Acceptance Cabinet");
      return { dataSelected: true, teamSelected: true };
    },
    () => "Data and Team drawers changed selected state and rendered their target surfaces.",
    (error) => `Data/Team drawers did not complete their target transitions: ${String(error)}`,
    {
      id: "data-team-drawers-no-op",
      reproduction: [
        "Open /room/acceptance-cabinet.",
        "Select Team, then Data.",
        "Observe whether selected state and main content change.",
      ],
      ownerHint: "drawer/mobile stabilization stream",
    }
  );

  await observed(
    "new-composer",
    "new",
    async () => {
      const trigger = page.getByRole("button", { name: "New conversation" });
      await trigger.click({ timeout: 10_000 });
      const dialog = page.getByRole("dialog", { name: "What needs to get done?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("textarea")).toBeEditable();
      await page.keyboard.press("Escape");
      return { dialogs: await dialog.count() };
    },
    () => "New opened one keyboard-usable conversation composer.",
    (error) => `New composer failed: ${String(error)}`
  );

  await observed(
    "search-terminal-unavailable",
    "availability",
    async () => {
      await expect(page.getByRole("button", { name: "Content search unavailable" })).toBeDisabled();
      await expect(page.getByText("Terminal unavailable", { exact: true })).toBeVisible();
      expect(recorder.network.searchRequests).toBe(0);
      expect(recorder.network.ptyCreateOrWriteRequests).toBe(0);
      return {
        searchRequests: recorder.network.searchRequests,
        ptyRequests: recorder.network.ptyCreateOrWriteRequests,
      };
    },
    () => "Search and Terminal were visibly unavailable with zero Search/PTY requests.",
    (error) => `Unavailable Search/Terminal contract failed: ${String(error)}`,
    {
      id: "unavailable-search-terminal-contract",
      reproduction: ["Open a Hermes-mode room.", "Inspect Search and Terminal affordances and network."],
      ownerHint: "polling stabilization stream",
    }
  );

  await observed(
    "tasks-route",
    "tasks",
    async () => {
      await pageIdentity(page, "/tasks", /Tasks/);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet/-/tasks`);
      await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
      markRoute(routes, "/tasks", "passed");
      markRoute(routes, "/room/acceptance-cabinet/-/tasks", "passed");
      return { standalone: true, nested: true, reload: true };
    },
    () => "Tasks loaded standalone and nested, including reload.",
    (error) => `Tasks route failed: ${String(error)}`
  );

  await observed(
    "primary-application-routes",
    "routes",
    async () => {
      await pageIdentity(page, "/", /Acceptance Home|Acceptance Cabinet/);
      markRoute(routes, "/", "passed");

      await page.goto(`${cabinet.appUrl}/cockpit`);
      const cockpit = page.getByTestId("daily-business-cockpit");
      await expect(cockpit).toBeVisible({ timeout: INTERACTION_TIMEOUT_MS });
      await expect(cockpit.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
      markRoute(routes, "/cockpit", "passed");

      await pageIdentity(page, "/integrations", /Integrations/);
      markRoute(routes, "/integrations", "passed");
      await pageIdentity(page, "/settings", /Settings/);
      markRoute(routes, "/settings", "passed");
      await pageIdentity(page, "/settings/providers", /Advanced Hermes|Providers/);
      markRoute(routes, "/settings/providers", "passed");
      await pageIdentity(page, "/login", /Cabinet|Sign in/);
      markRoute(routes, "/login", "passed");
      await pageIdentity(page, "/acceptance-catchall-check", /Acceptance Home|Acceptance Cabinet/);
      markRoute(routes, "/*", "passed");
      return { routes: 7, cockpitLocator: "daily-business-cockpit > heading:Today" };
    },
    ({ routes: count }) => `Loaded ${count} independent application routes with deterministic Cockpit identity.`,
    (error) => `A primary application route failed: ${String(error)}`,
    {
      id: "primary-route-failed",
      reproduction: ["Open home, Today, Integrations, Settings, Advanced Hermes, login, and a catch-all route."],
    },
    90_000,
  );

  await observed(
    "org-chart",
    "organization",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`, {
        waitUntil: "domcontentloaded",
        timeout: INTERACTION_TIMEOUT_MS,
      });
      await expect(page.getByRole("heading", { name: "Acceptance Cabinet" })).toBeVisible({
        timeout: INTERACTION_TIMEOUT_MS,
      });
      return { route: "/room/acceptance-cabinet" };
    },
    () => "Loaded the room overview that owns the Org-chart action.",
    (error) => `Org-chart route setup failed: ${String(error)}`,
    {
      id: "org-chart-route-unavailable",
      reproduction: ["Open /room/acceptance-cabinet.", "Verify the room overview renders."],
      ownerHint: "acceptance harness",
    }
  );

  const orgChartTrigger: Locator = page.getByRole("button", {
    name: "Org chart",
    exact: true,
  });
  const orgChartTriggerFound =
    orgChartRoute
      ? await observed(
          "org-chart-trigger-present",
          "organization",
          async () => {
            await expect(orgChartTrigger).toHaveCount(1, { timeout: INTERACTION_TIMEOUT_MS });
            await expect(orgChartTrigger).toBeVisible({ timeout: INTERACTION_TIMEOUT_MS });
            return { count: 1 };
          },
          () => "Found one visible Org-chart button by its accessible role and name.",
          (error) => `Org-chart trigger is missing: ${String(error)}`,
          {
            id: "org-chart-trigger-missing",
            reproduction: [
              "Open /room/acceptance-cabinet.",
              "Query role=button and accessible name=Org chart.",
            ],
            ownerHint: "acceptance harness",
          }
        )
      : null;

  const resolvedOrgChartTrigger = orgChartTriggerFound ? orgChartTrigger : null;
  const orgChartEnabled = resolvedOrgChartTrigger
    ? await observed(
        "org-chart-trigger-enabled",
        "organization",
        async () => {
          await expect(resolvedOrgChartTrigger).toBeEnabled({
            timeout: INTERACTION_TIMEOUT_MS,
          });
          return { enabled: true };
        },
        () => "The Org-chart trigger was enabled for the isolated agent fixture.",
        (error) => `Org-chart trigger is disabled: ${String(error)}`,
        {
          id: "org-chart-trigger-disabled",
          reproduction: [
            "Open the isolated room containing the Operator fixture.",
            "Inspect the Org chart button enabled state.",
          ],
          ownerHint: "acceptance harness or room overview",
        }
      )
    : null;
  if (!orgChartTriggerFound || !orgChartTrigger) {
    notRun(
      "org-chart-trigger-enabled",
      "organization",
      "Not run because the accessible Org-chart trigger was not found."
    );
  }

  const orgChartClicked = resolvedOrgChartTrigger && orgChartEnabled
    ? await observed(
        "org-chart-trigger-click",
        "organization",
        async () => {
          await resolvedOrgChartTrigger.click({ timeout: INTERACTION_TIMEOUT_MS });
          return { clicked: true };
        },
        () => "The enabled Org-chart trigger accepted a bounded click.",
        (error) => `Org-chart trigger click failed: ${String(error)}`,
        {
          id: "org-chart-trigger-click-failed",
          reproduction: ["Open the room overview.", "Click the enabled Org chart button."],
          ownerHint: "acceptance harness or room overview",
        }
      )
    : null;
  if (!resolvedOrgChartTrigger || !orgChartEnabled) {
    notRun(
      "org-chart-trigger-click",
      "organization",
      "Not run because the Org-chart trigger was missing or disabled."
    );
  }

  const orgChartDialog: Locator = page.getByRole("dialog", {
    name: "Acceptance Cabinet: org chart",
    exact: true,
  });
  const orgChartDialogFound = orgChartClicked
    ? await observed(
        "org-chart-dialog",
        "organization",
        async () => {
          await expect(orgChartDialog).toBeVisible({ timeout: INTERACTION_TIMEOUT_MS });
          return { visible: true };
        },
        () => "The named Org-chart dialog opened after the trigger click.",
        (error) => `Org-chart dialog did not open: ${String(error)}`,
        {
          id: "org-chart-dialog-missing",
          reproduction: [
            "Click the enabled Org chart button.",
            "Query role=dialog and accessible name=Acceptance Cabinet: org chart.",
          ],
          ownerHint: "room overview",
        }
      )
    : null;
  if (!orgChartClicked) {
    notRun(
      "org-chart-dialog",
      "organization",
      "Not run because the Org-chart trigger click did not complete."
    );
  }

  const resolvedOrgChartDialog = orgChartDialogFound ? orgChartDialog : null;
  if (resolvedOrgChartDialog) {
    await observed(
      "org-chart-bounds-and-close",
      "organization",
      async () => {
        const bounds = await resolvedOrgChartDialog.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
        await screenshot(
          page,
          "org-chart-desktop",
          "/room/acceptance-cabinet",
          "Viewport-bounded isolated Org-chart dialog"
        );
        await page.keyboard.press("Escape");
        await expect(resolvedOrgChartDialog).toBeHidden({
          timeout: INTERACTION_TIMEOUT_MS,
        });
        await expect(resolvedOrgChartTrigger!).toBeFocused({
          timeout: INTERACTION_TIMEOUT_MS,
        });
        markRoute(routes, "/room/acceptance-cabinet", "passed");
        return { bounded: true, keyboardClosed: true, focusRestored: true };
      },
      () => "Org chart stayed viewport-bounded, closed by keyboard, and restored trigger focus.",
      (error) => `Org-chart bounds or keyboard-close contract failed: ${String(error)}`,
      {
        id: "org-chart-bounds-or-close-failed",
        reproduction: [
          "Open the named Org-chart dialog at 1440x900.",
          "Measure dialog bounds, press Escape, and verify focus restoration.",
        ],
        ownerHint: "room overview",
      }
    );
  } else {
    notRun(
      "org-chart-bounds-and-close",
      "organization",
      "Not run because the named Org-chart dialog did not open."
    );
  }

  await observed(
    "operator-mode",
    "Hermes",
    async () => {
      await page.goto(
        `${cabinet.appUrl}/hermes`,
      );
      await expect(page.getByTestId("hermes-control-center")).toBeVisible();
      await expect(page.getByRole("tab", { name: "Operator" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      markRoute(routes, "/hermes", "passed");
      return { mode: "operator" };
    },
    () => "Hermes Operator mode rendered against the non-mutating acceptance projection.",
    (error) => `Operator mode failed: ${String(error)}`
  );

  await observed(
    "governed-skills",
    "Skills",
    async () => {
      await page.getByRole("button", { name: "Skills", exact: true }).click({ timeout: 10_000 });
      await expect(page.getByTestId("hermes-skills-management")).toBeVisible();
      await expect(page.getByTestId("hermes-skills-fixture-label")).toContainText(
        "no live Hermes mutation performed"
      );
      return { mutationRequests: 0 };
    },
    () => "Governed Skills rendered with explicit fixture provenance and no live mutation.",
    (error) => `Governed Skills surface failed: ${String(error)}`
  );

  await observed(
    "hermes-operator-sections",
    "Hermes",
    async () => {
      const targets: Array<[string, string]> = [
        ["Sessions / runs", "sessions"],
        ["Memory", "memory"],
        ["Sources", "sources"],
        ["Settings", "settings"],
      ];
      const navigation = page.getByRole("navigation", {
        name: "Hermes Control Center",
      });
      for (const [label, section] of targets) {
        await navigation.getByRole("button", { name: label, exact: true }).click();
        await expect(page.getByTestId(`hermes-section-${section}`)).toBeVisible();
      }
      return { sections: targets.length };
    },
    ({ sections }) => `Opened ${sections} independently scoped Hermes Operator sections.`,
    (error) => `A Hermes Operator section failed: ${String(error)}`,
    {
      id: "hermes-operator-section-failed",
      reproduction: ["Open Hermes Operator.", "Open Sessions / runs, Memory, Sources, and Settings."],
    },
  );

  await observed(
    "developer-diagnostics-48",
    "Developer",
    async () => {
      await page.getByRole("tab", { name: "Developer" }).click({ timeout: 10_000 });
      const rows = page
        .getByTestId("hermes-capability-list")
        .locator('button[data-testid^="hermes-capability-"]');
      await expect(rows).toHaveCount(48);
      markRoute(routes, "/hermes?mode=developer&section=developer", "passed");
      return { count: await rows.count() };
    },
    ({ count }) => `Developer mode exposed exactly ${count} diagnostic rows.`,
    (error) => `Developer diagnostic row contract failed: ${String(error)}`,
    {
      id: "developer-diagnostics-not-48",
      reproduction: ["Open /hermes.", "Switch to Developer.", "Count capability rows."],
    }
  );
  await screenshot(page, "developer-diagnostics", "/hermes?mode=developer", "48 diagnostic rows");

  const conversation = providerGateConversation;

  if (conversation && transport.sendsLiveModelMessages) {
    await observed(
      "conversation-direct-reload-persistence",
      "conversation",
      async () => {
        const taskRoute = `/tasks/${conversation.conversationId}`;
        await page.goto(`${cabinet.appUrl}${taskRoute}`);
        const agentTurns = page.locator('[data-testid="turn"][data-turn-role="agent"]');
        await expect(agentTurns).toHaveCount(2);
        await page.reload();
        await expect(agentTurns).toHaveCount(2);
        markRoute(routes, "/tasks/:id", "passed");

        await page.goto(
          `${cabinet.appUrl}/agents/conversations/${conversation.conversationId}`,
        );
        const transcriptBodies = page.locator(
          '[data-testid="turn"][data-turn-role="agent"] > ' +
            '[data-testid="assistant-message-content"]' +
            '[data-message-author="assistant"][data-message-part="content"]',
        );
        await expect(transcriptBodies).toHaveCount(2);
        for (const body of await transcriptBodies.allInnerTexts()) {
          expect(body.split(TRANSPORT_NONCE)).toHaveLength(2);
        }
        markRoute(routes, "/agents/conversations/:id", "passed");
        return { directTask: true, reload: true, transcript: true };
      },
      () => "The completed conversation survived direct task/transcript URLs and reload.",
      (error) => `Conversation direct URL or reload failed: ${String(error)}`,
      {
        id: "conversation-direct-reload-failed",
        reproduction: ["Open the completed task directly.", "Reload it.", "Open its transcript route."],
      },
      60_000,
    );
  } else {
    addCheck(
      "conversation-direct-reload-persistence",
      "conversation",
      "blocked",
      "Blocked by the unavailable live two-turn conversation result.",
    );
    markRoute(routes, "/tasks/:id", "blocked", "Blocked by the unavailable live conversation.");
    markRoute(
      routes,
      "/agents/conversations/:id",
      "blocked",
      "Blocked by the unavailable live conversation.",
    );
  }

  await observed(
    "restart-route-persistence",
    "restart",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
      await expect(page.getByText("Acceptance Cabinet", { exact: true }).first()).toBeVisible();
      const tracker = new ControlledRestartTracker();
      controlledRestart = tracker;
      try {
        await cabinet.restart((phase) => tracker.transition(phase));
        // The controlled transport-loss window ends at health readiness. Keep
        // the local tracker for the remaining phase ledger, but stop assigning
        // the intentional reload's ERR_ABORTED cancellations to listener loss.
        controlledRestart = null;
        await page.reload();
        await expect(page.getByText("Acceptance Cabinet", { exact: true }).first()).toBeVisible();
        tracker.transition("browser_reconnected");
        tracker.transition("acceptance_resumed");
        return {
          cabinetRestart: true,
          routePersisted: true,
          ...tracker.complete(),
        };
      } finally {
        controlledRestart = null;
      }
    },
    () => `Isolated Cabinet restarted on port ${appPort} and the room route persisted.`,
    (error) => `Cabinet restart persistence failed: ${String(error)}`,
    {
      id: "cabinet-restart-persistence",
      reproduction: ["Open the room.", "Restart isolated Cabinet.", "Reload the same URL."],
      ownerHint: "supervision stabilization stream",
    },
    120_000
  );
  await observed(
    "launchd-child-restart",
    "supervision",
    async () => {
      execFileSync("npx", ["tsx", "--test", "test/supervised-launch.test.ts"], {
        cwd: repoRoot,
        stdio: "ignore",
        timeout: 120_000,
      });
      return { isolatedSuite: true };
    },
    () => "The complete isolated supervision recovery suite passed without touching launchd.",
    (error) => `Supervision recovery evidence failed: ${String(error)}`,
    {
      id: "launchd-child-restart-not-proven",
      reproduction: ["Run the isolated supervised-launch test suite."],
      ownerHint: "supervision stabilization",
    },
    150_000,
  );

  await observed(
    "history-navigation",
    "navigation",
    async () => {
      await page.goto(`${cabinet.appUrl}/tasks`);
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
      await page.goBack();
      await expect(page).toHaveURL(/\/tasks$/);
      await page.goForward();
      await expect(page).toHaveURL(/\/room\/acceptance-cabinet$/);
      return { back: true, forward: true };
    },
    () => "Back/forward navigation preserved route identity.",
    (error) => `Back/forward navigation failed: ${String(error)}`,
    undefined,
    60_000
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await observed(
    "mobile-reduced-motion-overflow",
    "responsive",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
      await expect(
        page.getByText("Acceptance Cabinet", { exact: true }).first()
      ).toBeVisible({ timeout: INTERACTION_TIMEOUT_MS });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      const labels = await page.getByRole("button").allTextContents();
      recorder.navigation.mobile = [...new Set(labels.map((label) => label.trim()).filter(Boolean))].slice(0, 80);
      expect(overflow).toBeLessThanOrEqual(0);
      return { overflow };
    },
    ({ overflow }) => `390x844 reduced-motion room had ${overflow}px horizontal overflow.`,
    (error) => `390x844 reduced-motion room overflowed or clipped: ${String(error)}`,
    {
      id: "mobile-conversation-clipped",
      reproduction: ["Set viewport to 390x844 and reduced motion.", "Open the room/conversation surface.", "Measure document overflow and visible bounds."],
      ownerHint: "drawer/mobile stabilization stream",
    }
  );
  await screenshot(
    page,
    "mobile-room-reduced-motion",
    "/room/acceptance-cabinet",
    "Mobile reduced-motion overflow",
    true
  );

  addCheck(
    "legacy-daemon-output-accounting",
    "network",
    recorder.network.legacyDaemonOutputRequests === 0 ? "passed" : "failed",
    `Observed ${recorder.network.legacyDaemonOutputRequests} legacy daemon-output request(s).`,
    { count: recorder.network.legacyDaemonOutputRequests }
  );
  if (recorder.network.legacyDaemonOutputRequests > 0) {
    recorder.blocker({
      id: "legacy-daemon-output-poll",
      area: "network",
      summary: "Conversation-related navigation still requested the legacy daemon-output endpoint.",
      reproduction: ["Open a conversation directly.", "Reload.", "Inspect /api/daemon/session/:id/output requests."],
      ownerHint: "polling stabilization stream",
    });
  }

  const incompleteRoutes = routes.filter((entry) => entry.status !== "passed");
  addCheck(
    "complete-route-inventory",
    "routes",
    incompleteRoutes.length === 0 ? "passed" : "failed",
    incompleteRoutes.length === 0
      ? `Exercised all ${routes.length} discovered and required routes.`
      : `${incompleteRoutes.length} route(s) were not accepted.`,
    { incomplete: incompleteRoutes.map((entry) => entry.route) },
  );
  if (incompleteRoutes.length > 0) {
    recorder.blocker({
      id: "incomplete-route-inventory",
      area: "routes",
      summary: `${incompleteRoutes.length} discovered or required route(s) were not accepted.`,
      reproduction: incompleteRoutes.map((entry) => `Open ${entry.route}.`),
      ownerHint: "acceptance harness",
    });
  }

  if (transport.sendsLiveModelMessages) {
    recorder.stage("console-health");
    try {
      const healthIssue = await sampleHermesHealthProjection(page, cabinet.appUrl);
      if (healthIssue) {
        recorder.browserIssue({
          source: "http",
          ...healthIssue,
        });
      }
    } catch (error) {
      recorder.browserIssue({
        source: "http",
        severity: "error",
        path: "/api/hermes/health",
        summary: `Hermes health observation failed: ${conciseError(String(error))}`,
      });
    }
  }

  const relevantBrowserIssues = recorder.relevantBrowserIssues();
  addCheck(
    "console-health",
    "browser",
    relevantBrowserIssues.length ? "failed" : "passed",
    relevantBrowserIssues.length
      ? `${relevantBrowserIssues.length} relevant browser issue(s) were observed with stage ownership.`
      : "No relevant browser or framework errors were observed.",
    relevantBrowserIssues.length
      ? { issues: relevantBrowserIssues.slice(0, 20) }
      : undefined,
  );
  addCheck(
    "mutation-accounting",
    "safety",
    recorder.network.consequentialHermesMutations === 0 ? "passed" : "failed",
    `Recorded ${recorder.network.mutations} isolated HTTP mutation request(s) and ${recorder.network.consequentialHermesMutations} consequential Hermes mutation(s).`,
    {
      isolatedMutations: recorder.network.mutations,
      consequentialHermesMutations: recorder.network.consequentialHermesMutations,
    },
  );
});
