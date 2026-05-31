# cabinetai — CLI & Deployment

## Overview

`cabinetai` is the runtime CLI for Cabinet. It manages the app installation, creates cabinets, and starts the server — all from a single `npx` command.

**Architecture:** The Cabinet web app installs to `~/.cabinet/app/v{version}/` (auto-downloaded on first use). Cabinets are lightweight data directories anywhere on disk — just a `.cabinet` manifest + `.agents/` + `.jobs/` + content files. No database.

## Quick Start

```bash
mkdir my-startup && cd my-startup
npx cabinetai run
```

Or with explicit create:

```bash
npx cabinetai create my-startup
cd my-startup
npx cabinetai run
```

## Commands

| Command | Description |
|---|---|
| `cabinetai create [name]` | Create a new cabinet directory |
| `cabinetai run` | Start Cabinet serving the current directory |
| `cabinetai import <template>` | Import a pre-made cabinet from the registry |
| `cabinetai list` | List cabinets in the current directory |
| `cabinetai doctor` | Run health checks on the environment |
| `cabinetai update` | Download a newer app version |
| `cabinetai uninstall` (alias: `remove`) | Remove cached app versions from ~/.cabinet |

### `cabinetai create [name]`

Creates a new cabinet directory in the current folder.

```bash
cabinetai create my-startup          # root cabinet
cd my-startup
cabinetai create engineering         # child cabinet inside an existing one
```

What it creates:

```
my-startup/
  .cabinet          # YAML manifest (name, id, kind, version)
  .agents/          # Agent personas directory
  .jobs/            # Scheduled job definitions
  .cabinet-state/   # Runtime state (auto-managed)
  index.md          # Entry page with frontmatter
```

### `cabinetai run`

Starts Cabinet serving the current cabinet directory.

```bash
cabinetai run
cabinetai run --no-open              # don't open browser
cabinetai run --app-version 0.3.1    # use a specific app version
```

On first run, downloads the app to `~/.cabinet/app/` and installs dependencies. If the current directory is not already a cabinet, `run` bootstraps it in place by creating the `.cabinet`, `.agents/`, `.jobs/`, and `.cabinet-state/` structure before starting the server.

| Env Variable | Default | Description |
|---|---|---|
| `CABINET_APP_PORT` | `4000` | App server port |
| `CABINET_DAEMON_PORT` | `4100` | Daemon server port |

### `cabinetai import <template>`

Imports a cabinet template from the [hilash/cabinets](https://github.com/hilash/cabinets) registry.

```bash
cabinetai import saas-startup
cabinetai import career-ops
cabinetai import text-your-mom
```

### `cabinetai list`

Lists all cabinets in the current directory tree.

```bash
cabinetai list
```

```
  Name              Kind    Path              Agents  Jobs
  My Startup        root    .                 3       2
  Engineering       child   engineering       2       1
```

### `cabinetai doctor`

Runs health checks: Node.js version, cabinet structure, app installation, dependencies, port availability.

```bash
cabinetai doctor
cabinetai doctor --fix       # attempt auto-repair
cabinetai doctor --quiet     # suppress output, auto-fix only
```

### `cabinetai update`

Downloads a newer app version by checking the release manifest on GitHub.

```bash
cabinetai update
```

### `cabinetai uninstall` (alias: `remove`)

Removes cached app versions from `~/.cabinet/`. Prints a summary of what will be deleted and asks for confirmation. Your cabinet directories and their data are never touched — those you'd delete manually.

```bash
cabinetai uninstall          # remove cached app versions only
cabinetai uninstall --all    # remove ~/.cabinet AND telemetry data
cabinetai uninstall --yes    # skip the confirmation prompt
cabinetai remove             # alias for uninstall
```

With `--all`, also removes the platform-specific telemetry directory:

- macOS: `~/Library/Application Support/cabinet-telemetry`
- Windows: `%APPDATA%\cabinet-telemetry`
- Linux: `$XDG_CONFIG_HOME/cabinet` (falls back to `~/.config/cabinet`)

---

## File System Layout

### Global (`~/.cabinet/`)

```
~/.cabinet/
  app/
    v0.3.1/               # Version-pinned app install
      package.json
      node_modules/
      .next/
      server/
      src/
      .env.local
  state/
    runtime-ports.json    # Currently running server info
  config.json             # Global config (optional)
```

### Cabinet directory (anywhere on disk)

```
my-startup/
  .cabinet                # YAML manifest
  .cabinet-state/         # Runtime state (auto-created by app)
    runtime-ports.json
    install.json
    file-schema.json
  .agents/
    ceo/
      persona.md
      tasks/
    cto/
      persona.md
  .jobs/
    weekly-brief.yaml
  index.md                # Entry page
  company/
    index.md
  engineering/
    .cabinet              # Child cabinet manifest
    .agents/
    .jobs/
    index.md
```

### `.cabinet` manifest format

```yaml
schemaVersion: 1
id: my-startup
name: My Startup
kind: root              # or "child"
version: 0.1.0
description: ""
entry: index.md

# Child cabinets only:
parent:
  shared_context:
    - /company/strategy/index.md

access:
  mode: subtree-plus-parent-brief
```

---

## Package Structure

Three npm packages, all versioned in lockstep:

| File | npm package | Purpose |
|---|---|---|
| `package.json` | `cabinet` (private) | The Next.js web app. Source of truth for version. |
| `cli/package.json` | `create-cabinet` | Thin wrapper — delegates to `cabinetai create` + `cabinetai run` |
| `cabinetai/package.json` | `cabinetai` | Full CLI. All logic lives here. |

```
cabinet/
  package.json              # cabinet (the app) — version source of truth
  cli/
    package.json            # create-cabinet
    index.cjs               # Thin wrapper, delegates to cabinetai
    README.md
  cabinetai/
    package.json            # cabinetai
    README.md
    esbuild.config.mjs      # Bundles to single dist/index.js
    tsconfig.json
    src/
      index.ts              # Commander.js program, registers all commands
      version.ts            # Version injected at build time by esbuild
      commands/
        create.ts
        run.ts
        doctor.ts
        update.ts
        import.ts
        list.ts
        uninstall.ts
      lib/
        log.ts              # Colored console output
        process.ts          # npmCommand(), spawn helpers
        paths.ts            # CABINET_HOME, findCabinetRoot(), slugify()
        ports.ts            # Port detection, runtime-ports.json I/O
        app-manager.ts      # ensureApp() — download + install app if missing
        cabinet-manifest.ts # Read/write .cabinet YAML files
        health-checks.ts    # Doctor check implementations
    dist/
      index.js              # Single bundled file (gitignored)
```

### How `create-cabinet` relates to `cabinetai`

`npx create-cabinet my-project` is equivalent to `cabinetai create my-project && cd my-project && cabinetai run`.

The wrapper resolves `cabinetai` from local `node_modules` first, then falls back to `npx cabinetai@latest`.

---

## Releasing

One command bumps all versions, commits, tags, and pushes:

```bash
./scripts/release.sh patch   # or minor, major
```

### What `release.sh` does

1. Reads the current version from `package.json`
2. Calculates the next version based on bump type
3. Updates `"version"` in all three package.json files:
   - `package.json` — cabinet app
   - `cli/package.json` — create-cabinet
   - `cabinetai/package.json` — cabinetai
4. Runs `npm install --package-lock-only` to update the lockfile
5. Regenerates `cabinet-release.json` with the new tag
6. Commits: `Release vX.Y.Z`
7. Creates git tag: `vX.Y.Z`
8. Pushes commit + tag to `origin/main`

### What GitHub Actions does (triggered by the tag)

| Job | What it publishes |
|---|---|
| `release-assets` | GitHub Release + `cabinet-release.json` artifact |
| `publish-cli` | `create-cabinet@X.Y.Z` to npm |
| `publish-cabinetai` | `cabinetai@X.Y.Z` to npm (builds with esbuild first) |
| `electron-macos` | Signed macOS DMG + ZIP attached to the GitHub Release |

### Verify after release

```bash
npm view create-cabinet version     # should match
npm view cabinetai version          # should match
gh release view vX.Y.Z -R hilash/cabinet
npx cabinetai --version
```

### Release manifest

`cabinet-release.json` is published as a GitHub Release asset. The `cabinetai update` command fetches it to check for newer versions:

```
https://github.com/hilash/cabinet/releases/latest/download/cabinet-release.json
```

### Required GitHub secrets

| Secret | Used by |
|---|---|
| `NPM_TOKEN` | `publish-cli` and `publish-cabinetai` |
| `APPLE_ID` | Electron notarization |
| `APPLE_APP_PASSWORD` | Electron notarization |
| `APPLE_TEAM_ID` | Electron notarization |
| `APPLE_SIGN_IDENTITY` | Electron code signing |
| `APPLE_CERTIFICATE` | Electron code signing |
| `APPLE_CERTIFICATE_PASSWORD` | Electron code signing |

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

---

## Key Implementation Details

### `ensureApp(version)`

Checks if `~/.cabinet/app/v{version}/` exists and is ready. If not:

1. Tries to download the release tarball from GitHub (`/archive/refs/tags/vX.Y.Z.tar.gz`)
2. Falls back to `git clone --depth 1 --branch vX.Y.Z` if tarball is unavailable
3. Falls back to `git clone --depth 1` (HEAD) if the tag doesn't exist
4. Runs `npm install`
5. Copies `.env.example` to `.env.local`

### `findCabinetRoot(startDir)`

Walks up from `startDir` looking for a `.cabinet` file (not directory). Returns the directory containing it. This is how `cabinetai run` knows which cabinet to serve.

### Version injection

The CLI version is injected at build time via esbuild `define`:

```js
define: { "CABINETAI_VERSION": JSON.stringify(pkg.version) }
```

No hardcoded version strings in source code. `version.ts` reads the injected constant.

### Port detection

Default ports: app=4000, daemon=4100. Scans up to 200 ports from the preferred starting port. Configurable via `CABINET_APP_PORT` and `CABINET_DAEMON_PORT` env vars.

### Server reuse

`cabinetai run` checks `.cabinet-state/runtime-ports.json` — if a server is already running for this cabinet directory (health check confirms), it reuses the existing server and opens the browser.
