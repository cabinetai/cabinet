import { expect, test } from "@playwright/test";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });
let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet({ env: { CABINET_RUNTIME_MODE: "hermes", CABINET_HERMES_PROFILE: "operator-os" } });
});
test.afterAll(async () => { await cabinet?.close(); });

test("management workspace projects Hermes-owned state and confirms writes", async ({ page }) => {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/hermes/management", async (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: {
      checkedAt: new Date().toISOString(), profile: "operator-os", compatibility: { version: "0.18.2", adapter: "desktop-0.18" },
      profiles: [{ name: "operator-os", isDefault: false, model: null, provider: "nous", skillCount: 1, hasEnvironment: true }],
      agentManifest: { profile: "operator-os", exists: true, content: "Operator rules" },
      skills: [{ name: "research", description: "Research", category: "work", enabled: true, provenance: "agent", usage: 4 }],
      jobs: [{ id: "job_1", name: "Daily intake", enabled: true, schedule: "daily at 9am", nextRunAt: null, lastRunAt: null, lastError: null }],
      memory: { activeProvider: "supermemory", namespace: "operator-os:supermemory", captureState: "active", recallHealth: "healthy", providers: [{ name: "supermemory", description: "", configured: true, available: true }], builtInBytes: 0 },
      mcpServers: [{ name: "files", transport: "stdio", enabled: true, auth: null, configured: true }],
      toolsets: [{ name: "executor", label: "Executor", enabled: true, configured: true, toolCount: 2 }],
      plugins: [{ name: "opencli", label: "OpenCLI", version: "1", source: "bundled", enabled: true }],
      diagnostics: [{ area: "management", status: "healthy", message: "Hermes management surfaces responded." }],
    } });
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`${cabinet.appUrl}/settings/providers`);
  const useDefault = page.getByRole("button", { name: "Use default" });
  if (await useDefault.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await useDefault.click();
    await expect(useDefault).toBeHidden();
    await page.goto(`${cabinet.appUrl}/settings/providers`);
  }
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false)) {
    await skipTour.click();
  }
  await expect(page.getByTestId("hermes-management-workspace")).toBeVisible();
  await expect(page.getByText("Profiles and agent manifests")).toBeVisible();
  await expect(page.getByText("operator-os:supermemory")).toBeVisible();
  await expect(page.getByText("Cron calendar and run controls")).toBeVisible();
  await expect(page.getByText("Capability lifecycle and evidence")).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).first().click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]?.confirmed).toBe(true);
  expect(posts[0]?.action).toBe("skill.toggle");
  expect(typeof posts[0]?.idempotencyKey).toBe("string");
  expect(String(posts[0]?.reason)).toContain("Hermes skill research");

  await page.getByPlaceholder("Hermes skill hub identifier, for example official/gifs/gif-search").fill("official/gifs/gif-search");
  await page.getByRole("button", { name: "Install from hub" }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]?.action).toBe("skill.install");
  expect(posts[1]?.payload).toEqual({ identifier: "official/gifs/gif-search" });

  await page.getByPlaceholder("Job name").fill("Daily intake");
  await page.getByPlaceholder("Schedule, for example every day at 9am").fill("every day at 9am");
  await page.getByPlaceholder("Hermes job prompt").fill("Review new business intake");
  await page.getByPlaceholder("Attached skills, comma separated").fill("research, summarize");
  await page.getByRole("button", { name: "Create Hermes job" }).click();
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2]?.action).toBe("job.create");
  expect(posts[2]?.payload).toEqual({
    name: "Daily intake",
    prompt: "Review new business intake",
    schedule: "every day at 9am",
    skills: ["research", "summarize"],
  });
});
