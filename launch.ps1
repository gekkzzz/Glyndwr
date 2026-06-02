#Requires -Version 5.1
param()
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host ""
Write-Host "  Glyndwr -- Self-hosted AI Workspace" -ForegroundColor Magenta
Write-Host ""

# ── Python ────────────────────────────────────────────────────
$PythonCmd = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match 'Python (\d+)\.(\d+)' -and [int]$Matches[1] -ge 3 -and [int]$Matches[2] -ge 9) {
            $PythonCmd = $cmd; break
        }
    } catch {}
}
if (-not $PythonCmd) {
    Write-Host "  Python 3.9+ not found. Install from https://python.org" -ForegroundColor Red; exit 1
}

# ── Virtual environment ───────────────────────────────────────
$VenvDir    = Join-Path $ScriptDir '.venv'
$PythonVenv = Join-Path $VenvDir 'Scripts\python.exe'
$PipVenv    = Join-Path $VenvDir 'Scripts\pip.exe'

if (-not (Test-Path $VenvDir)) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Cyan
    & $PythonCmd -m venv $VenvDir
    Write-Host "  Done" -ForegroundColor Green
}

# ── Dependencies (skip if requirements unchanged) ────────────
$ReqFile  = Join-Path $ScriptDir 'requirements.txt'
$Sentinel = Join-Path $VenvDir '.deps-ok'
$ReqHash  = (Get-FileHash $ReqFile -Algorithm MD5).Hash
$NeedInstall = (-not (Test-Path $Sentinel)) -or ((Get-Content $Sentinel -Raw).Trim() -ne $ReqHash)

if ($NeedInstall) {
    Write-Host "  Installing dependencies..." -ForegroundColor Cyan
    & $PipVenv install -q -r $ReqFile
    $ReqHash | Set-Content $Sentinel
    Write-Host "  Dependencies ready" -ForegroundColor Green
}

# ── .env & data dir ──────────────────────────────────────────
$EnvFile = Join-Path $ScriptDir '.env'
if (-not (Test-Path $EnvFile)) { Copy-Item (Join-Path $ScriptDir '.env.example') $EnvFile }
New-Item -ItemType Directory -Force -Path (Join-Path $ScriptDir 'data') | Out-Null

# ── Port ─────────────────────────────────────────────────────
$Port = 7860
foreach ($line in (Get-Content $EnvFile -ErrorAction SilentlyContinue)) {
    if ($line -match '^APP_PORT\s*=\s*(\d+)') { $Port = [int]$Matches[1] }
}
$Url = "http://localhost:$Port"

# ── Start uvicorn as a background process ────────────────────
Write-Host "  Starting server..." -ForegroundColor Cyan

$proc = Start-Process `
    -FilePath $PythonVenv `
    -ArgumentList "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "$Port", "--reload" `
    -PassThru -NoNewWindow

# ── Poll until ready, then print URL and open browser ────────
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "$Url/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

if ($ready) {
    Write-Host ""
    Write-Host "  Application live at: $Url" -ForegroundColor Green
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor DarkGray
    Write-Host ""
    Start-Process $Url
} else {
    Write-Host "  Server did not respond after 20s -- check for errors above." -ForegroundColor Red
}

# ── Keep window open and forward Ctrl+C to uvicorn ───────────
try {
    $proc.WaitForExit()
} finally {
    if (-not $proc.HasExited) { $proc.Kill() }
}
