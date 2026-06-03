-- Google Drive for Desktop mounts
CREATE TABLE IF NOT EXISTS google_drive_mounts (
  id          TEXT PRIMARY KEY,
  abs_path    TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
