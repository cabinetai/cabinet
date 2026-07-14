# Meta Ads Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meta Ads to Cabinet's integrations hub as a one-click OAuth integration against Meta's official hosted MCP server.

**Architecture:** Meta's server (`https://mcp.facebook.com/ads`) is a spec-compliant remote MCP server with a public-client PKCE OAuth flow — no secret, nothing to paste. It therefore uses Cabinet's existing `cli-pkce` + `http` path, identical in shape to Notion/Linear/Stripe. The only genuinely new machinery is a `vendor` trust tier, because Meta published this server but never listed it in the Official MCP Registry, so neither `official` (unverifiable) nor `community` (understates it) is honest.

**Tech Stack:** TypeScript, Next.js App Router, React, Tailwind. Tests are `node:test` run via `tsx --test` (`npm test`). The `@/` path alias resolves in tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-meta-ads-integration-design.md`. Read it before starting.
- **Never** send `client_name: "Claude Code"` from a non-Claude provider to defeat Meta's DCR allowlist. Cabinet does not register as an MCP client at all; the provider CLI does, under its own true name. Any code that fakes a client identity is an automatic reject.
- No secrets in the repo. This integration has **no** credentials and **no** `oauthClient` block — the client is public (`token_endpoint_auth_method: "none"`) and scopes come from discovery.
- Set **no** `registryId` on the Meta entry. A generic id like `meta-ads` would substring-match the third-party `ai.adweave/meta-ads-mcp` in the registry and award a false Official badge (see `mcp-registry-verify.ts:74`).
- Run `npm test` before every commit.

## Known limitation (do not try to fix in this plan)

Meta's DCR is allowlisted by `client_name`: `Claude Code` / `Claude` / `ChatGPT` / `Perplexity` succeed; `Gemini CLI`, `Codex`, `Cursor` are refused. Per the approved spec the integration ships **ungated**.

Be aware of what that means mechanically, so you don't "fix" it by accident: `connect/route.ts:60` drives the OAuth leg through Claude Code unconditionally, and `writeEntry()` writes the server into every selected provider's config. So a Gemini/Codex user's **connect will succeed** (Claude Code holds the token) and the server will simply fail for their agent at runtime. Task 5's error mapping is a safety net for the case where the CLI itself surfaces the refusal — it is not a complete fix, and it is not meant to be. Flagged as a follow-up in the spec.

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/agents/mcp-registry-verify.ts` | `TrustTier` verification — add `vendor` short-circuit | 1 |
| `src/lib/agents/mcp-catalog.ts` | `TrustTier` union, `vendorName` field, `META_ADS` entry | 1, 2 |
| `test/mcp-registry-verify.test.ts` | **Create.** Tier verification unit tests | 1 |
| `src/app/api/agents/config/mcp-catalog/route.ts` | Pass `vendorName` to the UI | 3 |
| `src/components/settings/integrations-hub-section.tsx` | `Tier` type, `TIER_BADGE`, card badge render | 3 |
| `src/components/integrations/hub/integration-detail-page.tsx` | `TierBadge` hero pill | 3 |
| `src/components/integrations/integration-icon.tsx` | `meta-ads` brand slug | 4 |
| `src/lib/agents/claude-mcp-login.ts` | Map Meta's DCR refusal to actionable copy | 5 |
| `test/claude-mcp-login-errors.test.ts` | **Create.** Error-mapping unit test | 5 |
| `data/.agents/meta-ads/persona.md` | **Create.** Reporter agent (from PR #30) | 6 |
| `data/.agents/meta-ads/jobs/daily-report.yaml` | **Create.** 07:00 cron, MCP-backed (from PR #30) | 6 |

---

### Task 1: The `vendor` trust tier

The tier must stand on its own like `cabinet` does — there is nothing in the registry to corroborate, and the existing code path would otherwise silently downgrade it to `community`.

**Files:**
- Modify: `src/lib/agents/mcp-catalog.ts:32` (the `TrustTier` union) and the `CatalogEntry` interface (~line 75)
- Modify: `src/lib/agents/mcp-registry-verify.ts:117-133` (`verifyTier`)
- Test: `test/mcp-registry-verify.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `TrustTier` now includes `"vendor"`. `CatalogEntry.vendorName?: string`. `verifyTier(declared, registryId, presence)` returns `"vendor"` unchanged when `declared === "vendor"`.

- [ ] **Step 1: Write the failing test**

Create `test/mcp-registry-verify.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { verifyTier } from "@/lib/agents/mcp-registry-verify";

test("vendor tier stands on its own — no registry corroboration needed", () => {
  assert.equal(verifyTier("vendor", undefined, {}), "vendor");
});

test("vendor tier is not downgraded even when the registry is reachable", () => {
  assert.equal(verifyTier("vendor", undefined, { notion: true }), "vendor");
});

test("cabinet tier still stands on its own", () => {
  assert.equal(verifyTier("cabinet", undefined, {}), "cabinet");
});

test("official is granted only when the registry corroborates it", () => {
  assert.equal(verifyTier("official", "notion", { notion: true }), "official");
});

test("uncorroborated official degrades to registry, never lies", () => {
  assert.equal(verifyTier("official", "notion", { notion: false }), "registry");
});

test("official without a registryId falls through to community", () => {
  assert.equal(verifyTier("official", undefined, {}), "community");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx tsx --test test/mcp-registry-verify.test.ts`
Expected: FAIL — the two `vendor` tests fail. `verifyTier("vendor", undefined, {})` currently returns `"community"`, because `vendor` is not `cabinet` and has no `registryId`, so it hits the `!registryId → community` branch. (The other four tests should already pass — they pin existing behavior so Step 3 can't regress it.)

- [ ] **Step 3: Add `vendor` to the union and the entry field**

In `src/lib/agents/mcp-catalog.ts`, extend the union:

```ts
export type TrustTier = "official" | "registry" | "vendor" | "cabinet" | "community";
```

Update the doc comment above `TrustTier`'s usage in the file header to describe the new tier, keeping the file's existing candid tone:

```
 * `vendor` = published by the vendor themselves (their domain, their OAuth) but
 * NOT listed in the Official MCP Registry, so the `official` badge can't be
 * verified and would be a claim we can't back. Calling it `community` would be
 * the opposite lie. It gets its own honest label.
```

In the `CatalogEntry` interface, immediately after `trustTier`, add:

```ts
  /** Display name of the publisher for the `vendor` tier — e.g. "Meta". */
  vendorName?: string;
```

- [ ] **Step 4: Short-circuit `vendor` in `verifyTier`**

In `src/lib/agents/mcp-registry-verify.ts`, inside `verifyTier`, add the `vendor` case directly beneath the `cabinet` case — **before** the `!registryId` check, which would otherwise swallow it:

```ts
  // First-party, Cabinet-maintained servers stand on their own — they don't
  // claim a vendor/registry badge, so there's nothing to corroborate.
  if (declared === "cabinet") return "cabinet";
  // Vendor-published but not registry-listed (e.g. Meta's ads connector): the
  // publisher IS the vendor, so the badge is self-evident from the domain +
  // OAuth. There's no registry entry to corroborate, and there never may be.
  if (declared === "vendor") return "vendor";
  if (declared === "community" || !registryId) return "community";
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx tsx --test test/mcp-registry-verify.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/mcp-catalog.ts src/lib/agents/mcp-registry-verify.ts test/mcp-registry-verify.test.ts
git commit -m "feat(integrations): add vendor trust tier for vendor-published, unregistered MCP servers"
```

---

### Task 2: The `META_ADS` catalog entry

**Files:**
- Modify: `src/lib/agents/mcp-catalog.ts` (add the entry; register it in `MCP_CATALOG`)

**Interfaces:**
- Consumes: `TrustTier["vendor"]` and `CatalogEntry.vendorName` from Task 1.
- Produces: a catalog entry with `id: "meta-ads"`, `iconSlug: "meta-ads"` (consumed by Task 4).

Do **not** build this via the `officialRemote()` helper — it hardcodes `trustTier: "official"`, which is precisely the claim we cannot make.

- [ ] **Step 1: Add the entry**

In `src/lib/agents/mcp-catalog.ts`, alongside the other named entries (e.g. after `LINKEDIN`):

```ts
/**
 * Meta's official hosted ads connector (beta, launched 2026-04-29).
 *
 * Public-client PKCE — `token_endpoint_auth_method: "none"`, so there is no
 * secret anywhere and nothing for the user to paste. Meta's DCR is allowlisted
 * by `client_name`: the Claude Code CLI registers fine under its own true name,
 * which is why this works. Gemini/Codex are refused by Meta — the entry ships
 * ungated anyway (see the spec), so connect succeeds via Claude Code but the
 * server won't work for those agents at runtime.
 *
 * No `registryId`: Meta never listed this in the Official MCP Registry, and a
 * generic id would substring-match a third party's listing and mint a false
 * Official badge. Hence `trustTier: "vendor"`.
 */
const META_ADS: CatalogEntry = {
  id: "meta-ads",
  label: "Meta Ads",
  blurb: "Report on, create, and manage Facebook & Instagram ad campaigns.",
  iconSlug: "meta-ads",
  bgImage: "/integrations/meta-ads-bg.webp",
  logo: "/logos/meta.svg",
  sourceUrl: "https://www.facebook.com/business/news/meta-ads-ai-connectors",
  trustTier: "vendor",
  vendorName: "Meta",
  authBackend: "cli-pkce",
  transport: "http",
  mcpServerName: "cabinet-meta-ads",
  url: "https://mcp.facebook.com/ads",
  credentials: [],
  actions: [
    "Pull insights, benchmarks & performance trends",
    "Create campaigns, ad sets, ads & creatives",
    "Activate campaigns and boost posts (spends budget)",
    "Manage catalogs, product feeds & pixels",
    "Build & update custom audiences",
  ],
  setupSteps: [
    {
      title: "Requires the Claude Code provider",
      body: "Meta's connector only admits the Claude Code CLI. Agents running on Gemini or Codex can't authenticate with it — switch the agent's provider to Claude Code before connecting.",
    },
    {
      title: "Sign in with Meta",
      body: "Click Connect & sign in — your agent's CLI opens Meta in the browser to authorize your ad account. No developer app, no App Review, nothing to paste.",
    },
    {
      title: "This grants write access — including spend",
      body: "The connector exposes 82 tools, ~30 of which change things. An agent can create AND activate campaigns and boost Instagram posts, which spends real budget. Connect the ad account you actually intend an agent to act on.",
      href: "https://www.facebook.com/business/news/meta-ads-ai-connectors",
    },
  ],
};
```

- [ ] **Step 2: Register it in the exported catalog**

In the `MCP_CATALOG` array (~line 1130), add `META_ADS` after `LINKEDIN`:

```ts
  LINKEDIN,
  META_ADS,
  ...EXTENDED,
```

- [ ] **Step 3: Verify it typechecks and the suite still passes**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agents/mcp-catalog.ts
git commit -m "feat(integrations): add Meta Ads catalog entry (official hosted MCP, cli-pkce)"
```

---

### Task 3: Surface the `vendor` badge in the UI

`verifyTier` now returns `"vendor"`, but both badge components have exhaustive `Tier` maps that don't know the value — the card badge would read `undefined`. The badge text is per-vendor ("Published by Meta"), so the API must pass `vendorName` through.

**Files:**
- Modify: `src/app/api/agents/config/mcp-catalog/route.ts:48-62`
- Modify: `src/components/settings/integrations-hub-section.tsx:35` (`Tier`), `:63-75` (`CatalogItem`), `:114-131` (`TIER_BADGE`), `:592` (card badge render)
- Modify: `src/components/integrations/hub/integration-detail-page.tsx:308-334` (`TierBadge`)

**Interfaces:**
- Consumes: `CatalogEntry.vendorName` (Task 1), `verifiedTier === "vendor"` (Task 1).
- Produces: `CatalogItem.vendorName?: string` on the API payload.

- [ ] **Step 1: Pass `vendorName` through the API**

In `src/app/api/agents/config/mcp-catalog/route.ts`, in the `approved = catalog.map(...)` object, add the field next to `verifiedTier`:

```ts
      verifiedTier: verifyTier(entry.trustTier, entry.registryId, presence),
      vendorName: entry.vendorName,
```

- [ ] **Step 2: Teach the hub section the new tier**

In `src/components/settings/integrations-hub-section.tsx`, extend the `Tier` type (line 35):

```ts
type Tier = "official" | "registry" | "vendor" | "cabinet" | "community";
```

Add `vendorName` to the `CatalogItem` interface, next to `verifiedTier`:

```ts
  verifiedTier: Tier;
  vendorName?: string;
```

Add the `vendor` entry to `TIER_BADGE`, between `registry` and `cabinet`. Indigo distinguishes it from official-green and registry-sky:

```ts
  vendor: {
    label: "Vendor-published",
    cls: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30",
  },
```

- [ ] **Step 3: Render the vendor's name on the card badge**

Still in `integrations-hub-section.tsx`, find the badge render (~line 592, `{badge.label}`). Replace the label expression so a vendor entry names its publisher, falling back to the generic label when `vendorName` is absent:

```tsx
                  {item.verifiedTier === "official" && <ShieldCheck className="h-2.5 w-2.5" />}
                  {item.verifiedTier === "vendor" && item.vendorName
                    ? `Published by ${item.vendorName}`
                    : badge.label}
```

- [ ] **Step 4: Add the hero pill on the detail page**

In `src/components/integrations/hub/integration-detail-page.tsx`, `TierBadge` currently takes only `tier`. Give it the vendor name and add the branch. Change the signature and add the case after the `cabinet` branch:

```tsx
function TierBadge({ tier, vendorName }: { tier: string; vendorName?: string }) {
```

```tsx
  if (tier === "vendor") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
        <ShieldCheck className="h-3 w-3" />
        {vendorName ? `Published by ${vendorName}` : "Vendor-published"}
      </span>
    );
  }
```

Then update the single call site at line 115. It reads the raw catalog entry, which already carries `vendorName` from Task 1 — so no new prop type is needed:

```tsx
                {entry && <TierBadge tier={entry.trustTier} vendorName={entry.vendorName} />}
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint src/components/settings/integrations-hub-section.tsx src/components/integrations/hub/integration-detail-page.tsx src/app/api/agents/config/mcp-catalog/route.ts && npm test`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agents/config/mcp-catalog/route.ts src/components/settings/integrations-hub-section.tsx src/components/integrations/hub/integration-detail-page.tsx
git commit -m "feat(integrations): render the vendor trust badge (Published by <vendor>)"
```

---

### Task 4: Brand icon slug

`IntegrationIcon` falls back to rendering the raw slug when a brand entry is missing, so without this the card shows the literal string `meta-ads`.

**Files:**
- Modify: `src/components/integrations/integration-icon.tsx` (the `integrationMeta` map)

**Interfaces:**
- Consumes: `iconSlug: "meta-ads"` from Task 2.
- Produces: nothing downstream.

- [ ] **Step 1: Add the brand entry**

In `src/components/integrations/integration-icon.tsx`, in the `integrationMeta` map under the "Social platforms" group (Meta's brand blue is `#0668E1`):

```ts
  "meta-ads":   { label: "Meta Ads",     color: "#0668E1", bg: "bg-[#0668E1]/10", icon: "📣" },
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no type errors.

The background image (`/public/integrations/meta-ads-bg.webp`) and logo (`/public/logos/meta.svg`) referenced in Task 2 are **optional** — the UI already falls back to this icon when an asset 404s, so a missing image degrades gracefully rather than breaking. Add them if the assets exist; do not block on them.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/integration-icon.tsx
git commit -m "feat(integrations): add meta-ads brand icon"
```

---

### Task 5: Map Meta's DCR refusal to actionable copy

If a non-allowlisted CLI ever surfaces Meta's raw refusal, the user currently sees `Dynamic registration is not available for this client.` — which names no cause and no fix. Read the "Known limitation" section above first: this is a safety net, not a complete fix for provider gating.

**Files:**
- Modify: `src/lib/agents/claude-mcp-login.ts` (add an exported helper; call it in the `onExit` handler ~line 331)
- Test: `test/claude-mcp-login-errors.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `friendlyLoginError(output: string): string | null` — returns mapped copy, or `null` when no mapping applies.

- [ ] **Step 1: Write the failing test**

Create `test/claude-mcp-login-errors.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { friendlyLoginError } from "@/lib/agents/claude-mcp-login";

test("maps Meta's DCR refusal to copy that names the cause and the fix", () => {
  const raw = 'Error: {"error":"invalid_client_metadata","error_description":"Dynamic registration is not available for this client."}';
  const mapped = friendlyLoginError(raw);
  assert.ok(mapped, "expected a mapped message");
  assert.match(mapped, /Claude Code/);
});

test("leaves unrecognized errors alone so we never mask a real failure", () => {
  assert.equal(friendlyLoginError("Error: connection refused"), null);
});

test("returns null for empty output", () => {
  assert.equal(friendlyLoginError(""), null);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx tsx --test test/claude-mcp-login-errors.test.ts`
Expected: FAIL — `friendlyLoginError` is not exported from `claude-mcp-login`.

- [ ] **Step 3: Implement the mapper**

In `src/lib/agents/claude-mcp-login.ts`, near the other module-level helpers:

```ts
/**
 * Vendor OAuth errors that are meaningless on their own, mapped to copy that
 * names the cause and the fix. Returns null when nothing matches — we never
 * mask an error we don't actually understand.
 */
export function friendlyLoginError(output: string): string | null {
  if (/Dynamic registration is not available for this client/i.test(output)) {
    return "Meta's ads connector currently only admits the Claude Code CLI. Switch this agent's provider to Claude Code to connect.";
  }
  return null;
}
```

- [ ] **Step 4: Use it on the failure path**

In the `term.onExit(({ exitCode }) => {` handler, the `!settled` branch currently falls back to `session.error`. Prefer a mapped message from the accumulated PTY output, since the raw vendor string is what lands in `session.output`:

```ts
      if (!settled) {
        fail(
          friendlyLoginError(session.output) ??
            session.error ??
            (exitCode === 0
              ? "Sign-in ended before an authorization URL was issued"
              : `Sign-in process exited (code ${exitCode}) before an authorization URL`),
        );
        return;
      }
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx tsx --test test/claude-mcp-login-errors.test.ts && npm test`
Expected: PASS — 3/3 in the new file, and the full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/claude-mcp-login.ts test/claude-mcp-login-errors.test.ts
git commit -m "feat(integrations): map Meta's DCR refusal to an actionable error"
```

---

### Task 6: Port the Meta Ads Reporter agent onto the MCP tools

Credit where due: the agent, the persona, and the 07:00 cron job in this task are **@sdhilip200's design**, from PR #30 (opened 2026-04-10, nineteen days before Meta shipped the official connector). We are keeping his deliverable — a dated daily markdown report in the knowledge base — and replacing only its data-access layer.

What we are dropping from #30, and why:
- `server/connectors/meta-ads.ts` (416 lines of hand-rolled Graph API client) — superseded by the MCP server.
- `META_ADS_ACCESS_TOKEN` / `META_ADS_AD_ACCOUNT_ID` — a long-lived token that expires every ~60 days and must be manually regenerated. The MCP path uses OAuth and refreshes itself.
- The `v19.0` Graph API pin — Meta's own MCP authorization server is on v25.0; a v19 pin is at or past end-of-life.
- The token was also being sent in the **query string**, which leaks credentials into proxy and access logs. Dropping the file removes the bug with it.

His agent already declares `provider: claude-code`, so the Claude-Code-only constraint from the Known Limitation costs this task nothing.

**Files:**
- Create: `data/.agents/meta-ads/persona.md`
- Create: `data/.agents/meta-ads/jobs/daily-report.yaml`
- Do **NOT** create: `server/connectors/meta-ads.ts`, and do **not** add any `META_ADS_*` vars to `.env.example`.

**Interfaces:**
- Consumes: the connected `cabinet-meta-ads` MCP server from Task 2 — specifically the read-only insight tools `ads_get_ad_accounts`, `ads_get_ad_entities`, and `ads_insights_performance_trend`.
- Produces: `data/reports/meta-ads-YYYY-MM-DD.md`.

- [ ] **Step 1: Add the persona** (unchanged from #30 except the role wording)

Create `data/.agents/meta-ads/persona.md`:

```markdown
---
name: Meta Ads Reporter
slug: meta-ads
role: Pulls Meta Ads campaign performance and writes a daily markdown report to data/reports/.
provider: claude-code
department: marketing
---

The Meta Ads Reporter agent runs on a daily schedule. It pulls campaign
performance through the Meta Ads MCP integration and saves a markdown report to
Cabinet's knowledge base so it can be read, searched, and used as context by
other agents.

Requires the Meta Ads integration to be connected (Settings → Integrations).
This agent is read-only by policy: it must never create, update, activate, or
delete anything in the ad account.
```

- [ ] **Step 2: Add the cron job, pointed at MCP tools instead of the deleted script**

Create `data/.agents/meta-ads/jobs/daily-report.yaml`:

```yaml
id: daily-report
name: Meta Ads Daily Report
enabled: true
schedule: "0 7 * * *"
provider: claude-code
timeout: 300
prompt: |
  Pull the last 14 days of Meta Ads campaign performance and write a markdown report.

  Use the Meta Ads MCP tools (mcp__cabinet-meta-ads__*). Read-only tools ONLY:
    - ads_get_ad_accounts            — resolve the ad account
    - ads_get_ad_entities            — list campaigns
    - ads_insights_performance_trend — pull the metrics

  You must NOT call any tool that creates, updates, activates, deletes, or
  boosts anything — in particular never ads_activate_entity, ads_boost_ig_post,
  ads_update_entity, or any ads_create_*. This job reports; it does not act.

  Write the report to `data/reports/meta-ads-YYYY-MM-DD.md` (today's date) with:
    - a totals table across all campaigns: impressions, clicks, CTR, spend,
      conversions, ROAS
    - a per-campaign breakdown
    - a short insights summary: top spender, highest CTR, most conversions,
      best ROAS

  If the Meta Ads integration is not connected, write no file — report that it
  needs connecting in Settings → Integrations, and stop.
```

- [ ] **Step 3: Verify the report generates**

Trigger the job manually from the Jobs UI (or wait for 07:00).
Expected: `data/reports/meta-ads-YYYY-MM-DD.md` exists, contains a totals table and per-campaign rows, and the run history shows only read-only `ads_get_*` / `ads_insights_*` tool calls — **no** mutating calls.

- [ ] **Step 4: Commit**

```bash
git add data/.agents/meta-ads/
git commit -m "feat(agents): Meta Ads Reporter — daily report via the Meta Ads MCP integration

Agent design, persona, and cron schedule from @sdhilip200's PR #30; re-pointed
at Meta's official MCP server instead of a hand-rolled Graph API client, so it
drops the 60-day access token and the v19.0 version pin.

Co-authored-by: sdhilip200 <sdhilip200@users.noreply.github.com>"
```

---

### Task 7: Manual verification

Automated tests can't exercise a real OAuth round-trip. This is the gate before calling the feature done.

**Files:** none.

- [ ] **Step 1: Run the app**

Run: `npm run dev`, then open Settings → Integrations.

- [ ] **Step 2: Check the card**

Expected: a **Meta Ads** card, badged **Published by Meta** (indigo — not green "Official", not grey "Community"), showing the 📣 icon if the background asset is absent.

- [ ] **Step 3: Connect it on Claude Code**

Click Connect. Expected: the browser opens Meta's consent screen listing six scopes (`ads_management`, `ads_read`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`). Approve with a **test or low-stakes ad account** — this grants write and spend access. The panel should reach connected state.

- [ ] **Step 4: Confirm the tools actually load**

Ask an agent on the Claude Code provider: *"List your Meta ads tools. Don't call any of them."*
Expected: ~82 `mcp__cabinet-meta-ads__ads_*` tools.

- [ ] **Step 5: Confirm the known limitation is understood, not fixed**

Connect on a Gemini agent. Expected (and **correct** per the spec): connect *succeeds* — the OAuth runs through Claude Code — but the server won't work for that agent at runtime. If you find yourself tempted to make this pass by sending a fake `client_name`, stop: that's the one thing this plan forbids.

- [ ] **Step 6: Commit any fixes, then open the PR**

---

## Follow-ups (explicitly out of scope)

1. **Google Ads** — different shape entirely (local stdio Python server, read-only, developer-token gated). Own spec.
2. **Registry matcher hardening** — `mcp-registry-verify.ts:74` uses `name.includes(needle)`; should be `n === needle || n.endsWith("/" + needle)`. Untriggered by this change (no `registryId` here) but a live false-Official vector.
3. **Per-tool permissioning** — require human approval for `ads_activate_entity` and `ads_boost_ig_post`, the two tools that can spend the client's money unsupervised.
4. **Real provider gating** — a `providerAllowlist` field on `CatalogEntry` so non-Claude providers can't half-connect (see Known limitation).
5. **The detail page bypasses tier verification.** `integration-detail-page.tsx:115` renders `entry.trustTier` — the *declared* tier straight from the catalog — while the hub card renders `verifiedTier` from `verifyTier()`. So the detail page will show a green **Official** pill for any entry that declares it, even when the registry fails to corroborate and the card correctly degrades it to "Registry-listed". That directly contradicts the doctrine in `mcp-registry-verify.ts` ("we never let the UI claim Official purely from the catalog's self-declared tier"). Harmless for Meta (`vendor` verifies to `vendor` either way), which is why it isn't fixed here — but it is a live false-Official vector, and it is the second one found in this subsystem. Worth fixing with follow-up #2.
