import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  buildOptaleConsoleMembersPayload,
  buildOptaleConsolePermissionsPayload,
} from "./console-admin";
import { requireOptaleSettingsRequest } from "./console-admin-auth";
import {
  createOptaleConsoleMember,
  optaleConsoleMemberIdForIdentity,
  updateOptaleConsoleMemberRole,
} from "./member-registry";
import {
  permissionsForOptaleRole,
  type OptaleIdentitySnapshot,
} from "./identity-shared";

const generatedAt = new Date("2026-05-05T12:00:00.000Z");

function requestFor(
  origin: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new URL("/api/optale/admin/members", origin), {
    headers,
  });
}

async function withRegistryRoot<T>(callback: () => Promise<T>): Promise<T> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "optale-console-members-"),
  );
  const previous = process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT;
  process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT = tempRoot;

  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT;
    } else {
      process.env.OPTALE_CONSOLE_MEMBER_REGISTRY_ROOT = previous;
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("buildOptaleConsoleMembersPayload includes the active Console identity", async () => {
  const identity: OptaleIdentitySnapshot = {
    authenticated: true,
    provider: "authelia",
    source: "trusted-proxy",
    subject: "thor",
    email: "thor@optale.no",
    name: "Thor Haaland",
    groups: ["optale", "admin"],
    role: "admin",
    permissions: permissionsForOptaleRole("admin"),
  };

  const payload = await withRegistryRoot(() =>
    buildOptaleConsoleMembersPayload(
      identity,
      { OPTALE_HARNESS_API_URL: "https://harness.optale.no" },
      generatedAt,
    ),
  );

  assert.equal(payload.generatedAt, "2026-05-05T12:00:00.000Z");
  assert.equal(payload.canManage, true);
  assert.deepEqual(payload.rows[0], {
    principal: "Thor Haaland",
    kind: "Human",
    access: "Admin (16 grants)",
    source: "Authelia trusted proxy",
    groups: "optale, admin",
    state: "Active",
  });
  assert.equal(
    payload.rows.find((row) => row.principal === "Optale Agent")?.state,
    "Live",
  );
});

test("member registry supports manual members and protects final admin", async () => {
  const identity: OptaleIdentitySnapshot = {
    authenticated: true,
    provider: "authelia",
    source: "trusted-proxy",
    subject: "thor",
    email: "thor@optale.no",
    name: "Thor Haaland",
    groups: ["optale", "admin"],
    role: "admin",
    permissions: permissionsForOptaleRole("admin"),
  };

  await withRegistryRoot(async () => {
    await buildOptaleConsoleMembersPayload(identity, {}, generatedAt);
    await assert.rejects(
      updateOptaleConsoleMemberRole({
        id: optaleConsoleMemberIdForIdentity(identity),
        role: "operator",
      }),
      /At least one active Console admin/,
    );

    await createOptaleConsoleMember({
      principal: "Kamilla",
      email: "kamilla@optale.no",
      role: "operator",
    });
    await updateOptaleConsoleMemberRole({
      id: "human:kamilla-optale.no",
      role: "engineer",
    });

    const payload = await buildOptaleConsoleMembersPayload(
      identity,
      {},
      generatedAt,
    );
    const kamilla = payload.members.find(
      (member) => member.id === "human:kamilla-optale.no",
    );
    assert.equal(kamilla?.role, "engineer");
    assert.equal(kamilla?.access, "Engineer (13 grants)");
  });
});

test("buildOptaleConsolePermissionsPayload derives decisions from RBAC", () => {
  const rows = buildOptaleConsolePermissionsPayload(generatedAt).rows;
  const settingsRead = rows.find((row) => row.id === "settings.read");
  const settingsManage = rows.find((row) => row.id === "settings.manage");
  const terminalOpen = rows.find((row) => row.id === "terminal.open");

  assert.equal(settingsRead?.admin, "Allow");
  assert.equal(settingsRead?.engineer, "Allow");
  assert.equal(settingsRead?.operator, "Allow");
  assert.equal(settingsRead?.viewer, "Deny");

  assert.equal(settingsManage?.admin, "Allow");
  assert.equal(settingsManage?.engineer, "Deny");
  assert.equal(settingsManage?.operator, "Deny");

  assert.equal(terminalOpen?.engineer, "Allow");
  assert.equal(terminalOpen?.operator, "Deny");
});

test("requireOptaleSettingsRequest rejects anonymous public access", async () => {
  const result = await requireOptaleSettingsRequest(
    requestFor("https://console.optale.no"),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("requireOptaleSettingsRequest rejects viewer identities", async () => {
  const original = process.env.OPTALE_TRUST_PROXY_IDENTITY;
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";

  try {
    await withRegistryRoot(async () => {
      const result = await requireOptaleSettingsRequest(
        requestFor("https://console.optale.no", {
          "Remote-User": "viewer",
          "Remote-Groups": "viewer",
        }),
      );

      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.response.status, 403);
    });
  } finally {
    if (original === undefined) {
      delete process.env.OPTALE_TRUST_PROXY_IDENTITY;
    } else {
      process.env.OPTALE_TRUST_PROXY_IDENTITY = original;
    }
  }
});

test("registered member role overrides trusted group role", async () => {
  const original = process.env.OPTALE_TRUST_PROXY_IDENTITY;
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";

  try {
    await withRegistryRoot(async () => {
      const identity: OptaleIdentitySnapshot = {
        authenticated: true,
        provider: "authelia",
        source: "trusted-proxy",
        subject: "thor",
        email: "thor@optale.no",
        name: "Thor Haaland",
        groups: ["optale", "admin"],
        role: "admin",
        permissions: permissionsForOptaleRole("admin"),
      };
      await buildOptaleConsoleMembersPayload(identity, {}, generatedAt);
      await createOptaleConsoleMember({
        principal: "Backup Admin",
        email: "backup@optale.no",
        role: "admin",
      });
      await updateOptaleConsoleMemberRole({
        id: optaleConsoleMemberIdForIdentity(identity),
        role: "operator",
      });

      const result = await requireOptaleSettingsRequest(
        requestFor("https://console.optale.no", {
          "Remote-User": "thor",
          "Remote-Email": "thor@optale.no",
          "Remote-Groups": "optale,admin",
        }),
      );

      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.identity.role, "operator");

      const manageResult = await requireOptaleSettingsRequest(
        requestFor("https://console.optale.no", {
          "Remote-User": "thor",
          "Remote-Email": "thor@optale.no",
          "Remote-Groups": "optale,admin",
        }),
        "settings.manage",
      );

      assert.equal(manageResult.ok, false);
      if (!manageResult.ok) assert.equal(manageResult.response.status, 403);
    });
  } finally {
    if (original === undefined) {
      delete process.env.OPTALE_TRUST_PROXY_IDENTITY;
    } else {
      process.env.OPTALE_TRUST_PROXY_IDENTITY = original;
    }
  }
});

test("requireOptaleSettingsRequest accepts trusted operator settings readers", async () => {
  const original = process.env.OPTALE_TRUST_PROXY_IDENTITY;
  process.env.OPTALE_TRUST_PROXY_IDENTITY = "1";

  try {
    const result = await withRegistryRoot(() =>
      requireOptaleSettingsRequest(
        requestFor("https://console.optale.no", {
          "Remote-User": "operator",
          "Remote-Groups": "operator",
        }),
      ),
    );

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.identity.role, "operator");
  } finally {
    if (original === undefined) {
      delete process.env.OPTALE_TRUST_PROXY_IDENTITY;
    } else {
      process.env.OPTALE_TRUST_PROXY_IDENTITY = original;
    }
  }
});
