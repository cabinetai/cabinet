import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { requireOptaleControlPlaneRequest } from "./control-plane-auth";

function makeRequest(
  pathname: string,
  cookies: Record<string, string> = {},
  origin = "http://localhost:4000",
  headers: Record<string, string> = {},
) {
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  return new NextRequest(new URL(pathname, origin), {
    headers: {
      ...headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
}

async function hashToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}cabinet-salt`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

test("requireOptaleControlPlaneRequest allows local no-password development", async () => {
  const previous = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const response = await requireOptaleControlPlaneRequest(
      makeRequest("/api/optale/mcp-policy"),
    );
    assert.equal(response, null);
  } finally {
    if (previous === undefined) delete process.env.KB_PASSWORD;
    else process.env.KB_PASSWORD = previous;
  }
});

test("requireOptaleControlPlaneRequest blocks public no-password access", async () => {
  const previous = process.env.KB_PASSWORD;
  delete process.env.KB_PASSWORD;
  try {
    const response = await requireOptaleControlPlaneRequest(
      makeRequest(
        "/api/optale/mcp-policy",
        {},
        "https://observatory.optale.com",
      ),
    );
    assert.equal(response?.status, 403);
    assert.equal(
      (await response?.json())?.error,
      "OptaleControlPlaneAuthRequired",
    );
  } finally {
    if (previous === undefined) delete process.env.KB_PASSWORD;
    else process.env.KB_PASSWORD = previous;
  }
});

test("requireOptaleControlPlaneRequest requires auth cookie when locked", async () => {
  const previous = process.env.KB_PASSWORD;
  process.env.KB_PASSWORD = "secret";
  try {
    const denied = await requireOptaleControlPlaneRequest(
      makeRequest("/api/optale/mcp-policy"),
    );
    assert.equal(denied?.status, 401);

    const token = await hashToken("secret");
    const allowed = await requireOptaleControlPlaneRequest(
      makeRequest("/api/optale/mcp-policy", { "kb-auth": token }),
    );
    assert.equal(allowed, null);
  } finally {
    if (previous === undefined) delete process.env.KB_PASSWORD;
    else process.env.KB_PASSWORD = previous;
  }
});

test("requireOptaleControlPlaneRequest accepts trusted admin identity headers", async () => {
  const previousTrust = process.env.OPTALE_TRUST_PROXY_IDENTITY;
  const previousPassword = process.env.KB_PASSWORD;
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";
  delete process.env.KB_PASSWORD;
  try {
    const allowed = await requireOptaleControlPlaneRequest(
      makeRequest(
        "/api/optale/mcp-policy",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "thor",
          "Remote-Groups": "optale,admin",
        },
      ),
    );
    assert.equal(allowed, null);

    const denied = await requireOptaleControlPlaneRequest(
      makeRequest(
        "/api/optale/mcp-policy",
        {},
        "https://console.optale.com",
        {
          "Remote-User": "viewer",
          "Remote-Groups": "viewer",
        },
      ),
    );
    assert.equal(denied?.status, 403);
    assert.equal((await denied?.json())?.error, "OptaleControlPlaneForbidden");
  } finally {
    if (previousTrust === undefined) delete process.env.OPTALE_TRUST_PROXY_IDENTITY;
    else process.env.OPTALE_TRUST_PROXY_IDENTITY = previousTrust;
    if (previousPassword === undefined) delete process.env.KB_PASSWORD;
    else process.env.KB_PASSWORD = previousPassword;
  }
});
