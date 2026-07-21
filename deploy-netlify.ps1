<#
.SYNOPSIS
  One-click deploy of the Deja View frontend to Netlify.

.DESCRIPTION
  Installs the Netlify CLI if missing, links this repo to a Netlify site
  (creating one on first run), points the build at your deployed backend
  API, builds the frontend, and deploys it.

  The backend (FastAPI + Postgres) is NOT deployed by this script -- Netlify
  cannot host it. Deploy that first (see render.yaml / README) and pass its
  URL here.

.PARAMETER BackendUrl
  URL of your deployed backend API, e.g. https://dejaview-api.onrender.com
  Stored as the VITE_API_BASE env var on the Netlify site and used for the
  build. If omitted, you'll be prompted.

.PARAMETER Draft
  Deploy a draft/preview build instead of production.

.EXAMPLE
  ./deploy-netlify.ps1 -BackendUrl https://dejaview-api.onrender.com
#>

param(
    [string]$BackendUrl = "",
    [switch]$Draft
)

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$frontend = Join-Path $repoRoot "frontend"

function Assert-Command($name, $installHint) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "$name not found on PATH. $installHint"
    }
}

Write-Host "==> Checking prerequisites" -ForegroundColor Cyan
Assert-Command "node" "Install Node.js from https://nodejs.org and re-run."
Assert-Command "npm" "Install Node.js from https://nodejs.org and re-run."

if (-not (Get-Command netlify -ErrorAction SilentlyContinue)) {
    Write-Host "==> Installing Netlify CLI globally" -ForegroundColor Cyan
    npm install -g netlify-cli
}

if (-not $BackendUrl) {
    $BackendUrl = Read-Host "Backend API URL (e.g. https://dejaview-api.onrender.com) - leave blank to skip"
}

Push-Location $frontend
try {
    Write-Host "==> Installing frontend dependencies" -ForegroundColor Cyan
    npm install

    $stateFile = Join-Path $frontend ".netlify/state.json"
    if (-not (Test-Path $stateFile)) {
        Write-Host "==> No linked Netlify site found - linking/creating one" -ForegroundColor Cyan
        Write-Host "    (this will also prompt you to log in to Netlify if needed)"
        netlify init
    }

    if ($BackendUrl) {
        Write-Host "==> Setting VITE_API_BASE on Netlify to $BackendUrl" -ForegroundColor Cyan
        netlify env:set VITE_API_BASE $BackendUrl
        $env:VITE_API_BASE = $BackendUrl
    }

    Write-Host "==> Building frontend" -ForegroundColor Cyan
    npm run build

    Write-Host "==> Deploying to Netlify" -ForegroundColor Cyan
    if ($Draft) {
        netlify deploy --dir=dist
    } else {
        netlify deploy --prod --dir=dist
    }
}
finally {
    Pop-Location
}

Write-Host "==> Done." -ForegroundColor Green
if (-not $BackendUrl) {
    Write-Host "Reminder: no backend URL was set. The app will try to call http://127.0.0.1:8000 and fail in production." -ForegroundColor Yellow
    Write-Host "Deploy the backend (render.yaml) then re-run with -BackendUrl <url>." -ForegroundColor Yellow
}
