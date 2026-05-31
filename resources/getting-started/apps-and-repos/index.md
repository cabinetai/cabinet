---
title: Apps and Repos
created: '2026-04-12T00:00:00.000Z'
modified: '2026-04-17T14:02:43.840Z'
tags:
  - guide
  - apps
  - repos
order: 1
---
# Apps and Repos

Cabinet goes beyond markdown pages. You can embed full web applications, link external Git repositories, and create interactive tools that live right alongside your documentation.

## Embedded Apps

Any directory that contains an `index.html` file **and no** `index.md` is treated as an embedded app. Cabinet renders it in an iframe.

### Standard Embedded App

The app renders in the main content area with the sidebar and AI panel still visible. Good for dashboards and reference tools you want to glance at while working.

```
data/
  my-dashboard/
    index.html     ← the app (renders as iframe with sidebar)
    app.js
    style.css

```

### Full-Screen App (`.app` marker)

Add an empty `.app` marker file to the directory and the app gets maximum space: the sidebar and AI panel auto-collapse on open. A **Back to KB** button in the toolbar restores the normal layout.

```
data/
  my-tool/
    index.html     ← the app
    .app           ← marker: full-screen mode
    other-files/

```

Both types appear in the sidebar automatically — no build step, no deployment.

## Linked Repositories

A `.repo.yaml` file in any data directory links it to a Git repository. Agents use this to read and search source code in context when working on related documentation.

```yaml
name: my-project
local: /path/to/local/repo
remote: https://github.com/org/repo.git
source: both
branch: main
description: What this repo contains (helps agents understand context)

```

**Fields:**

<table class="border-collapse w-full" style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Field</p></th><th colspan="1" rowspan="1"><p>Required</p></th><th colspan="1" rowspan="1"><p>Description</p></th></tr><tr><td colspan="1" rowspan="1"><p><code>name</code></p></td><td colspan="1" rowspan="1"><p>Yes</p></td><td colspan="1" rowspan="1"><p>Human-readable project name</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>local</code></p></td><td colspan="1" rowspan="1"><p>Yes</p></td><td colspan="1" rowspan="1"><p>Absolute path to local clone</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>remote</code></p></td><td colspan="1" rowspan="1"><p>No</p></td><td colspan="1" rowspan="1"><p>GitHub URL — used for links, issues, PR suggestions</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>source</code></p></td><td colspan="1" rowspan="1"><p>No</p></td><td colspan="1" rowspan="1"><p><code>local</code>, <code>remote</code>, or <code>both</code> (default: <code>both</code>)</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>branch</code></p></td><td colspan="1" rowspan="1"><p>No</p></td><td colspan="1" rowspan="1"><p>Default branch (default: <code>main</code>)</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>description</code></p></td><td colspan="1" rowspan="1"><p>No</p></td><td colspan="1" rowspan="1"><p>Free-text description for agent context</p></td></tr></tbody></table>

When an agent works on a KB page that has a `.repo.yaml` in the same directory or any parent, it will:

1.  Read the `.repo.yaml` to find the linked repo
    
2.  Use `local` path to read source code and understand architecture
    
3.  Use `remote` URL when creating links or suggesting PRs
    

The sidebar shows these directories with an orange **GitBranch** icon.

---

Back to [[Getting Started]]
