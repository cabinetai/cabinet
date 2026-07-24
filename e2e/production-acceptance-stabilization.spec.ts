import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
const evidenceDir = "/tmp/cabinet-pr14-production-acceptance-evidence";

async function primeLocalAcceptance(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
  });
}

async function finishLocalOnboarding(page: Page) {
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await expect(useDefault).toBeHidden();
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) {
    await skipTour.click();
    await expect(skipTour).toBeHidden();
  }
}

async function openCabinet(page: Page) {
  await primeLocalAcceptance(page);
  await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
  await finishLocalOnboarding(page);
  await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet`);
  await expect(page.getByRole("heading", { name: "Acceptance Cabinet" })).toBeVisible();
}

test.beforeAll(async () => {
  mkdirSync(evidenceDir, { recursive: true });
  cabinet = await bootCabinet({
    startDaemon: false,
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
    },
    files: {
      "acceptance-cabinet/.cabinet": `schemaVersion: 1
id: acceptance-cabinet
name: Acceptance Cabinet
kind: room
entry: index.md
`,
      "acceptance-cabinet/index.md": "# Acceptance Cabinet\n",
      "acceptance-cabinet/.agents/editor/persona.md": `---
name: Operator
slug: editor
emoji: "⚡"
type: specialist
department: engineering
role: Local acceptance operator
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

Local acceptance fixture.
`,
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("direct Tasks, reload, and deep link use the production provider contract", async ({ page }) => {
  await primeLocalAcceptance(page);
  await page.goto(`${cabinet.appUrl}/tasks`);
  await finishLocalOnboarding(page);
  await page.goto(`${cabinet.appUrl}/tasks`);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  await page.goto(`${cabinet.appUrl}/room/acceptance-cabinet/-/tasks`);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("useTaskRail must be used within");
});

test("mount and reload never pull Git without an explicit Sync action", async ({ page }) => {
  const pullRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/git/pull"
    ) {
      pullRequests.push(request.url());
    }
  });

  await openCabinet(page);
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Acceptance Cabinet" })).toBeVisible();
  await page.waitForTimeout(250);

  expect(pullRequests).toEqual([]);
});

test("Search is precisely unavailable and New opens one keyboard-usable composer", async ({ page }) => {
  const searchRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/search") searchRequests.push(request.url());
  });

  await openCabinet(page);
  await expect(page.getByRole("button", { name: "Content search unavailable" })).toBeDisabled();
  await expect(page.getByText("Terminal unavailable", { exact: true })).toBeVisible();

  await page.keyboard.press("Meta+1");
  const newConversation = page.getByRole("button", { name: "New conversation" });
  await expect(newConversation).toBeVisible();
  await newConversation.focus();
  await page.keyboard.press("Enter");
  const composer = page.getByRole("dialog", { name: "What needs to get done?" });
  await expect(composer).toBeVisible();
  await page.keyboard.press("Meta+Alt+R");
  await expect(page.getByRole("dialog", { name: "What needs to get done?" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(composer).toBeHidden();
  expect(searchRequests).toEqual([]);
});

test("org chart is viewport-bounded, keyboard-closeable, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCabinet(page);
  const trigger = page.getByRole("button", { name: "Org chart" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Acceptance Cabinet: org chart" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("390x844 reduced-motion org chart does not overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openCabinet(page);
  const collapseSidebar = page.getByRole("button", { name: "Collapse sidebar" });
  if (await collapseSidebar.isVisible()) await collapseSidebar.click();
  const trigger = page.getByRole("button", { name: "Org chart" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Acceptance Cabinet: org chart" });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: path.join(evidenceDir, "org-chart-mobile-390x844.png") });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
