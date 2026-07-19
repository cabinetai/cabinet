import { expect, test } from "@playwright/test";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;

const coverage = Object.fromEntries(
  ["gmail", "calendar", "hermesJobs", "manualRisks", "supermemory"].map((name) => [
    name,
    { status: "connected", message: `${name} read-only evidence connected.`, evidenceCount: 1 },
  ])
);

const card = {
  id: "decision-1",
  kind: "needs_jeremy",
  title: "Review a time-sensitive account notice",
  summary: "Hermes found a notice that needs operator judgment.",
  whyItMatters: "Only Jeremy can decide the business response.",
  recommendedNextStep: "Investigate the evidence before responding.",
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
  runs: [],
  telemetry: { cockpitViews: 1, actionsStarted: 0, actionsCompleted: 0, sourceSystemsCovered: 5, estimatedToolSwitchesAvoided: 4, lastIntakeAt: "2026-07-18T20:00:00.000Z" },
};

test.beforeAll(async () => {
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});

test.afterAll(async () => { await cabinet?.close(); });

test("daily intake renders decision cards and keeps governed action results in context", async ({ page }) => {
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

  await page.goto(`${cabinet.appUrl}/cockpit`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await page.goto(`${cabinet.appUrl}/cockpit`);
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) await skipTour.click();

  const root = page.getByTestId("daily-business-cockpit");
  await expect(root).toBeVisible();
  await expect(page).toHaveURL(/\/cockpit$/);
  await expect(root.getByText("operator-os:supermemory")).toBeVisible();
  await expect(root.getByRole("heading", { name: "Needs Jeremy" })).toBeVisible();
  await expect(root.getByText("Review a time-sensitive account notice")).toBeVisible();
  await expect(root.getByText("gmail read-only evidence connected.")).toBeVisible();

  await root.getByRole("button", { name: "Track risk" }).click();
  await expect(root.getByRole("heading", { name: "Track a manual business risk" })).toBeVisible();
  await root.getByRole("button", { name: "Cancel" }).click();
  await expect(root.getByRole("heading", { name: "Track a manual business risk" })).toBeHidden();

  await root.getByRole("button", { name: "Investigate" }).click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({ action: "investigate", cardId: "decision-1", actor: "Jeremy", confirmed: false });
  expect(typeof actions[0]?.idempotencyKey).toBe("string");
  await expect(root.getByTestId("cockpit-action-result")).toContainText("Read-only evidence review completed.");
});
