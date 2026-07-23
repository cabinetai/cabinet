import { expect, test, type Page } from "@playwright/test";

import {
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { claudeReply } from "../test/support/fake-agent-cli";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

const CABINET_PATH = "operator-ui";
const LONG_TOKEN = "unbroken-mobile-content-".repeat(40);

let cabinet: CabinetInstance;
let conversationId: string;

async function primeUi(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.onboarding.completed", "true");
    window.localStorage.setItem("cabinet.tour.completed", "true");
  });
}

async function finishOnboarding(page: Page) {
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (
    await useDefault
      .waitFor({ state: "visible", timeout: 5_000 })
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

async function openTasks(page: Page) {
  await primeUi(page);
  await page.goto(`${cabinet.appUrl}/room/${CABINET_PATH}/-/tasks`);
  await finishOnboarding(page);
  await page.goto(`${cabinet.appUrl}/room/${CABINET_PATH}/-/tasks`);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

function drawerTab(page: Page, name: "Data" | "Team" | "Tasks") {
  return page
    .getByRole("tab", { name: new RegExp(`^${name} drawer`) })
    .first();
}

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    fakeAgents: [{ name: "claude" }],
    files: {
      [`${CABINET_PATH}/.cabinet`]: `schemaVersion: 1
id: operator-ui
name: Operator UI
kind: room
entry: index.md
`,
      [`${CABINET_PATH}/index.md`]: "# Operator UI\n",
      [`${CABINET_PATH}/.agents/editor/persona.md`]: `---
name: Operator
slug: editor
emoji: "O"
type: specialist
department: engineering
role: UI fixture
provider: claude-code
heartbeat: ""
heartbeatEnabled: false
budget: 100
active: true
setupComplete: true
workdir: /data
workspace: /
channels: [general]
focus: []
---

Local UI fixture.
`,
    },
  });

  await cabinet.agent("claude").reset([
    claudeReply(`CABINET_UI_OK ${LONG_TOKEN}`),
  ]);
  const conversation = await startConversation(cabinet, {
    cabinetPath: CABINET_PATH,
    userMessage: `mobile wrap probe ${LONG_TOKEN}`,
  });
  conversationId = conversation.id;
  await waitForStatus(cabinet, conversationId, "completed");
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("Data and Team replace stale Tasks state for pointer, keyboard, reload, and history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTasks(page);

  const tasks = drawerTab(page, "Tasks");
  const data = drawerTab(page, "Data");
  const team = drawerTab(page, "Team");
  await expect(tasks).toHaveAttribute("aria-selected", "true");

  await data.click();
  await expect(data).toHaveAttribute("aria-selected", "true");
  await expect(tasks).toHaveAttribute("aria-selected", "false");
  await expect(page).toHaveURL(new RegExp(`/room/${CABINET_PATH}$`));

  await team.focus();
  await page.keyboard.press("Enter");
  await expect(team).toHaveAttribute("aria-selected", "true");
  await expect(data).toHaveAttribute("aria-selected", "false");
  await expect(page).toHaveURL(
    new RegExp(`/room/${CABINET_PATH}/-/agents$`)
  );

  // Repeated activation is idempotent and does not disturb selected state.
  await team.click();
  await expect(team).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(drawerTab(page, "Team")).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await page.goto(`${cabinet.appUrl}/room/${CABINET_PATH}`);
  await expect(drawerTab(page, "Data")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.goto(`${cabinet.appUrl}/room/${CABINET_PATH}/-/tasks`);
  await expect(drawerTab(page, "Tasks")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.goBack();
  await expect(drawerTab(page, "Data")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.goForward();
  await expect(drawerTab(page, "Tasks")).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("mobile sidebar sheet keeps Data, Team, and Tasks interactive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);

  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();

  const tasks = drawerTab(page, "Tasks");
  const data = drawerTab(page, "Data");
  const team = drawerTab(page, "Team");
  await expect(tasks).toBeVisible();
  await expect(tasks).toHaveAttribute("aria-selected", "true");

  await data.click();
  await expect(data).toHaveAttribute("aria-selected", "true");
  await team.click();
  await expect(team).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);
});

test("390x844 conversation remains bounded with a visible composer and scrollable transcript", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await primeUi(page);
  await page.goto(
    `${cabinet.appUrl}/room/${CABINET_PATH}/-/tasks/${conversationId}`
  );
  await finishOnboarding(page);

  const layout = page.getByTestId("conversation-layout");
  const composer = page.getByTestId("conversation-composer");
  await expect(layout).toBeVisible();
  await expect(composer).toBeVisible();
  await expect(page.getByText("CABINET_UI_OK")).toBeVisible();

  const measurements = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '[data-testid="conversation-layout"]'
    )!;
    const transcriptNode = document.querySelector<HTMLElement>(
      '[data-testid="conversation-transcript"]'
    )!;
    const composerNode = document.querySelector<HTMLElement>(
      '[data-testid="conversation-composer"]'
    )!;
    const rootRect = root.getBoundingClientRect();
    const composerRect = composerNode.getBoundingClientRect();
    const transcriptStyle = getComputedStyle(transcriptNode);
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
      composerTop: composerRect.top,
      composerBottom: composerRect.bottom,
      viewportHeight: window.innerHeight,
      visualScale: window.visualViewport?.scale ?? 1,
      transcriptOverflowY: transcriptStyle.overflowY,
      transcriptScrollHeight: transcriptNode.scrollHeight,
      transcriptClientHeight: transcriptNode.clientHeight,
      turnWidths: Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="turn"]')
      ).map((turn) => ({
        scroll: turn.scrollWidth,
        client: turn.clientWidth,
      })),
    };
  });

  expect(measurements.documentWidth).toBeLessThanOrEqual(
    measurements.viewportWidth
  );
  expect(measurements.rootLeft).toBeGreaterThanOrEqual(0);
  expect(measurements.rootRight).toBeLessThanOrEqual(390);
  expect(measurements.composerTop).toBeGreaterThanOrEqual(0);
  expect(measurements.composerBottom).toBeLessThanOrEqual(
    measurements.viewportHeight
  );
  expect(measurements.visualScale).toBe(1);
  expect(measurements.transcriptOverflowY).toBe("auto");
  expect(measurements.transcriptScrollHeight).toBeGreaterThan(
    measurements.transcriptClientHeight
  );
  for (const turn of measurements.turnWidths) {
    expect(turn.scroll).toBeLessThanOrEqual(turn.client);
  }
  expect(consoleErrors).toEqual([]);
});

test("desktop conversation remains viewport-bounded at 1440x900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await primeUi(page);
  await page.goto(
    `${cabinet.appUrl}/room/${CABINET_PATH}/-/tasks/${conversationId}`
  );

  const layout = page.getByTestId("conversation-layout");
  const composer = page.getByTestId("conversation-composer");
  await expect(layout).toBeVisible();
  await expect(composer).toBeVisible();
  const box = await layout.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440);
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
});
