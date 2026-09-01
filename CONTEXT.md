# Cabinet

Cabinet is a desktop app for building and running teams of AI agents. This
glossary fixes the user-facing vocabulary so UI copy stays consistent — it is a
glossary, not a spec.

## Language

**Cabinet**:
A workspace a user creates and works inside — an AI team plus its jobs and
knowledge. The only user-facing word for this concept.
_Avoid_: Workspace, Room (in user-facing copy)

**Home**:
The install-level container that holds all of a user's Cabinets. Internal
plumbing — not surfaced to users in onboarding copy.
_Avoid_: exposing "Home" as a user-facing noun

**Room**:
Internal-only archetype (office, sales, hr, product, r&d, study, lab,
family-room, blank) that seeds a new Cabinet's starting team. A code concept
only; never shown to users.
_Avoid_: using "Room" in any user-facing text

**Provider**:
An agent CLI (e.g. Claude, Codex) that Cabinet detects, connects, and runs
agents through. Onboarding auto-selects the first ready one.

**Template**:
A whole pre-built Cabinet (team + jobs + knowledge) published to the remote
`cabinetai/cabinets` catalog. Importing one *creates a new Cabinet*. "Template"
means this and nothing else, in code and in copy.
_Avoid_: using "template" for personas, jobs, or skills

**Library**:
A catalog of individual building blocks — agents, jobs, skills — that a user
adds *into an existing Cabinet*. Named per kind: Agent Library, Job Library,
Skill Library.
_Avoid_: calling library entries "templates"

**Cabinet Guide**:
The markdown documentation seeded into every new Cabinet. Distinct from
Templates; not a selectable item.
_Avoid_: "Getting Started" (collides with the Template carousel)
