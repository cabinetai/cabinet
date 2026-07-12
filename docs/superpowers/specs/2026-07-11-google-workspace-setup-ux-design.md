# Google Workspace setup UX — design

**Date:** 2026-07-11
**Status:** Approved, ready for planning
**Goal:** Make connecting Google Workspace possible for a non-technical user. Today it is not.

## Why

The current guide (`src/lib/agents/mcp-catalog.ts:349-369`) is four steps. I walked it end to end in a
browser against a real Google account, from a brand-new Cloud project. **It cannot be followed.** Its
step order is impossible, it points at the wrong console surface, and it hides five traps that each
fail silently. Separately, the integration it produces is broken on arrival: only Calendar works.

**Impossible:**

Step 2 says *"create an OAuth client of type Web application"*. Step 3 says *"add yourself as a test
user"* (a consent-screen task). Google blocks the first until the second's surface exists:

> **To create an OAuth client ID, you must first configure your consent screen**

The Create-client form does not render at all. There is no client-type dropdown, no redirect-URI
field. A user following our guide hits a wall on their first real action, and must then discover an
undocumented **four-step wizard** (App Information → Audience → Contact Information → Finish) that the
guide never mentions.

**Wrong surface:** the guide links to `console.cloud.google.com/apis/credentials` and
`/apis/credentials/consent`. The OAuth consent screen has been rebranded to **Google Auth Platform**;
those URLs redirect into `/auth/*`, whose nav is Overview / Branding / Audience / Clients / Data
Access / Verification Center / Settings.

**Traps, in the order a user meets them:**

1. **The wrong-project trap (highest severity).** After you create a project, Google **switches you
   back to your previous project** and toasts *"Now viewing project &lt;old one&gt;"*. The new project is
   selected only via a small "Select Project" link inside a notification dropdown. Miss it, and every
   subsequent step lands in the wrong project. Everything appears to succeed; the failure surfaces
   much later as an opaque Google error.
2. **Internal looks selectable and isn't.** On the Audience step, *Internal* ("You will not need to
   submit your app for verification") reads as the obviously-correct choice. On a personal Gmail
   account it is `aria-disabled: true` but is **not visually disabled**. Clicking it is a silent no-op.
3. **The redirect URI can take hours to apply.** The Web-application form states: *"It may take 5
   minutes to a few hours for settings to take effect."* A user who adds the URI and immediately
   clicks Connect can get `redirect_uri_mismatch` for hours with nothing actually wrong. The form also
   puts an identical **+ Add URI** button under *Authorized JavaScript origins* directly above the
   redirect-URI one; pasting into the wrong one fails silently.
4. **The client secret is shown exactly once and is unrecoverable.** Reopening the client shows only
   its name: no secret, no re-reveal, no Download JSON. (Slack, by contrast, always re-reveals behind a
   *Show* button.) A user who closes the dialog before pasting must delete the client and start over.
5. **Consent checkboxes default to unchecked.** On the scope screen every box is empty, including
   *Select all*. Clicking Continue — the natural action — grants **zero scopes**. `workspace-mcp` still
   writes a token file, Cabinet's chip still reads "Signed in", and every tool call fails.

**The unlock:** two shortcuts, both verified end to end.

- **A Desktop-app OAuth client accepts any loopback redirect, unregistered.** I ran the real OAuth on
  port **8123** — registered nowhere — and Google served consent and completed the callback
  (`http://localhost:8123/oauth2callback` → *Authentication Successful*, token written with
  `refresh_token`). `workspace-mcp` supports `"installed"` clients with PKCE
  (`auth/google_auth.py:239-241`). The Desktop form has **two fields**: type and name. So trap 3 is
  **deleted**, not documented.
- **One deep link enables all nine APIs**: `flows/enableapi?apiid=a,b,c…&project=…` → *Confirm project*
  → *Enable*. It also mitigates trap 1 by naming the project before acting.

**The port bug this hides is real, not theoretical.** `workspace-mcp` probes :8000 then falls back
through :8001–8004 and rebuilds its redirect URI from the port it actually bound
(`auth/port_resolver.py`; applied to stdio transport, which is Cabinet's mode). Cabinet pins nothing.
**Port 8000 was already in use on the test machine** — so with a Web client, this user would have
silently drifted to :8001 and received an undiagnosable `redirect_uri_mismatch`. A Desktop client makes
the whole class of failure impossible.

## The integration is broken on arrival

Proven with a clean `claude -p` against the live MCP, not a status chip:

- `list_calendars` → **real data** (three calendars, correct account).
- `search_docs` → **`ACTION REQUIRED: Google Authentication Needed for Google Drive`**.

Cause: `connectAuth.authArgs` boots the sign-in server with `--tools calendar`
(`mcp-catalog.ts:312`), so the authorize URL requests **only Calendar scopes** and the stored token
grants only Calendar. The agent then runs the **full** `--tools` set. The catalog's comment — *"it
requests calendar scope regardless"* (`mcp-catalog.ts:310-312`) — is false. Docs, Sheets, Slides,
Tasks, Forms, Chat and Contacts are all advertised in the card's `actions` and all fail on first use.

Worse, that failure path makes `workspace-mcp` **auto-open a browser window mid-run**. In a detached
or scheduled Cabinet task, a Google consent tab appears in the user's face unbidden. (This also
contradicts `stdio-mcp-login.ts`'s stated design that the browser is *"deliberately... never
auto-opened"* — the MCP server opens one regardless, so connect-time yields two tabs.)

## Publishing status: escape Testing mode

Google issues refresh tokens that **expire after 7 days** for External apps in *Testing*. Every
personal-Gmail user's connection would silently die weekly — a bigger wound than setup itself.

**Publish app** (Audience page → *Push to production* → Confirm) resolves it in one click. Verified: no
privacy policy, no homepage, no verification submission demanded; status became *In production* and the
**Test users section disappeared entirely**. So publishing simultaneously:

- removes the 7-day expiry, and
- **deletes the guide's "add yourself as a test user" step**.

Cost: the *"Google hasn't verified this app"* interstitial, and a 100-user lifetime cap (irrelevant for
an app the user owns and uses alone).

> **Open question, resolve first in the plan.** I published *before* signing in, so I never observed
> Testing mode's consent screen. I believe the unverified interstitial appears in Testing too (making
> publishing a strict win), but **this is inferred, not observed**. Task one: create a throwaway app,
> leave it in Testing, add a test user, and capture its consent screen. If Testing somehow avoids the
> interstitial, the tradeoff must be re-presented before the copy is written.

## Scopes

Drop **`search`** and **`chat`** from `args`. Computed against the installed package
(`auth.scopes.get_scopes_for_tools`): **26 scopes → 21**.

- **`search` is dead code.** `gsearch/search_tools.py` needs `GOOGLE_PSE_API_KEY` +
  `GOOGLE_PSE_ENGINE_ID` (an API key, not OAuth). Cabinet sets neither, so every search tool raises at
  call time. It also adds a pointless `cse` scope and a pointless API to enable. Removing it costs
  nothing.
- **`chat`** contributes `chat.messages` / `chat.messages.readonly`, which are **restricted** scopes,
  plus a "read your chat messages" line on the consent screen.

Removed: `chat.messages`, `chat.messages.readonly`, `chat.spaces`, `chat.spaces.readonly`, `cse`.
The card's `actions` list must be trimmed to match — no advertising Chat or Search.

**`drive.readonly` (restricted) survives and cannot be removed.** `auth/scopes.py` puts it in both
`DOCS_SCOPES` and `SHEETS_SCOPES` at *every* granularity (`auth/permissions.py:79-86`). There is no
flag giving Docs/Sheets without it. Consequences, both of which the copy must be honest about:

1. The consent screen will always include a broad Drive-read line. That is the scariest row on the
   screen and we should say so rather than let it ambush the user.
2. **A shared, Cabinet-owned OAuth client is not viable.** A restricted scope requires an annual
   third-party CASA security assessment. Users creating their own client is *forced*, not lazy — and
   the guide should say that, because "why am I doing Google's job?" is the obvious reaction.

## The new flow

Four steps. The impossible one is gone; the undocumented wizard is now documented.

**1. Create a Google Cloud project.** Primary action → `https://console.cloud.google.com/projectcreate`.
`warning` callout: *After you click Create, Google puts you back in your previous project. Click
"Select Project" in the notification, or you will build everything in the wrong place.* Screenshot: the
notification with **Select Project**.

**2. Set up the consent screen, then publish it.** Primary action → `/auth/branding?project=…`. Walk
*Get started*: App name `Cabinet`, your email, **External**, agree, Create. Then **Audience → Publish
app → Confirm**. `info` callout: *"Internal" is greyed out on personal Gmail accounts even though it
looks clickable — External is your only option.* `info` callout: *Publishing keeps your sign-in from
expiring every 7 days. It stays private to you.* Screenshot: the Audience page showing *In production*.

**3. Enable the Google APIs.** Primary action → the prefilled `enableapi` deep link (8 APIs; no
`customsearch`, since `search` is dropped). Confirm project → Enable. Screenshot: the *You are about to
enable* list.

**4. Create a Desktop OAuth client and connect.** Primary action → `/auth/clients/create?project=…`.
Application type **Desktop app**, name it, Create. `warning` callout, the loudest on the page: *Google
shows your client secret once and will never show it again. Have this page open before you click
Create, or use Download JSON.* Then paste Client ID + Secret (or drop the JSON) into Cabinet and click
**Connect & sign in**. Screenshot: the one-time credentials dialog, scrubbed.

**Sign-in expectations** — rendered as callouts + screenshots on step 4, because these two screens are
where users quit:

- *"Google hasn't verified this app"* — red triangle, *"you shouldn't use it"*, and a prominent blue
  **BACK TO SAFETY** button versus a small grey **Advanced** link. Copy: *this is your own app; you are
  the developer it names. Click **Advanced** → **Go to Cabinet (unsafe)**.* Screenshot cropped to the
  Advanced link.
- The scope screen — **every checkbox is unchecked by default.** Copy: *tick **Select all**, or Google
  grants nothing and every tool will fail.* Screenshot cropped to the unticked *Select all*.

Deleted, not documented: the redirect URI, the Add-vs-Save-URLs ambiguity, the JavaScript-origins
decoy, the hours-to-take-effect delay, and the test-user step. No parallel "Web application" path is
retained; a second, worse route is somewhere a non-technical user gets stranded.

## Schema

Reuses the four optional `CatalogSetupStep` fields introduced by the Slack spec
(`2026-07-11-slack-setup-ux-design.md`): `action`, `callout`, `image`, `fallback`. **No new schema
work.** This is the first real test that those fields generalize beyond Slack, and they do — with one
gap:

- Google needs **multiple callouts per step** (step 2 carries both the Internal-is-disabled note and
  the publish-it note). Slack's `callout?: {...}` is singular. Widen to
  `callouts?: Array<{tone, body}>`, or accept one callout per step and split step 2. **Prefer
  widening**; splitting invents a fake step to satisfy a schema limitation.
- `action.href` must interpolate the project id, which Cabinet does not know. It cannot. So the deep
  links use the bare form (`/projectcreate`, `/auth/branding`) and rely on the console's own project
  chip — **except** the `enableapi` link, whose `?project=` is what makes it one-click. Resolution:
  ship `enableapi` **without** `project=`; the console then prompts for project selection on its
  *Confirm project* step, which is acceptable and still one flow. Verify this in the plan — I only
  tested the link *with* `project=`.

## Code changes

`src/lib/agents/mcp-catalog.ts` (GOOGLE_WORKSPACE):

- `args`: drop `chat` and `search`.
- `actions`: drop the Chat and Search lines.
- `connectAuth.authArgs`: **use the same `--tools` list as `args`**, so one consent grants every scope
  the agent will later need. This is the fix for the calendar-only-token bug. Delete the false comment
  at `:310-312`.
- `serverEnv`: add `WORKSPACE_MCP_PORT_FALLBACK_COUNT: "0"` so a port collision fails loudly instead
  of silently drifting. (Belt-and-braces: with a Desktop client the drift is harmless, but a loud
  failure still beats a confusing one, and it protects users who already made a Web client.)
- `credentials[]`: keep `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` / `USER_GOOGLE_EMAIL`. Rewrite the
  Client-ID `hint`, which currently says *"type: Web application ... with redirect URI
  http://localhost:8000/oauth2callback"* — both now wrong.
- Fix the comment at `:270-273` claiming Google's official MCP servers are *"gated to Claude.ai-web /
  Antigravity clients"*. They are not: they use your own OAuth client and Google ships a Gemini **CLI**
  codelab. Keep `workspace-mcp` anyway, for the true reasons: the official servers are still Developer
  Preview, they still require a hand-made OAuth client (zero pain saved), and they cover only
  Gmail/Drive/Calendar/Chat/People — **no Docs, Sheets, Slides, Tasks, Forms**.

**JSON upload path.** Add an optional "drop your `client_secret.json`" affordance alongside the paste
fields. `workspace-mcp` reads it via `GOOGLE_CLIENT_SECRET_PATH` and accepts the console's download
verbatim, in both `"web"` and `"installed"` shapes (`auth/google_auth.py:99-109`, `:251-302`).
**Critical:** env vars take priority over the file (`load_client_secrets`, `:270-277`), so when the file
is used Cabinet **must not** also set `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`. The file must be stored 0600
outside the repo, and its path written to `serverEnv`.

**Verification.** Replace the dead `/test` branch (`test/route.ts:86-103`), which checks
`GOOGLE_APPLICATION_CREDENTIALS` — an env key no longer present in the entry's `credentials[]`, so it
can only ever return `valid: false`. A check that always fails is as bad as Slack's canned check that
always passed. Replace with a **Test connection** button → `verify` route spawning `claude -p`
restricted to the `cabinet-google-workspace` tools, which calls `list_calendars` **and** one non-Calendar
tool (e.g. `search_docs`) and renders *"Connected as sam@… · 3 calendars · Docs OK."* Calling both is
the point: it is the only check that would have caught the calendar-only-token bug.

**Disconnect** (`connect/route.ts:191-215`) currently deletes only the `~/.claude.json` key. It must
also offer to remove the `GOOGLE_*` keys from `.cabinet.env` and delete
`~/.google_workspace_mcp/credentials/<email>.json`. Nothing in the codebase deletes that token today,
so after Disconnect the panel still reads "Signed in" and reconnect takes the `alreadyAuthenticated`
fast path against a token the user thinks they revoked.

**Status chip.** `readStdioAuthState` (`stdio-mcp-login.ts:388-393`) means *"a file named
`<email>.json` exists on disk"*. It never validates the token. Out of scope to fix here, but it is why
the calendar-only bug went unnoticed and why the Test-connection button is not optional.

## Assets

Light-mode PNGs under `public/integrations/google-workspace/`, each cropped tight to the control:

1. The post-create notification showing **Select Project** (the wrong-project trap).
2. The Audience page reading **In production**.
3. The `enableapi` *You are about to enable* list.
4. The one-time client-secret dialog (**Download JSON** visible).
5. *"Google hasn't verified this app"*, cropped to **Advanced**.
6. The scope screen, cropped to the unticked **Select all**.

Captures already exist from the walkthrough.

> **Security note:** these captures contain a real Client ID, a real client secret, a real Google
> account email and a real project id. Every asset must be cropped and scrubbed before it enters the
> repo, and the throwaway project (`cabinet-502114`) and its token
> (`~/.google_workspace_mcp/credentials/`) must be deleted.

## Testing

- **Unit:** scope derivation — asserting `chat` and `search` are absent and that `authArgs`'s tool list
  equals `args`'s. That equality is the regression guard for the calendar-only-token bug; it should be
  impossible to reintroduce.
- **Component — `SetupGuide`:** multi-callout rendering; a step with only `{title, body}` still renders
  as today (the guarantee that the other integrations are untouched).
- **Manual E2E, from genuinely zero:** delete the project, walk all four steps cold, and confirm via a
  fresh `claude -p` that **both** a Calendar tool and a Docs tool return real data. The Docs call is
  the whole point — Calendar alone is what passes today while the integration is broken.

## Out of scope (deliberately deferred)

Revalidating stored credentials against Google; detecting a revoked grant; the auto-opened browser
window on mid-run re-auth (a `workspace-mcp` behaviour that needs an upstream fix or a wrapper); and
the general "status chip reflects disk, not reality" problem. All real, all shared with Slack, all a
separate connection-lifecycle spec.

## Appendix — ground truth (verified 2026-07-11)

The true happy path, walked cold against a new project:

1. `console.cloud.google.com/projectcreate` → name → Create → **the console switches you back to your
   old project; click "Select Project"**
2. Credentials → Create credentials → OAuth client ID → **blocked**: *"you must first configure your
   consent screen"*
3. `/auth/branding` → **Get started** → App Information (name + support email) → Audience (**External**;
   *Internal* is disabled-but-not-greyed on Gmail) → Contact Information → agree → **Create**
4. `/auth/audience` → **Publish app** → Confirm → status **In production**, test-users section vanishes
5. `flows/enableapi?apiid=…&project=…` → Confirm project → **Enable** (8 APIs, one click)
6. `/auth/clients/create` → **Desktop app** → name → Create → **copy the secret NOW, it is never shown
   again** (or Download JSON)
7. Cabinet → paste → **Connect & sign in**
8. Google: *"hasn't verified this app"* → **Advanced** → **Go to Cabinet (unsafe)** → *Sign in to
   Cabinet* → **tick Select all** → Continue
9. `http://localhost:<any>/oauth2callback` → *Authentication Successful*; token written with a
   `refresh_token`

Also observed: `api…/apis/credentials` and `/apis/credentials/consent` redirect into `/auth/*`; the
Credentials page renders a blank body with the project chip reading *"Select a project"* for ~8s before
loading, which reads as "I'm in the wrong place"; and new Google Cloud accounts are capped at ~10
additional projects.
