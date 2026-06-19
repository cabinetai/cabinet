# Google Authentication

Shared auth layer for all Cabinet × Google integrations (Drive, Gmail, and any future Google services).

---

## Who needs this

| Setup | Needs Google Auth? |
|---|---|
| Google Drive via **Drive for Desktop** | ❌ No — Drive mounts as a local folder, Cabinet reads it like any other directory. No credentials, no OAuth, no GCP. |
| Google Drive via **OAuth API** | ✅ Yes |
| Gmail | ✅ Yes |

If a user connects Drive via Drive for Desktop and never uses Gmail, they never touch this auth layer at all.

If a user wants Gmail **and** uses Drive for Desktop for Drive, they only need OAuth for Gmail — not for Drive.

---

## One connection for everything

Cabinet connects to Google once. A single OAuth token covers all Google services the user enables. Scopes are additive — Cabinet requests only what it needs based on which integrations are active:

| Integration | Scope added |
|---|---|
| Google Drive (read-only) | `drive.readonly` |
| Google Drive (read + write) | `drive.file` |
| Gmail (read) | `gmail.readonly` |
| Gmail (send) | `gmail.send` |

If the user enables Drive and Gmail, Cabinet requests both scopes in a single consent screen — one click, one token, one refresh cycle. Tokens are stored in a single `google_credentials` table in `.cabinet.db`.

When a new integration is enabled later, Cabinet re-runs the OAuth flow with the expanded scope set. Google shows a new consent screen listing the added permissions; existing tokens are replaced.

---

## Two ways to connect

Settings → Integrations → Google shows this choice before any connection is made:

```
How would you like to connect your Google account?

○ Use Cabinet's Google app  (recommended)
  One click, no setup required. Uses Cabinet's registered
  OAuth app. Your account appears in Cabinet's Google Cloud
  console as an authorized user, but no data leaves your
  machine.

○ Use my own Google credentials  (advanced)
  Full privacy — your GCP project, your OAuth app, no
  third-party app identity involved. Requires a one-time
  setup in Google Cloud Console.
  [Show setup instructions ▾]
```

Both options produce an identical result: an OAuth token stored locally in `.cabinet.db`. Cabinet's behavior, performance, and data handling are the same either way. The only difference is whose client ID and secret were used.

---

## Option 1: Cabinet's shared OAuth app

### How it works

Cabinet ships with a pre-registered Google Cloud OAuth app. The user clicks "Connect", a browser window opens to Google's consent screen, they approve, and the token is stored locally. No configuration needed.

### Limitations

**Google verification requirement**
Google requires apps using sensitive scopes (`gmail.readonly`, `drive.readonly`, etc.) to pass an OAuth verification review before they can be used by the general public. Until verified:
- Users see a warning: *"This app isn't verified"* with a scary caution screen
- Users must click "Advanced → Go to Cabinet (unsafe)" to proceed
- The app is limited to **100 authorized users total** across all Cabinet installs

Verification involves submitting the app to Google for manual review (privacy policy, security assessment, sometimes a video demo). It can take several weeks and must be renewed if scopes change.

**Privacy optics**
The OAuth client is registered under Cabinet's Google Cloud project. Privacy-conscious users will notice that a third-party app identity is involved, even though no data leaves their machine. This is at odds with Cabinet's local-first story for users who look closely.

**Single point of failure**
If Cabinet's GCP project is suspended, the client secret rotates unexpectedly, or Google revokes the app, every user's Google connection breaks simultaneously.

**Verdict:** Good for convenience and mainstream users. Not ideal until verification is complete — unverified warning screen will deter cautious users.

---

## Option 2: User's own Google credentials

### How it works

The user creates their own Google Cloud project and OAuth app. Cabinet uses those credentials to run the same OAuth flow. The user's project is under their own Google account — no Cabinet involvement.

### Setup instructions (shown inline in Cabinet)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → Create a new project
2. Enable the APIs you need:
   - **Google Drive API** (if using Drive via OAuth)
   - **Gmail API** (if using Gmail)
3. Go to APIs & Services → OAuth consent screen
   - User type: **External**
   - Fill in app name (e.g. "My Cabinet"), your email, no logo required
   - Add scopes: select the ones Cabinet needs (shown in the instructions)
   - Add your own Google account as a **test user**
   - Status can stay **Testing** — you are the only user, no verification needed
4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Download or copy the Client ID and Client Secret
5. Paste them into Cabinet:

```
Google Client ID:      [________________________]
Google Client Secret:  [________________________]
                       [Save and Connect →]
```

Credentials are saved to `.cabinet.env`. Cabinet then runs the standard OAuth flow using these credentials.

### Why "Testing" status is fine for personal use

When an OAuth app is in Testing status, it is limited to explicitly listed test users. Since the user adds only their own account, this limit is irrelevant. No verification review is needed. No scary warning screen (the consent screen still appears but without the "unverified app" banner for the owner's account).

### Advantages over the shared app

- No third-party app identity — fully under the user's control
- No dependency on Cabinet's GCP project
- No verification delays or 100-user cap concerns
- Aligns with Cabinet's local-first, self-hosted philosophy

---

## Database

Both OAuth options store their token in this table. Service Account connections
(see [GoogleDrive.md](GoogleDrive.md), [Gmail.md](Gmail.md)) store their JSON key
in the same table, distinguished by `auth_type`:

```sql
CREATE TABLE IF NOT EXISTS google_credentials (
  id                  TEXT PRIMARY KEY DEFAULT 'default',
  auth_type           TEXT NOT NULL DEFAULT 'oauth',    -- 'oauth' | 'service_account'
  client_source       TEXT NOT NULL DEFAULT 'cabinet',  -- 'cabinet' | 'user' (OAuth only)
  access_token        TEXT,            -- OAuth only
  refresh_token       TEXT,            -- OAuth only
  token_expiry        TEXT,            -- ISO8601 (OAuth only)
  service_account_key TEXT,            -- JSON key file contents (service account only)
  email               TEXT,
  scopes              TEXT             -- JSON array of active scopes
);
```

`auth_type` distinguishes OAuth connections (which populate `access_token` /
`refresh_token` / `token_expiry`) from Service Account connections (which populate
`service_account_key`). `client_source` records which OAuth option the user chose,
so Cabinet can display the correct status in Settings and use the right client
ID/secret on token refresh.

---

## Token lifecycle

- Access tokens expire after 1 hour. Cabinet refreshes them automatically using the stored refresh token before any API call.
- Refresh tokens do not expire unless the user revokes access in their Google Account settings or the OAuth app is deleted.
- On disconnect (Settings → Google → Disconnect), Cabinet revokes the token via the Google OAuth revocation endpoint and clears the DB row.

---

## Adding a new Google integration later

When a future Google integration (e.g. Google Calendar) is enabled, Cabinet:
1. Checks the current active scopes in `google_credentials.scopes`
2. If the new scope is not present, triggers a re-authorization flow with the full scope set (existing + new)
3. Replaces the stored token with the newly issued one
4. Updates `google_credentials.scopes`

The user sees one incremental consent screen asking only for the new permission.
