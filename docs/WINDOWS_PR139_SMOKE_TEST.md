# PR #139 Windows Smoke Test Guide

This guide validates PR #139, `fix(windows): repair CLI install path + remaining POSIX-only assumptions`, on a real Windows 11 machine before release.

The goal is not only to prove TypeScript/tests pass. The important part is to exercise the Windows-only paths that macOS/Linux CI cannot prove:

- `npx create-cabinet` finds and runs the real `cabinetai` JavaScript entrypoint.
- `npx create-cabinet "<Name With Spaces>"` `cd`s into the **slugified** directory it actually created (not the raw argument).
- `cabinetai run` can download and extract the app tarball on Windows.
- Git Bash/MSYS/GNU `tar` earlier on `PATH` does not break extraction.
- "Open terminal" opens a terminal in the user's home directory.
- "Reveal in file manager" opens File Explorer without shell quoting issues.
- Root-level page navigation is not redirected into the default room.

> ### Verified against the code (2026-06-14, macOS)
> Before handing this to a Windows tester, the concrete claims below were checked against the branch:
> - **cabinetai version is `0.4.4`** → app installs at `%USERPROFILE%\.cabinet\app\v0.4.4` (`appVersionDir` in `cabinetai/src/lib/paths.ts`). ✅
> - `cabinetai/` has its own `package-lock.json`, so `npm ci` inside it works. ✅
> - `cabinetai` has `npm run build` (esbuild → `dist/index.js`) and a `tsconfig.json` (so `npx tsc --noEmit` is valid). ✅
> - Root `electron:make:win` script exists. ✅ Default app port is `4000` (overridable via `CABINET_APP_PORT`/`PORT`). ✅
> - **Correction:** `cabinetai create "Cabinet With Spaces"` writes a **slugified** directory `cabinet-with-spaces/` (see `slugify` in `cabinetai/src/lib/paths.ts`), *not* `Cabinet With Spaces/`. All filesystem paths below use the slug. This guide originally surfaced a real bug — `create-cabinet` `chdir`'d into the raw name and crashed with `ENOENT` — which **PR #139 now fixes** (the wrapper resolves the created slug dir). Smoke Test 1 explicitly re-checks this.
> - tsc + eslint clean and `npm test` 312/312 on macOS; the Windows-only behaviors still require this guide.

## Environment

Use a real Windows 11 machine or VM. Do not use WSL for the primary test. Run commands from PowerShell or Windows Terminal using PowerShell.

Recommended versions:

- Windows 11
- Node.js 20 or 22
- npm bundled with Node
- Git for Windows

Record these at the top of the test result:

```powershell
systeminfo | Select-String "OS Name","OS Version","System Type"
node -v
npm -v
git --version
$PSVersionTable.PSVersion
Get-Command tar
Get-Command npx
```

If Git Bash is installed, also record:

```powershell
Test-Path "C:\Program Files\Git\usr\bin\tar.exe"
```

## Checkout

```powershell
git clone https://github.com/cabinetai/cabinet.git
cd cabinet
git fetch origin main fix/windows-cli-and-polish
git checkout fix/windows-cli-and-polish
git rev-parse --short HEAD
```

Use the current tip of `fix/windows-cli-and-polish` (commit `c0df0034` or later — the slug-dir fix is a follow-up commit on the same branch). Record the exact short hash you tested.

## Static Verification

Run the repo checks first. These are not enough to approve the Windows behavior, but they catch obvious regressions.

```powershell
npm ci
npx tsc --noEmit
npx eslint cabinetai/src/lib/app-manager.ts cli/index.cjs src/app/api/system/reveal/route.ts src/app/api/terminal/open/route.ts src/components/layout/app-shell.tsx src/lib/agents/nvm-path.ts
npm test
```

Then validate the `cabinetai` package:

```powershell
Push-Location cabinetai
npm ci
npm run build
npx tsc --noEmit
Pop-Location
```

Expected:

- TypeScript exits with code 0.
- ESLint exits with code 0.
- `npm test` passes all tests (312 at time of writing).
- `cabinetai/dist/index.js` exists after `npm run build`.

## Build Local Package Tarballs

This simulates unpublished npm packages from the PR branch. It is important because the `create-cabinet` bug lives in package layout and bin resolution.

```powershell
Push-Location cabinetai
npm run build
$cabinetaiPackName = (npm pack --silent | Select-Object -Last 1)
$cabinetaiTgz = Join-Path (Get-Location) $cabinetaiPackName
Pop-Location

Push-Location cli
$createCabinetPackName = (npm pack --silent | Select-Object -Last 1)
$createCabinetTgz = Join-Path (Get-Location) $createCabinetPackName
Pop-Location

$cabinetaiTgz
$createCabinetTgz
```

Expected:

- A `cabinetai-*.tgz` path is printed.
- A `create-cabinet-*.tgz` path is printed.

## Smoke Test 1: `npx create-cabinet`

This is the highest-priority test. It validates that `create-cabinet` resolves `cabinetai` from package metadata and runs it with `node` (instead of feeding a Windows npm shim to Node), **and** that it `cd`s into the slugified directory that was actually created.

Start from a clean temp directory:

```powershell
$smokeRoot = Join-Path $env:TEMP "cabinet-pr139-smoke"
Remove-Item $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $smokeRoot | Out-Null
Push-Location $smokeRoot
```

Force a fresh app extraction:

```powershell
Remove-Item "$env:USERPROFILE\.cabinet\app\v0.4.4" -Recurse -Force -ErrorAction SilentlyContinue
```

If Git Bash is installed, put its GNU/MSYS tools first on `PATH` for this shell. This intentionally recreates the old failure mode where `tar` could misread `C:\...` as `host:path`.

```powershell
$oldPath = $env:Path
$gitUsrBin = "C:\Program Files\Git\usr\bin"
if (Test-Path $gitUsrBin) {
  $env:Path = "$gitUsrBin;$env:Path"
  Get-Command tar
}
```

Run the local package simulation (the spaced name deliberately exercises the slug `chdir` fix):

```powershell
npx -y --package $cabinetaiTgz --package $createCabinetTgz create-cabinet "Cabinet With Spaces"
```

After npm publish, repeat this same test once with the published package:

```powershell
npx -y create-cabinet@0.4.4 "Cabinet Published Smoke"
```

Expected:

- No `SyntaxError`.
- No attempt to parse a shell script as JavaScript.
- Output reaches `cabinetai create`.
- A directory `cabinet-with-spaces/` is created (slugified — **not** `Cabinet With Spaces/`).
- **No `ENOENT ... chdir ... Cabinet With Spaces`** — the wrapper must `cd` into `cabinet-with-spaces/`.
- Output reaches `cabinetai run`.
- Fresh install prints `Downloading Cabinet v0.4.4...` and `Extracting...`.
- No `Cannot connect to C:`.
- No `--no-same-owner` error.
- No misleading `Empty release archive`.
- App dependencies install if missing.
- The app starts and prints a local URL, usually `http://127.0.0.1:4000`.

Confirm the created directory name:

```powershell
Get-ChildItem $smokeRoot -Directory | Select-Object Name
```

Expected to include `cabinet-with-spaces` (and, after the published run, `cabinet-published-smoke`).

Leave the app running for the route/UI smoke tests below. If the process is stopped accidentally, restart it from the **slug** directory:

```powershell
cd "$smokeRoot\cabinet-with-spaces"
npx -y --package $cabinetaiTgz cabinetai run
```

Keep the app process running for the next tests. When all tests are done and the app has been stopped with `Ctrl+C`, restore `PATH` in this PowerShell window if it was changed:

```powershell
if ($oldPath) { $env:Path = $oldPath }
```

## Smoke Test 2: Extracted App Is Actually Usable

In a second PowerShell window:

```powershell
$smokeRoot = Join-Path $env:TEMP "cabinet-pr139-smoke"
$origin = "http://127.0.0.1:4000"
Invoke-WebRequest "$origin" -UseBasicParsing
```

If the app chose another port, update `$origin` to the URL printed by `cabinetai run`.

Expected:

- HTTP request succeeds.
- Browser can load the app.
- `%USERPROFILE%\.cabinet\app\v0.4.4\package.json` exists.
- `%USERPROFILE%\.cabinet\app\v0.4.4\node_modules\next` exists.

Check the files:

```powershell
Test-Path "$env:USERPROFILE\.cabinet\app\v0.4.4\package.json"
Test-Path "$env:USERPROFILE\.cabinet\app\v0.4.4\node_modules\next"
```

Both should print `True`.

## Smoke Test 3: Open Terminal Route

With the app still running:

```powershell
$origin = "http://127.0.0.1:4000"
Invoke-RestMethod -Method Post "$origin/api/terminal/open"
```

Expected:

- API returns `{ ok = True }`.
- A new `cmd.exe` window opens.
- The new terminal starts in the Windows user home directory, for example `C:\Users\<User>`.
- A home path containing spaces still works.

Manual confirmation inside the opened terminal:

```cmd
cd
```

The printed directory should match the user's home directory, not a literal `~`.

## Smoke Test 4: Reveal In File Manager

> The reveal API resolves the posted `path` **relative to the running cabinet's data root** (`resolveContentPath` → `DATA_DIR`). Create the test file under that data root. For a cabinet created above, that is the cabinet directory itself; if your install keeps content under a `data/` subfolder, create the file there and adjust the posted path accordingly.

Create a file with spaces and shell-sensitive characters in the running cabinet's data directory:

```powershell
$cabinetDir = Join-Path $smokeRoot "cabinet-with-spaces"
$nestedDir = Join-Path $cabinetDir "Folder With Spaces"
New-Item -ItemType Directory -Force $nestedDir | Out-Null
$testFile = Join-Path $nestedDir "hello & test.md"
"hello" | Set-Content -Encoding UTF8 $testFile
```

Call the reveal API with a Windows-style virtual path:

```powershell
$body = @{ path = "Folder With Spaces\hello & test.md" } | ConvertTo-Json
Invoke-RestMethod -Method Post "$origin/api/system/reveal" -ContentType "application/json" -Body $body
```

Expected:

- API returns `{ ok = True }`.
- File Explorer opens.
- The file is selected or the containing folder opens.
- The `&` in the filename is treated as part of the filename, not as shell syntax.

Also test a missing file:

```powershell
$body = @{ path = "Folder With Spaces\missing.md" } | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post "$origin/api/system/reveal" -ContentType "application/json" -Body $body
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected:

```text
404
```

## Smoke Test 5: Root Page Is Not Hijacked Into Default Room

This checks the `app-shell` redirect change. The important behavior is that a root-scoped page route remains a page route and is not snapped into the default room.

In the browser:

1. Open the app URL printed by `cabinetai run`.
2. Create or open a top-level page in the data root, not inside a room.
3. Reload the browser.
4. Navigate away and back to the page using the address bar or sidebar.

Expected:

- The page remains selected after reload.
- The URL stays on the page/content route.
- The UI does not jump into the default room dashboard.
- The sidebar selection still points at the requested page.

If there is no obvious way to create a root-level page through the UI, use the file created in Smoke Test 4 and navigate to it from search/sidebar. Record that limitation in the result.

## Smoke Test 6: Agent CLI PATH And nvm Caveat

PR #139 only changes the fallback from `HOME\.nvm` to `USERPROFILE\.nvm` when `NVM_DIR` is missing. It does not fully implement `nvm-windows` layout using `NVM_HOME` or `NVM_SYMLINK`.

Check the behavior, but do not call `nvm-windows` fully fixed unless it is explicitly verified.

Prefer validating through the app settings/provider verification flow:

1. Install or use one agent CLI through normal npm global installation.
2. Open Cabinet settings for provider setup.
3. Run the provider verify flow.
4. Confirm globally installed CLIs under `%APPDATA%\npm` are found.
5. If testing a Unix-style `%USERPROFILE%\.nvm`, confirm the provider CLI is found there.
6. If testing `nvm-windows`, record whether it works, but treat failures as outside this PR unless the branch claims otherwise.

Expected:

- npm global CLIs under `%APPDATA%\npm` are found.
- The PR should not regress provider verification.
- `nvm-windows` support should be documented as unproven unless separately fixed.

## Optional Release Gate: Packaged Windows App

This is not the same as `npx create-cabinet`, but it is still a release gate mentioned in the PR.

From the repo root:

```powershell
npm run electron:make:win
```

Then install/run the generated Squirrel artifact from `out\make\squirrel.windows\`.

Expected:

- Installer builds on `windows-latest` or a Windows 11 machine.
- Installed app launches.
- App can create/open a cabinet.
- No startup crash from native dependencies.

If this fails, record it separately from PR #139 unless the failure is caused by one of the changed files.

## Blocking Failures

Block the release if any of these happen:

- `npx create-cabinet` crashes with `SyntaxError` while parsing an npm shim.
- `npx create-cabinet "<Name With Spaces>"` crashes with `ENOENT` on `chdir` (slug-dir regression).
- App extraction fails with `Cannot connect to C:`.
- App extraction fails because `--no-same-owner` is unsupported.
- Extraction failure is reported as `Empty release archive`.
- Fresh `cabinetai run` cannot reach a working app URL.
- Terminal opens at literal `~` or fails when the home path contains spaces.
- Reveal route treats filename characters like `&`, `(`, `)`, `^`, or `|` as shell syntax.
- Root-scoped page routes are redirected into the default room.

## Report Template

Use this format when reporting results back on the PR:

```markdown
## Windows Smoke Test Result

- PR/commit:
- Windows version:
- Node/npm:
- Shell:
- Git for Windows installed: yes/no
- Git Bash `usr\bin` placed first on PATH for extraction test: yes/no

### Checks

- [ ] `npm ci`
- [ ] root `npx tsc --noEmit`
- [ ] focused ESLint
- [ ] `npm test`
- [ ] `cabinetai npm run build`
- [ ] `cabinetai npx tsc --noEmit`

### Smoke Tests

- [ ] local `npx create-cabinet` package simulation
- [ ] created directory is the slug (`cabinet-with-spaces`), no ENOENT chdir
- [ ] fresh app tarball extraction
- [ ] app URL loads
- [ ] terminal opens at user home
- [ ] reveal route opens File Explorer
- [ ] root page route is not hijacked
- [ ] provider CLI verification not regressed
- [ ] packaged Windows app smoke, if applicable

### Notes

Paste any command output for failures here. Include screenshots only when they show a UI-specific failure.
```
