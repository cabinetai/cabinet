CREATE TABLE IF NOT EXISTS gmail_credentials (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  method        TEXT NOT NULL DEFAULT 'imap',
  email         TEXT NOT NULL,
  imap_password TEXT NOT NULL  -- App Password, encrypted with AES-256-GCM
);

CREATE TABLE IF NOT EXISTS gmail_index (
  message_id    TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  subject       TEXT,
  sender        TEXT,
  date          TEXT,
  snippet       TEXT,
  body_text     TEXT,
  labels        TEXT,
  indexed_at    TEXT NOT NULL
);
