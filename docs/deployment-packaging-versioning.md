---
title: Packaging and Versioning
created: '2026-04-06T00:00:00.000Z'
modified: '2026-04-06T15:57:26.000Z'
tags:
  - packaging
  - versioning
  - releases
order: 2
---
# Packaging and Versioning

This page explains the supported Cabinet install paths today, how releases are packaged, and how versioning and updates work across managed source installs, custom source installs, and Electron.

Cabinet is still experimental and moving fast. Before any upgrade, keep a separate copy of your `data/` folder or let Cabinet create a backup first.

## Install Kinds

Cabinet currently distinguishes between three install kinds:

- `source-managed` - created by `create-cabinet`
- `source-custom` - cloned or modified manually
- `electron-macos` - packaged macOS desktop app

Those install kinds matter because update behavior is different for each one.

## Running Cabinet Today

## 1. Source-managed install

This is the best path today for local users, contributors, and anyone who wants the most complete update flow.

### First install

```bash
npx create-cabinet@latest
cd cabinet
npm run dev:all
```

Open `http://localhost:4000` (the default; dev-next.mjs auto-bumps if the port is busy).

### Production-style run

```bash
npm ci
npm run build
npm run start
```

By default, Cabinet runs the web app on port `3000` and the daemon on port `3001`. Those can be overridden with `CABINET_APP_PORT` and `CABINET_DAEMON_PORT`.

`create-cabinet` installs the app version that matches its npm version. On macOS/Linux this is a **prebuilt standalone bundle** (`cabinet-app-<platform>-vX.Y.Z.tgz`) downloaded from the GitHub Release — no `npm install`. On platforms with no bundle (currently Windows, pending PR #192) it falls back to the source release tarball + `npm install`. Either way it writes install metadata so Cabinet can recognize the install as managed later.

## 2. Source-custom install

This is any install made from a manual git clone, a fork, or a working tree that Cabinet does not recognize as managed.

Typical flow:

```bash
git clone https://github.com/cabinetai/cabinet.git
cd cabinet
npm install
npm run dev:all
```

Custom source installs still get update checks, but Cabinet will not overwrite app code automatically. They receive manual upgrade guidance instead.

## 3. Electron macOS app

Electron is the desktop packaging track for Cabinet.

### Local packaging

```bash
npm run build
npm run electron:make
```

That uses Electron Forge and produces packaged desktop artifacts under `out/`.

### Release packaging

On release tags, GitHub Actions builds the macOS desktop artifacts and publishes them to the GitHub Release. The release manifest also records the expected macOS asset names.

A separate `publish-app-bundles` job (in `release.yml`) builds the zero-install standalone bundles per platform (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`; Windows `win32-x64` pending PR #192) with `npm run build && npm run electron:prep`, then uploads each `cabinet-app-<key>-vX.Y.Z.tgz` + `.sha256` to the Release. The release manifest records these under `appBundles`, and `cabinetai run` consumes them (see docs/CABINETAI.md → `ensureApp`).

### Desktop data location

The Electron app stores user data outside the app bundle so app updates do not replace user content. On macOS the default location is:

```text
~/Library/Application Support/Cabinet/cabinet-data
```

On first launch, the Electron app can either:

- start with a fresh managed data directory
- import an existing Cabinet `data/` directory from a source install

### Electron updates

For macOS, Cabinet uses Electron's native update path with `update-electron-app` and `autoUpdater` (`electron/main.cjs` `configureAutoUpdates()`, darwin-only, 4-hour interval, `repo: cabinetai/cabinet`, served via `update.electronjs.org`). The app checks automatically, downloads supported updates in the background, and asks the user to restart when the update is ready. The Electron updater also writes lifecycle state (`checking` / `available` / `downloading` / `restart-required` / `failed`) into the shared `update-status.json`.

Linux auto-update is not part of v1.

## Versioning and Release Source of Truth

GitHub Releases are the canonical source of truth for every Cabinet release.

The version contract is:

- release tag: `vX.Y.Z`
- app version: `package.json`
- CLI version: `cli/package.json`
- release manifest version: `cabinet-release.json`

Those versions should match for a real release.

`cabinet-release.json` is generated from the tagged release and published as a GitHub Release asset. Clients poll the latest manifest here:

```text
https://github.com/cabinetai/cabinet/releases/latest/download/cabinet-release.json
```

That manifest tells Cabinet:

- the latest stable version
- the release tag
- the release notes URL
- the source tarball URL
- the matching `create-cabinet` version
- the Electron asset names for macOS
- the prebuilt app-bundle asset names + URLs per platform (`appBundles`)

`create-cabinet` mirrors the same version and installs the matching release build — the prebuilt bundle where one exists, else the source tarball — not the default branch `HEAD`.

Only the `stable` channel is used in v1. Draft and prerelease builds should not be treated as client updates.

## How Updates Work By Install Kind

### `source-managed`

- Cabinet checks for updates on startup, on focus, and periodically
- one-click apply is allowed only for recognized managed installs with clean app files
- before applying, Cabinet creates a project snapshot backup
- the updater preserves `data/`, `.env.local`, and install metadata
- after apply, Cabinet asks the user to restart

### `source-custom`

- Cabinet still checks for newer releases
- Cabinet shows release notes and manual upgrade guidance
- Cabinet does not overwrite custom app code automatically

### `electron-macos`

- Cabinet checks automatically through Electron's updater
- downloads happen in the background
- the user is prompted to restart when the update is ready
- desktop data stays outside the app bundle

## Data Survival and Migrations

Cabinet now uses a shared `CABINET_DATA_DIR` abstraction.

Default data locations:

- source installs: `./data`
- Electron: managed app-data directory outside the bundle

Update and migration safety rules:

- source self-updates create a project snapshot backup before replacing app files
- file migrations create a data backup before they run
- SQLite migrations run on startup
- SQL migration bookkeeping is owned by the migration runner
- file-backed schema changes have their own migration layer

Current backup locations:

- source installs: `../.cabinet-backups/<project>/<timestamp>-<reason>/`
- Electron: sibling backup directory next to the managed data root

Even with those protections, users should keep a separate copy of important data while Cabinet is still changing quickly.

## Releasing a New Cabinet Version

This is the release flow to use right now.

### Release prerequisites

npm publishing uses **npm trusted publishing (OIDC)**, not an `NPM_TOKEN` secret. Both `cabinetai` and `create-cabinet` must have this repo + the `Release` workflow registered as a trusted publisher on npmjs.com; CI upgrades to `npm@latest` in the publish jobs because OIDC auth needs npm >= 11.5.1 (Node 22 ships npm 10.x, which only does OIDC provenance, not auth). There is no npm token to rotate.

macOS notarization/signing still needs GitHub Actions secrets (consumed by the separate `electron-release.yml`):

- `APPLE_ID` - required for macOS notarization
- `APPLE_APP_PASSWORD` - required for macOS notarization
- `APPLE_TEAM_ID` - required for macOS notarization
- `APPLE_SIGN_IDENTITY` - required for macOS code signing

`GITHUB_TOKEN` is provided automatically by GitHub Actions for the release and Electron publishing steps.

### Step-by-step

1. Pick the release version, for example `0.2.1`.
2. Update `package.json` to that version.
3. Update `cli/package.json` to that same version.
4. Refresh `package-lock.json` so the root package version stays aligned.

```bash
npm install --package-lock-only
```

5. Regenerate the release manifest for the same tag.

```bash
npm run release:manifest -- --tag v0.2.1
```

6. Run the release sanity checks you want before tagging.

```bash
npm run test:unit
npm run build
npm run electron:make
```

7. Commit the release changes.
8. Push the commit to GitHub.
9. Create and push the release tag.

```bash
git tag v0.2.1
git push origin v0.2.1
```

10. Let GitHub Actions publish the release artifacts.

The tag-triggered `Release` workflow (`.github/workflows/release.yml`) runs these chained jobs (three verified 2026-07-04 shipping v0.5.0; `publish-app-bundles` added with PR #65):

1. `release-assets` - verify the tag matches `package.json`, regenerate `cabinet-release.json`, build the web app, and create a **draft** GitHub Release with the manifest attached.
1b. `publish-app-bundles` - matrix build (darwin/linux; Windows pending PR #192) that packages the standalone bundle and uploads `cabinet-app-<key>-vX.Y.Z.tgz` + `.sha256` to the Release. `publish-cabinetai` now `needs:` this job.
2. `publish-cabinetai` - `npm publish` from `cabinetai/`, publishing `cabinetai@X.Y.Z`.
3. `publish-cli` - `npm publish` from `cli/`, publishing `create-cabinet@X.Y.Z`.

The jobs are chained with `needs:`, so a failed draft-release job blocks both npm publishes, and a failed `cabinetai` publish blocks `create-cabinet`.

The Electron macOS DMG/ZIP is **not** built by this workflow. It is the separate, manually-dispatched `electron-release.yml`. So a tag gives you the draft release plus both npm packages; you trigger the desktop build yourself and then publish the draft (see Known Gaps below). Because `create-cabinet` installs the matching GitHub release build (prebuilt bundle or, as fallback, the source tarball), `npx create-cabinet@latest` stays broken until the draft release is published (both the bundle and tarball URLs 404 while it is a draft).

### What to verify after the tag ships

After GitHub Actions finishes, verify:

- the GitHub Release exists for `vX.Y.Z`
- `cabinet-release.json` is attached to that release
- `create-cabinet@X.Y.Z` is visible on npm
- the Electron macOS artifacts are attached to the GitHub Release
- the latest manifest URL resolves to the new version
- a fresh `npx create-cabinet@latest` install pulls the expected release

### Practical release checklist

For a normal release, this is the shortest safe sequence:

```bash
# 1. bump versions in package.json and cli/package.json
npm install --package-lock-only
npm run release:manifest -- --tag v0.2.1
npm run test:unit
npm run build
npm run electron:make
git add package.json cli/package.json package-lock.json cabinet-release.json
git commit -m "Release v0.2.1"
git push origin main
git tag v0.2.1
git push origin v0.2.1
```

If the Apple signing secrets are not configured yet, Electron packaging may still work locally, but the fully signed and notarized desktop release will not be production-ready.

## Known Gaps: Update vs. Release Mechanism (2026-05-19)

The intended model above does not match what currently ships. Users report the update popup **reappears every launch and cannot be dismissed**. Root causes, reconciling the release side with the update side:

### Release side (how versions are actually published)

- The tag-triggered workflow (`.github/workflows/release.yml`) generates `cabinet-release.json` and uploads it to a **`draft: true`** GitHub Release. `releases/latest/download/` only resolves to a *published, non-prerelease* release, so the in-app manifest URL either 404s (silently falls back to the bundled manifest → update detection effectively dead) or, if a draft is hand-published, advertises a version whose desktop build may not exist.
- The Electron macOS build/publish is a **separate, manually-triggered** workflow (`electron-release.yml`, `workflow_dispatch`, "after npm publish + smoke tests"). So `cabinet-release.json` can claim a version and Electron asset names (`Cabinet-darwin-arm64-X.zip`, `Cabinet-X-arm64.dmg`) before — or without — those assets ever being built. Manifest version and installable artifact are not guaranteed in lockstep.
- The "Releasing a New Cabinet Version" section above describes the *intended* single-pipeline flow; in reality the release is a draft and the Electron leg is manual and out-of-band.

### Update side (why the popup is stuck)

- **The in-app update dialog is not gated by install kind.** `src/components/layout/app-shell.tsx:590-602` decides visibility purely from `updateStatus.state`, `updateAvailable`, and the dismissed-version key — there is no `installKind` check. An `electron-macos` user therefore sees the source-managed modal *on top of* the native updater, but `canApplyUpdate` is `false` for them, so its apply button does nothing.
- **Persistent states force the modal open.** `effectiveUpdateDialogOpen = updateDialogOpen || hasPersistentUpdateState || shouldPromptForUpdate`. The native Electron updater writes `failed` / `restart-required` / `downloading` into the **same `update-status.json`** the dialog reads, so `hasPersistentUpdateState` re-opens the modal every render. "Later" only sets `updateDialogOpen=false`; it cannot clear a persistent state. With macOS signing/notarization incomplete, `update-electron-app` emits `error → state: failed`, which pins the modal open with no working dismiss.
- **Dismissal does not survive.** "Later" persists the dismissed version in `localStorage["cabinet.dismissed-update-version"]`, scoped to origin `http://127.0.0.1:<port>`. Cabinet's runtime port is not stable across launches, so a port change = new origin = empty localStorage = dismissal forgotten.

### What's needed

UX (ship first, unblocks users):

1. Gate the in-app dialog by `installKind` — for `electron-macos`, do not render the source-managed modal; surface native-updater state as a dismissible banner/toast, never a forced modal.
2. Stop OR-ing `hasPersistentUpdateState` into a forced-open modal; make `failed` / `restart-required` dismissible, and let stale `failed` clear on the next clean check.
3. Persist dismissal outside origin-scoped `localStorage` (data dir / IPC), keyed by version + state, so a port change does not resurrect it.
4. Define single ownership of `update-status.json` per install kind to stop the native and REST paths from writing over each other.

Release/CI (so the manifest can't lie):

5. Publish `cabinet-release.json` only when the matching desktop assets exist and the release is **published, not draft** — generate/upload the manifest in (or gated behind) the Electron publish job, or have the manifest generator verify asset presence.
6. Make the Electron build part of the automated release (or block manifest publish until it runs) so the advertised version always has an installable build.
7. Verify macOS signing/notarization end-to-end, or `update-electron-app` keeps emitting `error → failed` and re-pinning the modal.

## Release Troubleshooting: Desktop Packaging Failures (from the v0.5.0 ship, 2026-07-04)

The `electron-release.yml` desktop build hit three separate failures shipping v0.5.0. All are now fixed or documented; keep this as the runbook.

### macOS: `notarytool` HTTP 403, "a required agreement is missing or has expired"

Packaging and code-signing succeed, then `electron-forge publish` fails at *Finalizing package* with a notarize 403. This is **not** a code or secrets problem: the Apple Developer Program License Agreement is unsigned or expired on the account. Apple updates these terms periodically and blocks all notarization until accepted.

- Fix (Account Holder only): sign in at <https://developer.apple.com/account> (and check App Store Connect agreements), accept the pending "Review Agreement" banner, then re-dispatch `electron-release.yml`.
- The `APPLE_ID` / `APPLE_APP_PASSWORD` / `APPLE_TEAM_ID` / `APPLE_SIGN_IDENTITY` secrets being present does not prevent this.

### macOS: `ENOENT` on `.next/standalone/.next/node_modules/node-pty-<hash>`

electron-packager crashes during *Copying files* stat-ing a dangling symlink. Next.js output tracing writes hashed dedup symlinks (`node-pty-<hash> -> ../../node_modules/node-pty`); `scripts/prepare-electron-package.mjs` deletes node-pty's real dir so the daemon resolves it only from the staged `.native/` copy, which orphans that symlink. Fixed by `removeDanglingTracedSymlinks()` sweeping the traced `node_modules` after the removal. Reproduce/verify locally on a Mac with `npm run electron:make` (the DMG step's `cp` to `/Volumes` may fail under a sandbox, but packaging + signing completing is the signal the fix works).

### Windows: Squirrel maker fails "Description is required"

`electron-winstaller` requires a `<description>` in the generated `cabinet.nuspec`. Fixed by adding `description` to the `MakerSquirrel` config in `forge.config.cjs` (and `package.json`).

### Windows asset name: space becomes a dot

The Squirrel maker outputs `Cabinet-<version> Setup.exe`, but GitHub replaces the space with a dot when storing the release asset (`Cabinet-<version>.Setup.exe`). `generate-release-manifest.mjs` now advertises the as-uploaded (dot) name.

### Getting a build-config fix into an already-tagged release

`electron-release.yml` checks out `ref: <tag>`, so a fix on `main` is not built until the tag includes it. To rebuild desktop artifacts for the same version, force-move the tag (`git tag -f vX.Y.Z <fix-sha>; git push -f origin vX.Y.Z`) and re-dispatch. Re-pushing the tag re-fires `release.yml`; its two npm-publish jobs fail harmlessly because the version is already on npm (cosmetic), while `release-assets` refreshes the draft release + manifest.

## Recommended Operating Model Today

- Use `create-cabinet` for the best end-user install and update experience.
- Use Electron as the desktop packaging path for macOS, with user data stored outside the app bundle.
- Treat GitHub Releases as the release authority and keep npm, the app version, and the release manifest in lockstep.
- CI actions run on current majors (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, `softprops/action-gh-release@v3`) to stay off the deprecated Node 20 runtime.

---

Last Updated: 2026-07-04
