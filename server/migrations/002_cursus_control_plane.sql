-- Dedicated Cursus control-plane state. Cabinet is the canonical authority.
CREATE TABLE IF NOT EXISTS cursus_workspaces (
  workspace_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  bootstrap_capability_hash TEXT NOT NULL UNIQUE,
  bootstrap_expires_at INTEGER NOT NULL,
  bootstrap_consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cursus_principals (
  principal_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK(is_owner IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_principals_workspace ON cursus_principals(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cursus_single_owner ON cursus_principals(workspace_id) WHERE is_owner = 1;

CREATE TABLE IF NOT EXISTS cursus_passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL REFERENCES cursus_principals(principal_id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL CHECK(counter >= 0),
  transports_json TEXT,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL CHECK(backed_up IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_credentials_workspace ON cursus_passkey_credentials(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cursus_credentials_principal ON cursus_passkey_credentials(principal_id);

CREATE TABLE IF NOT EXISTS cursus_webauthn_challenges (
  challenge_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  principal_id TEXT,
  display_name TEXT,
  ceremony_type TEXT NOT NULL CHECK(ceremony_type IN ('registration', 'authentication')),
  challenge TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_challenges_active ON cursus_webauthn_challenges(challenge_id, expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS cursus_workspace_authorization_sessions (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL REFERENCES cursus_principals(principal_id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL REFERENCES cursus_passkey_credentials(credential_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_authorizations_workspace ON cursus_workspace_authorization_sessions(workspace_id, expires_at);

CREATE TABLE IF NOT EXISTS cursus_approval_receipts (
  receipt_id TEXT PRIMARY KEY,
  receipt_hash TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL REFERENCES cursus_principals(principal_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload_json TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_receipts_workspace ON cursus_approval_receipts(workspace_id, expires_at, consumed_at);
