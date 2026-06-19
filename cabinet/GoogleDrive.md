# Google Drive Integration Plan

## Goal

Surface Google Drive folders as a separate "Google Drive" section in Cabinet's sidebar, alongside local documents. Users choose which folders to mount. Full agent and task access is included.

The integration is delivered in two independent phases. Phase 1 ships a complete, fully-functional experience using Google Drive for Desktop. Phase 2 adds an OAuth path for users who cannot or do not want to install the desktop app, and brings Drive files to full parity with local files for agents and tasks.

---

## Phase 1 — Google Drive for Desktop

**Scope:** human browsing + full agent/task access, read & write, zero auth code.

### How it works

Google Drive for Desktop mounts the user's Drive as a real local filesystem path. Cabinet treats it exactly like any other local directory — the existing `tree-builder.ts`, `fs-operations.ts`, `page-io.ts`, git auto-commit, search indexer, and agent file-reading all work with no changes.

### Setup flow

On first visit to Settings → Integrations → Google Drive, Cabinet probes known mount paths:

- `~/Library/CloudStorage/GoogleDrive-*/My Drive` (macOS)
- `~/Google Drive/My Drive` (macOS legacy)
- `%USERPROFILE%\Google Drive\My Drive` (Windows)

**If detected:**

```
✓ Google Drive for Desktop detected
  ~/Library/CloudStorage/GoogleDrive-user@gmail.com/My Drive

  Folders to show in Cabinet:
  ☑ My KB Folder
  ☑ Team Docs
  [+ Browse…]
```

No credentials, no tokens, no setup. User picks folders and they appear immediately.

**If not detected:**

```
Google Drive for Desktop is not installed.

  [Download Google Drive for Desktop ↗]   [Re-check]

  ──── or ────

  Already using OAuth? → Set up API connection (Phase 2)
```

The OAuth option is surfaced here as a forward reference but is greyed out / labelled "coming soon" until Phase 2 ships.

### Read & Write

- **Plain files (`.md`, `.pdf`, images, etc.):** full read + write via the filesystem. Drive for Desktop syncs changes to the cloud automatically.
- **Native Google formats (`.gdoc`, `.gsheet`, `.gslide`):** these are shortcut files on the local mount containing the Drive URL. Cabinet renders them as **read-only iframe embeds** pointing to the Google editor. The edit toolbar is hidden for these files.

### Agent & task access

Full — agents see Drive files exactly like local files because they *are* local files. Search indexing (chokidar watcher), context injection, file-reading tools all work transparently.

### Folder picker

A filesystem folder browser modal scoped to the detected Drive root. Selected folder paths are saved to `.cabinet.db`:

```sql
CREATE TABLE IF NOT EXISTS google_drive_mounts (
  id           TEXT PRIMARY KEY,             -- uuid
  abs_path     TEXT NOT NULL UNIQUE,         -- absolute local path (Phase 1)
  folder_name  TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  added_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tree integration

Mounts appear inline in the main file tree, directly after the local cabinet
documents — there is no separate "Google Drive" root section or section header:

```
▾ 📁 Getting Started
   📄 Design
   📄 Development
   ...
▾ ☁ My KB Folder        ← mounted Drive folder, inline with local docs
   📄 Design Doc
   📝 Meeting Notes.md
▾ ☁ Team Docs
   ...
```

- The existing `buildTreeRecursive` is called with each mount's absolute path.
- Nodes get a `source: "google-drive"` annotation; it's used for styling — each
  mount's root row renders with a ☁ cloud glyph (the only marker distinguishing
  it from a local folder) and native Google-format nodes are flagged read-only.
- Each mount is an independent collapsible folder; expansion state persisted in localStorage.
- 60-second tree cache for Drive (vs. 5-second for local). No manual refresh
  button — the sidebar force-refetches when a folder is mounted/unmounted, via
  the `cabinet:gdrive-mounts-changed` event.
- Clicking a Drive file opens it in the right-hand viewer.
- Native Google format nodes (`.gdoc` etc.) show a read-only indicator.

### New files (Phase 1)

```
src/
  lib/
    google-drive/
      detect-desktop.ts          ← probe known mount paths, return { path } | null
      tree-builder.ts            ← build tree nodes from a mount path (source: "google-drive")
      paths.ts                   ← gdrive: path encode/decode helpers
  components/
    settings/
      google-drive-section.tsx   ← detection UI, folder mount manager, folder-picker dialog
    sidebar/
      google-drive-tree.tsx      ← renders mounts inline in the file tree
```

---

## Phase 2 — OAuth + Drive API (full parity)

**Scope:** users without Drive for Desktop; read + write for plain files; full agent/task access via search indexing + content API. Two auth methods are supported: user OAuth (personal accounts) and Service Account (teams).

### Read & Write

Phase 2 supports full read + write for plain files (`.md`, `.pdf`, images, etc.) via the Drive API, for both auth methods. Cabinet requests `drive.file` scope — access only to files the user explicitly opens or adds via Cabinet, not the entire Drive.

On save, Cabinet calls `files.update` instead of `fs.writeFile`. From the user's perspective the experience is identical to local files: edits are saved automatically and synced to Drive.

**Native Google formats (Docs, Sheets, Slides) are read-only regardless of connection method** — they are rendered as iframe embeds. Writing them would require round-tripping through Google's export/import formats, which destroys formatting.

### Auth methods

Phase 2 supports two ways to authenticate, selectable in the setup UI:

**User OAuth** (personal / small team)
Standard Google OAuth flow. Each user connects their own Google account. Best for individuals or small teams where everyone has their own Cabinet instance.

**Service Account** (teams / organizations)
An admin creates a Google Service Account in GCP, downloads a JSON key file, and shares the relevant Drive folders with the service account's email address (`name@project.iam.gserviceaccount.com`). The JSON key is pasted or uploaded into Cabinet settings — no browser redirect, no per-user consent screen. One key covers the whole team. Best for shared Cabinet deployments where an admin manages access centrally.

```
Settings → Integrations → Google Drive → Set up API connection

  How would you like to connect?

  ○ My Google account (personal / OAuth)
    Each user connects their own account.

  ○ Service Account (teams)
    Admin uploads a JSON key. All users share one connection.
    [Upload service-account.json]
```

Both methods use `drive.file` scope and produce the same read + write experience in Cabinet. The difference is only in how credentials are obtained and stored.

Service Account credentials are stored in the shared `google_credentials` table in `.cabinet.db` — see [GoogleAuth.md](GoogleAuth.md).

### Setup flow

1. User opens Settings → Integrations → Google Drive → "Set up API connection"
2. Cabinet prompts the user to choose a connection method — see [GoogleAuth.md](GoogleAuth.md) for the full auth flow (Cabinet's shared OAuth app vs. user's own credentials)
3. Before connecting, Cabinet shows a clear permissions summary:

```
┌─────────────────────────────────────────────────────┐
│  Cabinet will be able to:                           │
│  ✅  View and edit files in your selected folders   │
│  ✅  Search Drive files from within Cabinet         │
│  ✅  Use Drive files as agent/task context          │
│                                                     │
│  Cabinet will NOT be able to:                       │
│  ❌  Access files outside the folders you choose    │
│  ❌  Delete files                                   │
│                                                     │
│  Native Google Docs/Sheets/Slides are view-only.   │
│  All other files are fully editable in Cabinet.     │
│                                                     │
│  [Connect]                                          │
└─────────────────────────────────────────────────────┘
```

5. Browser opens to Google consent screen
6. Google redirects to `http://localhost:PORT/api/google-drive/callback`
7. Tokens stored in `.cabinet.db`. UI shows "Connected as user@gmail.com"
8. User picks folders via the Drive folder picker modal (fetches Drive API, not filesystem)

### Agent & task access (OAuth)

Unlike Phase 1, Drive files are not on disk — so three things must be built to give agents full access:

1. **Search indexing** — a background job in the daemon periodically fetches file content from the Drive API and writes it into Cabinet's existing SQLite FTS index. Runs on daemon startup, on mount add/remove, and on a configurable schedule (default: every 15 minutes). The daemon's chokidar watcher is not used here.

2. **Content resolution** — file paths use a `gdrive://<mountId>/<fileId>` scheme. When an agent or task references such a path, the content resolver calls `/api/google-drive/file/:id/content` instead of reading local disk. This requires a small routing shim in the file-reading layer.

3. **Context injection** — the agent composer's "attach file" flow handles `gdrive://` nodes the same as local nodes: fetches content via the content API and injects it as context. The Drive section is fully browsable in the attachment picker.

### New API routes (Phase 2)

```
POST   /api/google-drive/connect           → initiate OAuth, return auth URL
GET    /api/google-drive/callback          → exchange code, store tokens
DELETE /api/google-drive/disconnect        → revoke token, clear DB
GET    /api/google-drive/status            → { connected, email, authMethod }
GET    /api/google-drive/folders?parentId  → list subfolders (for picker UI)
POST   /api/google-drive/mounts            → add mount { folderId, folderName }
DELETE /api/google-drive/mounts/:id        → remove mount
GET    /api/google-drive/file/:id/content  → stream file content
PATCH  /api/google-drive/file/:id          → write updated content
POST   /api/google-drive/index             → trigger manual re-index
```

### DB additions (Phase 2)

Extend the `google_drive_mounts` table with OAuth-specific columns:

```sql
-- extend Phase 1 table
ALTER TABLE google_drive_mounts ADD COLUMN folder_id TEXT;   -- Drive folder ID (OAuth)
ALTER TABLE google_drive_mounts ADD COLUMN source TEXT DEFAULT 'desktop'; -- 'desktop' | 'oauth'

-- OAuth tokens are stored in the shared google_credentials table (see GoogleAuth.md).
-- No separate google_drive_credentials table — auth is shared across all Google integrations.

CREATE TABLE IF NOT EXISTS google_drive_index (
  file_id       TEXT PRIMARY KEY,
  mount_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  content       TEXT,           -- extracted plain text for FTS
  indexed_at    TEXT NOT NULL
);
```

### New files (Phase 2, additions to Phase 1)

```
src/
  lib/
    google-drive/
      oauth.ts              ← token management, auto-refresh
      drive-client.ts       ← googleapis SDK wrapper
      tree-builder.ts       ← Drive API folder listing → TreeNode[]
      mime-types.ts         ← Drive MIME → Cabinet node type
      indexer.ts            ← fetch + index Drive file content for FTS
      content-resolver.ts   ← gdrive:// path → content (used by agents)
  app/api/google-drive/
    connect/route.ts
    callback/route.ts
    disconnect/route.ts
    status/route.ts
    folders/route.ts
    mounts/route.ts
    index/route.ts
    file/[fileId]/
      content/route.ts
```

---

## Capability Comparison

| Capability | Phase 1 (Desktop) | Phase 2 (OAuth) |
|---|---|---|
| Read plain files | ✅ filesystem | ✅ Drive API |
| Write plain files | ✅ filesystem | ✅ Drive API (`files.update`) |
| Read native Docs/Sheets/Slides | ✅ iframe embed | ✅ iframe embed |
| Write native Docs/Sheets/Slides | ❌ | ❌ |
| Full-text search in Cabinet | ✅ (existing indexer) | ✅ (new Drive indexer) |
| Agent/task file access | ✅ transparent | ✅ via content resolver |
| Agent context injection | ✅ transparent | ✅ via content API |
| Works without desktop app | ❌ | ✅ |
| Setup complexity | minimal | moderate |

---

## Out of Scope (both phases)

- Real-time collaborative editing of Google Docs inside Cabinet
- Conflict resolution when Drive syncs a file Cabinet has open
- Shared drives / team drives (only "My Drive" supported initially)
- Per-file permissions or sharing controls
