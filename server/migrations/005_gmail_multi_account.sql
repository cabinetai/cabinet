-- Multi-account Gmail: credentials rows are keyed by lowercased email instead
-- of the single 'default' row. Migrate the existing row in place.
UPDATE gmail_credentials SET id = lower(email) WHERE id = 'default';

-- Track which account each indexed message came from ('' = pre-multi-account
-- rows; they belonged to the only connected account at the time).
ALTER TABLE gmail_index ADD COLUMN account TEXT NOT NULL DEFAULT '';
