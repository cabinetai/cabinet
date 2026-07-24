import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

import {
  ASSISTANT_MESSAGE_CONTENT_SELECTOR,
  ASSISTANT_TURN_SELECTOR,
  TURN_TEST_IDS,
} from "../src/lib/agents/assistant-message-contract";
import {
  parseTurnFilename,
  serializeTurn,
} from "../src/lib/agents/conversation-turns";
import type { ConversationTurn } from "../src/types/conversations";
import {
  bootIsolatedCabinet,
  type IsolatedCabinet,
} from "./production-acceptance/isolated-cabinet";

const CONVERSATION_ID = "conversation-reload-fixture";
const CONVERSATION_ROUTE = `/agents/conversations/${CONVERSATION_ID}`;
const CABINET_ROUTE = "/room/acceptance-cabinet";
const FIRST_USER = "Fixture user turn one.";
const FIRST_ASSISTANT = "Fixture assistant turn one.";
const SECOND_USER = "Fixture user turn two.";
const SECOND_ASSISTANT = "Fixture assistant turn two.";
const USER_TURN_SELECTOR =
  `[data-testid="${TURN_TEST_IDS.turn}"][data-turn-role="user"]`;
const USER_CONTENT_SELECTOR =
  `${USER_TURN_SELECTOR} > [data-testid="${TURN_TEST_IDS.userContent}"]`;
const ASSISTANT_CONTENT_SELECTOR =
  `${ASSISTANT_TURN_SELECTOR} > ${ASSISTANT_MESSAGE_CONTENT_SELECTOR}`;

test.describe.configure({ mode: "serial" });

let cabinet: IsolatedCabinet;

async function primeReturningUser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("cabinet.dataDirConfirmed", "1");
    window.localStorage.setItem("cabinet.wizard-done", "1");
    window.localStorage.setItem("cabinet.tour-done", "1");
  });
}

async function installPersistedConversationFixture(dataDir: string): Promise<void> {
  const conversationDir = path.join(
    dataDir,
    ".agents",
    ".conversations",
    CONVERSATION_ID,
  );
  const turnsDir = path.join(conversationDir, "turns");
  await fs.mkdir(turnsDir, { recursive: true });

  const meta = {
    id: CONVERSATION_ID,
    agentSlug: "editor",
    title: "Conversation reload fixture",
    trigger: "manual",
    status: "completed",
    startedAt: "2026-07-23T00:00:00.000Z",
    completedAt: "2026-07-23T00:00:04.000Z",
    lastActivityAt: "2026-07-23T00:00:04.000Z",
    providerId: "hermes",
    adapterType: "hermes_runtime",
    promptPath: `.agents/.conversations/${CONVERSATION_ID}/prompt.md`,
    transcriptPath: `.agents/.conversations/${CONVERSATION_ID}/transcript.txt`,
    mentionedPaths: [],
    artifactPaths: [],
    turnCount: 2,
  };
  const userTurn: ConversationTurn = {
    id: "fixture-user-2",
    requestId: "fixture-request-2",
    turn: 2,
    role: "user",
    ts: "2026-07-23T00:00:03.000Z",
    content: SECOND_USER,
  };
  const assistantTurn: ConversationTurn = {
    id: "fixture-assistant-2",
    requestId: "fixture-request-2",
    turn: 2,
    role: "agent",
    ts: "2026-07-23T00:00:04.000Z",
    content: SECOND_ASSISTANT,
    sessionId: "stable-native-session",
    exitCode: 0,
    completedAt: "2026-07-23T00:00:04.000Z",
  };

  await Promise.all([
    fs.writeFile(path.join(conversationDir, "meta.json"), JSON.stringify(meta, null, 2)),
    fs.writeFile(path.join(conversationDir, "prompt.md"), `User request:\n${FIRST_USER}`),
    fs.writeFile(path.join(conversationDir, "transcript.txt"), FIRST_ASSISTANT),
    fs.writeFile(path.join(conversationDir, "mentions.json"), "[]"),
    fs.writeFile(path.join(conversationDir, "artifacts.json"), "[]"),
    fs.writeFile(path.join(turnsDir, "002-user.md"), serializeTurn(userTurn)),
    fs.writeFile(path.join(turnsDir, "002-agent.md"), serializeTurn(assistantTurn)),
    fs.writeFile(
      path.join(conversationDir, "session.json"),
      JSON.stringify(
        {
          kind: "hermes_runtime",
          resumeId: "stable-native-session",
          alive: false,
          lastUsedAt: "2026-07-23T00:00:04.000Z",
        },
        null,
        2,
      ),
    ),
  ]);
}

async function readDurableStoreCounts(dataDir: string): Promise<{
  user: number;
  assistant: number;
}> {
  const conversationDir = path.join(
    dataDir,
    ".agents",
    ".conversations",
    CONVERSATION_ID,
  );
  const names = await fs.readdir(path.join(conversationDir, "turns"));
  const persistedRoles = names
    .map(parseTurnFilename)
    .filter((turn): turn is NonNullable<typeof turn> => turn !== null);
  return {
    // Turn one is canonically stored in prompt.md and transcript.txt.
    user: 1 + persistedRoles.filter((turn) => turn.role === "user").length,
    assistant: 1 + persistedRoles.filter((turn) => turn.role === "agent").length,
  };
}

async function assertExactTranscript(page: Page): Promise<{
  clientUserTurns: number;
  clientAssistantTurns: number;
  renderedUserMessages: number;
  renderedAssistantMessages: number;
  semanticAssistantContent: number;
}> {
  const userTurns = page.locator(USER_TURN_SELECTOR);
  const assistantTurns = page.locator(ASSISTANT_TURN_SELECTOR);
  const userContent = page.locator(USER_CONTENT_SELECTOR);
  const assistantContent = page.locator(ASSISTANT_CONTENT_SELECTOR);

  await expect(userTurns).toHaveCount(2);
  await expect(assistantTurns).toHaveCount(2);
  await expect(userContent).toHaveCount(2);
  await expect(assistantContent).toHaveCount(2);
  expect(await userContent.allInnerTexts()).toEqual([FIRST_USER, SECOND_USER]);
  expect(await assistantContent.allInnerTexts()).toEqual([
    FIRST_ASSISTANT,
    SECOND_ASSISTANT,
  ]);
  for (const content of await assistantContent.allInnerTexts()) {
    expect(content.trim().length).toBeGreaterThan(0);
  }
  for (let index = 0; index < 2; index += 1) {
    const turn = assistantTurns.nth(index);
    await expect(turn.getByTestId(TURN_TEST_IDS.roleLabel)).toHaveCount(1);
    await expect(turn.getByTestId(TURN_TEST_IDS.timestamp)).toHaveCount(1);
    await expect(turn.getByTestId(TURN_TEST_IDS.lifecycleStatus)).toHaveText(
      "completed",
    );
    await expect(turn.getByTestId(TURN_TEST_IDS.failureDetails)).toHaveCount(0);
  }

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    body: document.body.scrollWidth > document.body.clientWidth,
  }));
  expect(overflow).toEqual({ document: false, body: false });
  await expect(
    page.locator("[data-nextjs-dialog-overlay], [data-next-badge-root], nextjs-portal"),
  ).toHaveCount(0);

  return {
    clientUserTurns: await userTurns.count(),
    clientAssistantTurns: await assistantTurns.count(),
    renderedUserMessages: await userContent.count(),
    renderedAssistantMessages: await assistantContent.count(),
    semanticAssistantContent: await assistantContent.count(),
  };
}

function observeNoModelRequests(page: Page): {
  normalErrors: string[];
  modelRequests: string[];
  setRestarting(value: boolean): void;
} {
  const normalErrors: string[] = [];
  const modelRequests: string[] = [];
  let restarting = false;
  page.on("console", (message) => {
    if (message.type() === "error" && !restarting) normalErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (!restarting) normalErrors.push(error.message);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      (/\/api\/agents\/conversations\/?$/.test(url.pathname) ||
        /\/api\/agents\/conversations\/[^/]+\/continue$/.test(url.pathname))
    ) {
      modelRequests.push(`${request.method()} ${url.pathname}`);
    }
  });
  return {
    normalErrors,
    modelRequests,
    setRestarting(value: boolean) {
      restarting = value;
    },
  };
}

test.beforeAll(async () => {
  cabinet = await bootIsolatedCabinet(process.cwd());
  await installPersistedConversationFixture(cabinet.dataDir);
});

test.afterAll(async () => {
  await cabinet?.close();
});

test("direct load, reload, history, and Cabinet restart preserve exact 2/2 rendering", async ({
  page,
}) => {
  await primeReturningUser(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const observed = observeNoModelRequests(page);

  const detailResponse = await page.request.get(
    `${cabinet.appUrl}/api/agents/conversations/${CONVERSATION_ID}?withTurns=1`,
  );
  expect(detailResponse.ok()).toBe(true);
  const detail = (await detailResponse.json()) as {
    turns?: Array<{ role?: string; pending?: boolean; error?: string; exitCode?: number }>;
  };
  const durableStoreCounts = await readDurableStoreCounts(cabinet.dataDir);
  expect(durableStoreCounts).toEqual({ user: 2, assistant: 2 });
  const detailApiUserTurns =
    detail.turns?.filter((turn) => turn.role === "user").length ?? 0;
  const detailApiAssistantTurns =
    detail.turns?.filter((turn) => turn.role === "agent").length ?? 0;
  expect({ detailApiUserTurns, detailApiAssistantTurns }).toEqual({
    detailApiUserTurns: 2,
    detailApiAssistantTurns: 2,
  });

  const observabilityResponse = await page.request.get(
    `${cabinet.appUrl}/api/agents/conversations/${CONVERSATION_ID}/acceptance-observability`,
  );
  expect(observabilityResponse.ok()).toBe(true);
  const observability = (await observabilityResponse.json()) as {
    durableStoreCounts: { user: number; assistant: number; completedAssistant: number };
    pendingRequiredWrites: number;
  };
  expect(observability.durableStoreCounts).toMatchObject({
    user: 2,
    assistant: 2,
    completedAssistant: 2,
  });
  expect(observability.pendingRequiredWrites).toBe(0);

  await page.goto(`${cabinet.appUrl}/`);
  await page.goto(`${cabinet.appUrl}${CONVERSATION_ROUTE}`);
  await expect(page).toHaveURL(new RegExp(`${CONVERSATION_ROUTE}$`));
  const directCounts = await assertExactTranscript(page);

  await page.reload();
  const reloadCounts = await assertExactTranscript(page);

  await page.getByRole("link", { name: "Back to Cabinet" }).click();
  await expect(page).toHaveURL(`${cabinet.appUrl}${CABINET_ROUTE}`);
  await page.goBack();
  const backCounts = await assertExactTranscript(page);
  await page.goForward();
  await expect(page).toHaveURL(`${cabinet.appUrl}${CABINET_ROUTE}`);
  await page.goBack();
  const forwardReturnCounts = await assertExactTranscript(page);

  observed.setRestarting(true);
  await cabinet.restart();
  observed.setRestarting(false);
  await page.goto(`${cabinet.appUrl}${CONVERSATION_ROUTE}`);
  const restartCounts = await assertExactTranscript(page);

  expect(observed.modelRequests).toEqual([]);
  expect(observed.normalErrors).toEqual([]);
  console.log(
    "conversation-reload-count-ledger",
    JSON.stringify({
      durableStore: durableStoreCounts,
      detailApi: {
        user: detailApiUserTurns,
        assistant: detailApiAssistantTurns,
      },
      observabilityApi: {
        user: observability.durableStoreCounts.user,
        assistant: observability.durableStoreCounts.assistant,
      },
      pendingRequiredWrites: observability.pendingRequiredWrites,
      directCounts,
      reloadCounts,
      backCounts,
      forwardReturnCounts,
      restartCounts,
      modelRequests: observed.modelRequests.length,
    }),
  );
});

test("mobile reduced-motion direct load keeps exact transcript on-screen", async ({
  page,
}) => {
  await primeReturningUser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const observed = observeNoModelRequests(page);

  await page.goto(`${cabinet.appUrl}${CONVERSATION_ROUTE}`);
  await assertExactTranscript(page);

  expect(observed.modelRequests).toEqual([]);
  expect(observed.normalErrors).toEqual([]);
});
