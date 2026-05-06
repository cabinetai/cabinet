import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  optaleRoleHasPermission,
  permissionsForOptaleRole,
} from "./identity-shared";
import { resolveOptaleRequestIdentity } from "./identity";

function makeRequest(
  pathname: string,
  input: {
    origin?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
) {
  const cookieHeader = Object.entries(input.cookies || {})
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  return new NextRequest(new URL(pathname, input.origin || "http://localhost:4000"), {
    headers: {
      ...(input.headers || {}),
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

test("resolveOptaleRequestIdentity reads trusted Authelia headers when enabled", async () => {
  const identity = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity", {
      origin: "https://console.optale.com",
      headers: {
        "Remote-User": "thor",
        "Remote-Email": "thor@optale.no",
        "Remote-Name": "Thor Haaland",
        "Remote-Groups": "optale,admin",
      },
    }),
    { OPTALE_TRUST_PROXY_IDENTITY: "1" },
  );

  assert.equal(identity.authenticated, true);
  assert.equal(identity.provider, "authelia");
  assert.equal(identity.source, "trusted-proxy");
  assert.equal(identity.subject, "thor");
  assert.equal(identity.email, "thor@optale.no");
  assert.equal(identity.name, "Thor Haaland");
  assert.equal(identity.role, "admin");
  assert.deepEqual(identity.groups, ["optale", "admin"]);
  assert.equal(optaleRoleHasPermission(identity.role, "control_plane.write"), true);
});

test("resolveOptaleRequestIdentity ignores proxy headers unless trust is enabled", async () => {
  const identity = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity", {
      origin: "https://console.optale.com",
      headers: {
        "Remote-User": "spoofed",
        "Remote-Groups": "admin",
      },
    }),
    {},
  );

  assert.equal(identity.authenticated, false);
  assert.equal(identity.provider, "anonymous");
});

test("resolveOptaleRequestIdentity requires proxy shared secret when configured", async () => {
  const env = {
    OPTALE_TRUST_PROXY_IDENTITY: "1",
    OPTALE_AUTH_PROXY_SHARED_SECRET: "proxy-secret",
  };
  const missingSecret = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity", {
      origin: "https://console.optale.com",
      headers: {
        "Remote-User": "thor",
        "Remote-Groups": "optale,admin",
      },
    }),
    env,
  );

  assert.equal(missingSecret.authenticated, false);
  assert.equal(missingSecret.provider, "anonymous");

  const trusted = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity", {
      origin: "https://console.optale.com",
      headers: {
        "Remote-User": "thor",
        "Remote-Email": "thor@optale.no",
        "Remote-Groups": "optale,admin",
        "X-Optale-Auth-Proxy-Secret": "proxy-secret",
      },
    }),
    env,
  );

  assert.equal(trusted.authenticated, true);
  assert.equal(trusted.provider, "authelia");
  assert.equal(trusted.role, "admin");
});

test("resolveOptaleRequestIdentity supports legacy Cabinet password gate fallback", async () => {
  const token = await hashToken("secret");
  const identity = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity", {
      cookies: { "kb-auth": token },
    }),
    { KB_PASSWORD: "secret" },
  );

  assert.equal(identity.authenticated, true);
  assert.equal(identity.provider, "cabinet-password");
  assert.equal(identity.source, "legacy-password");
  assert.equal(identity.role, "admin");
});

test("resolveOptaleRequestIdentity returns local admin only on unlocked loopback", async () => {
  const local = await resolveOptaleRequestIdentity(
    makeRequest("/api/optale/identity"),
    {},
  );
  assert.equal(local.authenticated, true);
  assert.equal(local.provider, "local");
  assert.equal(local.role, "admin");

  const publicRequest = makeRequest("/api/optale/identity", {
    origin: "https://console.optale.com",
  });
  const publicIdentity = await resolveOptaleRequestIdentity(publicRequest, {});
  assert.equal(publicIdentity.authenticated, false);
  assert.equal(publicIdentity.provider, "anonymous");
});

test("viewer role never receives management permissions", () => {
  assert.deepEqual(permissionsForOptaleRole("viewer"), [
    "console.read",
    "objects.read",
    "agents.read",
    "brain.read",
    "observatory.read",
  ]);
  assert.equal(optaleRoleHasPermission("viewer", "settings.manage"), false);
  assert.equal(optaleRoleHasPermission("viewer", "terminal.open"), false);
});
