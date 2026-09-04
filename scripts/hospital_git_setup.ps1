# ============================================================================
# hospital_git_setup.ps1 — configure a hospital host to pull code updates from
# your central GitHub repository with a READ-ONLY credential.
#
# Principles:
#   * The machine can only PULL. The credential stored here has read-only
#     scope, so even a compromised host cannot push or alter the repository.
#   * No secret is ever written into the repository's .git/config or into any
#     database setting — it lives in the Windows credential store only.
#   * After this script, enable "Auto-update this machine" + a release signal
#     in Super Admin -> Cloud & Sync -> Software Update.
#
# Usage (run as Administrator, as the SAME account the EMR service runs as):
#
#   Option A — read-only fine-grained PAT (recommended):
#     Create a fine-grained PAT on GitHub with ONLY "Contents: Read" access to
#     your repository, then:
#
#       powershell -ExecutionPolicy Bypass -File .\hospital_git_setup.ps1 `
#         -Repo "LuckyGoldx/sretan-hms" -Branch "master" -Token "github_pat_..."
#
#   Option B — SSH deploy key (read-only):
#       powershell -ExecutionPolicy Bypass -File .\hospital_git_setup.ps1 `
#         -Repo "LuckyGoldx/sretan-hms" -Branch "master" -DeployKeyPath "C:\hms\deploy_key"
#
#   Option C — just point the repo + verify an already-stored credential:
#       powershell -ExecutionPolicy Bypass -File .\hospital_git_setup.ps1 `
#         -Repo "LuckyGoldx/sretan-hms" -Branch "master"
# ============================================================================

param(
  [string]$Repo = "LuckyGoldx/sretan-hms",
  [string]$Branch = "master",
  [string]$GitDir = "C:\hms",
  [string]$Token = "",
  [string]$DeployKeyPath = ""
)

$ErrorActionPreference = "Stop"

function Test-Git {
  try { git --version | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Git)) {
  Write-Host "ERROR: git is not installed or not on PATH for this account." -ForegroundColor Red
  Write-Host "Install git for Windows: https://git-scm.com/download/win" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath $GitDir)) {
  Write-Host "ERROR: Git directory '$GitDir' does not exist. Point -GitDir at the install folder (contains server/, client/, database/)." -ForegroundColor Red
  exit 1
}

if ($Repo -notmatch "^https?://" -and $Repo -notmatch "^git@") {
  $Repo = "https://github.com/$Repo.git"
}
if ($Repo -match "^https?://[^/@\s]+@") {
  Write-Host "ERROR: The repository URL must NOT contain a username/password." -ForegroundColor Red
  exit 1
}

$url = if ($DeployKeyPath) { "git@github.com:$Repo" } else { $Repo }

Write-Host ""
Write-Host "=== Hospital git setup ===" -ForegroundColor Cyan
Write-Host "Repo   : $url"
Write-Host "Branch : $Branch"
Write-Host "GitDir : $GitDir"
Write-Host ""

# 1. Point origin at the plain (secret-free) URL.
git -C $GitDir remote set-url origin $url 2>$null
if ($LASTEXITCODE -ne 0) {
  git -C $GitDir remote add origin $url
  if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: could not set origin." -ForegroundColor Red; exit 1 }
}

# 2. Never let this repository push anywhere (defense in depth — the token/deploy
#    key is read-only anyway, this simply makes an accidental push fail fast).
git -C $GitDir config remote.origin.pushurl "no-push-configured"
Write-Host "[ok] origin points at secret-free URL; push is disabled on this machine." -ForegroundColor Green

# 3. Credential handling.
if ($DeployKeyPath) {
  git -C $GitDir config core.sshCommand "ssh -i `"$DeployKeyPath`" -o IdentitiesOnly=yes"
  Write-Host "[ok] SSH deploy key configured: $DeployKeyPath" -ForegroundColor Green
}
elseif ($Token) {
  if ($Token -notmatch "^(github_pat_|ghp_|gho_)") {
    Write-Host "WARNING: token does not look like a GitHub PAT." -ForegroundColor Yellow
  }
  git -C $GitDir config credential.helper manager-core
  git -C $GitDir config credential.interactive never

  $stdin = "protocol=https`nhost=github.com`nusername=x-access-token`npassword=$Token`n`n"
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($stdin)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "git"
  $psi.Arguments = "credential approve"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $proc.StandardInput.Close()
  $errOut = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  if ($proc.ExitCode -ne 0) {
    Write-Host "WARNING: could not store the token in the credential manager:" -ForegroundColor Yellow
    Write-Host $errOut -ForegroundColor Yellow
    Write-Host "Tip: run 'git -C $GitDir fetch' once in this account so the GitHub sign-in window can save the credential."
  } else {
    Write-Host "[ok] read-only token stored in the Windows credential store (NOT in the repo)." -ForegroundColor Green
  }
}
else {
  git -C $GitDir config credential.helper manager-core
  Write-Host "[..] no -Token given — the existing Windows credential store will be used." -ForegroundColor DarkYellow
  Write-Host "     If GitHub asks for credentials on the first pull, sign in once (or re-run with -Token)."
}

# 4. Check out the requested branch if missing, then verify connectivity.
$current = git -C $GitDir rev-parse --abbrev-ref HEAD 2>$null
if ($current -and $current -ne $Branch) {
  git -C $GitDir checkout $Branch 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[..] branch '$Branch' not checked out locally yet; the daemon pulls it on first update." -ForegroundColor DarkYellow
  }
}

Write-Host ""
Write-Host "=== Verifying read-only access (git ls-remote) ===" -ForegroundColor Cyan
try {
  $sha = git -C $GitDir ls-remote origin $Branch 2>$null | ForEach-Object { ($_ -split "`t")[0] }
  if ($sha) {
    Write-Host "SUCCESS — remote '$Branch' is reachable at $($sha.Substring(0, 10))…" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart the EMR service so it runs with the new credential store:"
    Write-Host "       net stop Hospital_EMR_Local_Core; net start Hospital_EMR_Local_Core"
    Write-Host "  2. In the console (Super Admin -> Cloud & Sync -> Software Update) confirm the"
    Write-Host "     repository URL/branch and enable 'Auto-update this machine'."
    Write-Host "  3. Publish an update from your central console — every hospital pulls within seconds."
    exit 0
  } else {
    Write-Host "FAILED — remote not reachable with the current credential." -ForegroundColor Red
    Write-Host "Check: internet access, token scope (must be 'Contents: Read'), or deploy key."
    exit 1
  }
} catch {
  Write-Host "FAILED — $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
