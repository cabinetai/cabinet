# create-cabinet

Create a new [Cabinet](https://github.com/hilash/cabinet) project in one command. Cabinet is an AI-first self-hosted knowledge base and startup OS.

## Usage

```bash
npx create-cabinet my-startup
```

This creates a new cabinet directory and starts the server. It delegates to the [`cabinetai`](https://www.npmjs.com/package/cabinetai) CLI under the hood.

Equivalent to:

```bash
npx cabinetai create my-startup
cd my-startup
npx cabinetai run
```

## All Commands

`create-cabinet` is a shortcut for the most common flow. For everything else, use `cabinetai` directly:

```bash
npx cabinetai create [name]        # Create a new cabinet directory
npx cabinetai run                  # Start Cabinet serving the current directory
npx cabinetai import <template>    # Import a pre-made cabinet from the registry
npx cabinetai list                 # List cabinets in the current directory
npx cabinetai doctor               # Run health checks
npx cabinetai update               # Download a newer app version
npx cabinetai uninstall            # Remove cached app versions from ~/.cabinet
npx cabinetai --help               # Show all commands
```

## What You Get

- WYSIWYG markdown editor with AI editing panel (Claude)
- Agent dashboard — define personas, run tasks, view transcripts
- Scheduled jobs — cron-based automation with YAML configs
- Kanban task board
- Full terminal in the browser
- Cmd+K search, git-backed version history, drag-and-drop pages
- Cabinet registry — import pre-made templates for SaaS, agencies, e-commerce, and more

## How It Works

The Cabinet web app auto-downloads to `~/.cabinet/app/` on first run. Your cabinet is just a directory with a `.cabinet` manifest, your agents, jobs, and content — no database, no cloud dependency.

```
my-startup/
  .cabinet               YAML manifest
  .agents/               Agent personas
  .jobs/                 Scheduled jobs
  index.md               Entry page
```

## Requirements

- Node.js >= 18 (20+ recommended)
- git

## License

MIT
