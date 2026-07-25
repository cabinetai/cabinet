# Good Place distribution

This fork keeps application code separate from the private Good Place OS data
repository.

## Local development

```bash
npm ci
CABINET_DATA_DIR=/path/to/good-place-os npm run dev:all
```

The Good Place OS repository's `npm run cabinet` command uses the sibling
`good-place-cabinet` checkout by default. The Electron app owns automatic Git
synchronization; the workspace does not provide or execute a sync script.

## Desktop distribution

The Electron application is named **Good Place Cabinet**, uses the bundle ID
`com.souljorje.good-place-cabinet`, and checks
`souljorje/cabinet` for updates. It can coexist with upstream Cabinet.

On first launch, select the local clone of `good-place-os` as the data
directory. The desktop shell syncs a valid Git-backed Cabinet on startup, every
30 seconds, and after local Git commits. Its status is visible in the bottom
bar. API keys stay in machine-local application data, not in the workspace.

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
