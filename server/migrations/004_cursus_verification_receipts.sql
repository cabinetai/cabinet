-- Server-issued verification evidence for Cursus completion transitions.
CREATE TABLE IF NOT EXISTS cursus_verification_receipts (
  receipt_id TEXT PRIMARY KEY,
  receipt_hash TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES cursus_workspaces(workspace_id) ON DELETE CASCADE,
  report_json TEXT NOT NULL,
  snapshot_revision INTEGER NOT NULL CHECK(snapshot_revision >= 0),
  snapshot_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cursus_verification_receipts_workspace
  ON cursus_verification_receipts(workspace_id, expires_at, consumed_at);
