---
title: Symlinks and Load Knowledge
created: '2026-04-12T00:00:00.000Z'
modified: '2026-04-12T00:00:00.000Z'
tags:
  - guide
  - symlinks
  - knowledge
order: 2
---

# Symlinks and Load Knowledge

Cabinet uses direct symlinks to bring external folders into your knowledge base without copying anything. The folder stays where it is on disk — Cabinet just creates a pointer to it.

## How Load Knowledge Works

1. Right-click any item in the sidebar
2. Choose **Load Knowledge**
3. Pick a folder on your machine (or paste the path)
4. Optionally set a display name
5. Click **Load**

Cabinet creates a symlink inside the KB:

```
data/my-project -> /Users/me/Projects/my-project
```

The folder's contents appear directly as children in the sidebar tree. No wrapper directories, no extra nesting.

## What Gets Written

Cabinet writes two hidden dotfiles into the **target folder**:

### `.cabinet-meta`

Every linked folder gets this. Stores display metadata for the KB. Hidden from the sidebar.

```yaml
title: My Project
tags:
  - knowledge
created: '2026-04-12T00:00:00.000Z'
```

> Cabinet also reads legacy `.cabinet.yaml` files when they already exist, but new links use `.cabinet-meta`.

### `.repo.yaml` (git repos only)

If the folder is a git repo, Cabinet auto-detects the branch and remote and writes a `.repo.yaml` so AI agents can read the source code in context.

```yaml
name: my-project
local: /Users/me/Projects/my-project
remote: https://github.com/me/my-project.git
source: both
branch: main
```

If a `.repo.yaml` already exists in the folder, Cabinet skips writing it.

Both dotfiles are hidden from the sidebar by default.

## Sidebar Icons

| Icon | Color | Meaning |
|------|-------|---------|
| GitBranch | Orange | Linked git repo (has `.repo.yaml`) |
| Link2 | Blue | Linked non-repo directory |

## Unlinking

To remove a linked folder:

1. Right-click the linked item in the sidebar
2. Choose **Unlink**

This removes only the symlink from the KB. The original folder and all its files are untouched. The `.cabinet-meta` dotfile in the target is also cleaned up.

## Changing the Data Directory

By default, Cabinet stores content in `./data` (dev mode) or a platform-specific app-data path (Electron). Override with the `CABINET_DATA_DIR` environment variable:

```bash
CABINET_DATA_DIR=/path/to/my/kb npm run dev
```

You can also make `data/` itself a symlink pointing elsewhere — the tree builder follows symlinks transparently.

## Tips

- Linked folders with an `index.html` (and no `index.md`) render as embedded websites
- Add a `.app` marker for full-screen mode
- If the target folder has its own `index.md`, Cabinet uses it as the landing page
- Agents discover linked repos by reading `.repo.yaml` in the current or any parent directory

---

Back to [[Getting Started]]
