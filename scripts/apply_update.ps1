# ============================================================================
# apply_update.ps1 — rebuild + restart the EMR after the update daemon pulled
# new code. Designed to run from a Windows Scheduled Task every few minutes so
# "push to git" reaches the hospital hands-off.
#
# How it works
#   1. The update daemon writes C:\hms\server\UPDATE_PENDING_SHA after every
#      successful `git pull` (the new HEAD commit SHA).
#   2. This script checks that marker against the last applied SHA
#      (C:\hms\.last_applied_sha). Nothing to do → exits immediately.
#   3. New code present → rebuild the server (tsc) and client (vite), then
#      restart the EMR Windows service. The fresh build activates on boot and
#      new database migrations run automatically during startup.
#
# Schedule (run as SYSTEM, every 10 minutes — exits in <1s when idle):
#   schtasks /create /tn "EMR Apply Updates" /sc minute /mo 10 /ru SYSTEM ^
#     /tr "powershell -ExecutionPolicy Bypass -File C:\hms\scripts\apply_update.ps1"
#
# Manual run:
#   powershell -ExecutionPolicy Bypass -File C:\hms\scripts\apply_update.ps1
# ============================================================================

param(
  [string]$GitDir = "C:\hms",
  [string]$ServiceName = "Hospital_EMR_Local_Core",
  [string]$NodeDir = "C:\Program Files\nodejs"
)

$ErrorActionPreference = "Stop"

$marker = Join-Path $GitDir "server\UPDATE_PENDING_SHA"
$lastFile = Join-Path $GitDir ".last_applied_sha"

if (-not (Test-Path -LiteralPath $marker)) {
  exit 0
}

$pendingSha = (Get-Content -LiteralPath $marker -Raw).Trim()
if (-not $pendingSha) { exit 0 }

$lastSha = ""
if (Test-Path -LiteralPath $lastFile) {
  $lastSha = (Get-Content -LiteralPath $lastFile -Raw).Trim()
}
if ($pendingSha -eq $lastSha) { exit 0 }

Write-Host "=== EMR apply update: $($pendingSha.Substring(0, 10)) ===" -ForegroundColor Cyan

$node = Join-Path $NodeDir "node.exe"
$npm = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path -LiteralPath $node)) { throw "node.exe not found under $NodeDir" }

# 1. Rebuild the server (compiled output the service runs).
Push-Location (Join-Path $GitDir "server")
try {
  if (Test-Path -LiteralPath "package.json") {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw "server build failed" }
  }
} finally { Pop-Location }

# 2. Rebuild the web client (static files the server serves).
Push-Location (Join-Path $GitDir "client")
try {
  if (Test-Path -LiteralPath "package.json") {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw "client build failed" }
  }
} finally { Pop-Location }

# 3. Mark this SHA as applied BEFORE restarting so the task never loops.
Set-Content -LiteralPath $lastFile -Value $pendingSha -NoNewline

# 4. Restart the service so the new build + migrations activate.
$restarted = $false
if (Get-Command nssm -ErrorAction SilentlyContinue) {
  & nssm restart $ServiceName | Out-Null
  $restarted = $true
} else {
  try {
    Restart-Service -Name $ServiceName -Force -ErrorAction Stop
    $restarted = $true
  } catch {
    try {
      & "C:\Windows\System32\sc.exe" stop $ServiceName | Out-Null
      Start-Sleep -Seconds 2
      & "C:\Windows\System32\sc.exe" start $ServiceName | Out-Null
      $restarted = $true
    } catch {}
  }
}

Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue

if ($restarted) {
  Write-Host "Update applied ($($pendingSha.Substring(0, 10))): server+client rebuilt and service restarted." -ForegroundColor Green
} else {
  Write-Host "Update built but the service could not be restarted automatically. Restart '$ServiceName' manually." -ForegroundColor Yellow
}
