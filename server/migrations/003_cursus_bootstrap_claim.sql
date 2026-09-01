-- Bind a bootstrap capability to exactly one pending owner-registration ceremony.
ALTER TABLE cursus_workspaces ADD COLUMN bootstrap_claim_id TEXT;
