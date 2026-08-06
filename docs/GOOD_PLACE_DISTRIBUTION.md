# Good Place distribution

This fork keeps application code separate from the private Good Place OS data
repository.

## Local development

```bash
npm ci
CABINET_DATA_DIR=/path/to/good-place-os npm run dev:all
```

The Good Place OS repository's `npm run cabinet` command uses the sibling
`good-place-cabinet` checkout by default. Cabinet's Git service owns automatic
synchronization; the workspace does not provide or execute a sync script.

## Desktop distribution

The Electron application is named **Good Place Cabinet**, uses the bundle ID
`com.souljorje.good-place-cabinet`, and checks
`souljorje/cabinet` for updates. It can coexist with upstream Cabinet.

On first launch, select the local clone of `good-place-os` as the data
directory. API keys stay in machine-local application data, not in the
workspace.

### Automatic workspace sync

The Cabinet daemon asks the app's Git service to synchronize when the daemon
starts and every 30 seconds afterward. The schedule continues when the app
window is hidden or minimized because it does not depend on React or document
visibility. Quitting Cabinet stops both the app server and daemon, so automatic
sync also stops.

The status bar only reads the latest sync state, provides the explicit Sync
action, and registers each open window's active page so daemon-triggered pulls
cannot replace a page currently open in an editor.

Sync fetches first, then pushes local-only commits, fast-forwards remote-only
commits, or rebases disjoint changes. It defers incoming changes when the work
tree is dirty, the active page changed remotely, or local and remote commits
overlap. The **Settings → Storage → Automatic workspace sync** toggle persists
`CABINET_SYNC_ENABLED` in the machine-local `.cabinet.env`; changes take effect
on the daemon's next cycle. Explicit Git pull, commit, and Sync actions remain
available when automatic sync is disabled.

Create installers with:

```bash
npm run electron:make
```

Unsigned macOS builds require **right-click → Open** on first launch. Add the
Apple signing secrets documented in `docs/CABINETAI.md` for seamless
installation and updates.

## Release checklist

1. Create `release/<version>` from `main`.
2. Run `npm run gp:release:prepare -- <version>` and open the generated changes
   as a release PR.
3. Merge only after CI build, lint/unit, and e2e jobs pass.
4. Tag the exact merge commit. The `Release` workflow creates the draft,
   manifest, web build, and platform app bundles.
5. Dispatch `Electron Release (manual)` with that tag.
6. Verify the macOS and Windows package smoke tests, signing checks when
   configured, and all expected release assets.
7. Publish the draft GitHub release manually.
