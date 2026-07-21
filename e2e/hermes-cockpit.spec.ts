import { expect, test } from "@playwright/test";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;

const coverage = {
  gmail: { status: "error", message: "Live Gmail check failed with invalid_grant.", evidenceCount: 0 },
  calendar: { status: "error", message: "Live Calendar check failed with invalid_grant.", evidenceCount: 0 },
  hermesJobs: { status: "connected_empty", message: "No Hermes jobs found.", evidenceCount: 0 },
  manualRisks: { status: "connected", message: "One manual risk inspected.", evidenceCount: 1 },
  supermemory: { status: "connected", message: "Supermemory is healthy.", evidenceCount: 1 },
};

const card = {
  id: "decision-1",
  kind: "needs_jeremy",
  title: "Review a time-sensitive account notice",
  summary: "Hermes found a notice that needs operator judgment.",
  whyItMatters: "Only Jeremy can decide the business response.",
  recommendedNextStep: "Investigate the evidence before responding.",
  recommendedAction: "investigate",
  urgency: "high",
  sourceType: "gmail",
  sourceId: "gmail:notice-1",
  evidence: [{ source: "gmail", label: "Message metadata", reference: "gmail:notice-1", occurredAt: "2026-07-18T18:00:00.000Z" }],
  approval: { state: "not_required", runId: null, requestId: null },
  createdAt: "2026-07-18T18:00:00.000Z",
  snoozedUntil: null,
  comments: [],
};

const cockpit = {
  schemaVersion: 1,
  generatedAt: "2026-07-18T20:00:00.000Z",
  shadowMode: true,
  profile: "operator-os",
  health: { enabled: true, status: "online", version: "0.18.2", profile: "operator-os", gatewayState: "running", checkedAt: "2026-07-18T20:00:00.000Z", message: "Hermes is online." },
  memory: { namespace: "operator-os:supermemory", provider: "supermemory", captureState: "active", recallHealth: "healthy" },
  sourceCoverage: coverage,
  cards: [card],
  potentiallyMissed: [{ id: "miss-1", title: "Inventory alert needs context", sourceType: "gmail", sourceId: "gmail:inventory-1", whyPotentiallyMissed: "STALE-EVIDENCE WARNING: The affected inventory may no longer be active.", reviewQuestion: "Is the inventory still active?", evidence: [], createdAt: "2026-07-18T18:00:00.000Z" }],
  ownerReview: { classifications: { "decision-1": { classification: "correct", note: "Verified", actor: "Jeremy", reviewedAt: "2026-07-18T20:00:00.000Z" } }, potentialMisses: [], friction: [] },
  runs: [],
  history: [],
  momentumPlan: {
    localDate: "2026-07-19",
    intakeRunId: "run_intake_1",
    acceptedAt: "2026-07-19T08:00:00.000Z",
    loops: [{ id: "decide:decision-1", cardId: "decision-1", sourceId: "gmail:notice-1", title: card.title, category: "decide", status: "open", completedAt: null, completionActionId: null }],
    proposal: null,
  },
  telemetry: { cockpitViews: 1, actionsStarted: 0, actionsCompleted: 0, sourceSystemsCovered: 5, estimatedToolSwitchesAvoided: 4, lastIntakeAt: "2026-07-18T20:00:00.000Z" },
};

test.beforeAll(async () => {
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});

test.afterAll(async () => { await cabinet?.close(); });

async function enterCockpit(page: import("@playwright/test").Page) {
  await page.route("**/api/hermes/health", async (route) => route.fulfill({ json: cockpit.health }));
  await page.goto(`${cabinet.appUrl}/cockpit`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await page.goto(`${cabinet.appUrl}/cockpit`);
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) await skipTour.click();
}

test("Today orients the owner and keeps governed action results in the inspector", async ({ page }) => {
  const consoleIssues: string[] = [];
  const responseIssues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) responseIssues.push(`${response.status()} ${response.url()}`);
  });
  const actions: Record<string, unknown>[] = [];
  let actionStarted = false;
  await page.route("**/api/hermes/cockpit", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: actionStarted ? {
      ...cockpit,
      runs: [{ runId: "run_cockpit_1", context: "cockpit:card:decision-1:investigate", capability: "cockpit.investigate", status: "completed", startedAt: cockpit.generatedAt, updatedAt: cockpit.generatedAt, result: "Read-only evidence review completed.", error: null, pendingDecision: null }],
      telemetry: { ...cockpit.telemetry, actionsStarted: 1, actionsCompleted: 1 },
    } : cockpit });
  });
  await page.route("**/api/hermes/cockpit/actions", async (route) => {
    actions.push(route.request().postDataJSON() as Record<string, unknown>);
    actionStarted = true;
    await route.fulfill({ json: { ok: true, runId: "run_cockpit_1" } });
  });

  await enterCockpit(page);

  const root = page.getByTestId("daily-business-cockpit");
  await expect(root).toBeVisible();
  await expect(page).toHaveURL(/\/cockpit$/);
  await expect(root.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(root.getByText("Daily Momentum")).toBeVisible();
  await expect(root.getByText("Next Best Move")).toBeVisible();
  await expect(root.getByText("Review a time-sensitive account notice")).toBeVisible();
  await expect(root.getByText("2 system exceptions")).toBeVisible();
  await expect(root.getByRole("button", { name: "Reauthenticate" })).toBeVisible();
  await expect(root.getByText("0 may deserve promotion")).toBeVisible();
  await expect(root.getByTestId("cockpit-systems-strip")).toContainText("Jobs empty");

  await root.getByRole("button", { name: "Radar", exact: true }).click();
  await expect(root.getByTestId("cockpit-radar-view")).toContainText("Inventory alert needs context");
  await root.getByRole("button", { name: "Today", exact: true }).click();

  await root.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Risks" }).click();
  await root.getByRole("button", { name: "Track risk" }).click();
  await expect(root.getByRole("heading", { name: "Track a manual business risk" })).toBeVisible();
  await root.getByRole("button", { name: "Cancel" }).click();
  await expect(root.getByRole("heading", { name: "Track a manual business risk" })).toBeHidden();
  await root.getByRole("button", { name: "Today", exact: true }).click();

  await root.getByTestId("cockpit-next-best-move").getByRole("button", { name: "Investigate" }).click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({ action: "investigate", cardId: "decision-1", actor: "Jeremy", confirmed: false });
  expect(typeof actions[0]?.idempotencyKey).toBe("string");
  await expect(page.getByTestId("cockpit-inspector")).toBeVisible();
  await expect(page.getByTestId("cockpit-action-result")).toContainText("Read-only evidence review completed.");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cockpit-inspector")).toBeHidden();
  expect({ consoleIssues, responseIssues }).toEqual({ consoleIssues: [], responseIssues: [] });
});

test("meaningful completion contracts the queue and advances Momentum", async ({ page }) => {
  const queuedCard = {
    ...card,
    id: "decision-2",
    title: "Confirm missing business facts",
    sourceId: "gmail:notice-2",
    missingFacts: ["Current balance"],
  };
  const initialCockpit = { ...cockpit, cards: [card, queuedCard] };
  const completionActionId = "history-1";
  const initialMomentumPlan = {
    ...cockpit.momentumPlan,
    loops: [
      cockpit.momentumPlan.loops[0],
      { id: "verify:decision-2", cardId: queuedCard.id, sourceId: queuedCard.sourceId, title: queuedCard.title, category: "verify", status: "open", completedAt: null, completionActionId: null },
    ],
  };
  const completedCockpit = {
    ...initialCockpit,
    cards: [card],
    momentumPlan: {
      ...initialMomentumPlan,
      loops: [
        initialMomentumPlan.loops[0],
        { ...initialMomentumPlan.loops[1], status: "completed", completedAt: new Date().toISOString(), completionActionId },
      ],
    },
    history: [{
      id: completionActionId,
      action: "investigate",
      cardId: queuedCard.id,
      actor: "Jeremy",
      at: new Date().toISOString(),
      outcome: "completed",
      detail: "Verified evidence and confirmed the missing facts.",
      momentumCategory: "verify",
      meaningfulLoopClosed: true,
    }],
  };
  let completed = false;
  await page.route("**/api/hermes/cockpit", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: completed ? completedCockpit : { ...initialCockpit, momentumPlan: initialMomentumPlan } });
  });
  await page.route("**/api/hermes/cockpit/actions", async (route) => {
    completed = true;
    await route.fulfill({ json: { ok: true, runId: "run_cockpit_2" } });
  });

  await enterCockpit(page);
  const root = page.getByTestId("daily-business-cockpit");
  const row = root.getByTestId("cockpit-queue-row-decision-2");
  await row.getByRole("button", { name: "Investigate" }).click();
  await expect(row).toHaveClass(/cockpit-queue-exit/);
  await expect(row).toBeHidden();
  await expect(root.getByRole("status")).toContainText("Confirm missing business facts cleared.");
  await expect(root.getByText("1 of 2 clear")).toBeVisible();
});

test("390px Today has no horizontal overflow and uses a full-height detail sheet", async ({ page }) => {
  const consoleIssues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleIssues.push(`${message.type()}: ${message.text()}`);
  });
  await page.route("**/api/hermes/cockpit", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: cockpit });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterCockpit(page);

  const root = page.getByTestId("daily-business-cockpit");
  await expect(root.getByRole("navigation", { name: "Cockpit mobile" })).toBeVisible();
  const firstViewItems = root.locator(".cockpit-first-view > *");
  expect(await firstViewItems.count()).toBeGreaterThan(0);
  expect(await firstViewItems.first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await root.getByRole("button", { name: "Open details" }).click();
  const inspector = page.getByTestId("cockpit-inspector");
  await expect(inspector).toBeVisible();
  const box = await inspector.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(280);
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box?.height).toBe(844);
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  expect(consoleIssues).toEqual([]);
});
