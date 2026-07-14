# Meta Ads integration — design

**Date:** 2026-07-13
**Status:** Approved, pending implementation plan
**Scope:** Add Meta Ads to Cabinet's integrations hub. Google Ads is explicitly out of scope (see Follow-ups).

## Context

A client asked for Meta Ads and Google Ads. Meta shipped official "Ads AI Connectors" (beta, 2026-04-29):
a hosted remote MCP server at `https://mcp.facebook.com/ads`, plus a CLI. This spec covers the MCP server
only — Cabinet agents already speak MCP through the provider CLI, so the connector is the natural fit.

## Verified facts

Everything in this section was confirmed firsthand against the live endpoint, not taken from documentation
or secondary sources. Several widely-repeated claims turned out to be **false** — see Corrections.

**OAuth (probed via curl):**

- `GET /.well-known/oauth-protected-resource/ads` → RFC 9728 metadata. Advertised scopes:
  `ads_management`, `ads_read`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`.
- Unauthenticated `initialize` → `401` with a correct `WWW-Authenticate: Bearer resource_metadata=…` header.
- `GET /.well-known/oauth-authorization-server/ads` → issuer `https://www.facebook.com`,
  `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_method: ["none"]` (**public client — no
  secret anywhere**), and a `registration_endpoint`.

**Dynamic Client Registration is allowlisted by `client_name`.** This is undocumented and load-bearing:

| `client_name`                        | Result                                            |
| ------------------------------------ | ------------------------------------------------- |
| `Claude Code`, `Claude`              | OK → client_id `4510005499318155` (pre-provisioned) |
| `ChatGPT`                            | OK → client_id `1718457352668935`                  |
| `Perplexity`                         | OK → client_id `1008498691522239`                  |
| `Gemini CLI`, `Codex`, `Cursor`, `Cabinet` | REFUSED — `"Dynamic registration is not available for this client."` |

The refusal is independent of the rest of the registration metadata (redirect URI, grant types, auth method
all varied; only the name mattered).

**Consequence:** the integration only works when the active provider CLI is Claude Code. Cabinet does not
register as itself — it spawns a CLI which *is* the MCP client and performs DCR under its own true name.
That is honest and requires no special handling.

> **Non-negotiable:** Cabinet must never send `client_name: "Claude Code"` from a Gemini/Codex session to
> defeat the allowlist. That would misrepresent to Meta which software is holding the user's ad-account
> credentials. If the allowlist blocks a provider, the correct outcome is a clear error, not a disguise.

**End-to-end smoke test (2026-07-13):** registered the server with the real Claude Code CLI in an isolated
local scope, completed the browser OAuth against a real Meta account, and observed `✔ Connected`. The PKCE
round-trip completes with no client secret. The tool registry was then enumerated without invoking anything.

## Corrections to published claims

Every secondary source (and the first two drafts of this design) asserted the following. Both are wrong:

1. **"29 tools across five capability areas."** The server actually exposes **82 tools**.
2. **"Everything the connectors create lands in PAUSED status, and no flag overrides this default."**
   Misleading. It is true of the *create* tools, but the registry also contains **`ads_activate_entity`**,
   whose entire purpose is to un-pause entities. There is also **`ads_boost_ig_post`**, which spends money
   directly, and **`ads_update_entity`**, a generic mutator covering budgets, bids, and status.

## Risk: blast radius

Approximately **30 of the 82 tools mutate state**, including activation, spend, and deletion
(`ads_delete_custom_audience`, `ads_catalog_delete_product`). With the approved scope set, a Cabinet agent
holding this connection **can take a campaign live and spend the client's money without a human in the loop.**

This is an accepted, deliberate decision (the client wants autonomous campaign management), not an oversight.
It is recorded here so it is never a surprise. Mitigations deferred to Follow-ups.

## Design

### 1. Catalog entry (`src/lib/agents/mcp-catalog.ts`)

A new explicit `META_ADS: CatalogEntry` literal, added to the `MCP_CATALOG` export. Deliberately **not**
built via the `officialRemote()` helper, which hardcodes `trustTier: "official"` — we need `vendor`.

```ts
id: "meta-ads"
label: "Meta Ads"
vendorName: "Meta"
trustTier: "vendor"          // no registryId — see §2
authBackend: "cli-pkce"
transport: "http"
url: "https://mcp.facebook.com/ads"
mcpServerName: "cabinet-meta-ads"
credentials: []              // nothing to paste
// no oauthClient block: scopes come from discovery (all six), and the
// client is public — there is no secret to register.
```

`setupSteps` must state plainly: (a) sign in with Facebook, no developer app or App Review needed;
(b) **requires the Claude Code provider**; (c) the agent can create *and activate* campaigns and spend money.

### 2. New `vendor` trust tier

Meta published this server but never listed it in the Official MCP Registry, so neither existing tier is
honest: `official` would be unverifiable, `community` would understate a Meta-published, Meta-OAuth'd server.

- `TrustTier` gains `"vendor"`.
- `verifyTier()` short-circuits it like `"cabinet"` — it stands on its own, there is nothing to corroborate:
  `if (declared === "vendor") return "vendor";`, placed **before** the `!registryId → community` check.
- `CatalogEntry` gains optional `vendorName?: string`. `TierBadge` renders `Published by {vendorName}`,
  falling back to a generic "Vendor-published".
- Touches `mcp-registry-verify.ts`, `integration-detail-page.tsx`, and the `Tier` type in
  `integrations-hub-section.tsx`.

Because we set **no `registryId`**, this change never exercises the registry matcher — see Follow-ups for
the latent bug there.

### 3. Provider gating: ship ungated, fail legibly

Decision: **no new gating field.** The card shows for every provider. A user on Gemini/Codex who clicks
Connect gets a failure at the DCR step.

To keep that failure from being an opaque vendor string, `claude-mcp-login.ts` (which already funnels CLI
stdout/stderr into `session.error`) maps Meta's `Dynamic registration is not available for this client` to:

> "Meta's ads connector currently only admits the Claude Code CLI. Switch this agent's provider to Claude
> Code to connect."

### 4. Assets

`/public/integrations/meta-ads-bg.webp`, a Meta logo, and a `meta-ads` slug in `integration-icon.tsx`. The
UI already falls back to the icon when images are absent, so this does not block the entry landing.

## Testing

- **Unit:** `verifyTier("vendor", undefined, {})` → `"vendor"`. Regression: an existing official entry with a
  corroborated `registryId` still verifies as `"official"`, and an uncorroborated one still degrades.
- **Unit:** the DCR error string maps to the friendly message.
- **Manual:** connect on Claude Code → OAuth completes → tools list populates. Connect on Gemini → the mapped
  error appears, not a raw vendor string.

## Follow-ups (out of scope)

1. **Google Ads.** Different shape entirely: local stdio Python server (`googleads/google-ads-mcp`), read-only
   (3 tools), gated behind a developer token + GCP OAuth. Deserves its own spec.
2. **Registry matcher bug** (`mcp-registry-verify.ts:74`). Presence is tested with
   `name.includes(needle)` — a substring match. A generic `registryId` like `meta-ads` would match the
   third-party `ai.adweave/meta-ads-mcp` in the registry and award a green **Official** badge on the strength
   of someone else's listing. Not triggered by this change (we set no `registryId`), but it is a live
   false-Official vector for any future entry. Should be anchored (`n === needle || n.endsWith("/" + needle)`).
3. **Per-tool permissioning.** Given the blast radius above, consider restricting the mutating tools at the
   agent layer, or requiring human approval for `ads_activate_entity` / `ads_boost_ig_post`.
4. **Watch for the tool surface changing.** This is a beta connector; 29 → 82 happened without the docs
   catching up. Re-enumerate before relying on any specific tool.
