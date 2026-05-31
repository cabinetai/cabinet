# PRD — Cabinet Mobile Responsive

**Author.** hilash · **Date.** 2026-05-15 · **Status.** Draft · **Related.** PR #21 (micahbrich, stalled)

## Goal

Make the entire Cabinet app usable and look intentional on mobile viewports (375×667 → 430×932). Desktop behavior must not regress. Output is one PR onto `main`, plus a `before/after` audit folder under `data/cabinet-data/audits/audit-2026-05-15-mobile-responsive/` with side-by-side screenshots and a written summary in the existing audit format.

## Non-goals

- Tablet-specific layouts (640–1023). They follow desktop by default — fix only if something actively breaks.
- New features. No new screens, no new components.
- Touch-gesture upgrades (swipe drawers, pull-to-refresh). Tap-only.
- Native iOS/Android packaging.

## Target viewports

- **Phone S** — 375×667 (iPhone SE, smallest in regular rotation)
- **Phone M** — 390×844 (iPhone 14)
- **Phone L** — 430×932 (iPhone 14 Pro Max)
- **Desktop baseline** — 1440×900 (no regression)
- **Breakpoint.** Tailwind `md` (768px) is the desktop/mobile line. Use `max-md:` for mobile-only.

## Reference patterns (from PR #21, kept)

- `useIsMobile()` hook — single source of truth for runtime checks.
- **Sidebar.** Off-canvas drawer on mobile; toggle moves inline into header (not floating).
- **AI panel.** Full-screen overlay with scrim on mobile.
- **Agents workspace.** Master-detail — list collapses to detail on row tap, back button to return.

Codebase has moved on a lot since #21 (i18n, RTL, Team tabs, heartbeats, mission-control, skills hub). We **reimplement the patterns**, not cherry-pick the commits.

## Screens to audit (the checklist — every one gets before+after screenshots at 375 and 1440)

### Shell / chrome
1. `app-shell` — viewport, scroll containers, safe-area insets
2. `header` — title, breadcrumb, nav-arrows, user avatar, theme picker, header-actions
3. `sidebar` — drawer behavior, file tree, cabinet switcher
4. `status-bar` — server status, sync, uncommitted, terminal toggle, popovers
5. `ai-panel` — overlay, scrim, close affordance, composer inside it
6. `terminal` panel — opens, resizes, doesn't trap viewport
7. `notification-toasts` — placement, stacking, dismiss target
8. `system-toasts` — same
9. `theme-picker` — popover/dialog fits, scrolls
10. `update-dialog`, `breaking-changes-warning`, `daemon-health-banner`, `narrow-viewport-hint` (kill or improve)

### Home / onboarding
11. `home-screen` — greeting, prompt, templates carousel, recents
12. `onboarding-wizard` — steps, inputs, CTAs
13. `onboarding/tour` — tooltips don't overflow viewport
14. `data-dir-prompt`, `feedback-popup`

### Editor & viewers
15. `editor` — toolbar, bubble menu, table menu, slash commands, mention picker, emoji picker
16. `editor-toolbar` — overflow / scroll on narrow
17. `bubble-menu`, `link-popover`, `media-popover`, `embed-popover`
18. `color-palette`, `emoji-picker` — sizing
19. `folder-index`
20. Viewers: `image-viewer`, `pdf-viewer`, `csv-viewer`, `mermaid-viewer`, `notebook-viewer`, `source-viewer`, `google-doc-viewer`, `website-viewer`, `media-viewer`, `file-fallback-viewer`
21. `office` editors (docx/xlsx/pptx)
22. `version-history`

### Agents
23. `agents-workspace` (list + detail master-detail on mobile)
24. `agents/v2` flow
25. `agent-preview` page
26. Conversations: `agents/conversations/[id]`
27. Schedule, routines, heartbeats tabs (`agents-demo/*`)

### Tasks
28. `tasks` board (kanban → stacked or scroll-x on mobile?)
29. `tasks/[id]` task detail
30. `tasks/conversation`
31. Task creation flow

### Search / palette / composer
32. `search` palette — full-height sheet on mobile
33. `composer` — input, file attachments, slash commands, mentions

### Settings
34. `settings-page` — sections list, scroll
35. `api-keys-section`
36. `cli-mcp-section`
37. `connected-integrations-card`
38. `data-locations-section`
39. `storage-backend-section`
40. `uninstall-section`
41. `edit-user-avatar-dialog`

### Other
42. `cabinets` — cabinet switcher, create flow
43. `integrations`
44. `skills` hub
45. `mission-control`
46. `registry`
47. `help` — demos, keyboard cheatsheet
48. `login` page
49. RTL (Hebrew) — every above screen at 375 needs an RTL spot-check on at least 5 representative screens

## Definition of done

- [ ] No horizontal scroll at 375 on any screen above.
- [ ] All tap targets ≥ 44×44 (iOS HIG) — focus-rings still visible.
- [ ] No content trapped behind keyboard / virtual viewport.
- [ ] Sidebar opens/closes on mobile with header toggle; doesn't overlap content when desktop expands.
- [ ] AI panel is full-screen with a backdrop on mobile, dismissable; composer keyboard-friendly.
- [ ] Agents workspace master-detail works both directions (list→detail, back).
- [ ] Tasks board readable (either single-column stack or horizontal-scroll columns with snap).
- [ ] Editor toolbar doesn't overflow — wrap, scroll-x, or overflow menu.
- [ ] Every popover/dialog (theme picker, mention picker, emoji picker, link/media popover) fits in 375 viewport.
- [ ] RTL spot-check passes on Home, Editor, Agents, Settings, Sidebar.
- [ ] Lighthouse mobile a11y ≥ 90 on Home, Editor, Agents, Settings.
- [ ] Desktop (1440) screenshots show **no diff** beyond intended changes.
- [ ] Audit folder `audit-2026-05-15-mobile-responsive/` populated with:
  - `index.md` — walkthrough with paired before/after screenshots and summary
  - `screenshots/` — `NN-screen-name-mobile-before.png`, `NN-screen-name-mobile-after.png`, `NN-screen-name-desktop.png`
  - `progress.md` — issue tracker
  - `issues/` — per-issue files

## Approach

1. Worktree off `main` at `../cabinet-mobile/`, branch `feat/mobile-responsive`.
2. Run dev server, capture **all before screenshots at 375 + 1440** for every screen above.
3. Implement in phases:
   - **Phase 1 — Shell.** `useIsMobile`, `app-shell`, `header`, `sidebar`, `status-bar`, `ai-panel`. (Foundation; unlocks everything.)
   - **Phase 2 — Agents + Tasks + Home.** The primary surfaces.
   - **Phase 3 — Editor + viewers.** The content surface.
   - **Phase 4 — Settings + dialogs + popovers.** The long tail.
   - **Phase 5 — RTL + a11y + tap-target sweep.**
4. After each phase, re-screenshot the touched screens and update the audit.
5. Final pass: walk every screen in the checklist, fix what's left, write the audit summary.

## Risks

- **Scope balloon.** 49 surfaces. Hard cap: any single surface that needs >1 hour gets its own follow-up issue rather than blocking the PR.
- **i18n branch interference.** Branch from `main`, not from `feat/i18n-chinese` (which has uncommitted work).
- **RTL × mobile interaction.** Drawer slides from `start`, not `left`. Test in Hebrew explicitly.
- **Test coverage.** No mobile Playwright suite exists; we rely on manual + Chrome DevTools MCP screenshots. Acceptable for v1.
