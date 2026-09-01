# Integrations Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Integrations tab's browse surface as a two-pane category-rail + card-grid layout with Details and Connect modals, borrowing the reference's wireframes while keeping Cabinet's brand.

**Architecture:** Pure derivation rules (filtering, counts, per-card state) move into a React-free `hub-view-model.ts` so they are unit-testable; the current full-page detail view is extracted into an `IntegrationDetailBody` that renders either standalone or as the Connect modal's body; the hub page keeps owning routing (`section.slug`), the connected-ids fetch, and the new connecting-ids set.

**Tech Stack:** Next.js (App Router) + React client components, TypeScript, Tailwind v4 with Cabinet design tokens, `@base-ui/react` primitives (via `src/components/ui/{dialog,button}.tsx`), `lucide-react` icons, `node:test` + `tsx` for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-07-16-integrations-hub-redesign-design.md`

## Global Constraints

- **Frontend-only.** No new API routes, no backend changes, no new npm dependencies. The only data sources are the static `src/lib/integrations/preview-catalog.ts` and the existing `GET /api/agents/config/mcp-catalog` fetch already in `integrations-hub-page.tsx`.
- **Cabinet brand tokens only.** Use `bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`/`text-primary`, and per-item `item.brand`. **Never** introduce the reference's `#ea2070` literal or its warm `oklch` gradient shell. Borrow layout/wireframe only.
- **Scope fence.** Only the **Integrations** tab changes. The **MCPs** and **API Keys** tabs of `integrations-hub-page.tsx` must render exactly as they do today.
- **Copy style.** No em dashes and no sparkles icons in UI copy (see commit `56dc364a`). Use plain hyphens.
- **Strings are hardcoded English**, matching every existing component in `src/components/integrations/hub/`. Do **not** add `useLocale()`/i18n keys to these components; that would diverge from the surrounding subsystem.
- **No component-test harness exists.** The repo has no `@testing-library`, no vitest/jest, and zero `.test.tsx` files. Do **not** add one. Unit tests are `node:test` (`*.test.ts`) for pure logic only; UI behavior is covered by Playwright e2e.
- **Preserve suite routing verbatim:** `connectTargetFor`, `coveredBy`, `integrationVia`, the `google-drive`/`gmail` special cases, `workAccountOnly` + `msWorkAccountConnected`.
- Every task ends green on: `npx tsc --noEmit` and `npm run lint`.

## Spec deviations recorded in this plan

Two points where implementation forced a decision the spec did not settle. Both are deliberate:

1. **`N connected` pill counts connected _cards_, not `connectedIds.size`.** The spec said `connectedIds.size`. That set holds MCP-catalog ids, which can include ids with no card in the preview catalog, and one suite connection (google-workspace) lights three cards (Workspace, Gmail, Calendar). `connectedIds.size` would therefore disagree with the green cards on screen. Counting cards keeps both pills describing the same catalog the user is looking at.
2. **The card's `Connecting...` button is clickable and reopens the Connect modal** (the reference's is a disabled spinner). Because setup now happens inside the modal, a disabled spinner would strand a user mid-OAuth with no way back in. Reopening is also what clears a stale flag, so no timer is needed.

## File Structure

**Create:**
- `src/lib/integrations/hub-view-model.ts` - React-free derivation rules: `CategorySelection`, `CardState`, `deriveCardState`, `visibleIntegrations`, `availableCount`, `connectedCount`, `railCategories`, `connectSlugFor`.
- `test/integrations-hub-view-model.test.ts` - `node:test` unit tests for the above.
- `src/components/integrations/hub/integration-detail-body.tsx` - the extracted contents of today's `IntegrationDetailPage` (hero, capabilities, setup guide, trust note, connect/native panel). Renders standalone or as modal body.
- `src/components/integrations/hub/category-rail.tsx` - the left vertical category rail.
- `src/components/integrations/hub/integration-card.tsx` - the self-contained card.
- `src/components/integrations/hub/integration-details-modal.tsx` - read-only capabilities modal.
- `src/components/integrations/hub/integration-connect-modal.tsx` - modal shell wrapping `IntegrationDetailBody`.
- `src/components/integrations/hub/layouts/layout-grid.tsx` - the two-pane gallery (rail + grid + counts + request flows).
- `e2e/integrations-hub.spec.ts` - Playwright coverage.

**Modify:**
- `src/components/integrations/hub/integration-detail-page.tsx` - becomes a thin scroll-container wrapper over `IntegrationDetailBody` (Task 2), then is deleted (Task 7).
- `src/components/integrations/hub/connect-panel.tsx` - gains an `onConnectingChange` callback prop (Task 6).
- `src/components/integrations/hub/integrations-hub-page.tsx` - renders the two-pane gallery + route-driven Connect modal; owns `connectingIds` (Task 7).

**Delete:**
- `src/components/integrations/hub/layouts/layout-gallery.tsx` - replaced by `layout-grid.tsx` (Task 7). Its request flows (`REQUESTED_KEY` persistence, `submitIntegrationRequest`, `RequestSection`) move to `layout-grid.tsx`.
- `src/components/integrations/hub/integration-detail-page.tsx` - dead once the hub renders the modal (Task 7).

---

### Task 1: View-model (pure derivation rules)

The only properly unit-testable layer. Everything downstream reads these rules instead of re-deriving them inline.

**Files:**
- Create: `src/lib/integrations/hub-view-model.ts`
- Test: `test/integrations-hub-view-model.test.ts`

**Interfaces:**
- Consumes: `IntegrationItem`, `IntegrationCategory`, `CATEGORY_META`, `CATEGORY_ORDER`, `filterIntegrations`, `connectTargetFor` from `@/lib/integrations/preview-catalog`.
- Produces:
  - `type CategorySelection = IntegrationCategory | "all"`
  - `type CardState = "connected" | "available" | "soon"`
  - `deriveCardState({ item, connectedIds, msWorkAccountConnected }): CardState`
  - `visibleIntegrations({ items, query, category }): IntegrationItem[]`
  - `availableCount(items: IntegrationItem[]): number`
  - `connectedCount({ items, connectedIds, msWorkAccountConnected }): number`
  - `railCategories(items: IntegrationItem[]): { id: CategorySelection; label: string }[]`
  - `connectSlugFor(id: string): string`

- [ ] **Step 1: Write the failing test**

Create `test/integrations-hub-view-model.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  availableCount,
  connectSlugFor,
  connectedCount,
  deriveCardState,
  railCategories,
  visibleIntegrations,
} from "@/lib/integrations/hub-view-model";
import type { IntegrationItem } from "@/lib/integrations/preview-catalog";

/** A minimal catalog item; override only what the assertion is about. */
function item(overrides: Partial<IntegrationItem> & { id: string }): IntegrationItem {
  return {
    name: overrides.id,
    category: "communication",
    logo: "/logos/example.svg",
    blurb: "",
    brand: "#000000",
    implemented: true,
    actions: [],
    ...overrides,
  } as IntegrationItem;
}

const NONE = new Set<string>();

test("deriveCardState: an unimplemented connector is always 'soon', even if connected", () => {
  const state = deriveCardState({
    item: item({ id: "zoom", implemented: false }),
    connectedIds: new Set(["zoom"]),
    msWorkAccountConnected: false,
  });
  assert.equal(state, "soon");
});

test("deriveCardState: 'available' when implemented but not connected", () => {
  const state = deriveCardState({
    item: item({ id: "slack" }),
    connectedIds: NONE,
    msWorkAccountConnected: false,
  });
  assert.equal(state, "available");
});

test("deriveCardState: 'connected' via its own id", () => {
  const state = deriveCardState({
    item: item({ id: "slack" }),
    connectedIds: new Set(["slack"]),
    msWorkAccountConnected: false,
  });
  assert.equal(state, "connected");
});

test("deriveCardState: 'connected' via the suite that covers it", () => {
  const state = deriveCardState({
    item: item({ id: "google-calendar", coveredBy: "google-workspace" }),
    connectedIds: new Set(["google-workspace"]),
    msWorkAccountConnected: false,
  });
  assert.equal(state, "connected");
});

test("deriveCardState: a work-only sub-product stays 'available' on a personal account", () => {
  const state = deriveCardState({
    item: item({ id: "sharepoint", coveredBy: "microsoft-365", workAccountOnly: true }),
    connectedIds: new Set(["microsoft-365"]),
    msWorkAccountConnected: false,
  });
  assert.equal(state, "available");
});

test("deriveCardState: a work-only sub-product is 'connected' with work credentials", () => {
  const state = deriveCardState({
    item: item({ id: "sharepoint", coveredBy: "microsoft-365", workAccountOnly: true }),
    connectedIds: new Set(["microsoft-365"]),
    msWorkAccountConnected: true,
  });
  assert.equal(state, "connected");
});

test("visibleIntegrations: filters to the selected category", () => {
  const items = [
    item({ id: "slack", category: "communication" }),
    item({ id: "notion", category: "knowledge" }),
  ];
  const visible = visibleIntegrations({ items, query: "", category: "knowledge" });
  assert.deepEqual(visible.map((i) => i.id), ["notion"]);
});

test("visibleIntegrations: 'all' keeps every category", () => {
  const items = [
    item({ id: "slack", category: "communication" }),
    item({ id: "notion", category: "knowledge" }),
  ];
  const visible = visibleIntegrations({ items, query: "", category: "all" });
  assert.deepEqual(visible.map((i) => i.id), ["slack", "notion"]);
});

test("visibleIntegrations: category and search compose", () => {
  const items = [
    item({ id: "slack", name: "Slack", category: "communication" }),
    item({ id: "discord", name: "Discord", category: "communication" }),
    item({ id: "notion", name: "Notion", category: "knowledge" }),
  ];
  const visible = visibleIntegrations({
    items,
    query: "disc",
    category: "communication",
  });
  assert.deepEqual(visible.map((i) => i.id), ["discord"]);
});

test("availableCount: counts only implemented items", () => {
  const items = [
    item({ id: "slack", implemented: true }),
    item({ id: "zoom", implemented: false }),
  ];
  assert.equal(availableCount(items), 1);
});

test("connectedCount: counts cards that render as connected, including suite-covered ones", () => {
  const items = [
    item({ id: "google-workspace" }),
    item({ id: "google-calendar", coveredBy: "google-workspace" }),
    item({ id: "slack" }),
  ];
  const count = connectedCount({
    items,
    connectedIds: new Set(["google-workspace"]),
    msWorkAccountConnected: false,
  });
  assert.equal(count, 2);
});

test("connectedCount: an unimplemented connector never counts", () => {
  const items = [item({ id: "zoom", implemented: false })];
  const count = connectedCount({
    items,
    connectedIds: new Set(["zoom"]),
    msWorkAccountConnected: false,
  });
  assert.equal(count, 0);
});

test("railCategories: leads with All, then only categories that have items", () => {
  const items = [
    item({ id: "slack", category: "communication" }),
    item({ id: "notion", category: "knowledge" }),
  ];
  assert.deepEqual(railCategories(items), [
    { id: "all", label: "All" },
    { id: "communication", label: "Communication" },
    { id: "knowledge", label: "Knowledge" },
  ]);
});

test("connectSlugFor: routes a covered sub-product to its suite", () => {
  assert.equal(connectSlugFor("google-calendar"), "google-workspace");
});

test("connectSlugFor: google-drive and gmail keep their own detail slugs", () => {
  assert.equal(connectSlugFor("google-drive"), "google-drive");
  assert.equal(connectSlugFor("gmail"), "gmail");
});

test("connectSlugFor: a standalone connector routes to itself", () => {
  assert.equal(connectSlugFor("slack"), "slack");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/integrations-hub-view-model.test.ts`
Expected: FAIL - cannot find module `@/lib/integrations/hub-view-model`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/integrations/hub-view-model.ts`:

```ts
/**
 * Pure view-model rules for the Integrations Hub browse surface.
 *
 * Kept free of React so the rules that drive the category rail, the header
 * counts and each card's primary action can be unit-tested without a DOM - the
 * repo has no component-test harness, so this file is where the logic worth
 * testing lives, and the components above it stay dumb.
 */

import {
  CATEGORY_META,
  CATEGORY_ORDER,
  connectTargetFor,
  filterIntegrations,
  type IntegrationCategory,
  type IntegrationItem,
} from "@/lib/integrations/preview-catalog";

/** The rail's selection: a real category, or the "All" sentinel. */
export type CategorySelection = IntegrationCategory | "all";

/** Which primary action a card offers. */
export type CardState = "connected" | "available" | "soon";

/**
 * "soon" outranks everything: a gated connector must never advertise a state
 * you can't open, even if an earlier build left a live connection behind.
 * Otherwise a card is connected when its own id - or the suite covering it
 * (Gmail -> google-workspace) - is connected, except for the sub-products a
 * personal Microsoft account genuinely cannot reach (Teams, SharePoint), which
 * also need the work/school credentials.
 */
export function deriveCardState({
  item,
  connectedIds,
  msWorkAccountConnected,
}: {
  item: IntegrationItem;
  connectedIds: Set<string>;
  msWorkAccountConnected: boolean;
}): CardState {
  if (!item.implemented) return "soon";
  const suiteConnected =
    connectedIds.has(item.id) ||
    (!!item.coveredBy && connectedIds.has(item.coveredBy));
  const connected =
    suiteConnected && (!item.workAccountOnly || msWorkAccountConnected);
  return connected ? "connected" : "available";
}

/** The cards to render: rail selection first, then the search box. */
export function visibleIntegrations({
  items,
  query,
  category,
}: {
  items: IntegrationItem[];
  query: string;
  category: CategorySelection;
}): IntegrationItem[] {
  const scoped =
    category === "all" ? items : items.filter((i) => i.category === category);
  return filterIntegrations(scoped, query);
}

/** How many of these are connectable today, as opposed to "Soon". */
export function availableCount(items: IntegrationItem[]): number {
  return items.filter((i) => i.implemented).length;
}

/**
 * How many cards render as connected. Deliberately counts cards rather than
 * the raw connected-id set: one suite OAuth (google-workspace) lights three
 * cards, and the set can hold MCP ids with no card at all, so the set's size
 * would disagree with the green cards on screen.
 */
export function connectedCount({
  items,
  connectedIds,
  msWorkAccountConnected,
}: {
  items: IntegrationItem[];
  connectedIds: Set<string>;
  msWorkAccountConnected: boolean;
}): number {
  return items.filter(
    (item) =>
      deriveCardState({ item, connectedIds, msWorkAccountConnected }) ===
      "connected",
  ).length;
}

/**
 * The rail's rows: "All", then every category with at least one item. Callers
 * pass the platform-filtered base list, NOT the searched list - a rail that
 * reshuffled on each keystroke would move the row out from under the cursor.
 */
export function railCategories(
  items: IntegrationItem[],
): { id: CategorySelection; label: string }[] {
  const present = CATEGORY_ORDER.filter((c) =>
    items.some((i) => i.category === c),
  );
  return [
    { id: "all" as const, label: "All" },
    ...present.map((c) => ({ id: c, label: CATEGORY_META[c].label })),
  ];
}

/**
 * The slug whose detail view a card opens. Google Drive (Drive-for-Desktop)
 * and Gmail (IMAP) are Cabinet-native and keep their own pages rather than
 * folding into the Google Workspace OAuth suite; everything else defers to the
 * catalog's suite routing.
 */
export function connectSlugFor(id: string): string {
  if (id === "google-drive" || id === "gmail") return id;
  return connectTargetFor(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/integrations-hub-view-model.test.ts`
Expected: PASS - 16 tests pass.

- [ ] **Step 5: Verify the whole suite and types are green**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all existing unit tests still pass, no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/hub-view-model.ts test/integrations-hub-view-model.test.ts
git commit -m "feat(integrations): pure view-model rules for the hub browse surface"
```

---

### Task 2: Extract `IntegrationDetailBody`

Pure refactor, zero behavior change. Splits the detail view's *content* from its *container* so Task 6 can mount the same content inside a modal without duplicating any logic.

**Files:**
- Create: `src/components/integrations/hub/integration-detail-body.tsx`
- Modify: `src/components/integrations/hub/integration-detail-page.tsx` (becomes a thin wrapper)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `IntegrationDetailBody({ item, via, onBack }: { item: IntegrationItem; via?: string | null; onBack?: () => void })`. Renders the hero + body grid with **no outer scroll container**. The back button renders **only when `onBack` is passed** - the modal omits it and relies on its own close button.

- [ ] **Step 1: Create the body file by moving the existing implementation**

Create `src/components/integrations/hub/integration-detail-body.tsx` with the **entire current contents** of `integration-detail-page.tsx` (all imports, `M365_WORK_ONLY_VIA`, `M365_CAPABILITIES`, the component, `TierBadge`, `TrustVariant`, `ENV_CODE`, `TRUST_COPY`, `TrustNote`), with exactly four edits:

1. Rename the exported component `IntegrationDetailPage` -> `IntegrationDetailBody`.
2. Make `onBack` optional in the props type:

```tsx
export function IntegrationDetailBody({
  item,
  via,
  onBack,
}: {
  item: IntegrationItem;
  /** The sub-product card the user clicked to reach this suite page, if any. */
  via?: string | null;
  /** When provided, renders the "All integrations" back link in the hero. */
  onBack?: () => void;
}) {
```

3. Replace the outermost element - drop `h-full overflow-y-auto` (the container owns scrolling now):

```tsx
  return (
    <div className="bg-background">
```

4. Make the hero back button conditional. Replace:

```tsx
          <button
            type="button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All integrations
          </button>
```

with:

```tsx
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All integrations
            </button>
          )}
```

Also update the file's doc comment to describe the body rather than the page:

```tsx
/**
 * The contents of a single integration's configuration view: a high-contrast
 * logo tile, a friendly trust note (the MCP/CLI detail tucked into a "For
 * developers" disclosure), and a step-by-step setup guide with mini-mockups of
 * the third-party UI. The static connect data (steps, tier) is read straight
 * from the MCP catalog; the ConnectPanel handles the live runtime state.
 *
 * Container-agnostic: it does not scroll itself. `IntegrationConnectModal`
 * mounts it inside a dialog. Pass `onBack` to get the hero's back link.
 */
```

- [ ] **Step 2: Reduce the page to a wrapper**

Replace the **entire contents** of `src/components/integrations/hub/integration-detail-page.tsx` with:

```tsx
"use client";

import type { IntegrationItem } from "@/lib/integrations/preview-catalog";
import { IntegrationDetailBody } from "@/components/integrations/hub/integration-detail-body";

/**
 * Full-page configuration view for a single integration, opened in place of the
 * browse grid. Owns only the scroll container and the back link; all content
 * lives in IntegrationDetailBody, which the Connect modal also mounts.
 */
export function IntegrationDetailPage({
  item,
  via,
  onBack,
}: {
  item: IntegrationItem;
  via?: string | null;
  onBack: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <IntegrationDetailBody item={item} via={via} onBack={onBack} />
    </div>
  );
}
```

- [ ] **Step 3: Verify types and lint are green**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors. In particular no "unused import" errors in `integration-detail-page.tsx` - it should now import only the two symbols above.

- [ ] **Step 4: Verify no behavior change in the running app**

Run: `npm run dev:all`, open the app, go to Integrations, click the **Slack** tile.
Expected: the detail page renders exactly as before - brand hero, "All integrations" back link, "What your agents can do", setup guide, trust note, and the connect panel on the right. The back link returns to the gallery.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/hub/integration-detail-body.tsx src/components/integrations/hub/integration-detail-page.tsx
git commit -m "refactor(integrations): split detail view content from its page container"
```

---

### Task 3: Category rail

**Files:**
- Create: `src/components/integrations/hub/category-rail.tsx`

**Interfaces:**
- Consumes: `CategorySelection`, `railCategories` from Task 1.
- Produces: `CategoryRail({ categories, selected, onSelect })` where `categories: { id: CategorySelection; label: string }[]`, `selected: CategorySelection`, `onSelect: (id: CategorySelection) => void`.

- [ ] **Step 1: Write the component**

Create `src/components/integrations/hub/category-rail.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { CategorySelection } from "@/lib/integrations/hub-view-model";

/**
 * The browse surface's left rail: a single-select category filter. Rows come
 * from railCategories() so the list stays stable while the user types in the
 * search box.
 */
export function CategoryRail({
  categories,
  selected,
  onSelect,
}: {
  categories: { id: CategorySelection; label: string }[];
  selected: CategorySelection;
  onSelect: (id: CategorySelection) => void;
}) {
  return (
    <nav
      aria-label="Integration categories"
      data-testid="category-rail"
      className="flex flex-col gap-0.5"
    >
      <h2 className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Categories
      </h2>
      {categories.map((category) => {
        const active = category.id === selected;
        return (
          <button
            key={category.id}
            type="button"
            aria-current={active ? "true" : undefined}
            data-testid="category-rail-item"
            data-category={category.id}
            data-active={active ? "true" : "false"}
            onClick={() => onSelect(category.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-start text-[13px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {category.label}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verify types and lint are green**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors. (The component is not mounted yet; Task 7 wires it in.)

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/hub/category-rail.tsx
git commit -m "feat(integrations): category rail for the hub browse surface"
```

---

### Task 4: Integration card

**Files:**
- Create: `src/components/integrations/hub/integration-card.tsx`

**Interfaces:**
- Consumes: `CardState` from Task 1; `LogoTile`, `DimWhenComingSoon` from `@/components/integrations/hub/integration-visuals`; `CATEGORY_META`, `IntegrationItem` from the catalog.
- Produces: `IntegrationCard({ item, state, connecting, requested, requesting, onDetails, onConnect, onRequest })`.
  - `state: CardState`, all of `connecting`/`requested`/`requesting`: `boolean`.
  - `onDetails`, `onConnect`, `onRequest`: `(item: IntegrationItem) => void`.
  - Button precedence: `connected` -> **Manage**; `connecting` -> **Connecting...** (clickable, calls `onConnect` to resume); `soon` -> **Request**/**Requested**/**Requesting...**; otherwise **Connect**.
  - Test hooks: root `data-testid="integration-card"` + `data-integration-id` + `data-state`; buttons `data-testid="integration-details-button"` / `"integration-primary-button"`.

- [ ] **Step 1: Write the component**

Create `src/components/integrations/hub/integration-card.tsx`:

```tsx
"use client";

import { Check, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_META,
  type IntegrationItem,
} from "@/lib/integrations/preview-catalog";
import type { CardState } from "@/lib/integrations/hub-view-model";
import {
  DimWhenComingSoon,
  LogoTile,
} from "@/components/integrations/hub/integration-visuals";

/**
 * One connector in the browse grid: logo, name, category tag, blurb, and a
 * Details / primary-action pair.
 *
 * The primary action is polymorphic so the auth-type complexity stays hidden
 * behind one button. "Connecting..." stays clickable on purpose - setup happens
 * inside the Connect modal, so a user who closed it mid-OAuth needs a way back
 * in, and reopening is also what lets the panel clear a stale flag.
 */
export function IntegrationCard({
  item,
  state,
  connecting,
  requested,
  requesting,
  onDetails,
  onConnect,
  onRequest,
}: {
  item: IntegrationItem;
  state: CardState;
  /** A connect for this connector is in flight, possibly behind a closed modal. */
  connecting: boolean;
  /** This coming-soon connector has already been requested from the team. */
  requested: boolean;
  /** A request for this coming-soon connector is in flight. */
  requesting: boolean;
  onDetails: (item: IntegrationItem) => void;
  onConnect: (item: IntegrationItem) => void;
  onRequest: (item: IntegrationItem) => void;
}) {
  const soon = state === "soon";

  return (
    <div
      data-testid="integration-card"
      data-integration-id={item.id}
      data-state={state}
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card p-4 transition-shadow",
        !soon && "hover:shadow-sm",
      )}
    >
      <DimWhenComingSoon implemented={!soon} className="flex flex-1 flex-col">
        <div className="flex items-start gap-3">
          <LogoTile
            item={item}
            size={40}
            logoSize={22}
            className="rounded-xl ring-1 ring-border/60"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-[14px] font-semibold text-foreground">
                {item.name}
              </h3>
              <span className="shrink-0 rounded-md bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {CATEGORY_META[item.category].label}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
              {item.blurb}
            </p>
          </div>
        </div>

        {state === "connected" && (
          <span
            data-testid="integration-connected-badge"
            className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
          >
            <Check className="h-2.5 w-2.5" /> Connected
          </span>
        )}
      </DimWhenComingSoon>

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          data-testid="integration-details-button"
          onClick={() => onDetails(item)}
        >
          <Info /> Details
        </Button>
        <PrimaryAction
          item={item}
          state={state}
          connecting={connecting}
          requested={requested}
          requesting={requesting}
          onConnect={onConnect}
          onRequest={onRequest}
        />
      </div>
    </div>
  );
}

function PrimaryAction({
  item,
  state,
  connecting,
  requested,
  requesting,
  onConnect,
  onRequest,
}: {
  item: IntegrationItem;
  state: CardState;
  connecting: boolean;
  requested: boolean;
  requesting: boolean;
  onConnect: (item: IntegrationItem) => void;
  onRequest: (item: IntegrationItem) => void;
}) {
  const className = "flex-1";

  if (state === "soon") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        data-testid="integration-primary-button"
        disabled={requesting || requested}
        onClick={() => onRequest(item)}
      >
        {requesting ? (
          <>
            <Loader2 className="animate-spin" /> Requesting...
          </>
        ) : requested ? (
          <>
            <Check /> Requested
          </>
        ) : (
          "Request"
        )}
      </Button>
    );
  }

  if (state === "connected") {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        data-testid="integration-primary-button"
        onClick={() => onConnect(item)}
      >
        Manage
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={className}
      data-testid="integration-primary-button"
      onClick={() => onConnect(item)}
    >
      {connecting ? (
        <>
          <Loader2 className="animate-spin" /> Connecting...
        </>
      ) : (
        "Connect"
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Verify types and lint are green**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/hub/integration-card.tsx
git commit -m "feat(integrations): self-contained connector card"
```

---

### Task 5: Details modal

**Files:**
- Create: `src/components/integrations/hub/integration-details-modal.tsx`

**Interfaces:**
- Consumes: `CardState` from Task 1; `Dialog`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`.
- Produces: `IntegrationDetailsModal({ item, state, open, onOpenChange, onConnect })`. `item: IntegrationItem | null` (null closes it). `onConnect: (item: IntegrationItem) => void` hands off to the Connect modal.

Read-only: it lists `item.actions` only. No tabs - Cabinet has no "triggers" concept.

- [ ] **Step 1: Write the component**

Create `src/components/integrations/hub/integration-details-modal.tsx`:

```tsx
"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IntegrationItem } from "@/lib/integrations/preview-catalog";
import type { CardState } from "@/lib/integrations/hub-view-model";
import { LogoTile } from "@/components/integrations/hub/integration-visuals";

/**
 * Read-only capability browser: what your agents can do with a connector,
 * before you commit to connecting it. Sourced from the catalog's static
 * actions list, so it costs no request.
 */
export function IntegrationDetailsModal({
  item,
  state,
  open,
  onOpenChange,
  onConnect,
}: {
  item: IntegrationItem | null;
  state: CardState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (item: IntegrationItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="integration-details-modal"
        className="sm:max-w-md"
      >
        {item && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <LogoTile
                  item={item}
                  size={44}
                  logoSize={24}
                  className="rounded-xl ring-1 ring-border/60"
                />
                <div className="min-w-0 flex-1">
                  <DialogTitle>{item.name}</DialogTitle>
                  <DialogDescription className="mt-1.5 text-[13px]">
                    {item.blurb}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                What your agents can do
              </h3>
              {item.actions.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  No actions listed yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2" data-testid="integration-actions">
                  {item.actions.map((action) => (
                    <li key={action} className="flex items-start gap-2.5">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Zap className="h-3 w-3 text-primary" />
                      </span>
                      <span className="text-[13px] text-foreground">{action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DialogFooter>
              <Button
                data-testid="integration-details-connect"
                disabled={state === "soon"}
                onClick={() => onConnect(item)}
              >
                {state === "connected" ? "Manage" : "Connect"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Note: for a `soon` connector the footer button is disabled rather than offering "Request" - the request action lives on the card, and duplicating it here would need the request state threaded into the modal for no real gain.

- [ ] **Step 2: Verify types and lint are green**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/hub/integration-details-modal.tsx
git commit -m "feat(integrations): read-only capabilities modal"
```

---

### Task 6: Connect modal + ConnectPanel connecting callback

**Files:**
- Modify: `src/components/integrations/hub/connect-panel.tsx`
- Create: `src/components/integrations/hub/integration-connect-modal.tsx`

**Interfaces:**
- Consumes: `IntegrationDetailBody` from Task 2.
- Produces:
  - `ConnectPanel` gains an optional prop `onConnectingChange?: (connecting: boolean) => void`. **The callback must be stable** (wrap in `useCallback` at the call site) - it is an effect dependency.
  - `IntegrationDetailBody` gains an optional pass-through prop `onConnectingChange?: (connecting: boolean) => void`, forwarded to `ConnectPanel`.
  - `IntegrationConnectModal({ item, via, open, onOpenChange, onConnectingChange })`.

- [ ] **Step 1: Add the connecting callback to ConnectPanel**

In `src/components/integrations/hub/connect-panel.tsx`:

1. Ensure `useEffect` is imported from `react` (add it to the existing react import if absent).
2. Add the prop to the component's props type:

```tsx
  /**
   * Reports whether a connect is in flight, so the browse grid can keep showing
   * "Connecting..." on the card after this panel's modal is closed. Deliberately
   * NOT called with `false` on unmount: a closed modal does not cancel the
   * server-side session, and the card is the only place that remains visible.
   * Must be referentially stable - it is an effect dependency.
   */
  onConnectingChange?: (connecting: boolean) => void;
```

3. Immediately after the `busy`, `oauthLogin` and `msLogin` state declarations (they exist around lines 105-130), add:

```tsx
  // One aggregate flag for "the user has started something and it hasn't landed".
  const connecting =
    busy ||
    oauthLogin.state === "starting" ||
    oauthLogin.state === "pending" ||
    msLogin.state === "starting" ||
    msLogin.state === "pending";
  useEffect(() => {
    onConnectingChange?.(connecting);
  }, [connecting, onConnectingChange]);
```

- [ ] **Step 2: Forward the callback through IntegrationDetailBody**

In `src/components/integrations/hub/integration-detail-body.tsx`, add to the props type:

```tsx
  /** Forwarded to ConnectPanel; see its own docs. Must be stable. */
  onConnectingChange?: (connecting: boolean) => void;
```

and add it to the destructured params, then pass it to the `ConnectPanel` render:

```tsx
            <ConnectPanel
              item={item}
              msMode={msMode}
              onMsModeChange={setMsMode}
              msPersonalDisabled={msWorkOnly}
              onConnectingChange={onConnectingChange}
            />
```

- [ ] **Step 3: Write the Connect modal**

Create `src/components/integrations/hub/integration-connect-modal.tsx`:

```tsx
"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { IntegrationItem } from "@/lib/integrations/preview-catalog";
import { IntegrationDetailBody } from "@/components/integrations/hub/integration-detail-body";

/**
 * The connector's whole setup surface, in a dialog: brand hero, capability
 * list, step-by-step guide, trust note, and the live ConnectPanel. Everything
 * is IntegrationDetailBody - this file only supplies the shell.
 *
 * The body is wide and tall, so the dialog opts out of the default `sm:max-w-sm`
 * and lets DialogContent's built-in max-height scroll it.
 */
export function IntegrationConnectModal({
  item,
  via,
  open,
  onOpenChange,
  onConnectingChange,
}: {
  item: IntegrationItem | null;
  via?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Must be referentially stable - forwarded into an effect dependency. */
  onConnectingChange?: (connecting: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="integration-connect-modal"
        // The body brings its own padding and brand-tinted hero, so the shell
        // must not add any of its own.
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {item && (
          <>
            {/* The hero shows the name visually; this keeps the dialog labelled
                for assistive tech without rendering a second heading. */}
            <DialogTitle className="sr-only">{`Connect ${item.name}`}</DialogTitle>
            <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto">
              <IntegrationDetailBody
                item={item}
                via={via}
                onConnectingChange={onConnectingChange}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Verify types and lint are green**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors, no lint errors.

- [ ] **Step 5: Verify the existing detail page still works**

Run: `npm run dev:all`, open Integrations, click **Slack**.
Expected: unchanged behavior - the added prop is optional and unused by the page path.

- [ ] **Step 6: Commit**

```bash
git add src/components/integrations/hub/connect-panel.tsx src/components/integrations/hub/integration-detail-body.tsx src/components/integrations/hub/integration-connect-modal.tsx
git commit -m "feat(integrations): connect modal housing the full setup flow"
```

---

### Task 7: Two-pane gallery + hub wiring

The task that makes everything visible: builds the rail+grid gallery, moves the request flows over from `layout-gallery.tsx`, wires the modals to the route, tracks `connectingIds`, and deletes the two now-dead files.

**Files:**
- Create: `src/components/integrations/hub/layouts/layout-grid.tsx`
- Modify: `src/components/integrations/hub/integrations-hub-page.tsx`
- Delete: `src/components/integrations/hub/layouts/layout-gallery.tsx`
- Delete: `src/components/integrations/hub/integration-detail-page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5, 6.
- Produces: `LayoutGrid({ items, query, connectedIds, msWorkAccountConnected, connectingIds, onOpen, onConnectingChange })` where `items` is the platform-filtered catalog (**not** search-filtered - the grid applies `query` itself via `visibleIntegrations` so the rail can stay stable), `onOpen: (id: string) => void` opens a connector's Connect modal by **card id**.

- [ ] **Step 1: Write the two-pane gallery**

Create `src/components/integrations/hub/layouts/layout-grid.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Asterisk, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/lib/ui/toast";
import {
  type IntegrationItem,
} from "@/lib/integrations/preview-catalog";
import {
  availableCount,
  connectSlugFor,
  deriveCardState,
  railCategories,
  visibleIntegrations,
  type CategorySelection,
} from "@/lib/integrations/hub-view-model";
import { CategoryRail } from "@/components/integrations/hub/category-rail";
import { IntegrationCard } from "@/components/integrations/hub/integration-card";
import { IntegrationDetailsModal } from "@/components/integrations/hub/integration-details-modal";
import { submitIntegrationRequest } from "@/lib/telemetry/integration-request-client";

// Coming-soon connectors a user has already asked the team for. Persisted so
// the "Requested" state survives a reload and we don't double-send on re-click.
const REQUESTED_KEY = "cabinet-requested-integrations";

function loadRequested(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(REQUESTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistRequested(ids: Set<string>): void {
  try {
    window.localStorage.setItem(REQUESTED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore localStorage failures */
  }
}

/**
 * The browse surface: a single-select category rail beside a card grid.
 *
 * Owns the category selection, the Details modal, and the coming-soon request
 * flow. The Connect modal is NOT owned here - it hangs off the route in
 * IntegrationsHubPage so a connector stays deep-linkable.
 */
export function LayoutGrid({
  items,
  query,
  connectedIds,
  msWorkAccountConnected,
  connectingIds,
  onOpen,
}: {
  /** The platform-filtered catalog. Search is applied here, not by the caller. */
  items: IntegrationItem[];
  query: string;
  connectedIds: Set<string>;
  msWorkAccountConnected: boolean;
  /** Connect-target slugs with a connect in flight. */
  connectingIds: Set<string>;
  onOpen: (id: string) => void;
}) {
  const [category, setCategory] = useState<CategorySelection>("all");
  const [detailsItem, setDetailsItem] = useState<IntegrationItem | null>(null);

  // The rail reads the unsearched list on purpose: rows must not disappear as
  // the user types, or the row under the cursor moves.
  const categories = useMemo(() => railCategories(items), [items]);
  const visible = useMemo(
    () => visibleIntegrations({ items, query, category }),
    [items, query, category],
  );

  const [requestedIds, setRequestedIds] = useState<Set<string>>(loadRequested);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const requestIntegration = async (item: IntegrationItem) => {
    if (requestingId || requestedIds.has(item.id)) return;
    setRequestingId(item.id);
    const result = await submitIntegrationRequest({
      integrationId: item.id,
      integrationName: item.name,
      category: item.category,
      source: "soon-tile",
    });
    setRequestingId(null);
    if (result.ok) {
      setRequestedIds((prev) => {
        const next = new Set(prev).add(item.id);
        persistRequested(next);
        return next;
      });
      showSuccess(`Thanks. We'll try to add ${item.name} soon.`);
    } else {
      showError("Couldn't record that just now. Please try again in a bit.");
    }
  };

  const detailsState = detailsItem
    ? deriveCardState({ item: detailsItem, connectedIds, msWorkAccountConnected })
    : "available";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl gap-8 px-6 py-6 md:flex">
        {/* Left rail */}
        <div className="shrink-0 md:w-44">
          <CategoryRail
            categories={categories}
            selected={category}
            onSelect={setCategory}
          />
        </div>

        {/* Right grid */}
        <div className="mt-6 min-w-0 flex-1 md:mt-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Available
            </span>
            <span
              data-testid="visible-available-count"
              className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border"
            >
              {availableCount(visible)}
            </span>
          </div>

          {visible.length === 0 ? (
            <div className="flex min-h-[24vh] items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No integrations match your search.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((item) => (
                <IntegrationCard
                  key={item.id}
                  item={item}
                  state={deriveCardState({
                    item,
                    connectedIds,
                    msWorkAccountConnected,
                  })}
                  connecting={connectingIds.has(connectSlugFor(item.id))}
                  requested={requestedIds.has(item.id)}
                  requesting={requestingId === item.id}
                  onDetails={setDetailsItem}
                  onConnect={(i) => onOpen(i.id)}
                  onRequest={requestIntegration}
                />
              ))}
            </div>
          )}

          <RequestSection />
        </div>
      </div>

      <IntegrationDetailsModal
        item={detailsItem}
        state={detailsState}
        open={detailsItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsItem(null);
        }}
        onConnect={(item) => {
          setDetailsItem(null);
          onOpen(item.id);
        }}
      />
    </div>
  );
}

/** "Don't see your integration?" - capture requests right from the gallery. */
function RequestSection() {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v || submitting) return;
    setSubmitting(true);
    const result = await submitIntegrationRequest({
      integrationName: v,
      source: "request-box",
    });
    setSubmitting(false);
    if (result.ok) {
      showSuccess(`Thanks, we'll look into "${v}".`);
      setValue("");
    } else {
      showError("Couldn't send that just now. Please try again in a bit.");
    }
  };
  return (
    <section className="mt-12 rounded-2xl bg-foreground/[0.025] px-6 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.06]">
        <Asterisk className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-[14px] font-semibold text-foreground">
        Don&apos;t see your integration?
      </h3>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Tell us what you need. We prioritize what people ask for most.
      </p>
      <form onSubmit={submit} className="mx-auto mt-4 flex max-w-md items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Airtable, QuickBooks, HubSpot"
          className="h-9 flex-1 rounded-lg bg-foreground/[0.05] px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:bg-foreground/[0.08]"
        />
        <Button type="submit" disabled={!value.trim() || submitting}>
          {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Request
        </Button>
      </form>
    </section>
  );
}
```

Note: the old gallery popped a thank-you `Dialog` after a soon-tile click. That dialog existed because a dimmed tile gave no other feedback; the card's Request -> Requested transition now says the same thing in place, so this replaces it with a toast (consistent with `RequestSection`) and drops the dialog.

- [ ] **Step 2: Rewrite the hub page**

Replace lines 1-17 of `src/components/integrations/hub/integrations-hub-page.tsx` (the imports) with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PREVIEW_INTEGRATIONS,
  INTEGRATION_BY_ID,
} from "@/lib/integrations/preview-catalog";
import {
  availableCount,
  connectSlugFor,
  connectedCount,
} from "@/lib/integrations/hub-view-model";
import { LayoutGrid } from "@/components/integrations/hub/layouts/layout-grid";
import { IntegrationConnectModal } from "@/components/integrations/hub/integration-connect-modal";
import { useAppStore } from "@/stores/app-store";
import { CliMcpSection } from "@/components/settings/cli-mcp-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { BuiltInToolsSection } from "@/components/settings/built-in-tools-section";
```

Then replace the body of the component from the `const filtered = useMemo(...)` block (line 94) through the end of the file with:

```tsx
  // The base list every derivation starts from: the catalog minus connectors
  // that can't exist on this platform. Search is applied inside LayoutGrid.
  const base = useMemo(
    () =>
      isMac
        ? PREVIEW_INTEGRATIONS
        : PREVIEW_INTEGRATIONS.filter((i) => i.platform !== "macos"),
    // isMac is stable after hydration; PREVIEW_INTEGRATIONS is a module constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Connect-target slugs with a connect in flight. Survives closing the modal
  // on purpose - the server-side session outlives it, so the card keeps saying
  // "Connecting..." and clicking it reopens the modal to finish.
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set());

  const selected = selectedId ? INTEGRATION_BY_ID[selectedId] : null;

  // Stable: ConnectPanel takes this as an effect dependency.
  const handleConnectingChange = useCallback(
    (connecting: boolean) => {
      if (!selectedId) return;
      setConnectingIds((prev) => {
        if (connecting === prev.has(selectedId)) return prev;
        const next = new Set(prev);
        if (connecting) next.add(selectedId);
        else next.delete(selectedId);
        return next;
      });
    },
    [selectedId],
  );

  // A connector that has landed is no longer connecting; prune it so a card
  // can't be left with a stale flag behind its "Connected" badge.
  useEffect(() => {
    setConnectingIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => !connectedIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [connectedIds]);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Integrations
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Connect Cabinet to everything that runs your work, so your agents can act on all of it.
              </p>

              {tab === "integrations" && (
                <div className="mt-3 flex items-center gap-2">
                  <span
                    data-testid="available-pill"
                    className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {availableCount(base)} available
                  </span>
                  <span
                    data-testid="connected-pill"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {connectedCount({
                      items: base,
                      connectedIds,
                      msWorkAccountConnected,
                    })}{" "}
                    connected
                  </span>
                </div>
              )}
            </div>

            {/* Search - only relevant on the gallery tab */}
            {tab === "integrations" && (
              <div className="relative w-44 shrink-0 sm:w-64">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search integrations…"
                  data-testid="integration-search"
                  className="h-9 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-foreground/20"
                />
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-4 flex items-center gap-6" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative pb-3 text-[13px] font-medium transition-colors",
                  tab === t.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content (each tab owns its own scroll) */}
      <div className="min-h-0 flex-1">
        {tab === "integrations" && (
          <LayoutGrid
            items={base}
            query={query}
            connectedIds={connectedIds}
            msWorkAccountConnected={msWorkAccountConnected}
            connectingIds={connectingIds}
            onOpen={(id) => {
              const slug = connectSlugFor(id);
              setSection({
                type: "integrations",
                slug,
                // Remember the actual card when it routes to a suite, so the
                // detail body can default to the right account mode.
                integrationVia: slug !== id ? id : undefined,
              });
            }}
          />
        )}
        {tab === "mcps" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-4xl space-y-8 px-6 py-6">
              <CliMcpSection />
              <BuiltInToolsSection />
            </div>
          </div>
        )}
        {tab === "keys" && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-4xl px-6 py-6">
              <ApiKeysSection />
            </div>
          </div>
        )}
      </div>

      {/* Route-driven: `#/integrations/{id}` opens it, closing clears the slug. */}
      <IntegrationConnectModal
        item={selected}
        via={selectedVia}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSection({ type: "integrations" });
        }}
        onConnectingChange={handleConnectingChange}
      />
    </div>
  );
}
```

Leave the component's opening lines (state, `selectedId`, `selectedVia`, `setSection`, the `connectedIds` fetch effect and `isMac`) exactly as they are, and update the file's doc comment's first tab bullet to:

```
 *  - Integrations — the category rail + card grid of connectors (Details and
 *                   Connect open modals; Connect is route-driven).
```

- [ ] **Step 3: Delete the two dead files**

```bash
git rm src/components/integrations/hub/layouts/layout-gallery.tsx src/components/integrations/hub/integration-detail-page.tsx
```

- [ ] **Step 4: Verify nothing still references them**

Run: `grep -rn "layout-gallery\|LayoutGallery\|integration-detail-page\|IntegrationDetailPage" src/ e2e/ test/`
Expected: no matches.

- [ ] **Step 5: Verify types, lint and the unit suite are green**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all unit tests pass.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev:all` and open the Integrations tab. Confirm each of:
- Left rail lists All + the 10 categories; clicking one filters the grid and updates `AVAILABLE n`; the active row is a filled primary pill.
- Header shows `N available` and `0 connected`.
- Cards show logo, name, category tag, 2-line blurb, Details + Connect.
- Coming-soon cards are dimmed with a **Request** button; Details still opens.
- **Details** on Slack opens the modal listing its three actions; its Connect hands off to the Connect modal.
- **Connect** on Slack opens the Connect modal containing the brand hero, setup guide and connect panel, and the URL becomes `#/integrations/slack`.
- Closing the modal returns the URL to `#/integrations`; the browser back button also closes it.
- Reloading on `#/integrations/slack` reopens the modal.
- The **MCPs** and **API Keys** tabs render unchanged.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/integrations/hub
git commit -m "feat(integrations): two-pane browse surface with details and connect modals"
```

---

### Task 8: End-to-end coverage

The only automated coverage of the rendered surface (there is no component-test harness). Boots the real app + daemon against an isolated temp state root, per `test/support/harness.ts`.

**Files:**
- Create: `e2e/integrations-hub.spec.ts`

**Interfaces:**
- Consumes: `bootCabinet`, `CabinetInstance` from `../test/support/harness`; the `data-testid` hooks added in Tasks 3-7.

- [ ] **Step 1: Write the spec**

Create `e2e/integrations-hub.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { bootCabinet, type CabinetInstance } from "../test/support/harness";

/**
 * The integrations hub's browse surface is pure client-side derivation over a
 * static catalog - no connector is connected in a fresh state root. That makes
 * it cheap to assert the parts that a refactor silently breaks: the rail's
 * filtering, the counts, and that each modal opens the right content.
 *
 * The connector detail is route-driven (`#/integrations/{id}`), so the deep-link
 * assertions here are what stop the modal rewrite from quietly dropping it.
 */

let cabinet: CabinetInstance;

test.beforeAll(async () => {
  cabinet = await bootCabinet();
});

test.afterAll(async () => {
  await cabinet.close();
});

const HUB = () => `${cabinet.appUrl}/#/integrations`;

test("the rail filters the grid and the count follows", async ({ page }) => {
  await page.goto(HUB());

  const cards = page.locator('[data-testid="integration-card"]');
  await expect(cards.first()).toBeVisible();
  const allCount = await cards.count();

  await page
    .locator('[data-testid="category-rail-item"][data-category="communication"]')
    .click();

  await expect(
    page.locator('[data-testid="category-rail-item"][data-category="communication"]'),
  ).toHaveAttribute("data-active", "true");

  // Communication is a strict subset of the catalog, and Slack is in it.
  // (It is also a category the launch gate leaves some connectors live in, so
  // the AVAILABLE label below is non-zero - most categories are entirely
  // "soon" right now, which would make that assertion vacuous.)
  await expect(cards).not.toHaveCount(allCount);
  await expect(
    page.locator('[data-testid="integration-card"][data-integration-id="slack"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="integration-card"][data-integration-id="github"]'),
  ).toHaveCount(0);

  // The label counts only the connectable ones in view, so it can't exceed them.
  const visible = await cards.count();
  const label = Number(
    await page.locator('[data-testid="visible-available-count"]').innerText(),
  );
  expect(label).toBeGreaterThan(0);
  expect(label).toBeLessThanOrEqual(visible);
});

test("search composes with the selected category", async ({ page }) => {
  await page.goto(HUB());

  await page
    .locator('[data-testid="category-rail-item"][data-category="communication"]')
    .click();
  await page.locator('[data-testid="integration-search"]').fill("discord");

  await expect(
    page.locator('[data-testid="integration-card"][data-integration-id="discord"]'),
  ).toBeVisible();
  await expect(page.locator('[data-testid="integration-card"]')).toHaveCount(1);

  // The rail must not reshuffle under the search box.
  await expect(
    page.locator('[data-testid="category-rail-item"][data-category="knowledge"]'),
  ).toBeVisible();
});

test("a fresh state root reports nothing connected", async ({ page }) => {
  await page.goto(HUB());

  await expect(page.locator('[data-testid="available-pill"]')).toContainText(
    "available",
  );
  await expect(page.locator('[data-testid="connected-pill"]')).toContainText(
    "0 connected",
  );
  await expect(
    page.locator('[data-testid="integration-connected-badge"]'),
  ).toHaveCount(0);
});

test("Details opens a read-only capability list and hands off to Connect", async ({
  page,
}) => {
  await page.goto(HUB());

  const slack = page.locator(
    '[data-testid="integration-card"][data-integration-id="slack"]',
  );
  await slack.locator('[data-testid="integration-details-button"]').click();

  const modal = page.locator('[data-testid="integration-details-modal"]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Slack");
  // The catalog's three static actions for Slack.
  await expect(modal.locator('[data-testid="integration-actions"] li')).toHaveCount(3);
  await expect(modal).toContainText("Search channels & DMs");

  // Read-only: it must not have opened the connector's route.
  expect(page.url()).toContain("#/integrations");
  expect(page.url()).not.toContain("#/integrations/slack");

  await modal.locator('[data-testid="integration-details-connect"]').click();
  await expect(
    page.locator('[data-testid="integration-connect-modal"]'),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/integrations\/slack$/);
});

test("Connect opens the setup modal, and it is deep-linkable", async ({ page }) => {
  await page.goto(HUB());

  await page
    .locator('[data-testid="integration-card"][data-integration-id="slack"]')
    .locator('[data-testid="integration-primary-button"]')
    .click();

  const modal = page.locator('[data-testid="integration-connect-modal"]');
  await expect(modal).toBeVisible();
  // The whole detail body came along, not just a stub.
  await expect(modal).toContainText("What your agents can do");
  await expect(page).toHaveURL(/#\/integrations\/slack$/);

  // Back closes it and restores the hub route.
  await page.goBack();
  await expect(modal).toHaveCount(0);
  await expect(page).toHaveURL(/#\/integrations$/);

  // And the route alone is enough to reopen it.
  await page.goto(`${cabinet.appUrl}/#/integrations/slack`);
  await expect(
    page.locator('[data-testid="integration-connect-modal"]'),
  ).toBeVisible();
});

test("a coming-soon connector offers Request, not Connect", async ({ page }) => {
  await page.goto(HUB());

  // Zoom is unimplemented in the catalog's launch gate.
  const zoom = page.locator(
    '[data-testid="integration-card"][data-integration-id="zoom"]',
  );
  await expect(zoom).toHaveAttribute("data-state", "soon");
  await expect(zoom.locator('[data-testid="integration-primary-button"]')).toHaveText(
    "Request",
  );

  // Details still previews what it will do once it lands.
  await zoom.locator('[data-testid="integration-details-button"]').click();
  await expect(page.locator('[data-testid="integration-details-modal"]')).toContainText(
    "Zoom",
  );
});
```

- [ ] **Step 2: Run the spec**

Run: `npx playwright test e2e/integrations-hub.spec.ts`
Expected: 6 tests pass.

If a test fails on a catalog assumption (e.g. `zoom` was launched, or Slack's action count changed), fix the **test's** expectation against `src/lib/integrations/preview-catalog.ts` - do not weaken an assertion to make it pass.

- [ ] **Step 3: Verify the full suite is green**

Run: `npm test && npx tsc --noEmit && npm run lint && npx playwright test`
Expected: unit tests pass, no type errors, no lint errors, all e2e specs pass (the 5 pre-existing agent specs plus this one).

- [ ] **Step 4: Commit**

```bash
git add e2e/integrations-hub.spec.ts
git commit -m "test(e2e): cover the integrations hub browse surface and its modals"
```

---

### Task 9: Changelog

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Append the entry**

Add this entry at the top of `PROGRESS.md`, directly under the `# Progress` heading. Replace each `<...>` with the number you actually measured in Task 8 Step 3 - do not guess them, and do not leave a `<...>` in the committed file:

```
[2026-07-16] Rebuilt the Integrations tab's browse surface as a two-pane category rail + card grid, replacing the stacked "logo wall" of compact tiles. Frontend-only: no new API, no new deps, no backend change — the data is still the static `preview-catalog.ts` plus the existing `/api/agents/config/mcp-catalog` connected-state fetch. Layout and wireframes are borrowed from a reference integrations product; all styling is Cabinet's own tokens, none of the reference's palette. Plan: `docs/superpowers/plans/2026-07-16-integrations-hub-redesign.md`. **Structure:** the derivation rules that used to be inline in the gallery (card state, filtering, counts, suite-slug routing) moved to a React-free `src/lib/integrations/hub-view-model.ts` so they're unit-testable — the repo has no component-test harness, so this is the layer worth testing and the components above it stay dumb. `IntegrationDetailPage` was split into `IntegrationDetailBody` (content, container-agnostic) + a shell, so the *same* body renders inside the new `IntegrationConnectModal` — the full brand hero, setup guide, trust note and live ConnectPanel all came along rather than being rebuilt. `LayoutGallery` → `LayoutGrid` (rail + grid + request flows); both `LayoutGallery` and `IntegrationDetailPage` are deleted. New `IntegrationDetailsModal` is a read-only capability browser over the catalog's static `actions[]` (no tabs — Cabinet has no "triggers" concept, unlike the broker-backed reference). Deep-linking is unchanged and still route-driven: `#/integrations/{id}` opens the Connect modal, closing or the back button clears the slug. **Two deliberate deviations from the spec, both because the borrowed pattern didn't survive contact with our model:** (1) the `N connected` pill counts *cards* that render connected, not `connectedIds.size` — that set holds MCP ids that may have no card, and one Google Workspace OAuth lights three cards, so its size would disagree with the green cards on screen; (2) the card's `Connecting…` button is clickable and reopens the modal, where the reference's is a disabled spinner — because setup now happens *inside* the modal, a disabled spinner would strand a user mid-OAuth with no way back in, and reopening is also what lets ConnectPanel clear a stale flag (so no timer is needed). The connecting flag deliberately survives closing the modal: the server-side OAuth session outlives it, and the card is then the only visible surface. Verified: <N> unit tests pass (incl. <N> new view-model tests), tsc clean, eslint clean, <N> e2e specs pass (incl. the new `e2e/integrations-hub.spec.ts`), and a manual pass over the rail, both modals, deep-link/back-button, light+dark themes, and the untouched MCPs / API Keys tabs.
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: record the integrations hub redesign in PROGRESS"
```

---

## Verification checklist

Before opening a PR:

- [ ] `npm test` - unit suite green, including the 16 new view-model tests.
- [ ] `npx tsc --noEmit` - clean.
- [ ] `npm run lint` - clean.
- [ ] `npx playwright test` - all specs green.
- [ ] `grep -rn "ea2070" src/` returns nothing - no reference-app brand literal leaked in.
- [ ] The hub renders correctly in **both light and dark** themes.
- [ ] The **MCPs** and **API Keys** tabs are visually unchanged.
- [ ] A real connect still works end to end on an available connector (drive it via `/verify`).
