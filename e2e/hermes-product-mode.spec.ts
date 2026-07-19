import { expect, test } from "@playwright/test";

import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;

async function acceptDataDirectory(page: import("@playwright/test").Page) {
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await expect(useDefault).toBeHidden();
  }
}

async function skipTour(page: import("@playwright/test").Page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) {
    await skip.click();
  }
}

test.beforeAll(async () => {
  cabinet = await bootCabinet({
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
    },
    files: {
      "test-cabinet/.cabinet": `schemaVersion: 1
id: test-cabinet
name: Test Cabinet
kind: room
entry: index.md
`,
      "test-cabinet/index.md": "# Test Cabinet\n",
      "test-cabinet/.agents/editor/persona.md": `---
name: Editor
slug: editor
emoji: "📝"
type: specialist
department: general
role: KB content editing
provider: claude-code
heartbeat: ""
heartbeatEnabled: false
budget: 100
active: true
workdir: /data
workspace: /
channels: [general]
focus: []
---

Fixture Operator.
`,
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("Hermes mode exposes one Operator product instead of legacy runtimes", async ({ page }) => {
  await page.goto(`${cabinet.appUrl}/room/test-cabinet/-/agents`);
  await skipTour(page);
  await acceptDataDirectory(page);
  await page.goto(`${cabinet.appUrl}/room/test-cabinet/-/agents`);
  await skipTour(page);

  await expect(page.getByText("Operator", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Routines", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Heartbeats", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Schedule", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Channels", { exact: true })).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "New Agent" }).click();
  await expect(
    page.getByText(/Every role uses the same operator-os Hermes profile/i)
  ).toBeVisible();
  await expect(page.getByText("Provider", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Runtime", { exact: true })).toHaveCount(0);
});

test("Advanced Hermes replaces provider and skill settings", async ({ page }) => {
  await page.goto(`${cabinet.appUrl}/settings/providers`);
  await acceptDataDirectory(page);
  await page.goto(`${cabinet.appUrl}/settings/providers`);

  await expect(page.getByRole("heading", { name: "Advanced Hermes" })).toBeVisible();
  await expect(page.getByText("Hermes source-of-truth boundary")).toBeVisible();
  await expect(page.getByText("Default runtime", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Skills" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Integrations" })).toHaveCount(0);

  await page.goto(`${cabinet.appUrl}/settings/skills`);
  await expect(page.getByRole("heading", { name: "Advanced Hermes" })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/providers$/);
});
