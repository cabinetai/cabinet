# Integrations Hub Redesign — Design Spec

**Date:** 2026-07-16
**Status:** Approved (brainstorming) → ready for implementation plan
**Feeds into:** `/writing-plans`
**Source of inspiration:** an internal UX teardown of a reference integrations product (not in this repo). Borrow layout & wireframes only.

## 1. Goal & constraints

Improve the frontend of Cabinet's **Integrations** browse surface by borrowing the
layout and interaction patterns from a reference integrations product, while keeping Cabinet's
own brand.

Hard constraints:

- **Frontend-only.** No new API endpoints, no new backend data. Reuse the existing
  static catalog (`preview-catalog.ts`), the existing connected-state fetch
  (`/api/agents/config/mcp-catalog`), and the existing setup/connect components.
- **Keep our brand.** Borrow the reference's *structure and wireframes* only. All color,
  typography, radii, and accents stay on Cabinet's design tokens (`bg-background`,
  `bg-card`, `border-border`, `--primary`, per-integration `brand` colors). Do **not**
  adopt the reference's `#ea2070` pink literal or its warm off-white `oklch` gradient shell.
- **Scope is the Integrations tab only.** The **MCPs** and **API Keys** tabs of the hub
  are untouched.

Non-goals: no hosted-broker adoption, no "Use our key" chooser (irrelevant to
self-hosted Cabinet), no Actions/Triggers API, no triggers concept.

## 2. What exists today (baseline)

- `src/components/integrations/hub/integrations-hub-page.tsx` — the full-page hub with
  three tabs: **Integrations · MCPs · API Keys**. Owns search state, the selected
  connector (from `section.slug`), and the connected-ids fetch.
- `src/components/integrations/hub/layouts/layout-gallery.tsx` — the current
  "logo wall": compact logo tiles grouped under **stacked category headers**, each tile
  = `LogoTile` + name + status badge (Connected / Soon / Requested). Clicking a tile
  calls `onOpen(id)`. Also owns the coming-soon request flow + the "Don't see your
  integration?" request box.
- `src/components/integrations/hub/integration-detail-page.tsx` — the **full-page**
  detail view opened when a tile is clicked: brand-tinted hero, `SetupGuide` with
  third-party UI mockups, "For developers" MCP disclosure, native sections
  (Apple Notes / Google Drive / Gmail), and the live `ConnectPanel`.
- `src/lib/integrations/preview-catalog.ts` — the static catalog. Each `IntegrationItem`
  already carries `actions: string[]`, `blurb`, `brand`, `category`, `implemented`,
  `native`, `coveredBy`, and suite-routing helpers (`connectTargetFor`,
  `INTEGRATION_BY_ID`, `IMPLEMENTED_COUNT`, `groupByCategory`, `filterIntegrations`,
  `CATEGORY_META`, `CATEGORY_ORDER`).

## 3. Target design

### 3.1 Layout — two-pane

Replace the stacked-category logo wall on the Integrations tab with a two-pane layout:

- **Header** (mostly unchanged): title "Integrations" + subtitle. Add two status pills
  next to (or under) the title:
  - **`N available`** — `IMPLEMENTED_COUNT` (or the count of currently-visible available
    items; see §3.6).
  - **`N connected`** — `connectedIds.size`, rendered with a small live dot.
  Search box stays top-right, existing filter behavior.
- **Left rail** — a vertical, single-select category list inside the content pane:
  - Top item **All**, then Cabinet's existing categories in `CATEGORY_ORDER`
    (Communication, Productivity, Knowledge, Social, Development, Sales & Support,
    Finance & Legal, Data & Analytics, People & HR, Automation & AI). Use the existing
    `CATEGORY_META[...].label`.
  - Active item = filled `--primary` pill (our brand), matching the hub's active-tab
    accent. Inactive = muted, hover → foreground.
  - Client-side filter only. Selecting a category filters the grid; **All** clears it.
- **Right grid** — responsive card grid (2 columns on narrow, 3 on wide), replacing the
  logo wall. Above the grid: an **`AVAILABLE n`** label that reflects the current
  category + search selection.

The "Don't see your integration?" request box (`RequestSection`) is preserved, below
the grid.

### 3.2 The card

Self-contained card, `rounded-2xl border border-border bg-card`, borrowing the reference's
card wireframe:

- Top row: small `LogoTile` + **name**, with a muted **category tag** (the
  `CATEGORY_META` label) top-right.
- 2-line clamped **blurb** (existing `item.blurb`).
- Button row: **Details** (secondary / outline) + **Connect** (primary, `--primary`).

State handling (reuses existing derivation from `LayoutGallery`/`GalleryTile`):

- **Available, not connected** → Details + Connect (primary).
- **Connected** (`connectedIds` incl. `coveredBy`, honoring `workAccountOnly` +
  `msWorkAccountConnected`) → a green "Connected" indicator on the card; the primary
  button reads **Manage** and opens the Connect modal (which surfaces connected state +
  disconnect).
- **Coming-soon** (`!item.implemented`) → card visually dimmed (`DimWhenComingSoon`);
  **Details still opens** (preview of what it will do); the primary button becomes
  **Request** → **Requested** (in-flight: `Requesting…`), reusing the existing
  `submitIntegrationRequest` + `cabinet-requested-integrations` localStorage flow.
- **Connecting** → while a connect attempt is in flight, the Connect button is replaced
  **in place** by a `Connecting…` spinner (no full-page block), matching the reference's
  low-disruption feedback. (Drives off the ConnectPanel's connecting state, surfaced up
  to the card, or shown on the card that launched the modal.)

Native integrations (`item.native`) are always available and open the Connect modal
housing their native section.

### 3.3 Details modal (read-only)

A backdrop-blurred, centered, `rounded-2xl` modal built on the existing
`@/components/ui/dialog` (already used for the thank-you dialog), styled to the reference's
*shape* but with Cabinet tokens and a top-right close button.

Content:

- Header: `LogoTile` + name + one-line blurb.
- Body: the `actions[]` rendered as capability rows — each row a lightning icon in a
  rounded `--primary`-tinted square + the action label. Empty state: "No actions listed".
- Footer: a **Connect** button that hands off to the Connect modal (for coming-soon
  items this reads **Request** instead, matching card state).

No tabs — Cabinet has `actions` only, no triggers.

### 3.4 Connect modal (re-house the full detail view)

The current full-page `IntegrationDetailPage` becomes the **body of a modal**. All of it
comes along, re-parented, not rebuilt:

- Brand-tinted hero, `SetupGuide` with third-party mockups, "For developers" MCP
  disclosure, native sections (Apple Notes / Drive / Gmail), and the live `ConnectPanel`
  (including the Microsoft 365 personal/work toggle and `via`-driven default mode).
- The modal shell is scrollable (the setup guide is tall) and uses the same brand Dialog
  as the Details modal, with a top-right close and a "back to all integrations" affordance
  folded into the close.

This is a frontend re-parenting: extract the detail body so it can render either as the
modal content or (transitionally) standalone, without duplicating logic.

### 3.5 Routing & deep-linking (preserved)

Deep-linking stays route-driven, as today:

- Opening the Connect modal sets `section.slug` (and `integrationVia` when a sub-product
  card routes to its suite). The modal is open iff `section.slug` resolves to an
  integration. Closing the modal clears the slug back to `{ type: "integrations" }`.
- Result: a connector remains deep-linkable and the browser/app back button closes the
  modal, exactly like the current full-page behavior — only the visual container changes
  from a full page to a modal over the grid.
- The Details modal is **local component state** (not routed) — it's an ephemeral preview,
  not a destination.
- All suite-routing quirks are preserved unchanged: `connectTargetFor`, the
  `google-drive`/`gmail` special cases, `coveredBy`, `integrationVia`,
  `msWorkAccountConnected`.

### 3.6 Counts

- **Header `N available` pill** = the total available count across the platform-filtered
  catalog (`IMPLEMENTED_COUNT`, minus macOS-only items on non-Mac). It is a stable "how
  much can Cabinet connect to" number and does **not** shrink with search/category.
- **Grid `AVAILABLE n` label** = the count of currently-visible available items, i.e. it
  **does** reflect the active category + search. This is the "how many are you looking at
  right now" number.
- Both are pure client-side derivations over the catalog — no new data.
- `N connected` pill: `connectedIds.size` from the existing `mcp-catalog` fetch.

## 4. Component boundaries

Proposed units (final names/splits decided in the plan):

- `IntegrationsHubPage` — unchanged responsibilities (tabs, search, connected-ids fetch,
  selected slug), now renders the two-pane gallery + the route-driven Connect modal.
- Gallery (replaces `LayoutGallery`): owns the left rail + category selection + card grid
  + counts + the coming-soon request flow + the request box.
- `IntegrationCard` — the self-contained card with Details/Connect/Manage/Request states
  and the in-place `Connecting…` spinner.
- `IntegrationDetailsModal` — read-only capabilities modal.
- `IntegrationConnectModal` — wraps the extracted detail body in the brand Dialog shell.
- `IntegrationDetailBody` — the extracted content of today's `IntegrationDetailPage`
  (hero + setup guide + connect panel + native sections), rendered inside the modal.

Each unit has one clear purpose and communicates through props already used in the
current components (`IntegrationItem`, `connectedIds`, `msWorkAccountConnected`, `via`,
`onOpen`/`onClose`).

## 5. Testing

- The repo has an e2e/agent test setup; add/extend coverage for: category rail filtering,
  search + category interaction, the two count pills, opening Details → capabilities list,
  opening Connect → setup guide renders, and the coming-soon Request flow.
- Manual/visual verification per the `/verify` skill: drive the Integrations tab in the
  running app — filter by category, open both modals, run a real connect on an available
  connector, confirm deep-link (`section.slug`) + back-button-closes-modal still work.
- Verify light and dark themes, and that no reference-app literal colors leaked in (brand
  tokens only).

## 6. Risks & mitigations

- **Double left column** (app nav + category rail): accepted — faithful to the reference,
  lives inside the content pane at `max-w-6xl`.
- **Tall Connect modal**: the setup guide is long; modal body must scroll cleanly and cap
  height to the viewport.
- **Re-parenting regressions**: extracting `IntegrationDetailBody` must not change the
  ConnectPanel's runtime behavior (M365 toggle, native sections). Mitigation: extract
  without editing internals; keep the standalone render path until the modal is verified.
- **Coming-soon in a card grid**: cards are larger than tiles, so the roadmap of dimmed
  "soon" connectors is more prominent — ensure the dimming + Request affordance reads as
  intentional, not broken.

## 7. Out of scope

MCPs tab, API Keys tab, any backend/API change, broker adoption, triggers, monetization
("use our key"), and changes to the connector catalog contents.
