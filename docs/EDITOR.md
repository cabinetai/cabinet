# PRD: Editor Agent Visibility and Cabinet Scope

**Status:** Revised after implementation review  
**Author:** hilash  
**Date:** 2026-04-13

---

## 1. Problem

Cabinet has two overlapping truths about the editor:

| Concern | Current behavior |
|---|---|
| Identity | `"editor"` is a known agent slug used by the AI Panel and several UI filters |
| Visibility | Editor activity is not consistently visible across the Agents Dashboard and cabinet task boards |
| Scope | Editor conversations are expected to belong to the page being edited, but were not consistently saved with cabinet scope |

The user expectation is clear:

- If the AI editor edits a page inside a deeply nested cabinet, that cabinet must show the running task.
- The root cabinet must still be able to see all editor activity across descendants.
- The system must not create confusing duplicate built-in agents across nested cabinet views.

---

## 2. Observations From Code Review

### 2.1 Editor conversations were not reliably cabinet-scoped

The AI Panel submits editor runs with:

- `source: "editor"`
- `pagePath`
- `userMessage`
- `mentionedPaths`

But it does **not** send `cabinetPath`.

Result:

- The conversations API accepts cabinet scope when provided.
- Manual agent conversations from the Agents workspace are cabinet-scoped.
- Editor conversations defaulted to root/global storage unless the server derived cabinet ownership itself.

This is why root views could see editor runs while the owning nested cabinet task board could miss them.

### 2.2 Cabinet task boards aggregate descendants, not ancestors

Cabinet task boards and conversation APIs work like this:

- A cabinet view can see its own conversations.
- With broader visibility, it can also see descendant cabinets.
- It does **not** automatically see ancestor-scoped conversations.

This means a root-scoped editor conversation will not naturally appear on a deeply nested cabinet's task board.

### 2.3 Duplicating built-in agents per cabinet would create the wrong UI

At first glance, forcing one `general` and one `editor` into every cabinet seems simple. In practice it creates several problems:

- Cabinet overview already aggregates the current cabinet plus visible descendants.
- Nested cabinet views would show multiple `General` and `Editor` rows.
- Large parts of the UI still identify agents by bare `slug`, not fully scoped identity.
- Duplicate `editor` agents across cabinets would make selection, navigation, and settings ambiguous.

Conclusion:

- `general` and `editor` should be treated as built-in identities.
- They should **not** be blindly duplicated into every cabinet just to solve visibility.

### 2.4 The editor runtime behaves more like a global singleton than a per-cabinet agent

The editor prompt builder reads the editor persona as:

```typescript
readPersona("editor")
```

without passing `cabinetPath`.

That means the current runtime model already behaves like:

- one logical editor identity
- many cabinet-scoped conversations

That is a good fit for the product requirement.

### 2.5 New cabinets created via the UI onboarding flow already include editor

The onboarding wizard currently treats `editor` as always selected.

Implication:

- New cabinets created through the main UI flow should already get an `editor/persona.md`.
- So the statement "editor never exists unless manually created" is too strong.

However:

- This is true only for cabinets created through that onboarding path.
- It is **not** a server-side guarantee for imported, older, manually modified, or partially configured cabinets.

### 2.6 Editability is asymmetric today

Current behavior:

- `general` is hard-coded in the Agents workspace and is not editable through the UI.
- `editor` is editable if its persona file exists.
- If `editor/persona.md` is missing, the persona detail route returns `404`, so editor does not yet have a guaranteed fallback settings experience.

This means:

- In new cabinets created through onboarding, editor should generally be editable.
- In cabinets missing the persona file, editor editability is not guaranteed.

### 2.7 Sessions needed a page label

The editor already records the edited page in `mentionedPaths[0]`.

Without surfacing that in the Sessions list, the cross-page history is much harder to scan. The correct UX is to show:

```text
edited: <pagePath>
```

on editor conversation cards.

---

## 3. Revised Design Decisions

| Decision | Choice |
|---|---|
| General vs Editor | Keep separate |
| Built-in scope | Treat `general` and `editor` as built-in identities, not one copy per cabinet |
| Editor conversation scope | Save each editor conversation under the owning cabinet of the page being edited |
| Root visibility | Root cabinet continues to see all editor conversations through descendant aggregation |
| Editor persona scope | Keep editor persona global for now; do not introduce per-cabinet editor personas in this change |
| General editability | Leave unchanged; general remains non-editable through current UI |
| Editor editability | Editable when persona exists; fallback creation remains follow-up work if needed |
| Sessions layout | Flat chronological list with `edited: <pagePath>` secondary label |

---

## 4. Recommended Architecture

### 4.1 Keep one logical editor, scope the work by cabinet

The right model is:

- One logical `editor` identity
- Conversations saved with the cabinet that owns the edited page
- Root cabinet sees all descendant editor work
- Nested cabinets see their own editor work

This satisfies both user requirements without multiplying built-in agents.

### 4.2 Derive editor cabinet ownership from `pagePath` on the server

Do **not** rely on the AI Panel client to determine cabinet scope.

Instead:

1. Receive `pagePath` in the editor conversation request.
2. Resolve the page path under `data/`.
3. Walk upward until the nearest `.cabinet` manifest is found.
4. Use that cabinet path as the conversation `cabinetPath`.
5. Fall back to root (`"."`) if no nested cabinet owns the page.

This makes cabinet scoping:

- deterministic
- server-authoritative
- safe for every page depth

### 4.3 Keep root behavior exactly as users expect

Because root already aggregates descendant conversations, cabinet-scoped editor conversations will still be visible from root.

So the target behavior becomes:

- editing `sub/sub/sub/page` shows up in that cabinet's task board
- the same conversation also appears in root views that aggregate descendants

---

## 5. Rejected Approach

### Rejected: auto-create `general/persona.md` and `editor/persona.md` in every cabinet

This approach was considered and rejected.

Why it is wrong:

- Nested cabinet views would show multiple built-in editors and generals.
- The current UI is not consistently scoped by `scopedId`; many interactions still use slug-only lookups.
- It mixes two separate concerns:
  - built-in agent identity
  - conversation ownership

The real problem is conversation scope, not "missing duplicate agent copies in every cabinet."

---

## 6. Implementation Plan

### Step 1 — Server-side owning cabinet helper

**File:** `src/lib/cabinets/server-paths.ts`

Add a helper that resolves the nearest owning cabinet for a page:

```typescript
findOwningCabinetPathForPage(pagePath: string): Promise<string>
```

Behavior:

- start from the edited page path
- walk upward to the nearest directory containing `.cabinet`
- return that cabinet path
- fall back to `"."` for root

### Step 2 — Use the derived cabinet path for editor conversations

**File:** `src/app/api/agents/conversations/route.ts`

When `source === "editor"`:

- derive cabinet ownership from `pagePath`
- pass that `cabinetPath` into `startConversationRun(...)`

Important:

- manual agent conversations keep their existing cabinet behavior
- editor scope is derived server-side, not trusted from the client

### Step 3 — Keep root aggregation unchanged

No new root-specific storage behavior is needed.

The existing cabinet visibility model already allows root to see descendant conversations. Once editor runs are saved to the owning cabinet, root visibility continues to work naturally.

### Step 4 — Show page label in Sessions cards

**File:** `src/components/agents/agents-workspace.tsx`

For editor conversation cards, render:

```tsx
edited: {conversation.mentionedPaths[0]}
```

below the title row.

### Step 5 — Optional follow-up: editor settings fallback

This is useful, but separate from cabinet-scoped conversations.

If we want editor to be truly guaranteed-editable everywhere, then:

- the editor settings panel should fall back to a built-in editor definition when `persona.md` is missing
- saving from that screen should create the missing persona file

This is a follow-up, not a prerequisite for cabinet-scoped editor visibility.

---

## 7. Non-Goals

- Creating one `General` and one `Editor` inside every cabinet
- Introducing per-cabinet editor personas
- Making `general` editable through the current UI
- Giving editor heartbeat or scheduler behavior
- Changing Mission Control filtering for editor
- Changing gallery/home/@mention exclusions for editor
- Merging `general` and `editor` into one built-in agent

---

## 8. Verification

1. Create or open a nested cabinet, for example `a/b/c`.
2. Open a page inside that cabinet and submit an AI editor request.
3. Confirm the resulting editor conversation is stored under cabinet scope `a/b/c`, not root.
4. Open the task board for `a/b/c` and confirm the running editor task is visible there.
5. Open the root cabinet task board and confirm the same conversation is still visible through descendant aggregation.
6. Open the Agents Sessions list for editor and confirm the card shows `edited: <pagePath>`.
7. Confirm onboarding-created cabinets still include `editor/persona.md` and the editor persona remains editable there.

---

## 9. Summary

The correct fix is:

- not "one editor per cabinet"
- but "one logical editor, cabinet-scoped conversations"

That preserves a clean built-in agent model, makes nested cabinet task boards accurate, and keeps root visibility working the way users already expect.
