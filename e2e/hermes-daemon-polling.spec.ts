import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

const ROOM = "polling-cabinet";
const ROOM_FILES = {
  [`${ROOM}/.cabinet`]: `schemaVersion: 1
id: ${ROOM}
name: Polling Cabinet
kind: room
entry: index.md
`,
  [`${ROOM}/index.md`]: "# Polling Cabinet\n",
  [`${ROOM}/.agents/editor/persona.md`]: `---
name: Operator
slug: editor
emoji: "⚡"
type: specialist
department: engineering
role: Polling test operator
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

Polling fixture.
`,
};

async function primeLocalAcceptance(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.wizard-done", "1");
  });
}

async function stubHermesModeHealth(page: Page) {
  await page.route("**/api/hermes/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        status: "online",
        version: "test",
        profile: "operator-os",
        gatewayState: "unavailable",
        checkedAt: new Date().toISOString(),
        message: "Isolated polling fixture.",
      }),
    })
  );
}

async function createRunningDraft(cabinet: CabinetInstance): Promise<string> {
  const response = await fetch(`${cabinet.appUrl}/api/agents/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agentSlug: "editor",
      source: "manual",
      userMessage: "Polling regression fixture",
      cabinetPath: ROOM,
      draftOnly: true,
    }),
  });
  expect(response.status).toBe(201);
  const payload = (await response.json()) as {
    conversation: { id: string };
  };
  const metaPath = path.join(
    cabinet.dataDir,
    ROOM,
    ".agents",
    ".conversations",
    payload.conversation.id,
    "meta.json"
  );
  const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as {
    status: string;
  };
  meta.status = "running";
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  return payload.conversation.id;
}

function collectBrowserFailures(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

test("Hermes conversations never request legacy daemon output across direct load, reload, or history", async ({
  page,
}) => {
  const cabinet = await bootCabinet({
    startDaemon: false,
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
    },
    files: ROOM_FILES,
  });
  try {
    const conversationId = await createRunningDraft(cabinet);
    const daemonOutputRequests: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (
        pathname ===
        `/api/daemon/session/${encodeURIComponent(conversationId)}/output`
      ) {
        daemonOutputRequests.push(request.url());
      }
    });
    const failures = collectBrowserFailures(page);
    await stubHermesModeHealth(page);
    await primeLocalAcceptance(page);

    const conversationUrl = `${cabinet.appUrl}/tasks/${conversationId}`;
    await page.goto(conversationUrl);
    await expect(
      page.getByText("Polling regression fixture", { exact: false }).first()
    ).toBeVisible();
    await page.waitForTimeout(1_200);

    await page.reload();
    await expect(
      page.getByText("Polling regression fixture", { exact: false }).first()
    ).toBeVisible();
    await page.waitForTimeout(1_200);

    await page.goto(`${cabinet.appUrl}/tasks`);
    await page.goBack();
    await expect(page).toHaveURL(conversationUrl);
    await page.goForward();
    await expect(page).toHaveURL(`${cabinet.appUrl}/tasks`);
    await page.goBack();
    await expect(page).toHaveURL(conversationUrl);
    await page.waitForTimeout(1_200);

    expect(daemonOutputRequests).toEqual([]);
    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  } finally {
    await cabinet.close();
  }
});

test("Hermes Search and Terminal attempts create no daemon-dependent requests", async ({
  page,
}) => {
  const cabinet = await bootCabinet({
    startDaemon: false,
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_PROFILE: "operator-os",
    },
    files: ROOM_FILES,
  });
  try {
    const searchRequests: string[] = [];
    const ptyRequests: string[] = [];
    const ptySockets: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/search") searchRequests.push(request.url());
      if (
        pathname === "/api/daemon/auth" ||
        pathname === "/api/daemon/pty"
      ) {
        ptyRequests.push(request.url());
      }
    });
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname === "/api/daemon/pty") {
        ptySockets.push(socket.url());
      }
    });
    const failures = collectBrowserFailures(page);
    await stubHermesModeHealth(page);
    await primeLocalAcceptance(page);
    await page.goto(`${cabinet.appUrl}/room/${ROOM}`);
    await expect(page.getByRole("heading", { name: "Polling Cabinet" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Content search unavailable" })
    ).toBeDisabled();
    await page.keyboard.press("Meta+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.type("legacy request must not run");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("hermes-terminal-unavailable")).toBeVisible();
    await page.keyboard.press("Control+`");
    await page.waitForTimeout(400);
    await expect(page.locator("[data-testid=terminal-tabs]")).toHaveCount(0);

    expect(searchRequests).toEqual([]);
    expect(ptyRequests).toEqual([]);
    expect(ptySockets).toEqual([]);
    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  } finally {
    await cabinet.close();
  }
});

test("legacy Cabinet conversations retain daemon output polling", async ({
  page,
}) => {
  const cabinet = await bootCabinet({
    env: { CABINET_RUNTIME_MODE: "cabinet" },
    files: ROOM_FILES,
  });
  try {
    const conversationId = await createRunningDraft(cabinet);
    let daemonOutputRequests = 0;
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname ===
        `/api/daemon/session/${encodeURIComponent(conversationId)}/output`
      ) {
        daemonOutputRequests += 1;
      }
    });
    await primeLocalAcceptance(page);
    await page.goto(`${cabinet.appUrl}/tasks/${conversationId}`);
    await expect(
      page.getByText("Polling regression fixture", { exact: false }).first()
    ).toBeVisible();
    await expect.poll(() => daemonOutputRequests).toBeGreaterThan(0);
  } finally {
    await cabinet.close();
  }
});
