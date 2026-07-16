import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { authCookieHeader, deriveAuthToken, getAuthSalt } from "@/lib/auth/kb-auth";

// Keep PBKDF2 cheap for tests — the shared module reads this at call time.
process.env.CABINET_LOGIN_PBKDF2_ITERS = "1";

function makeReq(pathname: string, cookies: Record<string, string> = {}) {
  const url = new URL(pathname, "http://localhost:4000");
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
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
    const token = await deriveAuthToken("secret", getAuthSalt());
    const res = await proxy(makeReq("/some-page", { "kb-auth": token }));
    assert.equal(res.status, 200);
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
    else delete process.env.KB_PASSWORD;
  }
});

// End-to-end guard for the scheduler-daemon bug: the cookie the daemon attaches
// (authCookieHeader) must satisfy the SAME gate (proxy) on an /api/* route, or
// every scheduled job + heartbeat 401s silently once KB_PASSWORD is set. Both
// sides derive from the shared kb-auth module; this pins them together through
// the real proxy, across a non-default per-install salt.
test("daemon's authCookieHeader passes the proxy gate on /api/* when locked", async () => {
  const prev = {
    pw: process.env.KB_PASSWORD,
    salt: process.env.CABINET_AUTH_SALT,
  };
  process.env.KB_PASSWORD = "s3cret";
  process.env.CABINET_AUTH_SALT = "feedface";
  try {
    const header = await authCookieHeader();
    const eq = header.Cookie.indexOf("=");
    const cookies = { [header.Cookie.slice(0, eq)]: header.Cookie.slice(eq + 1) };
    const res = await proxy(makeReq("/api/pages", cookies));
    assert.equal(res.status, 200, "gate must admit the daemon's cookie");
  } finally {
    for (const [k, v] of [
      ["KB_PASSWORD", prev.pw],
      ["CABINET_AUTH_SALT", prev.salt],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("proxy rewrites /api to the daemon origin when CABINET_API_VIA_DAEMON=1", async () => {
  process.env.CABINET_API_VIA_DAEMON = "1";
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  const prevPassword = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const res = await proxy(makeReq("/api/cabinets?x=1"));
    assert.equal(
      res.headers.get("x-middleware-rewrite"),
      "http://127.0.0.1:4100/api/cabinets?x=1"
    );
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    if (prevPassword !== undefined) process.env.KB_PASSWORD = prevPassword;
  }
});

test("proxy leaves pages and flag-off requests alone", async () => {
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  const prevPassword = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    delete process.env.CABINET_API_VIA_DAEMON;
    const flagOff = await proxy(makeReq("/api/cabinets"));
    assert.equal(flagOff.headers.get("x-middleware-rewrite"), null);

    process.env.CABINET_API_VIA_DAEMON = "1";
    const page = await proxy(makeReq("/tasks"));
    assert.equal(page.headers.get("x-middleware-rewrite"), null);
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    if (prevPassword !== undefined) process.env.KB_PASSWORD = prevPassword;
  }
});

test("proxy still 401s unauthenticated /api requests before any rewrite", async () => {
  process.env.CABINET_API_VIA_DAEMON = "1";
  process.env.CABINET_DAEMON_URL = "http://127.0.0.1:4100";
  process.env.KB_PASSWORD = "hunter2";
  try {
    const res = await proxy(makeReq("/api/cabinets"));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
  } finally {
    delete process.env.CABINET_API_VIA_DAEMON;
    delete process.env.CABINET_DAEMON_URL;
    delete process.env.KB_PASSWORD;
  }
});
