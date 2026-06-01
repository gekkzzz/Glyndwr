#Requires -Version 5.1
<#
.SYNOPSIS
    Glyndwr launcher for Windows PowerShell
.DESCRIPTION
    Checks Python, creates/activates venv, installs deps, runs the server, opens browser.
#>

$ErrorActionPreference = 'Stop'

# ── Colors ──────────────────────────────────────────────────────────────────
function Write-Step   { param($msg) Write-Host "  ➜  $msg" -ForegroundColor Cyan }
function Write-OK     { param($msg) Write-Host "  ✓  $msg" -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Err    { param($msg) Write-Host "  ✗  $msg" -ForegroundColor Red }
function Write-Banner {
    Write-Host ""
    Write-Host "  ⊕  Glyndwr — Self-hosted AI Workspace" -ForegroundColor Magenta
    Write-Host "  ──────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Banner

# ── Script directory ────────────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# ── Check Python ────────────────────────────────────────────────────────────
Write-Step "Checking Python installation…"

$PythonCmd = $null
foreach ($cmd in @('python', 'python3', 'py')) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match 'Python (\d+)\.(\d+)') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 9) {
                $PythonCmd = $cmd
                Write-OK "Found $ver"
                break
            }
        }
    } catch {}
}

if (-not $PythonCmd) {
    Write-Err "Python 3.9+ not found. Please install from https://python.org"
    exit 1
}

# ── Create/activate venv ────────────────────────────────────────────────────
$VenvDir = Join-Path $ScriptDir '.venv'
if (-not (Test-Path $VenvDir)) {
    Write-Step "Creating virtual environment…"
    & $PythonCmd -m venv $VenvDir
    Write-OK "Virtual environment created at .venv"
} else {
    Write-OK "Virtual environment exists"
}

$PythonVenv = Join-Path $VenvDir 'Scripts\python.exe'
$PipVenv    = Join-Path $VenvDir 'Scripts\pip.exe'

if (-not (Test-Path $PythonVenv)) {
    Write-Err "venv Python not found. Try deleting .venv and re-running."
    exit 1
}

# ── Install / update dependencies ───────────────────────────────────────────
Write-Step "Installing/updating dependencies…"
& $PipVenv install -q -r requirements.txt
Write-OK "Dependencies ready"

# ── Ensure .env exists ──────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $ScriptDir '.env'))) {
    Write-Warn ".env not found — copying from .env.example"
    Copy-Item (Join-Path $ScriptDir '.env.example') (Join-Path $ScriptDir '.env')
    Write-OK ".env created. Edit it to add your API keys."
}

# ── Ensure data dir ─────────────────────────────────────────────────────────
$DataDir = Join-Path $ScriptDir 'data'
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
}

# ── Read port ───────────────────────────────────────────────────────────────
$Port = 7860
$EnvFile = Join-Path $ScriptDir '.env'
if (Test-Path $EnvFile) {
    $EnvContent = Get-Content $EnvFile
    foreach ($line in $EnvContent) {
        if ($line -match '^APP_PORT\s*=\s*(\d+)') {
            $Port = [int]$Matches[1]
        }
    }
}

$Url = "http://localhost:$Port"
Write-Host ""
Write-Host "  🚀  Starting Glyndwr on $Url" -ForegroundColor Magenta
Write-Host "  📖  Press Ctrl+C to stop" -ForegroundColor DarkGray
Write-Host ""

# ── Open browser after short delay ──────────────────────────────────────────
$openBrowser = Start-Job -ScriptBlock {
    param($url)
    Start-Sleep -Seconds 2
    Start-Process $url
} -ArgumentList $Url

# ── Run server ──────────────────────────────────────────────────────────────
try {
    & $PythonVenv -m uvicorn app:app --host 0.0.0.0 --port $Port --reload
} finally {
    Stop-Job $openBrowser -ErrorAction SilentlyContinue
    Remove-Job $openBrowser -ErrorAction SilentlyContinue
}
