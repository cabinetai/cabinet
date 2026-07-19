import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CursusControlPlane,
  CursusControlPlaneError,
  type WebAuthnOperations,
  type WorkspaceBootstrap,
} from "@/lib/cursus/control-plane";
const ORIGIN = "https://cursus.example.test";
function fakeWebAuthn(): WebAuthnOperations {
  let nextChallenge = 0;
  return {
    async registrationOptions() {
      nextChallenge += 1;
      return { challenge: `registration-${nextChallenge}`, rp: { id: "cursus.example.test" } };
    },
    async authenticationOptions() {
      nextChallenge += 1;
      return { challenge: `authentication-${nextChallenge}`, rpId: "cursus.example.test" };
    },
    async verifyRegistration(input) {
      const response = input.response;
      if (!response || typeof response !== "object" || !("origin" in response) || typeof response.origin !== "string" || !input.expectedOrigin.includes(response.origin)) {
        throw new Error("unexpected origin");
      }
      return {
        verified: true,
        registrationInfo: {
          credentialID: "credential-owner",
          credentialPublicKey: Uint8Array.from([1, 2, 3]),
          counter: 5,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
          transports: ["internal"],
        },
      };
    },
    async verifyAuthentication(input) {
      const response = input.response;
      if (!response || typeof response !== "object" || !("origin" in response) || typeof response.origin !== "string" || !input.expectedOrigin.includes(response.origin)) {
        throw new Error("unexpected origin");
      }
      return { verified: true, authenticationInfo: { newCounter: input.credential.counter + 7 } };
    },
  };
}

function createControlPlane(): { db: Database.Database; controlPlane: CursusControlPlane } {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync("server/migrations/002_cursus_control_plane.sql", "utf8"));
  db.exec(readFileSync("server/migrations/003_cursus_bootstrap_claim.sql", "utf8"));
  db.exec(readFileSync("server/migrations/004_cursus_verification_receipts.sql", "utf8"));
  return {
    db,
    controlPlane: new CursusControlPlane(db, {
      rpID: "cursus.example.test",
      allowedOrigins: [ORIGIN],
      receiptSigningSecret: "test-only-receipt-signing-secret",
      challengeTtlMs: 1_000,
      authorizationTtlMs: 10_000,
      receiptTtlMs: 10_000,
    }, fakeWebAuthn()),
  };
}

async function registerOwner(controlPlane: CursusControlPlane, workspace: WorkspaceBootstrap): Promise<void> {
  const ceremony = await controlPlane.beginRegistration({
    workspaceId: workspace.workspaceId,
    principalId: "owner",
    displayName: "Owner",
    bootstrapCapability: workspace.bootstrapCapability,
  });
  await controlPlane.finishRegistration({
    workspaceId: workspace.workspaceId,
    challengeId: ceremony.challengeId,
    response: { origin: ORIGIN },
    bootstrapCapability: workspace.bootstrapCapability,
  });
}

async function authorizeOwner(controlPlane: CursusControlPlane, workspaceId: string): Promise<string> {
  const ceremony = await controlPlane.beginAuthentication({ workspaceId });
  const authenticated = await controlPlane.finishAuthentication({
    workspaceId,
    challengeId: ceremony.challengeId,
    response: { id: "credential-owner", origin: ORIGIN },
  });
  return authenticated.workspaceAuthorization;
}

function assertControlError(error: unknown, code: string): void {
  assert(error instanceof CursusControlPlaneError);
  assert.equal(error.code, code);
}

test("rejects stale workspace snapshot writes atomically", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);

  assert.deepEqual(controlPlane.writeSnapshot({ workspaceId: workspace.workspaceId, expectedRevision: 0, snapshot: { state: "first" }, authorizationToken }), {
    workspaceId: workspace.workspaceId,
    revision: 1,
  });
  assert.throws(
    () => controlPlane.writeSnapshot({ workspaceId: workspace.workspaceId, expectedRevision: 0, snapshot: { state: "stale" }, authorizationToken }),
    (error) => {
      assertControlError(error, "revision_conflict");
      return true;
    }
  );
});

test("enforces canonical run transitions and independent verification before completion", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);
  const write = (expectedRevision: number, snapshot: unknown) => controlPlane.writeSnapshot({
    workspaceId: workspace.workspaceId, authorizationToken, expectedRevision, snapshot,
  });

  write(0, { stage: "INBOXED" });
  write(1, { stage: "SCOPING" });
  write(2, { stage: "GATED" });
  write(3, { stage: "RUNNING" });
  write(4, { stage: "VERIFYING" });
  assert.throws(
    () => write(5, { stage: "DONE", verificationReceipt: "forged.receipt" }),
    (error) => {
      assertControlError(error, "verification_receipt_invalid");
      return true;
    },
  );
  const verification = controlPlane.issueVerificationReceipt({
    workspaceId: workspace.workspaceId,
    authorizationToken,
    report: {
      pass: true,
      criteria: [{ criterion: "Contract satisfied", pass: true, evidence: "Verified against the declared gate." }],
      unresolved: [],
      blockers: [],
    },
    expectedRevision: 5,
    snapshotHash: createHash("sha256").update(JSON.stringify({ stage: "VERIFYING" })).digest("base64url"),
  });
  write(5, { stage: "DONE", verificationReceipt: verification.receipt });
  assert.throws(
    () => write(6, { stage: "BLOCKED" }),
    (error) => {
      assertControlError(error, "run_transition_not_allowed");
      return true;
    },
  );
});

test("denies preclaiming and binds bootstrap capability to one pending owner ceremony", async () => {
  const { controlPlane, db } = createControlPlane();
  await assert.rejects(
    controlPlane.beginRegistration({ workspaceId: "attacker-chosen", principalId: "attacker", displayName: "Attacker", bootstrapCapability: "not-a-capability" }),
    (error) => {
      assertControlError(error, "workspace_not_found");
      return true;
    }
  );

  const workspace = controlPlane.createWorkspace();
  const attempts = await Promise.allSettled([
    controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner-one", displayName: "Owner one", bootstrapCapability: workspace.bootstrapCapability }),
    controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner-two", displayName: "Owner two", bootstrapCapability: workspace.bootstrapCapability }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  const rejected = attempts.find((attempt) => attempt.status === "rejected");
  assert(rejected && rejected.status === "rejected");
  assertControlError(rejected.reason, "workspace_bootstrap_denied");
  const fulfilled = attempts.find((attempt) => attempt.status === "fulfilled");
  assert(fulfilled && fulfilled.status === "fulfilled");

  await controlPlane.finishRegistration({ workspaceId: workspace.workspaceId, challengeId: fulfilled.value.challengeId, response: { origin: ORIGIN }, bootstrapCapability: workspace.bootstrapCapability });
  await assert.rejects(
    controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner-two", displayName: "Owner two", bootstrapCapability: workspace.bootstrapCapability }),
    (error) => {
      assertControlError(error, "invalid_request");
      return true;
    }
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM cursus_principals WHERE workspace_id = ? AND is_owner = 1").get(workspace.workspaceId) as { count: number }).count, 1);
});

test("denies expired and reused WebAuthn challenges", async () => {
  const { controlPlane, db } = createControlPlane();
  const expiredWorkspace = controlPlane.createWorkspace();
  const expired = await controlPlane.beginRegistration({ workspaceId: expiredWorkspace.workspaceId, principalId: "owner", displayName: "Owner", bootstrapCapability: expiredWorkspace.bootstrapCapability });
  db.prepare("UPDATE cursus_webauthn_challenges SET expires_at = 0 WHERE challenge_id = ?").run(expired.challengeId);
  await assert.rejects(
    controlPlane.finishRegistration({ workspaceId: expiredWorkspace.workspaceId, challengeId: expired.challengeId, response: { origin: ORIGIN }, bootstrapCapability: expiredWorkspace.bootstrapCapability }),
    (error) => {
      assertControlError(error, "challenge_expired");
      return true;
    }
  );

  const freshWorkspace = controlPlane.createWorkspace();
  const fresh = await controlPlane.beginRegistration({ workspaceId: freshWorkspace.workspaceId, principalId: "owner-b", displayName: "Owner B", bootstrapCapability: freshWorkspace.bootstrapCapability });
  await controlPlane.finishRegistration({ workspaceId: freshWorkspace.workspaceId, challengeId: fresh.challengeId, response: { origin: ORIGIN }, bootstrapCapability: freshWorkspace.bootstrapCapability });
  await assert.rejects(
    controlPlane.finishRegistration({ workspaceId: freshWorkspace.workspaceId, challengeId: fresh.challengeId, response: { origin: ORIGIN }, bootstrapCapability: freshWorkspace.bootstrapCapability }),
    (error) => {
      assertControlError(error, "challenge_invalid_or_used");
      return true;
    }
  );
});

test("denies passkey responses from an unconfigured origin", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  const ceremony = await controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner", displayName: "Owner", bootstrapCapability: workspace.bootstrapCapability });
  await assert.rejects(
    controlPlane.finishRegistration({ workspaceId: workspace.workspaceId, challengeId: ceremony.challengeId, response: { origin: "https://attacker.example.test" }, bootstrapCapability: workspace.bootstrapCapability }),
    (error) => {
      assertControlError(error, "registration_verification_failed");
      return true;
    }
  );
});

test("releases a failed bootstrap ceremony claim so the owner can retry", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  const failed = await controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner", displayName: "Owner", bootstrapCapability: workspace.bootstrapCapability });
  await assert.rejects(
    controlPlane.finishRegistration({ workspaceId: workspace.workspaceId, challengeId: failed.challengeId, response: { origin: "https://attacker.example.test" }, bootstrapCapability: workspace.bootstrapCapability }),
    (error) => {
      assertControlError(error, "registration_verification_failed");
      return true;
    }
  );
  const retry = await controlPlane.beginRegistration({ workspaceId: workspace.workspaceId, principalId: "owner", displayName: "Owner", bootstrapCapability: workspace.bootstrapCapability });
  await controlPlane.finishRegistration({ workspaceId: workspace.workspaceId, challengeId: retry.challengeId, response: { origin: ORIGIN }, bootstrapCapability: workspace.bootstrapCapability });
});

test("denies workspace-scoped authorization tokens outside their workspace", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);
  assert.throws(
    () => controlPlane.readSnapshot("other-workspace", authorizationToken),
    (error) => {
      assertControlError(error, "workspace_authorization_denied");
      return true;
    }
  );
});

test("returns authenticated run status without exposing workspace contents", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);
  controlPlane.writeSnapshot({
    workspaceId: workspace.workspaceId,
    authorizationToken,
    expectedRevision: 0,
    snapshot: { stage: "INBOXED" },
  });
  controlPlane.writeSnapshot({
    workspaceId: workspace.workspaceId,
    authorizationToken,
    expectedRevision: 1,
    snapshot: {
      stage: "SCOPING",
      captureNote: "confidential work request",
      sources: [{ content: "private source contents" }, { content: "another private source" }],
      loopRun: { artifacts: [{ summary: "private artifact" }] },
      verification: { pass: true, evidence: "private verification evidence" },
    },
  });

  const status = controlPlane.readWorkspaceRunStatus(workspace.workspaceId, authorizationToken);
  assert.deepEqual(status, {
    workspaceId: workspace.workspaceId,
    revision: 2,
    run: { state: "SCOPING", verification: "passed", sourceCount: 2, artifactCount: 1 },
  });
  assert.equal(JSON.stringify(status).includes("private"), false);
});

test("consumes approval receipts only once", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);
  const issued = controlPlane.issueReceipt({ workspaceId: workspace.workspaceId, authorizationToken, action: "deploy", payload: { revision: 3 } });
  assert.deepEqual(controlPlane.consumeReceipt({ workspaceId: workspace.workspaceId, authorizationToken, receipt: issued.receipt, expectedAction: "deploy" }), {
    workspaceId: workspace.workspaceId,
    principalId: "owner",
    action: "deploy",
    payload: { revision: 3 },
  });
  assert.throws(
    () => controlPlane.consumeReceipt({ workspaceId: workspace.workspaceId, authorizationToken, receipt: issued.receipt, expectedAction: "deploy" }),
    (error) => {
      assertControlError(error, "receipt_already_consumed");
      return true;
    }
  );
});

test("binds receipt consumption to the approved action", async () => {
  const { controlPlane } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  const authorizationToken = await authorizeOwner(controlPlane, workspace.workspaceId);
  const issued = controlPlane.issueReceipt({ workspaceId: workspace.workspaceId, authorizationToken, action: "vendor_handoff_review" });

  assert.throws(
    () => controlPlane.consumeReceipt({ workspaceId: workspace.workspaceId, authorizationToken, receipt: issued.receipt, expectedAction: "stripe_checkout" }),
    (error) => {
      assertControlError(error, "receipt_action_mismatch");
      return true;
    }
  );
  assert.deepEqual(controlPlane.consumeReceipt({ workspaceId: workspace.workspaceId, authorizationToken, receipt: issued.receipt, expectedAction: "vendor_handoff_review" }), {
    workspaceId: workspace.workspaceId,
    principalId: "owner",
    action: "vendor_handoff_review",
    payload: null,
  });
});

test("persists the verified passkey signature counter update", async () => {
  const { controlPlane, db } = createControlPlane();
  const workspace = controlPlane.createWorkspace();
  await registerOwner(controlPlane, workspace);
  await authorizeOwner(controlPlane, workspace.workspaceId);
  assert.equal((db.prepare("SELECT counter FROM cursus_passkey_credentials WHERE credential_id = ?").get("credential-owner") as { counter: number }).counter, 12);
});
