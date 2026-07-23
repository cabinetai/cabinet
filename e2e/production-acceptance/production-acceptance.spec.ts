import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { buildHermesAcceptanceFixtureProjection } from "../../src/lib/hermes/control-center-acceptance-fixture";
import { buildHermesSkillsAcceptanceSnapshot } from "../../src/lib/hermes/skills-management-fixture";
import type { AcceptanceStatus, RouteChecklistEntry } from "./contracts";
import { bootIsolatedCabinet, type IsolatedCabinet } from "./isolated-cabinet";
import { AcceptanceRecorder, markRoute, writeAcceptanceArtifacts } from "./recorder";
import { discoverRouteManifest } from "./route-discovery";
import { FOLLOW_UP_PROMPT, INITIAL_PROMPT, TRANSPORT_TOKEN, selectTransport } from "./transport";

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const repoRoot = process.cwd();
const outputDir = path.resolve(
  process.env.CABINET_ACCEPTANCE_OUTPUT_DIR ??
    "docs/research/parallel/acceptance-harness"
);
const screenshotDir = path.join(outputDir, "screenshots");
const recorder = new AcceptanceRecorder();
const transport = selectTransport();
const projection = buildHermesAcceptanceFixtureProjection({
  implementationRevision: execFileSync("git", ["rev-parse", "origin/main"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim(),
  artifactGeneratedAt: "2026-07-23T00:00:00.000Z",
});
let cabinet: IsolatedCabinet;
let routes: RouteChecklistEntry[] = [];

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
  blocker?: { id: string; reproduction: string[]; ownerHint?: string }
): Promise<T | null> {
  try {
    const value = await operation();
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
  }
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
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(cabinet.appUrl).origin) {
      recorder.requestFailed(
        request.method(),
        url.pathname,
        request.failure()?.errorText ?? "request failed"
      );
    }
  });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      recorder.scanText.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => recorder.scanText.push(`pageerror: ${error.message}`));

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
  await page.route("**/api/hermes/skills-management**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: buildHermesSkillsAcceptanceSnapshot() });
    }
    return route.fulfill({
      status: 405,
      json: { error: "Acceptance harness forbids governed Skill mutations." },
    });
  });
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
  const base = execFileSync("git", ["rev-parse", "origin/main"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const changed = execFileSync("git", ["diff", "--name-only", "origin/main"], {
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
      !file.startsWith("docs/research/parallel/acceptance-harness/")
  );
  if (applicationDiff.length) {
    recorder.blocker({
      id: "application-diff-outside-owned-lane",
      area: "safety",
      summary: "Application or shared files differ from origin/main.",
      reproduction: ["Run git diff --name-only origin/main.", "Inspect paths outside the acceptance lane."],
      ownerHint: "integration coordinator",
    });
  }
  await writeAcceptanceArtifacts(outputDir, {
    stream: "acceptance-harness",
    branch,
    testedBaseRevision: base,
    applicationDiffFromBase: applicationDiff,
    environment: {
      url: "http://127.0.0.1:4207",
      appPort: 4207,
      runtimeMode: "hermes",
      data: "isolated",
      productionTouched: false,
      liveModelMessagesSent: 0,
      transport: transport.id,
      browserPath: process.env.CABINET_ACCEPTANCE_BROWSER_PATH ?? "Playwright runner",
    },
    routes,
    visibleNavigation: recorder.navigation,
    checks: recorder.checks,
    blockers: recorder.blockers,
    network: recorder.network,
    screenshots: recorder.screenshots,
    productionTouched: false,
  }, recorder.scanText.join("\n"));
  await cabinet?.close();
});

test("authoritative isolated production acceptance", async ({ page }) => {
  await installPageObservation(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await observed(
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
    "org-chart",
    "organization",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet/-/agents`);
      const trigger = page.getByRole("button", { name: "Org chart" });
      await trigger.click({ timeout: 10_000 });
      const dialog = page.getByRole("dialog", { name: /Acceptance Cabinet.*org chart/i });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
      await page.keyboard.press("Escape");
      markRoute(routes, "/room/acceptance-cabinet/-/agents", "passed");
      return { bounded: true };
    },
    () => "Org chart opened, stayed viewport-bounded, and closed by keyboard.",
    (error) => `Org chart failed: ${String(error)}`
  );

  await observed(
    "operator-mode",
    "Hermes",
    async () => {
      await page.goto(`${cabinet.appUrl}/hermes?skillsFixture=acceptance`);
      await expect(page.getByTestId("hermes-control-center")).toBeVisible();
      await expect(page.getByRole("tab", { name: "Operator" })).toHaveAttribute("data-state", "active");
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
    "developer-diagnostics-48",
    "Developer",
    async () => {
      await page.getByRole("tab", { name: "Developer" }).click({ timeout: 10_000 });
      const rows = page
        .getByTestId("hermes-capability-list")
        .locator('button[data-testid^="hermes-capability-"]');
      await expect(rows).toHaveCount(48);
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

  const conversation = await transport.runTwoTurnContract();
  addCheck(
    "fixture-two-turn-contract",
    "conversation",
    conversation.firstResponse === TRANSPORT_TOKEN &&
      conversation.secondResponse === TRANSPORT_TOKEN &&
      conversation.sameSession
      ? "passed"
      : "failed",
    `Fixture transport exercised exact prompts without a model: "${INITIAL_PROMPT}" then "${FOLLOW_UP_PROMPT}".`,
    { sameSession: conversation.sameSession, token: TRANSPORT_TOKEN }
  );
  addCheck(
    "live-two-turn-contract",
    "conversation",
    "blocked",
    "No transport passed the mandatory live gate; zero live model messages were sent."
  );
  recorder.blocker({
    id: "no-live-transport-passed-mandatory-gate",
    area: "conversation",
    summary: "The exact live two-turn conversation, same-session resume, and live persistence are blocked.",
    reproduction: [
      "Select a transport only after it passes the mandatory live gate.",
      "Run the exact initial prompt and follow-up serially.",
      "Verify the same live session after reload, direct URL, and Cabinet restart.",
    ],
    ownerHint: "transport integration coordinator",
  });

  await observed(
    "restart-route-persistence",
    "restart",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
      await expect(page.getByText("Acceptance Cabinet", { exact: true }).first()).toBeVisible();
      await cabinet.restart();
      await page.reload();
      await expect(page.getByText("Acceptance Cabinet", { exact: true }).first()).toBeVisible();
      return { cabinetRestart: true, routePersisted: true };
    },
    () => "Isolated Cabinet restarted on port 4207 and the room route persisted.",
    (error) => `Cabinet restart persistence failed: ${String(error)}`,
    {
      id: "cabinet-restart-persistence",
      reproduction: ["Open the room.", "Restart isolated Cabinet.", "Reload the same URL."],
      ownerHint: "supervision stabilization stream",
    }
  );
  addCheck(
    "launchd-child-restart",
    "supervision",
    "blocked",
    "Production launchd child recovery is outside the isolated harness and remains a known blocker."
  );
  recorder.blocker({
    id: "launchd-child-restart-not-proven",
    area: "supervision",
    summary: "The supervised wrapper is not proven to recover after the Next child exits.",
    reproduction: [
      "Run the production-only supervision acceptance after the supervision fix.",
      "Terminate only the Next child.",
      "Verify the wrapper starts a healthy replacement automatically.",
    ],
    ownerHint: "supervision stabilization stream",
  });

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
    (error) => `Back/forward navigation failed: ${String(error)}`
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await observed(
    "mobile-reduced-motion-overflow",
    "responsive",
    async () => {
      await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
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

  addCheck(
    "console-health",
    "browser",
    recorder.scanText.some((entry) => entry.startsWith("error:") || entry.startsWith("pageerror:"))
      ? "failed"
      : "passed",
    recorder.scanText.some((entry) => entry.startsWith("error:") || entry.startsWith("pageerror:"))
      ? "Relevant browser errors were observed."
      : "No relevant browser errors were observed."
  );
  addCheck(
    "mutation-accounting",
    "safety",
    "passed",
    `Recorded ${recorder.network.mutations} isolated HTTP mutation request(s); no production or governed Skill mutation was authorized.`,
    { isolatedMutations: recorder.network.mutations }
  );
});
