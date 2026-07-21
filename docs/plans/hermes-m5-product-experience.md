# M5 Hermes-Only Product Experience

Status: accepted on 2026-07-18

This is the implementation and acceptance record for M5. It converts the normal Cabinet product surface to one Hermes Operator experience while retaining the upstream Cabinet implementation behind the runtime-mode boundary. It does not authorize daily cutover. Cabinet remains secondary until M7 passes and Jeremy explicitly approves cutover.

## Delivered product boundary

- A fail-closed client runtime-mode store resolves `/api/hermes/health` before legacy controls can render. Network or authorization ambiguity keeps the Hermes-only boundary in place instead of flashing provider controls.
- Every composer hides Cabinet provider, model, effort, native, and terminal selection in Hermes mode.
- Server-side runtime normalization always forces `providerId: hermes` and `adapterType: hermes_runtime`. Crafted provider, adapter, model, effort, and terminal requests cannot escape to a legacy execution path.
- The canonical `editor` persona is projected as one visible `Operator` with the role `Hermes operator for this Cabinet`. Other cards are explicitly working roles for the same operator-os profile, not separate runtimes or profiles.
- Persona create, update, import, library-add, and onboarding paths enforce Hermes provider and adapter values server-side. The create-role dialog also forces the same values client-side and removes its provider/runtime fields.
- The Team workspace exposes Agents and Channels only. Cabinet Routines, Heartbeats, Schedule, master scheduling controls, per-agent scheduling controls, provider selection, skill attachment, and organization scheduling dialogs do not mount in Hermes mode.
- Settings replaces Providers with `Advanced Hermes`, removes Skills and Integrations from normal navigation, redirects a direct Skills route to Advanced Hermes, and presents only non-secret Hermes health, profile, version, source-of-truth guidance, and canonical session management.
- Provider setup dialogs, the empty-provider home banner, provider health rows, and provider setup calls are suppressed in Hermes mode. Status instead reports the Hermes Operator connection.
- First-run onboarding is rewritten around the Hermes Operator. It asks only for identity and workspace naming, verifies the Hermes projection, explains the M7 cutover rule, and omits provider, model, skill, memory, heartbeat, and scheduler setup.
- Cabinet mode remains the default and retains the upstream provider, model, skills, integrations, agents, routines, heartbeats, and schedule implementation.

## Acceptance matrix

| Requirement | Evidence | Result |
| --- | --- | --- |
| No legacy provider choices | Runtime picker returns no UI in Hermes mode; provider setup, home empty-provider banner, agent-detail provider field, and Settings provider matrix are absent. | Passed |
| No model or execution plumbing in the composer | All composer surfaces use the centralized hidden runtime picker; a crafted model, effort, or terminal request is discarded server-side. | Passed |
| Hermes Operator onboarding | Hermes mode selects the dedicated one-screen Operator onboarding and never enters the legacy provider/team/heartbeat flow. | Passed |
| One default visible Operator | The live personas endpoint returns one `editor` projection named `Operator`, backed by `hermes_runtime`. The isolated browser renders the same Operator card. | Passed |
| Every new role is Hermes-backed | POST, PUT, import, library-add, and onboarding paths enforce Hermes values. Unit tests prove hostile provider/adapter values are overwritten. | Passed |
| Cabinet-native skills, providers, memory, and schedulers hidden | Browser proof shows only Agents and Channels, no Routines, Heartbeats, Schedule, Skills, Integrations, Provider, or Runtime controls. Agent-detail legacy controls and dialogs do not mount. | Passed |
| Advanced Hermes area | Browser proof renders Advanced Hermes and its source-of-truth boundary; a direct `/settings/skills` visit resolves to `/settings/providers`. | Passed |
| Hermes-only vocabulary and routing | Normal copy describes Operator roles and one operator-os profile. Persona and overview APIs project Operator, and runtime routing cannot be overridden by a crafted request. | Passed |
| Upstream mergeability | Legacy Cabinet implementation remains intact behind `CABINET_RUNTIME_MODE`; cabinet remains the safe default. | Passed |

## Live and browser evidence

- Live Hermes health on Cabinet port 4000 reported `enabled: true`, `status: online`, profile `operator-os`, and Hermes Agent `0.18.2`.
- The live `/api/agents/personas?cabinetPath=.` response returned one visible persona: `editor`, name `Operator`, provider `hermes`, adapter `hermes_runtime`.
- The isolated production-browser suite rendered Operator and Channels; verified that Routines, Heartbeats, Schedule, Provider, Runtime, Skills, Integrations, and Default runtime were absent; opened the new-role dialog; and verified direct Skills routing to Advanced Hermes. Result: 2/2 passed.
- Product-mode unit tests prove hostile persona values are overridden, the stored Cabinet persona is not mutated by projection, additional roles use Hermes, and explicit terminal requests cannot escape Hermes routing.

## Automated verification

- Full unit suite: 440 tests passed, 0 failed.
- M5 browser acceptance: 2 tests passed, 0 failed.
- TypeScript: passed.
- ESLint: 0 errors; existing repository warnings remain.
- Production build: passed. Existing broad Next/Turbopack NFT trace warnings remain unrelated to M5.
- `git diff --check`: passed.

## M5 decision

M5 passes. The normal product is now a Hermes-only Operator experience, and the server enforces the same boundary independently of the UI. This milestone does not authorize daily use or cutover. M6 management, M7 full conversion acceptance, and Jeremy's explicit approval are still required.
