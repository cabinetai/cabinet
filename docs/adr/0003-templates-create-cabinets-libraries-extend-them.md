# Templates create Cabinets; Libraries extend them

Cabinet has two catalogs that look similar but do different things: importing a
registry **Template** (`POST /api/registry/import`) scaffolds a whole new
Cabinet on disk, while adding from a **Library**
(`POST /api/agents/library/[slug]/add`) copies one persona into a Cabinet the
user already has. We decided to keep them as two distinct systems, drawing the
boundary at **the action** — create a Cabinet vs. add a part to one — rather
than at the size of the thing.

This is why there is no single merged "Gallery" browsing surface, despite the
two catalogs sharing a look and both being browsable collections.

## Considered Options

- **Merge into one Gallery** with filter tabs and a per-item badge — rejected;
  it hides the one distinction that actually matters to the user at click time
  ("does this replace/create a Cabinet, or add to my current one?").
- **Adopt the split in UI copy but leave code names alone** — rejected; the
  overload is itself a source of the confusion (see Consequences).

## Consequences

"Template" now means a whole Cabinet everywhere, in code and copy. This requires
renaming the persona-as-template overload: `resolveAgentTemplateDir` →
`resolveLibraryAgentDir`, the `/api/agents/library` response key `templates` →
`agents`, and the seeded docs directory `resources/getting-started/` →
`resources/cabinet-guide/` (which also removes the second meaning of "getting
started"). `JobLibraryTemplate` is subject to the same rule.
