import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getConversationDetail,
  startConversation,
  waitForStatus,
} from "../test/support/cabinet-api";
import { bootCabinet, type CabinetInstance } from "../test/support/harness";

test.describe.configure({ mode: "serial" });

let cabinet: CabinetInstance;
let fixtureRoot: string;
let instrumentationPath: string;
let toolExecutedPath: string;

test.beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-hermes-no-tools-"));
  instrumentationPath = path.join(fixtureRoot, "no-tools-entered");
  toolExecutedPath = path.join(fixtureRoot, "tool-executed");
  const cliPath = path.join(fixtureRoot, "hermes");
  const source = `#!${process.execPath}
const fs = require("node:fs");
const readline = require("node:readline");
if (process.env.HERMES_ACP_NO_TOOLS !== "1") process.exit(91);
fs.appendFileSync(${JSON.stringify(instrumentationPath)}, "1\\n");
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: 1 } });
  } else if (message.method === "session/new") {
    send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "sentinel-session" } });
  } else if (message.method === "session/prompt") {
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: message.params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "PARTIAL_SENTINEL" } }
    }});
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: message.params.sessionId,
      update: { sessionUpdate: "tool_call", toolCallId: "forbidden", title: "forbidden" }
    }});
    send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } });
  }
});
`;
  await fs.writeFile(cliPath, source, { mode: 0o700 });
  cabinet = await bootCabinet({
    startDaemon: false,
    env: {
      CABINET_RUNTIME_MODE: "hermes",
      CABINET_HERMES_EXECUTION_CLI_PATH: cliPath,
      CABINET_HERMES_EXECUTION_NO_TOOLS: "true",
      CABINET_HERMES_PROFILE: "operator-os",
    },
  });
});

test.afterAll(async () => {
  await cabinet?.close();
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("a forbidden ACP tool event leaves a visibly failed turn and executes nothing", async ({ page }) => {
  const outsideRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const staticFontAsset = new Set([
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]).has(url.origin);
    if (url.origin !== cabinet.appUrl && !staticFontAsset) {
      outsideRequests.push(url.origin);
    }
  });

  const weakenResponse = await fetch(`${cabinet.appUrl}/api/agents/config/cabinet-env`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: "CABINET_HERMES_EXECUTION_NO_TOOLS",
      value: "false",
    }),
  });
  expect(weakenResponse.status).toBe(403);

  const conversation = await startConversation(cabinet, {
    userMessage: "local sentinel tool-event test",
  });
  const meta = await waitForStatus(cabinet, conversation.id, "failed");
  const detail = await getConversationDetail(cabinet, conversation.id, true);
  expect(meta.status).toBe("failed");
  expect(meta.exitCode).not.toBe(0);
  expect(detail.session).toBeNull();
  expect(await fs.readFile(instrumentationPath, "utf8")).toBe("1\n");
  await expect(fs.access(toolExecutedPath)).rejects.toThrow();

  await page.goto(`${cabinet.appUrl}/tasks/${conversation.id}`);
  await expect(
    page.locator('[data-testid="turn"][data-turn-role="user"]').first(),
  ).toContainText("local sentinel tool-event test");
  await expect(page.locator("body")).toContainText(/failed/i);
  expect(outsideRequests).toEqual([]);
});
