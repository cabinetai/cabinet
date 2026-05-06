import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeReq(
  pathname: string,
  cookies: Record<string, string> = {},
  origin = "http://localhost:4000",
  headers: Record<string, string> = {},
) {
  const url = new URL(pathname, origin);
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(url, {
    headers: {
      ...headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
}

function restoreEnv(
  snapshot: Map<string, string | undefined>,
  keys: string[],
): void {
  for (const key of keys) {
    const value = snapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

test("proxy blocks public Brain APIs when password auth is disabled", async () => {
  const prev = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const res = await proxy(
      makeReq("/api/optale/brain/memory", {}, "https://observatory.optale.com"),
    );
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), {
      error: "BrainAuthRequired",
      message:
        "Optale Brain APIs require authentication before exposing scoped Brain data on public hosts.",
    });
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
  }
});

test("proxy blocks public Optale control-plane APIs when password auth is disabled", async () => {
  const prev = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    for (const path of [
      "/api/optale/command-center",
      "/api/optale/context-registry",
      "/api/optale/mcp-clients",
      "/api/optale/mcp-policy",
      "/api/optale/scopes",
    ]) {
      const res = await proxy(
        makeReq(path, {}, "https://observatory.optale.com"),
      );
      assert.equal(res.status, 403, path);
      assert.equal((await res.json()).error, "OptaleControlPlaneAuthRequired");
    }
  } finally {
    if (prev !== undefined) process.env.KB_PASSWORD = prev;
  }
});

test("proxy rejects malformed Command Brain bridge paths before route resolution", async () => {
  const prev = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const res = await proxy(
      makeReq("/api/optale/brain/command/brain/%E0%A4%A/promotions"),
    );
    assert.equal(res.status, 403);
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

test("proxy admits trusted central-auth headers when explicitly enabled", async () => {
  const keys = ["KB_PASSWORD", "OPTALE_TRUST_PROXY_IDENTITY"];
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.KB_PASSWORD = "secret";
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";
  try {
    const res = await proxy(
      makeReq(
        "/console",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "thor",
          "Remote-Email": "thor@optale.no",
          "Remote-Groups": "optale,admin",
        },
      ),
    );
    assert.equal(res.status, 200);
  } finally {
    restoreEnv(snapshot, keys);
  }
});

test("proxy ignores spoofed central-auth headers unless trust is enabled", async () => {
  const keys = ["KB_PASSWORD", "OPTALE_TRUST_PROXY_IDENTITY", "OPTALE_AUTH_PROVIDER"];
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.KB_PASSWORD = "secret";
  delete process.env.OPTALE_TRUST_PROXY_IDENTITY;
  delete process.env.OPTALE_AUTH_PROVIDER;
  try {
    const res = await proxy(
      makeReq(
        "/api/optale/admin/tenant-readiness",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "spoofed",
          "Remote-Groups": "admin",
        },
      ),
    );
    assert.equal(res.status, 401);
  } finally {
    restoreEnv(snapshot, keys);
  }
});

test("proxy lets trusted central auth protect public Optale APIs without KB password", async () => {
  const keys = ["KB_PASSWORD", "OPTALE_AUTH_PROVIDER"];
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  delete process.env.KB_PASSWORD;
  process.env.OPTALE_AUTH_PROVIDER = "authelia";
  try {
    const res = await proxy(
      makeReq(
        "/api/optale/admin/tenant-readiness",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "thor",
          "Remote-Email": "thor@optale.no",
          "Remote-Groups": "optale,admin",
        },
      ),
    );
    assert.equal(res.status, 200);
  } finally {
    restoreEnv(snapshot, keys);
  }
});

test("proxy requires central-auth shared secret when configured", async () => {
  const keys = [
    "KB_PASSWORD",
    "OPTALE_TRUST_PROXY_IDENTITY",
    "OPTALE_AUTH_PROXY_SHARED_SECRET",
  ];
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.KB_PASSWORD = "secret";
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";
  process.env.OPTALE_AUTH_PROXY_SHARED_SECRET = "proxy-secret";
  try {
    const missingSecret = await proxy(
      makeReq(
        "/api/optale/admin/tenant-readiness",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "thor",
          "Remote-Groups": "optale,admin",
        },
      ),
    );
    assert.equal(missingSecret.status, 401);

    const trusted = await proxy(
      makeReq(
        "/api/optale/admin/tenant-readiness",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "thor",
          "Remote-Groups": "optale,admin",
          "X-Optale-Auth-Proxy-Secret": "proxy-secret",
        },
      ),
    );
    assert.equal(trusted.status, 200);
  } finally {
    restoreEnv(snapshot, keys);
  }
});
