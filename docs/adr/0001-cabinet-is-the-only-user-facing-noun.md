# Cabinet is the only user-facing noun

The codebase carries four words for two concepts: `homeName` (the install-level
container), `roomType`/`ROOMS` (an archetype that seeds a new workspace's
starting team), and `workspaceName` (a workspace's name) — all describing what
users simply call a **Cabinet**. We decided that user-facing copy uses
**"Cabinet" and nothing else**; Home and Room remain internal plumbing and are
never surfaced in the UI.

This is why you will find `homeName`, `roomType`, and `workspaceName` in code
with no corresponding words anywhere in the interface. That mismatch is
deliberate — do not "fix" it by exposing those terms in copy.

## Considered Options

- **Home + Cabinet user-facing** (Room internal) — rejected; the container adds
  a second noun users don't need during onboarding.
- **Home + Cabinet + Room all visible**, re-exposing the Room archetype picker —
  rejected; it adds a choice back into a flow we were explicitly shortening.
- **Leave the mixed vocabulary alone** — rejected; the onboarding rewrite needs
  one consistent word.

## Consequences

The Room archetype (office, sales, hr, product, r&d, study, lab, family-room,
blank) still exists in code and still seeds Cabinets, but its picker stays
hidden and `roomType` defaults to blank. Re-exposing it is a product decision
that would supersede this ADR.
