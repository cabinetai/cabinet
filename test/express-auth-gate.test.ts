import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

// Must be set before kb-auth / daemon-auth are imported by the gate.
process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";
process.env.CABINET_DAEMON_TOKEN = "test-daemon-token-0123456789abcdef";

import express from "express";
import { apiAuthGate } from "../server/http/auth-gate";
import { expectedToken, KB_AUTH_COOKIE } from "../src/lib/auth/kb-auth";

async function withGate(fn: (origin: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(apiAuthGate);
  app.get("/api/echo-user", (req, res) => {
    res.json({ user: req.headers["x-cabinet-user"] ?? null });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/auth/check", (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("gate passes everything when no password is set, stripping spoofed identity", async () => {
  delete process.env.KB_PASSWORD;
  await withGate(async (origin) => {
    const res = await fetch(`${origin}/api/echo-user`, {
      headers: { "x-cabinet-user": "spoofed" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { user: null });
  });
});

test("gate 401s without a cookie and passes with the derived kb-auth cookie", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      const anonymous = await fetch(`${origin}/api/echo-user`);
      assert.equal(anonymous.status, 401);
      assert.deepEqual(await anonymous.json(), { error: "Unauthorized" });

      const token = await expectedToken();
      const authed = await fetch(`${origin}/api/echo-user`, {
        headers: { cookie: `${KB_AUTH_COOKIE}=${token}` },
      });
      assert.equal(authed.status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});

test("gate exempts /api/health and /api/auth/check even when locked", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      assert.equal((await fetch(`${origin}/api/health`)).status, 200);
      assert.equal((await fetch(`${origin}/api/auth/check`)).status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});

test("gate accepts the daemon bearer token in place of a cookie", async () => {
  process.env.KB_PASSWORD = "hunter2";
  try {
    await withGate(async (origin) => {
      const res = await fetch(`${origin}/api/echo-user`, {
        headers: { authorization: `Bearer ${process.env.CABINET_DAEMON_TOKEN}` },
      });
      assert.equal(res.status, 200);
    });
  } finally {
    delete process.env.KB_PASSWORD;
  }
});
