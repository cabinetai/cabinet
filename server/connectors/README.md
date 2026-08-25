# Cabinet Connectors

Connectors are headless scripts that pull data from external services and write
markdown reports into `data/reports/`, where Cabinet indexes them for search and
agents can read them as context.

## Available connectors

| Connector | Source | Report | Setup |
|---|---|---|---|
| StackAdapt | StackAdapt GraphQL API | `data/reports/stackadapt-YYYY-MM-DD.md` | [↓](#stackadapt) |

## Adding a new connector

Each connector follows the same shape:

1. `loadCredentials()` — read and validate required env vars
2. `resolveDateRange()` — compute the report window
3. fetch — pull from the API (handle pagination, rate limits, errors)
4. aggregate — reduce raw records into report rows
5. `renderReport()` — emit markdown
6. `writeReport()` — write to `data/reports/<name>-YYYY-MM-DD.md`
7. `main()` — orchestrate, with an `if (require.main === module)` guard

Place credentials in `.env.local` (git-ignored) and document them in
`.env.example`. Add a row to the table above and a section below.

---

## StackAdapt

Pulls programmatic-advertising campaign delivery from the
[StackAdapt GraphQL API](https://api.stackadapt.com/graphql) and writes a daily
markdown report with three sections:

1. **Spend & Delivery** — total spend, impressions, clicks, blended CTR,
   conversions, conversion revenue, and blended ROAS across all campaigns.
2. **Campaign Performance** — per-campaign table (spend, impressions, clicks,
   CTR, conversions, CVR, ROAS, eCPA, eCPC), ranked by spend.
3. **Pacing & Anomalies** — stale campaigns (spent last window, silent now),
   low-ROAS flags, and delivery drift vs the prior equal-length window.

Read-only by design: the connector only sends GraphQL queries, never mutations.

### Setup

1. Create a StackAdapt **GraphQL API token** (Settings → API in the StackAdapt
   dashboard, or ask your account admin). A read-capable token is sufficient —
   the connector never mutates.
2. Add it to `.env.local`:

   ```bash
   STACKADAPT_API_TOKEN=your_graphql_api_token_here
   ```

3. Run it:

   ```bash
   npx tsx server/connectors/stackadapt.ts
   ```

The report is written to `data/reports/stackadapt-YYYY-MM-DD.md`.

### Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STACKADAPT_API_TOKEN` | yes | — | GraphQL API token (read use). |
| `STACKADAPT_LOOKBACK_DAYS` | no | `14` | Rolling window length, ending yesterday. Max `730`. |
| `STACKADAPT_START_DATE` | no | — | Explicit start (`YYYY-MM-DD`). Requires `END_DATE`; overrides lookback. |
| `STACKADAPT_END_DATE` | no | — | Explicit end (`YYYY-MM-DD`). Requires `START_DATE`. |

The connector always compares the chosen window against the immediately
preceding window of equal length to compute delivery drift.

### Scheduling

`resources/.agents/stackadapt/jobs/daily-report.yaml` registers a "StackAdapt
Reporter" agent that regenerates the report every day at 07:00 UTC and reindexes
it for search.

### Troubleshooting

- **`Missing required environment variable: STACKADAPT_API_TOKEN`** — add the
  token to `.env.local` (not `.env.example`).
- **`StackAdapt auth failed (HTTP 401/403)`** — the token is invalid, expired,
  or lacks read access.
- **`StackAdapt is still computing this report (async)`** — StackAdapt returned
  its `Progress` state. Re-run shortly, or narrow the date window.
- **`StackAdapt rate limit`** — the connector retries 429s with backoff; if it
  still fails, narrow the window and retry.

### Limitations

- Reports campaign-level delivery only — no audience/creative/line-item
  breakdowns (a possible follow-up).
- Metrics reflect StackAdapt's reported attribution at query time; very recent
  conversions may still be settling.
- No local caching: each run is a fresh pull of the current and prior windows.
