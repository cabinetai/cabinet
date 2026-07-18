import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type DatabaseConstructor from "better-sqlite3";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import { getDb } from "@/lib/db";

type Database = DatabaseConstructor.Database;

type ChallengeType = "registration" | "authentication";

type CredentialRecord = {
  credential_id: string;
  workspace_id: string;
  principal_id: string;
  public_key: Buffer;
  counter: number;
  transports_json: string | null;
  device_type: string;
  backed_up: number;
};

type PrincipalRecord = {
  principal_id: string;
  workspace_id: string;
  is_owner: number;
};

type ChallengeRecord = {
  challenge_id: string;
  workspace_id: string;
  principal_id: string | null;
  display_name: string | null;
  ceremony_type: ChallengeType;
  challenge: string;
  expires_at: number;
};

type AuthorizationRecord = {
  workspace_id: string;
  principal_id: string;
  credential_id: string;
  expires_at: number;
  revoked_at: number | null;
};

export type CursusControlPlaneConfig = {
  rpID: string;
  allowedOrigins: readonly string[];
  receiptSigningSecret: string;
  challengeTtlMs?: number;
  authorizationTtlMs?: number;
  receiptTtlMs?: number;
};

export type WorkspaceBootstrap = {
  workspaceId: string;
  bootstrapCapability: string;
  expiresAt: number;
};

export type RegistrationVerification = {
  verified: boolean;
  registrationInfo?: {
    credentialID: string;
    credentialPublicKey: Uint8Array;
    counter: number;
    credentialDeviceType: string;
    credentialBackedUp: boolean;
    transports?: AuthenticatorTransportFuture[];
  };
};

export type AuthenticationVerification = {
  verified: boolean;
  authenticationInfo?: { newCounter: number };
};

export type CeremonyOptions = { challenge: string; [key: string]: unknown };

export type WebAuthnOperations = {
  registrationOptions(input: {
    rpID: string;
    rpName: string;
    userID: Uint8Array<ArrayBuffer>;
    userName: string;
    userDisplayName: string;
    excludeCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[];
  }): Promise<CeremonyOptions>;
  authenticationOptions(input: {
    rpID: string;
    allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[];
  }): Promise<CeremonyOptions>;
  verifyRegistration(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: readonly string[];
    expectedRPID: string;
  }): Promise<RegistrationVerification>;
  verifyAuthentication(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: readonly string[];
    expectedRPID: string;
    credential: WebAuthnCredential;
  }): Promise<AuthenticationVerification>;
};

const productionWebAuthn: WebAuthnOperations = {
  async registrationOptions(input) {
    const options = await generateRegistrationOptions({
      rpName: input.rpName,
      rpID: input.rpID,
      userID: input.userID,
      userName: input.userName,
      userDisplayName: input.userDisplayName,
      excludeCredentials: input.excludeCredentials,
      authenticatorSelection: { userVerification: "required" },
    });
    return { ...options };
  },
  async authenticationOptions(input) {
    const options = await generateAuthenticationOptions({
      rpID: input.rpID,
      allowCredentials: input.allowCredentials,
      userVerification: "required",
    });
    return { ...options };
  },
  async verifyRegistration(input) {
    // SimpleWebAuthn performs the protocol-level runtime validation.
    const response = input.response as RegistrationResponseJSON;
    return (await verifyRegistrationResponse({
      response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: [...input.expectedOrigin],
      expectedRPID: input.expectedRPID,
      requireUserVerification: true,
    })) as RegistrationVerification;
  },
  async verifyAuthentication(input) {
    // SimpleWebAuthn performs the protocol-level runtime validation.
    const response = input.response as AuthenticationResponseJSON;
    return (await verifyAuthenticationResponse({
      response,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: [...input.expectedOrigin],
      expectedRPID: input.expectedRPID,
      credential: input.credential,
      requireUserVerification: true,
    })) as AuthenticationVerification;
  },
};

export class CursusControlPlaneError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

function fail(code: string, status: number, message: string, details?: Record<string, unknown>): never {
  throw new CursusControlPlaneError(code, status, message, details);
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail("invalid_request", 400, `${field} is required`);
  return value;
}

function encodeUserID(principalId: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(principalId));
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function nowMs(): number {
  return Date.now();
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  const parsed: unknown = JSON.parse(value);
  const supported: Record<AuthenticatorTransportFuture, true> = {
    ble: true,
    cable: true,
    hybrid: true,
    internal: true,
    nfc: true,
    "smart-card": true,
    usb: true,
  };
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string" && item in supported)
    ? parsed as AuthenticatorTransportFuture[]
    : undefined;
}

function configFromEnvironment(): CursusControlPlaneConfig {
  const rpID = process.env.CURSUS_WEBAUTHN_RP_ID?.trim();
  const allowedOrigins = process.env.CURSUS_WEBAUTHN_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
  const receiptSigningSecret = process.env.CURSUS_APPROVAL_RECEIPT_SECRET;
  if (!rpID || allowedOrigins.length === 0 || !receiptSigningSecret) {
    fail("control_plane_misconfigured", 503, "Cursus WebAuthn and receipt signing configuration is required");
  }
  return { rpID, allowedOrigins, receiptSigningSecret };
}

export class CursusControlPlane {
  private readonly challengeTtlMs: number;
  private readonly authorizationTtlMs: number;
  private readonly receiptTtlMs: number;
  private readonly bootstrapTtlMs: number;

  constructor(
    private readonly db: Database,
    private readonly config: CursusControlPlaneConfig,
    private readonly webauthn: WebAuthnOperations = productionWebAuthn
  ) {
    if (!config.rpID || config.allowedOrigins.length === 0 || !config.receiptSigningSecret) {
      fail("control_plane_misconfigured", 503, "Cursus WebAuthn and receipt signing configuration is required");
    }
    this.challengeTtlMs = config.challengeTtlMs ?? 5 * 60_000;
    this.authorizationTtlMs = config.authorizationTtlMs ?? 15 * 60_000;
    this.receiptTtlMs = config.receiptTtlMs ?? 5 * 60_000;
    this.bootstrapTtlMs = 10 * 60_000;
  }

  createWorkspace(): WorkspaceBootstrap {
    const workspaceId = randomUUID();
    const bootstrapCapability = randomBytes(32).toString("base64url");
    const now = nowMs();
    const expiresAt = now + this.bootstrapTtlMs;
    this.db.prepare("INSERT INTO cursus_workspaces (workspace_id, bootstrap_capability_hash, bootstrap_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(workspaceId, tokenHash(bootstrapCapability), expiresAt, now, now);
    return { workspaceId, bootstrapCapability, expiresAt };
  }

  async beginRegistration(input: {
    workspaceId: string;
    principalId: string;
    displayName: string;
    authorizationToken?: string;
    bootstrapCapability?: string;
  }): Promise<{ challengeId: string; options: CeremonyOptions }> {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const principalId = requireNonEmpty(input.principalId, "principalId");
    const displayName = requireNonEmpty(input.displayName, "displayName");
    const now = nowMs();

    const registration = this.db.transaction(() => {
      const workspace = this.db.prepare("SELECT workspace_id FROM cursus_workspaces WHERE workspace_id = ?").get(workspaceId) as { workspace_id: string } | undefined;
      if (!workspace) fail("workspace_not_found", 404, "Workspace must be created by the Cursus control plane");
      const owner = this.db.prepare("SELECT principal_id FROM cursus_principals WHERE workspace_id = ? AND is_owner = 1").get(workspaceId) as { principal_id: string } | undefined;
      if (!owner) {
        this.mustBootstrap(workspaceId, requireNonEmpty(input.bootstrapCapability, "workspace bootstrap capability"), now);
        const existing = this.db.prepare("SELECT workspace_id FROM cursus_principals WHERE principal_id = ?").get(principalId) as { workspace_id: string } | undefined;
        if (existing) fail("principal_workspace_mismatch", 409, "Principal already belongs to a workspace");
        return { bootstrap: true, principalId };
      }
      const authorizationToken = requireNonEmpty(input.authorizationToken, "workspace authorization");
      const authorization = this.mustAuthorize(workspaceId, authorizationToken, now);
      const authorizedOwner = this.db.prepare("SELECT is_owner FROM cursus_principals WHERE principal_id = ? AND workspace_id = ?").get(authorization.principal_id, workspaceId) as { is_owner: number } | undefined;
      if (!authorizedOwner?.is_owner) fail("owner_authorization_required", 403, "Only a workspace owner can register a principal");
      const existing = this.db.prepare("SELECT workspace_id FROM cursus_principals WHERE principal_id = ?").get(principalId) as { workspace_id: string } | undefined;
      if (existing && existing.workspace_id !== workspaceId) fail("principal_workspace_mismatch", 409, "Principal belongs to another workspace");
      if (!existing) {
        this.db.prepare("INSERT INTO cursus_principals (principal_id, workspace_id, display_name, is_owner, created_at) VALUES (?, ?, ?, 0, ?)").run(principalId, workspaceId, displayName, now);
      }
      return { bootstrap: false, principalId };
    })();

    const credentials = this.db.prepare("SELECT credential_id, transports_json FROM cursus_passkey_credentials WHERE principal_id = ? AND workspace_id = ?").all(registration.principalId, workspaceId) as Pick<CredentialRecord, "credential_id" | "transports_json">[];
    const options = await this.webauthn.registrationOptions({
      rpID: this.config.rpID,
      rpName: "Cursus",
      userID: encodeUserID(principalId),
      userName: principalId,
      userDisplayName: displayName,
      excludeCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: parseTransports(credential.transports_json) })),
    });
    const challengeId = randomUUID();
    if (registration.bootstrap) {
      this.db.transaction(() => {
        this.claimBootstrap(workspaceId, requireNonEmpty(input.bootstrapCapability, "workspace bootstrap capability"), challengeId, now);
        this.db.prepare("INSERT INTO cursus_webauthn_challenges (challenge_id, workspace_id, principal_id, display_name, ceremony_type, challenge, expires_at, created_at) VALUES (?, ?, ?, ?, 'registration', ?, ?, ?)").run(challengeId, workspaceId, principalId, displayName, options.challenge, now + this.challengeTtlMs, now);
      })();
    } else {
      this.db.prepare("INSERT INTO cursus_webauthn_challenges (challenge_id, workspace_id, principal_id, display_name, ceremony_type, challenge, expires_at, created_at) VALUES (?, ?, ?, ?, 'registration', ?, ?, ?)").run(challengeId, workspaceId, principalId, displayName, options.challenge, now + this.challengeTtlMs, now);
    }
    return { challengeId, options };
  }

  async finishRegistration(input: { workspaceId: string; challengeId: string; response: unknown; bootstrapCapability?: string }): Promise<{ principalId: string }> {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const challenge = this.consumeChallenge(workspaceId, requireNonEmpty(input.challengeId, "challengeId"), "registration");
    if (!challenge.principal_id) fail("invalid_challenge", 409, "Registration challenge has no principal");
    let verification: RegistrationVerification;
    try {
      verification = await this.webauthn.verifyRegistration({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.rpID,
      });
    } catch {
      fail("registration_verification_failed", 403, "Passkey registration verification failed");
    }
    const info = verification.verified ? verification.registrationInfo : undefined;
    if (!info) fail("registration_verification_failed", 403, "Passkey registration verification failed");
    const now = nowMs();
    try {
      this.db.transaction(() => {
        const principal = this.db.prepare("SELECT is_owner FROM cursus_principals WHERE principal_id = ? AND workspace_id = ?").get(challenge.principal_id, workspaceId) as { is_owner: number } | undefined;
        if (!principal) {
          this.consumeBootstrap(workspaceId, requireNonEmpty(input.bootstrapCapability, "workspace bootstrap capability"), challenge.challenge_id, now);
          this.db.prepare("INSERT INTO cursus_principals (principal_id, workspace_id, display_name, is_owner, created_at) VALUES (?, ?, ?, 1, ?)").run(challenge.principal_id, workspaceId, challenge.display_name ?? challenge.principal_id, now);
        }
        this.db.prepare("INSERT INTO cursus_passkey_credentials (credential_id, workspace_id, principal_id, public_key, counter, transports_json, device_type, backed_up, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(info.credentialID, workspaceId, challenge.principal_id, Buffer.from(info.credentialPublicKey), info.counter, info.transports ? JSON.stringify(info.transports) : null, info.credentialDeviceType, info.credentialBackedUp ? 1 : 0, now, now);
      })();
    } catch (error) {
      if (error instanceof CursusControlPlaneError) throw error;
      fail("credential_exists", 409, "Passkey credential already exists");
    }
    return { principalId: challenge.principal_id };
  }

  async beginAuthentication(input: { workspaceId: string }): Promise<{ challengeId: string; options: CeremonyOptions }> {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const credentials = this.db.prepare("SELECT credential_id, transports_json FROM cursus_passkey_credentials WHERE workspace_id = ?").all(workspaceId) as Pick<CredentialRecord, "credential_id" | "transports_json">[];
    if (credentials.length === 0) fail("no_passkeys", 404, "Workspace has no registered passkeys");
    const options = await this.webauthn.authenticationOptions({
      rpID: this.config.rpID,
      allowCredentials: credentials.map((credential) => ({ id: credential.credential_id, transports: parseTransports(credential.transports_json) })),
    });
    const now = nowMs();
    const challengeId = randomUUID();
    this.db.prepare("INSERT INTO cursus_webauthn_challenges (challenge_id, workspace_id, ceremony_type, challenge, expires_at, created_at) VALUES (?, ?, 'authentication', ?, ?, ?)").run(challengeId, workspaceId, options.challenge, now + this.challengeTtlMs, now);
    return { challengeId, options };
  }

  async finishAuthentication(input: { workspaceId: string; challengeId: string; response: unknown }): Promise<{ workspaceAuthorization: string; expiresAt: number; principalId: string }> {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const challenge = this.consumeChallenge(workspaceId, requireNonEmpty(input.challengeId, "challengeId"), "authentication");
    const credentialId = this.responseCredentialId(input.response);
    const credential = this.db.prepare("SELECT credential_id, workspace_id, principal_id, public_key, counter, transports_json, device_type, backed_up FROM cursus_passkey_credentials WHERE credential_id = ? AND workspace_id = ?").get(credentialId, workspaceId) as CredentialRecord | undefined;
    if (!credential) fail("unknown_credential", 403, "Passkey credential is not registered for this workspace");
    let verification: AuthenticationVerification;
    try {
      verification = await this.webauthn.verifyAuthentication({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.rpID,
        credential: {
          id: credential.credential_id,
          publicKey: Uint8Array.from(credential.public_key),
          counter: credential.counter,
          transports: parseTransports(credential.transports_json),
        },
      });
    } catch {
      fail("authentication_verification_failed", 403, "Passkey authentication verification failed");
    }
    const newCounter = verification.verified ? verification.authenticationInfo?.newCounter : undefined;
    if (newCounter === undefined || !Number.isInteger(newCounter) || newCounter < credential.counter) {
      fail("authentication_verification_failed", 403, "Passkey authentication verification failed");
    }
    const workspaceAuthorization = randomBytes(32).toString("base64url");
    const expiresAt = nowMs() + this.authorizationTtlMs;
    this.db.transaction(() => {
      const update = this.db.prepare("UPDATE cursus_passkey_credentials SET counter = ?, updated_at = ? WHERE credential_id = ? AND counter = ?").run(newCounter, nowMs(), credential.credential_id, credential.counter);
      if (update.changes !== 1) fail("credential_counter_conflict", 409, "Passkey credential changed during authentication");
      this.db.prepare("INSERT INTO cursus_workspace_authorization_sessions (token_hash, workspace_id, principal_id, credential_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(tokenHash(workspaceAuthorization), workspaceId, credential.principal_id, credential.credential_id, expiresAt, nowMs());
    })();
    return { workspaceAuthorization, expiresAt, principalId: credential.principal_id };
  }

  readSnapshot(workspaceId: string, authorizationToken: string): { workspaceId: string; revision: number; snapshot: unknown } {
    this.mustAuthorize(requireNonEmpty(workspaceId, "workspaceId"), requireNonEmpty(authorizationToken, "workspace authorization"), nowMs());
    const row = this.db.prepare("SELECT revision, snapshot_json FROM cursus_workspaces WHERE workspace_id = ?").get(workspaceId) as { revision: number; snapshot_json: string } | undefined;
    if (!row) fail("workspace_not_found", 404, "Workspace does not exist");
    return { workspaceId, revision: row.revision, snapshot: JSON.parse(row.snapshot_json) };
  }

  writeSnapshot(input: { workspaceId: string; expectedRevision: unknown; snapshot: unknown; authorizationToken: string }): { workspaceId: string; revision: number } {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    if (typeof input.expectedRevision !== "number" || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) fail("invalid_request", 400, "expectedRevision must be a non-negative integer");
    const expectedRevision = input.expectedRevision;
    this.mustAuthorize(workspaceId, requireNonEmpty(input.authorizationToken, "workspace authorization"), nowMs());
    let snapshotJson: string;
    try {
      snapshotJson = JSON.stringify(input.snapshot);
    } catch {
      fail("invalid_snapshot", 400, "snapshot must be JSON serializable");
    }
    if (snapshotJson === undefined) fail("invalid_snapshot", 400, "snapshot must be JSON serializable");
    const result = this.db.prepare("UPDATE cursus_workspaces SET snapshot_json = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND revision = ?").run(snapshotJson, nowMs(), workspaceId, expectedRevision);
    if (result.changes !== 1) {
      const row = this.db.prepare("SELECT revision FROM cursus_workspaces WHERE workspace_id = ?").get(workspaceId) as { revision: number } | undefined;
      if (!row) fail("workspace_not_found", 404, "Workspace does not exist");
      fail("revision_conflict", 409, "Workspace snapshot revision is stale", { revision: row.revision });
    }
    return { workspaceId, revision: expectedRevision + 1 };
  }

  issueReceipt(input: { workspaceId: string; authorizationToken: string; action: string; payload?: unknown; expiresInSeconds?: number }): { receipt: string; expiresAt: number } {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const authorization = this.mustAuthorize(workspaceId, requireNonEmpty(input.authorizationToken, "workspace authorization"), nowMs());
    const action = requireNonEmpty(input.action, "action");
    let payloadJson: string | null = null;
    if (input.payload !== undefined) {
      try {
        payloadJson = JSON.stringify(input.payload);
      } catch {
        fail("invalid_request", 400, "payload must be JSON serializable");
      }
      if (payloadJson === undefined) fail("invalid_request", 400, "payload must be JSON serializable");
    }
    const expiresInMs = input.expiresInSeconds === undefined ? this.receiptTtlMs : input.expiresInSeconds * 1000;
    if (!Number.isFinite(expiresInMs) || expiresInMs <= 0 || expiresInMs > this.receiptTtlMs) fail("invalid_request", 400, "expiresInSeconds is invalid");
    const receiptId = randomUUID();
    const receipt = `${receiptId}.${this.sign(receiptId)}`;
    const expiresAt = nowMs() + expiresInMs;
    this.db.prepare("INSERT INTO cursus_approval_receipts (receipt_id, receipt_hash, workspace_id, principal_id, action, payload_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(receiptId, tokenHash(receipt), workspaceId, authorization.principal_id, action, payloadJson, expiresAt, nowMs());
    return { receipt, expiresAt };
  }

  consumeReceipt(input: { workspaceId: string; authorizationToken: string; receipt: string }): { workspaceId: string; principalId: string; action: string; payload: unknown } {
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    this.mustAuthorize(workspaceId, requireNonEmpty(input.authorizationToken, "workspace authorization"), nowMs());
    const receipt = requireNonEmpty(input.receipt, "receipt");
    const [receiptId, signature, ...extra] = receipt.split(".");
    if (!receiptId || !signature || extra.length !== 0 || !this.signatureMatches(receiptId, signature)) fail("invalid_receipt", 403, "Approval receipt is invalid");
    const now = nowMs();
    const result = this.db.prepare("UPDATE cursus_approval_receipts SET consumed_at = ? WHERE receipt_id = ? AND receipt_hash = ? AND workspace_id = ? AND consumed_at IS NULL AND expires_at > ?").run(now, receiptId, tokenHash(receipt), workspaceId, now);
    if (result.changes !== 1) {
      const row = this.db.prepare("SELECT workspace_id, consumed_at, expires_at FROM cursus_approval_receipts WHERE receipt_id = ? AND receipt_hash = ?").get(receiptId, tokenHash(receipt)) as { workspace_id: string; consumed_at: number | null; expires_at: number } | undefined;
      if (row?.workspace_id !== workspaceId) fail("workspace_authorization_denied", 403, "Approval receipt is not valid for this workspace");
      if (row?.consumed_at) fail("receipt_already_consumed", 409, "Approval receipt was already consumed");
      if (row && row.expires_at <= now) fail("receipt_expired", 409, "Approval receipt has expired");
      fail("invalid_receipt", 403, "Approval receipt is invalid");
    }
    const row = this.db.prepare("SELECT principal_id, action, payload_json FROM cursus_approval_receipts WHERE receipt_id = ?").get(receiptId) as { principal_id: string; action: string; payload_json: string | null };
    return { workspaceId, principalId: row.principal_id, action: row.action, payload: row.payload_json ? JSON.parse(row.payload_json) : null };
  }

  private consumeChallenge(workspaceId: string, challengeId: string, type: ChallengeType): ChallengeRecord {
    const now = nowMs();
    const row = this.db.prepare("SELECT challenge_id, workspace_id, principal_id, display_name, ceremony_type, challenge, expires_at FROM cursus_webauthn_challenges WHERE challenge_id = ? AND workspace_id = ? AND ceremony_type = ?").get(challengeId, workspaceId, type) as ChallengeRecord | undefined;
    const result = this.db.prepare("UPDATE cursus_webauthn_challenges SET consumed_at = ? WHERE challenge_id = ? AND workspace_id = ? AND ceremony_type = ? AND consumed_at IS NULL AND expires_at > ?").run(now, challengeId, workspaceId, type, now);
    if (result.changes !== 1) {
      if (row && row.expires_at <= now) fail("challenge_expired", 409, "WebAuthn challenge has expired");
      fail("challenge_invalid_or_used", 409, "WebAuthn challenge is invalid or already used");
    }
    return row!;
  }
  private mustBootstrap(workspaceId: string, capability: string, now: number): void {
    const workspace = this.db.prepare("SELECT bootstrap_capability_hash, bootstrap_expires_at, bootstrap_consumed_at FROM cursus_workspaces WHERE workspace_id = ?").get(workspaceId) as { bootstrap_capability_hash: string; bootstrap_expires_at: number; bootstrap_consumed_at: number | null } | undefined;
    if (!workspace || workspace.bootstrap_consumed_at || workspace.bootstrap_expires_at <= now || workspace.bootstrap_capability_hash !== tokenHash(capability)) {
      fail("workspace_bootstrap_denied", 403, "Workspace bootstrap capability is invalid, expired, or already consumed");
    }
  }

  private claimBootstrap(workspaceId: string, capability: string, challengeId: string, now: number): void {
    const result = this.db.prepare("UPDATE cursus_workspaces SET bootstrap_claim_id = ?, updated_at = ? WHERE workspace_id = ? AND bootstrap_capability_hash = ? AND bootstrap_claim_id IS NULL AND bootstrap_consumed_at IS NULL AND bootstrap_expires_at > ?").run(challengeId, now, workspaceId, tokenHash(capability), now);
    if (result.changes !== 1) fail("workspace_bootstrap_denied", 403, "Workspace bootstrap capability is invalid, expired, already consumed, or already claimed");
  }

  private consumeBootstrap(workspaceId: string, capability: string, challengeId: string, now: number): void {
    const result = this.db.prepare("UPDATE cursus_workspaces SET bootstrap_consumed_at = ?, updated_at = ? WHERE workspace_id = ? AND bootstrap_capability_hash = ? AND bootstrap_claim_id = ? AND bootstrap_consumed_at IS NULL AND bootstrap_expires_at > ?").run(now, now, workspaceId, tokenHash(capability), challengeId, now);
    if (result.changes !== 1) fail("workspace_bootstrap_denied", 403, "Workspace bootstrap capability is invalid, expired, already consumed, or not bound to this ceremony");
  }


  private mustAuthorize(workspaceId: string, authorizationToken: string, now: number): AuthorizationRecord {
    const authorization = this.db.prepare("SELECT workspace_id, principal_id, credential_id, expires_at, revoked_at FROM cursus_workspace_authorization_sessions WHERE token_hash = ?").get(tokenHash(authorizationToken)) as AuthorizationRecord | undefined;
    if (!authorization || authorization.workspace_id !== workspaceId || authorization.revoked_at || authorization.expires_at <= now) {
      fail("workspace_authorization_denied", 403, "Workspace authorization is invalid, expired, or scoped to another workspace");
    }
    return authorization;
  }

  private responseCredentialId(response: unknown): string {
    if (!response || typeof response !== "object" || !("id" in response)) fail("invalid_request", 400, "Authentication response credential id is required");
    return requireNonEmpty((response as { id?: unknown }).id, "Authentication response credential id");
  }

  private sign(receiptId: string): string {
    return createHmac("sha256", this.config.receiptSigningSecret).update(receiptId).digest("base64url");
  }

  private signatureMatches(receiptId: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(receiptId));
    const provided = Buffer.from(signature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }
}

export function getCursusControlPlane(): CursusControlPlane {
  return new CursusControlPlane(getDb(), configFromEnvironment());
}
