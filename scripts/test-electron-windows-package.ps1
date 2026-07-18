$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq "Core") {
  throw "This smoke test must run on Windows."
}

function Get-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Wait-HealthyJson([string]$Url, [int]$TimeoutSeconds, [System.Diagnostics.Process]$Process) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastError = "no response"
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($Process.HasExited) {
      throw "Cabinet exited before becoming healthy (code $($Process.ExitCode))."
    }
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 3
      if ($response.status -eq "ok") {
        return $response
      }
      $lastError = "unexpected status payload: $($response | ConvertTo-Json -Compress)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for ${Url}: $lastError"
}

function Assert-ValidSignature([string]$Path) {
  $signature = Get-AuthenticodeSignature -FilePath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Authenticode signature for $Path is $($signature.Status): $($signature.StatusMessage)"
  }
  Write-Host "Valid Authenticode signature: $Path"
}

function Copy-Diagnostics([string]$Destination, [string]$ProcessLog, [string]$DataDirectory) {
  if ([string]::IsNullOrWhiteSpace($Destination)) { return }
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  if (Test-Path $ProcessLog) {
    Copy-Item $ProcessLog (Join-Path $Destination "electron-process.log") -Force
  }
  $cabinetLogs = Join-Path $DataDirectory ".cabinet-state\logs"
  if (Test-Path $cabinetLogs) {
    Copy-Item $cabinetLogs (Join-Path $Destination "cabinet-logs") -Recurse -Force
  }
}

$setupExe = Get-ChildItem "out\make\squirrel.windows" -Filter "*Setup.exe" -Recurse -File |
  Select-Object -First 1
if (-not $setupExe) {
  throw "No Squirrel Setup.exe found. Run npm run electron:make:win first."
}

$requireSigning = $env:CABINET_WINDOWS_REQUIRE_SIGNING -eq "1"
if ($requireSigning) {
  Assert-ValidSignature $setupExe.FullName
}

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$workDirectory = Join-Path $tempRoot "cabinet-electron-smoke-$([Guid]::NewGuid())"
$dataDirectory = Join-Path $workDirectory "cabinet-data"
$processLog = Join-Path $workDirectory "electron-process.log"
$processErrorLog = Join-Path $workDirectory "electron-process-error.log"
$userDataDirectory = Join-Path $env:APPDATA "Cabinet"
$configPath = Join-Path $userDataDirectory "cabinet-config.json"
$installRoot = Join-Path $env:LOCALAPPDATA "cabinet"
$existingConfig = $null
$configExisted = Test-Path $configPath
$appProcess = $null

New-Item -ItemType Directory -Force -Path $workDirectory, $dataDirectory, $userDataDirectory | Out-Null
if ($configExisted) {
  $existingConfig = [IO.File]::ReadAllBytes($configPath)
}

try {
  $appPort = Get-FreePort
  @{ appPort = $appPort; dataDir = $dataDirectory } |
    ConvertTo-Json |
    Set-Content -Path $configPath -Encoding utf8

  Write-Host "Installing $($setupExe.FullName)"
  $installer = Start-Process -FilePath $setupExe.FullName -ArgumentList "--silent" -Wait -PassThru
  if ($installer.ExitCode -ne 0) {
    throw "Squirrel installer exited with code $($installer.ExitCode)."
  }

  # Launch the versioned executable directly. The root Squirrel stub may spawn
  # the real app and exit immediately, which would look like a smoke-test crash.
  $appExe = Get-ChildItem $installRoot -Directory -Filter "app-*" |
    ForEach-Object { Get-Item (Join-Path $_.FullName "Cabinet.exe") -ErrorAction SilentlyContinue } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if (-not $appExe) {
    throw "Cabinet.exe was not installed below $installRoot."
  }
  if ($requireSigning) {
    Assert-ValidSignature $appExe.FullName
  }

  # A normal interactive Squirrel install may launch the app automatically.
  # --silent should suppress that, but clean up defensively before starting the
  # process whose lifetime and logs this test owns.
  Get-Process -Name "Cabinet" -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not $_.CloseMainWindow()) {
      & taskkill.exe /PID $_.Id /T /F 2>$null | Out-Null
    } elseif (-not $_.WaitForExit(10000)) {
      & taskkill.exe /PID $_.Id /T /F 2>$null | Out-Null
    }
  }

  Write-Host "Launching installed app: $($appExe.FullName)"
  $appProcess = Start-Process `
    -FilePath $appExe.FullName `
    -RedirectStandardOutput $processLog `
    -RedirectStandardError $processErrorLog `
    -PassThru

  $origin = "http://127.0.0.1:$appPort"
  $appHealth = Wait-HealthyJson "$origin/api/health" 90 $appProcess
  Write-Host "App healthy: $($appHealth | ConvertTo-Json -Compress)"
  $daemonHealth = Wait-HealthyJson "$origin/api/health/daemon" 30 $appProcess
  Write-Host "Daemon healthy: $($daemonHealth | ConvertTo-Json -Compress)"

  $homeResponse = Invoke-WebRequest -Uri "$origin/" -UseBasicParsing -TimeoutSec 5
  if ($homeResponse.StatusCode -ne 200 -or $homeResponse.Content -notmatch "<!DOCTYPE html") {
    throw "Installed app did not serve its HTML shell."
  }

  Write-Host "Windows Electron installer smoke test passed."
} finally {
  if ($appProcess -and -not $appProcess.HasExited) {
    & taskkill.exe /PID $appProcess.Id /T /F 2>$null | Out-Null
  }

  if (Test-Path $processErrorLog) {
    Get-Content $processErrorLog | Add-Content $processLog
  }
  Copy-Diagnostics $env:CABINET_ELECTRON_SMOKE_LOG_DIR $processLog $dataDirectory

  $updateExe = Join-Path $installRoot "Update.exe"
  if (Test-Path $updateExe) {
    $uninstaller = Start-Process -FilePath $updateExe -ArgumentList "--uninstall", "-s" -Wait -PassThru
    if ($uninstaller.ExitCode -ne 0) {
      Write-Warning "Squirrel uninstaller exited with code $($uninstaller.ExitCode)."
    }
  }

  if ($configExisted) {
    [IO.File]::WriteAllBytes($configPath, $existingConfig)
  } else {
    Remove-Item $configPath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $workDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
