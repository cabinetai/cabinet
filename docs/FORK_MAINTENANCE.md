# Fork maintenance

## 1. Develop a Good Place feature

Start from `main`, create a `gp/*` branch, and keep version, manifest, tag, and
release-date changes out of the feature. Open the branch against
`souljorje/cabinet:main` and squash merge it.

## 2. Develop an upstream feature

Start from the exact `upstream-main` mirror and create an `upstream/*` branch.
Keep it generic: no Good Place branding, distribution, release, or sync
changes. Open it against `cabinetai/cabinet:main`. Integrate the same commit
into a temporary branch from `main` when the fork needs it before upstream.

## 3. Merge new upstream changes

Run `scripts/sync-upstream.sh`. It refuses a dirty tree, updates
`upstream-main` to the upstream remote, merges that mirror into `main`, and
stops before pushing the shipping branch. Run `npm ci`, `npm test`,
`npm run lint`, and `npm run build`, then push `main`.

## 4. Publish a Good Place release

Create `release/<version>` from `main` and run
`npm run gp:release:prepare -- <version>`. Review the version and manifest
changes, open the release PR, and wait for CI. After it merges, tag that exact
`main` commit. Wait for web, app-bundle, and Electron artifacts to pass their
smoke tests, then publish the draft GitHub release manually.
