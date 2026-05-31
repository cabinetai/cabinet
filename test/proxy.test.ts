import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeReq(pathname: string, cookies: Record<string, string> = {}) {
  const url = new URL(pathname, "http://localhost:4000");
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "cabinet-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

test("proxy passes through every path when KB_PASSWORD is unset", async () => {
  const prev = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    for (const path of ["/", "/api/anything", "/login", "/api/health"]) {
      const res = await proxy(makeReq(path));
      // NextResponse.next() emits a 200 response with the rsc-rewritten header.
      assert.equal(res.status, 200);
    }
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
  }
});

test("proxy lets the login page and health check through even when locked", async () => {
  const prev = process.env.KB_PASSWORD;
  process.env.KB_PASSWORD = "secret";
  try {
    for (const path of [
      "/login",
      "/api/auth/login",
      "/api/auth/check",
      "/api/health",
      "/api/health/daemon",
    ]) {
      const res = await proxy(makeReq(path));
      assert.equal(res.status, 200, `${path} should pass through`);
    }
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
    else delete process.env.KB_PASSWORD;
  }
});

test("proxy 401s API requests without a valid auth cookie when locked", async () => {
  const prev = process.env.KB_PASSWORD;
  process.env.KB_PASSWORD = "secret";
  try {
    const res = await proxy(makeReq("/api/pages"));
    assert.equal(res.status, 401);
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
    else delete process.env.KB_PASSWORD;
  }
});

test("proxy redirects unauthenticated page requests to /login when locked", async () => {
  const prev = process.env.KB_PASSWORD;
  process.env.KB_PASSWORD = "secret";
  try {
    const res = await proxy(makeReq("/some-page"));
    // NextResponse.redirect emits 307 by default.
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location") || "").pathname, "/login");
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
    else delete process.env.KB_PASSWORD;
  }
});

test("proxy admits authenticated requests when locked", async () => {
  const prev = process.env.KB_PASSWORD;
  process.env.KB_PASSWORD = "secret";
  try {
    const token = await hashToken("secret");
    const res = await proxy(makeReq("/some-page", { "kb-auth": token }));
    assert.equal(res.status, 200);
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
    else delete process.env.KB_PASSWORD;
  }
});
