# Today cockpit redesign inventory and QA

Status: implemented for Jeremy's live owner review; not yet owner-approved.

## Implementation inventory

### Existing components retained

- Cabinet's theme system, semantic surface tokens, Lucide icon library, `Button`, `DropdownMenu`, `ScrollArea`, `Separator`, and `Tooltip` foundations.
- Existing cockpit fetch, intake, governed-action, approval, risk, reauthentication, polling, confirmation, and idempotency behavior.
- Existing card, source freshness, manual-risk, owner-review, potentially-missed, run, and source-health data.

### Components split

- `DailyBusinessCockpit` is now the state and action orchestrator.
- Presentation is split into navigation, Daily Momentum, Next Best Move, queue row, responsive inspector, active-risk, Radar, Systems, History, and resume modules under `src/components/hermes/cockpit/`.

### New presentation components

- Today header and desktop/mobile navigation
- Daily Momentum and restrained completion result
- One Next Best Move with quiet mission override
- Ordered 72-96 px queue rows with secondary-action overflow
- Desktop right-side inspector and mobile full-height detail sheet
- Compressed active risk, Radar, and Systems modules
- Radar, Risks, Systems, and History secondary views
- Interruption-resume banner backed by versioned, minimal session storage

### Data reuse and additive fields

All existing business fields are reused. Additive fields are `history`, the frozen local-day `momentumPlan`, structured `momentumCategory` and `meaningfulLoopClosed` action outcomes, and the governed card `recommendedAction`. The plan persists stable card/source identities; later same-day intakes create a visible proposal without changing the accepted denominator. Recommended actions remain restricted to the existing cockpit action allowlist, and all existing confirmation, approval, identity, and idempotency boundaries still apply.

## Mismatch ledger

| Area | Baseline mismatch | Resolution | Verification |
| --- | --- | --- | --- |
| Hierarchy | Source health and long reports preceded decisions. | Today now leads with orientation, Momentum, one mission, and an ordered queue. | Desktop live render and focused browser test. |
| Density | Twenty-one expanded blocks produced a multi-thousand-pixel report. | Main queue rows are collapsed; evidence and audits moved to the inspector. | Three rows maximum on desktop Today; two on mobile Today. |
| Typography | Long summaries competed at equal weight. | One title/consequence hierarchy; metadata is compact and uppercase only where scannability benefits. | Screenshot review at 1440 and 390 px. |
| Color | Many status surfaces competed. | Neutral resting surfaces; violet command actions; amber uncertainty; emerald verified state; red only for real exceptions. | Light-theme live screenshot; no animated gradients or ambient glow. |
| Queue anatomy | Expanded two-column cards exposed every action. | Ordered rows expose one primary action and move secondary actions to a menu. | Governed-action browser test verifies the unchanged payload and idempotency key. |
| Momentum integrity | The target was recalculated from the changing queue and Verify completion depended on free-text keywords. | The accepted intake freezes stable Decide, Protect, and Verify loops for the local day; only an explicit structured loop-closure outcome advances the persisted plan. | Focused store/model/contract tests prove target stability, proposal isolation, and fail-closed prose handling. |
| Primary action | Every nonapproval card defaulted to Investigate. | A validated `recommendedAction` selects from existing governed actions; pending approvals still override it with the exact approval path. | Focused model and intake-contract tests. |
| Inspector anatomy | Evidence expanded the main page vertically. | Summary, impact, move, missing facts, context, and result are visible; audit sections are collapsed. | Desktop open/close and mobile full-height sheet tests. |
| Mobile layout | Existing Cabinet and cockpit navigation competed; long text created intrinsic-width overflow. | Cabinet mobile nav yields to Today; modules are single-column and min-width constrained. | 390 by 844 test reports no horizontal overflow. |
| Motion | No outcome-oriented hierarchy or completion behavior. | Explicit 220 ms hierarchy entry, one cyan refresh sweep, one critical-item entrance pulse, resolved-row contraction, Momentum transition, and one completion sweep; all disable under reduced motion. | Playwright reduced-motion run and production render without framework overlay. |
| Orientation | Freshness was present without the compact date required by the audit. | Relative freshness now precedes a compact local date and the source-health state. | Desktop and 390 px live headers. |
| Accessibility | Expanded content made focus and action priority ambiguous. | Semantic regions, named navigation, one primary action, keyboard-closing sheet, focus-managed shadcn primitives, and non-color status labels. | Role-based Playwright locators and keyboard Escape verification. |

## Preserved boundaries

Hermes remains authoritative. Approval, confirmation, idempotency, read-only versus write permissions, owner-review evidence, source freshness, stale-evidence treatment, Potentially missed data, and existing safety rules are unchanged.

## Verification

- TypeScript: pass
- ESLint: pass
- `git diff --check`: pass
- Next.js production build: pass; existing broad NFT trace warnings remain non-blocking
- Focused contract/model/store coverage: 12/12 pass
- Focused production-browser coverage: 3/3 pass
- Live 1440 by 900: no horizontal overflow, no framework overlay, all required desktop modules visible in the first viewport
- Live 390 by 844: no horizontal overflow, single-column Today, one cockpit bottom navigation, two queued decisions, compact freshness/Radar orientation, and full-height detail sheet

Owner approval is still required. PR #1 remains draft and unmerged.
