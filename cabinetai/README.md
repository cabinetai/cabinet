# cabinetai

AI-first self-hosted knowledge base and startup OS. All content lives as markdown files on disk. Humans define intent. Agents do the work. The knowledge base is the shared memory between both.

## Quick Start

```bash
mkdir my-startup && cd my-startup
npx cabinetai run
```

That's it — no global install needed. `run` bootstraps the directory, auto-downloads the app on first use, installs dependencies, and opens in your browser.

## What You Get

- WYSIWYG markdown editor with AI editing panel (Claude)
- Agent dashboard — define personas, run tasks, view transcripts
- Scheduled jobs — cron-based automation with YAML configs
- Kanban task board
- Full terminal in the browser (xterm.js)
- Cmd+K search across all pages
- Git-backed version history with one-click restore
- Drag-and-drop page organization
- Cabinet registry — import pre-made templates for SaaS, agencies, e-commerce, and more

## How It Works

```
~/.cabinet/              Global app cache (auto-managed)
  app/v0.3.0/            Version-pinned Next.js install

~/my-startup/            Your cabinet (this is your data)
  .cabinet               YAML manifest
  .agents/               Agent personas
  .jobs/                 Scheduled jobs
  index.md               Entry page
  ...                    Your content
```

The app lives in `~/.cabinet/` and is shared across all your cabinets. Each cabinet is a lightweight directory you can put anywhere — just a `.cabinet` manifest file, your agents, jobs, and content. No database.

## Commands

All commands work via `npx` — no global install needed.

### `npx cabinetai create [name]`

Create a new cabinet directory.

```bash
npx cabinetai create my-startup          # root cabinet
cd my-startup
npx cabinetai create engineering         # child cabinet inside an existing one
```

### `npx cabinetai run`

Start Cabinet serving the current directory.

```bash
npx cabinetai run
npx cabinetai run --no-open              # don't open browser
npx cabinetai run --app-version 0.2.12   # use a specific app version
```

On first run, downloads the app to `~/.cabinet/app/` and installs dependencies. If the current directory is not already a cabinet, `run` bootstraps it in place by creating the `.cabinet`, `.agents/`, `.jobs/`, and `.cabinet-state/` structure before starting the server.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `CABINET_APP_PORT` | `4000` | App server port |
| `CABINET_DAEMON_PORT` | `4100` | Daemon server port |

### `npx cabinetai import <template>`

Import a pre-made cabinet from the [template registry](https://github.com/hilash/cabinets).

```bash
npx cabinetai import saas-startup
npx cabinetai import career-ops
npx cabinetai import text-your-mom
```

### `npx cabinetai list`

List all cabinets in the current directory.

```bash
npx cabinetai list
```

```
  Name              Kind    Path              Agents  Jobs
  My Startup        root    .                 3       2
  Engineering       child   engineering       2       1
```

### `npx cabinetai doctor`

Run health checks on the environment.

```bash
npx cabinetai doctor
npx cabinetai doctor --fix       # attempt auto-repair
```

Checks Node.js version, cabinet structure, app installation, dependencies, and port availability.

### `npx cabinetai update`

Download a newer app version.

```bash
npx cabinetai update
```

### `npx cabinetai uninstall` (alias: `remove`)

Remove cached app versions from `~/.cabinet/`. Prints a summary of what will be deleted and asks for confirmation. **Your cabinet directories and their data are never touched — those you'd delete manually.**

```bash
npx cabinetai uninstall          # remove cached app versions only
npx cabinetai uninstall --all    # also remove global state and telemetry data
npx cabinetai uninstall --yes    # skip the confirmation prompt
npx cabinetai remove             # alias for uninstall
```

What `--all` removes:

| Path | What's there |
|---|---|
| `~/.cabinet/` | cached app versions, global state, `config.json` |
| `~/Library/Application Support/cabinet-telemetry/` (macOS) | anonymous `install_id`, telemetry queue, session state |
| `%APPDATA%\cabinet-telemetry\` (Windows) | same as above |
| `$XDG_CONFIG_HOME/cabinet/` (Linux, falls back to `~/.config/cabinet/`) | same as above |

To completely remove everything Cabinet has on your machine — including your cabinets — run `uninstall --all` and then `rm -rf` your cabinet directories manually.

## Requirements

- Node.js >= 18 (20+ recommended)
- git (for importing templates and app download fallback)

## License

MIT
