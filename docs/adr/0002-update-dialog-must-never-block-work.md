# The update dialog must never block work

The update dialog previously derived its `open` state as
`updateDialogOpen || hasPersistentUpdateState || shouldPromptForUpdate`, while
the dismiss handler only cleared the first two. Any persistent update state —
including `restart-required`, the normal state after a download — latched the
dialog open with no way out. We decided that **no update state may hard-lock the
dialog**: every state is dismissible to a small, persistent, non-blocking
reminder, and the user can always keep working.

This is why there is no "force the user to update" path, and why even an
in-progress `applying` state is minimizable rather than modal. A hung update
must never be able to trap someone in an unusable app.

## Considered Options

- **Auto-restart once downloaded** — rejected; interrupts the user's work
  without consent.
- **Keep progress states blocking** because they're brief — rejected; "brief"
  is an assumption, and a stuck `applying` then traps the user permanently.
- **Dismiss with no reminder** — rejected; the pending update becomes invisible
  until the next launch.

## Consequences

Dismissal state must be tracked per update-status/version, not just per version,
so that clearing the prompt also suppresses the persistent-state branch. A
non-blocking reminder surface (pill/badge) is a required companion to any
dismissible update state — do not add a new update state without one.
