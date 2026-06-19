# Gmail Integration Plan

## Goal

Give Cabinet agents the ability to read, search, and summarize emails, and send emails as part of task execution. Gmail is not a document store — it is a **live data source and action channel** for agents, not a sidebar tree of files.

---

## How Gmail fits into Cabinet's architecture

Cabinet agents today read context from the knowledge base (files) and act via LAUNCH_TASK / SCHEDULE_JOB actions. Gmail adds two new capabilities:

1. **Inbox as agent context** — agents can query Gmail (search, read threads, summarize) during a conversation or heartbeat, the same way they read KB files.
2. **Send as agent action** — agents can propose sending an email as a task output, subject to human approval before dispatch (same approval gate as LAUNCH_TASK).

Gmail data does **not** appear as a file tree in the sidebar. Instead it surfaces through:
- Agent tool access (agents query Gmail on demand during tasks)
- KB pages written by agents (e.g. a daily digest page created by a heartbeat job)
- Scheduled heartbeat jobs (e.g. "every morning summarize my inbox")

The only Gmail UI in Cabinet is a **connection status indicator** in Settings → Integrations → Gmail (connected account, last sync time, reconnect / disconnect). Users read email in Gmail itself.

---

## Two phases

| | Phase 1 | Phase 2 |
|---|---|---|
| Connection | IMAP + SMTP (App Password) | Gmail API (OAuth) |
| Setup complexity | minimal — no GCP, no OAuth | moderate — see [GoogleAuth.md](GoogleAuth.md) |
| Read emails | ✅ | ✅ |
| Basic search (date, sender, subject, unread) | ✅ | ✅ |
| Advanced search (labels, `has:attachment`, full-text, `is:important`) | ❌ | ✅ |
| Send email (human-approved) | ✅ via SMTP | ✅ |
| Reply to thread | ✅ | ✅ |
| Gmail labels | ⚠️ appear as folders only | ✅ native |
| Works without GCP project | ✅ | depends on auth method |
| Service Account (Workspace) | ❌ | ✅ |

---

## Phase 1 — IMAP / SMTP (App Password)

### How it works

Gmail supports standard IMAP for reading and SMTP for sending — the same protocols used by Outlook, Apple Mail, and Thunderbird. No GCP project, no OAuth app, no browser redirect. The user generates a Google **App Password** (a 16-character token Google issues for third-party mail clients) and pastes it into Cabinet.

App Passwords require **2-Step Verification** to be enabled on the Google account. If 2SV is off, the user must enable it first (Google requires this for security).

### Setup flow

Settings → Integrations → Gmail

```
Connect Gmail via IMAP

  Gmail address:   [user@gmail.com          ]
  App Password:    [xxxx xxxx xxxx xxxx     ]

  How to get an App Password:
  1. Go to myaccount.google.com/security
  2. Under "How you sign in to Google", open 2-Step Verification
  3. Scroll to the bottom → App passwords
  4. Select app: Mail, device: Other → name it "Cabinet"
  5. Copy the 16-character password and paste it above

  [Connect]
```

Credentials stored in `.cabinet.db` (password encrypted at rest). Cabinet immediately tests the connection on save.

### What IMAP can do for agents

| Query | Supported |
|---|---|
| All emails from yesterday | ✅ `SINCE` / `BEFORE` date filters |
| Emails from a specific sender | ✅ `FROM` filter |
| Unread emails | ✅ `UNSEEN` flag |
| Subject contains keyword | ✅ `SUBJECT` filter |
| Full-text body search | ⚠️ slow, works on recent mail |
| Has attachment | ❌ not standard IMAP |
| Gmail label filtering | ⚠️ labels appear as IMAP folders |
| `is:important` / starred | ⚠️ mapped to IMAP flags, unreliable |

This covers the large majority of practical agent use cases: "summarize my inbox from today", "find emails from Alice this week", "fetch all unread emails", "check if anyone replied to my budget email".

### Agent tools (Phase 1)

| Tool | What it does |
|---|---|
| `email_search(criteria)` | Search by date, sender, subject, flags. Returns message summaries. |
| `email_read_thread(messageId)` | Fetch full content of a message and its thread. |
| `email_get_unread(maxResults)` | Fetch unread messages, newest first. |
| `email_send(to, subject, body)` | Send a new email via SMTP (requires human approval). |
| `email_reply(messageId, body)` | Reply to an existing thread via SMTP (requires human approval). |

Tool names use `email_` prefix (not `gmail_`) so they work generically — Phase 2 replaces the implementation, not the interface. Agents written in Phase 1 continue to work in Phase 2 without changes.

### Send flow (Phase 1)

Sending always goes through the human approval gate:

```
Agent wants to send an email:

  To:       alice@example.com
  Subject:  Re: Q3 budget review
  Body:
    Hi Alice, following up on the Q3 budget thread.
    The numbers look good — let's proceed.

  [Send]   [Edit]   [Reject]
```

Cabinet sends via SMTP using the stored App Password credentials.

### Search indexing

A background indexer in the daemon fetches recent emails (last N days, configurable) via IMAP, extracts plain text, and writes to a `gmail_index` FTS table in `.cabinet.db`. Re-runs on a schedule (default: every 15 minutes). Enables agents to find relevant email context passively during heartbeats without an explicit tool call.

### New API routes (Phase 1)

```
POST   /api/gmail/connect         → test + store IMAP/SMTP credentials
DELETE /api/gmail/disconnect      → clear credentials
GET    /api/gmail/status          → { connected, email, method, lastSync }
GET    /api/gmail/search?q=...    → IMAP search
GET    /api/gmail/thread/:id      → full thread content
POST   /api/gmail/send            → send approved email via SMTP
POST   /api/gmail/reply           → reply to thread via SMTP
POST   /api/gmail/index           → trigger manual re-index
```

### DB additions (Phase 1)

```sql
-- IMAP/SMTP credentials (Phase 1 only — not OAuth tokens)
CREATE TABLE IF NOT EXISTS gmail_credentials (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  method        TEXT NOT NULL DEFAULT 'imap',  -- 'imap' | 'oauth'
  email         TEXT NOT NULL,
  imap_password TEXT          -- encrypted App Password
  -- imap_host and smtp_host are intentionally omitted as writable columns.
  -- The implementation must hardcode 'imap.gmail.com' and 'smtp.gmail.com'
  -- in the connection layer and never accept these values from user input or
  -- API payloads. Allowing arbitrary hosts would enable credential phishing
  -- (an attacker-controlled server receiving the App Password in plaintext).
);

-- Phase 2 note: OAuth tokens for Gmail are stored in the shared google_credentials
-- table (see GoogleAuth.md) alongside Drive tokens. gmail_credentials is only used
-- for IMAP/SMTP App Passwords which are not Google OAuth credentials.

CREATE TABLE IF NOT EXISTS gmail_index (
  message_id    TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  subject       TEXT,
  sender        TEXT,
  date          TEXT,
  snippet       TEXT,
  body_text     TEXT,
  labels        TEXT,          -- JSON array
  indexed_at    TEXT NOT NULL
);
```

### New source files (Phase 1)

```
src/
  lib/
    gmail/
      imap-client.ts        ← IMAP connection + search + read
      smtp-client.ts        ← SMTP send + reply
      indexer.ts            ← fetch + index emails for FTS
      tools.ts              ← agent tool definitions (email_search, email_read_thread, etc.)
  components/
    settings/
      gmail-section.tsx     ← IMAP setup form + status indicator
      send-approval.tsx     ← approval UI for pending send actions
  types/
    actions.ts              ← add SEND_EMAIL action type
  lib/agents/
    action-dispatcher.ts    ← handle SEND_EMAIL dispatch
  app/api/gmail/
    connect/route.ts
    disconnect/route.ts
    status/route.ts
    search/route.ts
    thread/[id]/route.ts
    send/route.ts
    reply/route.ts
    index/route.ts
```

---

## Phase 2 — Gmail API (OAuth)

**Scope:** replaces IMAP/SMTP with the Gmail API for users who want full Gmail features. The agent tool interface (`email_search`, `email_read_thread`, etc.) stays identical — only the implementation underneath changes.

### Why upgrade

| Limitation in Phase 1 | Resolved in Phase 2 |
|---|---|
| No `has:attachment` search | ✅ full Gmail search operators |
| Labels unreliable via IMAP | ✅ native Gmail label API |
| `is:important` not available | ✅ Gmail importance signals |
| Slow full-text search | ✅ fast server-side Gmail search |
| Polling only | ✅ Gmail push notifications (webhook) |

### Connection

OAuth via [GoogleAuth.md](GoogleAuth.md) — user chooses Cabinet's shared app or their own credentials. Scopes requested:
- `gmail.readonly` for read/search
- `gmail.send` for send/reply (prompted on first send action)

**Service Account** (Google Workspace only): admin uploads a JSON key, no per-user OAuth needed. See [GoogleAuth.md](GoogleAuth.md).

### Setup flow

Settings → Integrations → Gmail shows both options:

```
Connect Gmail

  ○ App Password (IMAP)         ← already set up / switch method
  ● Gmail API (OAuth)           ← upgrading to full features

  [Connect via Google →]
```

Existing IMAP credentials are preserved — user can switch back if needed. The `gmail_index` table is reused; a full re-index runs after switching.

### New API routes (Phase 2, additions)

```
POST   /api/gmail/connect/oauth   → initiate OAuth, return auth URL
GET    /api/gmail/callback        → exchange code, store tokens
GET    /api/gmail/labels          → list Gmail labels
POST   /api/gmail/webhook         → receive Gmail push notifications
```

### New source files (Phase 2, additions)

```
src/
  lib/
    gmail/
      oauth-client.ts       ← Gmail API client (replaces imap/smtp for API path)
      push-notifications.ts ← Gmail webhook handler for real-time updates
```

---

## Capability summary

| Capability | Phase 1 (IMAP) | Phase 2 (Gmail API) |
|---|---|---|
| Read emails | ✅ | ✅ |
| Search by date / sender / subject | ✅ | ✅ |
| Full Gmail search operators | ❌ | ✅ |
| Gmail labels | ⚠️ folders only | ✅ native |
| `has:attachment`, `is:important` | ❌ | ✅ |
| Full-text body search | ⚠️ slow | ✅ fast |
| Send email (human-approved) | ✅ SMTP | ✅ |
| Reply to thread (human-approved) | ✅ SMTP | ✅ |
| Real-time push updates | ❌ polling | ✅ |
| FTS index for passive agent discovery | ✅ | ✅ |
| Heartbeat inbox digests | ✅ | ✅ |
| GCP project required | ❌ | depends on auth method |
| Service Account (Workspace) | ❌ | ✅ |
| Autonomous send (no approval) | ❌ never | ❌ never |
| Delete / modify emails | ❌ never | ❌ never |

---

## Agent recipes

Copy-paste starting points for Gmail-connected agents. Each recipe is a persona prompt snippet or heartbeat job config.

---

### Daily inbox digest

**What it does:** Every morning, fetches unread emails, groups them by topic, and writes a summary page to the KB.

**Heartbeat schedule:** `0 8 * * *` (8am daily)

**Persona prompt:**
```
You are an inbox assistant. Every morning:
1. Use email_get_unread to fetch all unread emails from the last 24 hours.
2. Group them by topic or sender.
3. Write a concise summary to `gmail/daily-digest.md` with:
   - A one-line summary per thread
   - Any emails that require a response flagged with ⚠️
   - Any deadlines or dates mentioned
4. Mark the digest with today's date as the title.
```

---

### Action items extractor

**What it does:** Scans the last 7 days of email, finds anything requiring a response or action, and creates a KB task list.

**Run:** manually or on a weekly schedule

**Persona prompt:**
```
Search emails from the last 7 days using email_search.
For each email that requires a response or contains an action item:
- Note the sender, subject, and what's needed
- Write the list to `gmail/action-items.md`
- Flag items with a deadline as urgent

Do not include newsletters, notifications, or automated emails.
```

---

### Thread monitor

**What it does:** Polls for a reply to a specific thread and notifies the user when it arrives by writing to the KB.

**Heartbeat schedule:** `0 * * * *` (every hour)

**Persona prompt:**
```
Use email_search to check if there are any new emails from alice@example.com
with the subject containing "contract".

If a new email is found that wasn't in yesterday's check:
1. Read the full thread with email_read_thread.
2. Summarize the reply in `gmail/contract-thread-update.md`.
3. Prepend ⚡ NEW REPLY to the file title.

If no new email, do nothing.
```

---

### Draft reply assistant

**What it does:** Reads a thread, drafts a reply based on context from the KB, and proposes it for human approval before sending.

**Run:** manually, triggered by the user in a conversation

**Example user prompt:**
> "Read the latest email from Bob about the Q3 budget and draft a reply using my notes in `projects/budget-q3.md`"

**What the agent does:**
1. Calls `email_search(from:bob subject:Q3 budget)` to find the thread
2. Calls `email_read_thread` to read the full context
3. Reads `projects/budget-q3.md` from the KB
4. Drafts a reply combining both sources
5. Proposes a `SEND_EMAIL` action — user sees the draft and clicks Send / Edit / Reject

---

### Weekly sender summary

**What it does:** Every Friday, summarizes who you've been emailing most, useful for relationship tracking.

**Heartbeat schedule:** `0 17 * * 5` (Friday 5pm)

**Persona prompt:**
```
Use email_search to fetch emails from the last 7 days.
Count emails sent and received per contact.
Write a summary to `gmail/weekly-connections.md`:
- Top 5 people you exchanged emails with
- Any thread that's gone quiet for more than 3 days that might need a follow-up
```

---

### Smart follow-up reminder

**What it does:** Finds emails you sent that haven't received a reply in 3+ days and surfaces them as follow-up candidates.

**Heartbeat schedule:** `0 9 * * 1,3,5` (Mon/Wed/Fri mornings)

**Persona prompt:**
```
Search for emails sent in the last 7 days that have no reply yet
using email_search.

For each unanswered sent email older than 3 days:
- Note the recipient, subject, and date sent
- Write the list to `gmail/follow-ups.md`
- Sort by oldest first

Skip automated receipts and mailing lists.
```

---

## Out of scope

- Full email client UI (Cabinet is not a Gmail replacement)
- Autonomous sending without human approval
- Email deletion or label management
- Calendar integration (separate plan)
- Attachment download / rendering beyond plain text
- Non-Gmail providers (the IMAP/SMTP layer works with any provider, but setup UI and testing targets Gmail only in v1)
