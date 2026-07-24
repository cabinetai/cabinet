# Good Place distribution

This fork keeps application code separate from the private Good Place OS data
repository.

## Local development

```bash
npm ci
CABINET_DATA_DIR=/path/to/good-place-os npm run dev:all
```

The Good Place OS repository's `npm run cabinet` command uses the sibling
`good-place-cabinet` checkout by default and supervises its Git synchronization.

## Desktop distribution

The Electron application is named **Good Place Cabinet**, uses the bundle ID
`com.souljorje.good-place-cabinet`, and checks
`souljorje/cabinet` for updates. It can coexist with upstream Cabinet.

On first launch, select the local clone of `good-place-os` as the data
directory. When that directory contains `scripts/cabinet-sync.mjs`, the desktop
shell runs it immediately, every 30 seconds, and after local Git commits.

Create installers with:

```bash
npm run electron:make
```

Unsigned macOS builds require **right-click → Open** on first launch. Add the
Apple signing secrets documented in `docs/CABINETAI.md` for seamless
installation and updates.
