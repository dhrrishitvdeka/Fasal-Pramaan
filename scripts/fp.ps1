# FasalPramaan AI — Windows PowerShell task runner (Make alternative)
param(
    [Parameter(Position = 0)]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Ensure-Env {
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example"
    }
}

function Wait-Http($url, $retries = 30, $delaySec = 2) {
    for ($i = 0; $i -lt $retries; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch { }
        Start-Sleep -Seconds $delaySec
    }
    return $false
}

switch ($Command.ToLower()) {
    "help" {
        Write-Host @"
FasalPramaan AI — PowerShell commands
  .\scripts\fp.ps1 setup    One-command build, migrate, seed, start
  .\scripts\fp.ps1 dev      Start full stack
  .\scripts\fp.ps1 down     Stop services
  .\scripts\fp.ps1 clean    Stop and remove volumes
  .\scripts\fp.ps1 migrate  Run migrations
  .\scripts\fp.ps1 seed     Load seed data
  .\scripts\fp.ps1 test     Run tests
  .\scripts\fp.ps1 lint     Run linters
  .\scripts\fp.ps1 build    Build images
  .\scripts\fp.ps1 health   Check health endpoints
  .\scripts\fp.ps1 demo     Print demo info
"@
    }
    "setup" {
        Ensure-Env
        docker compose up -d --build
        Write-Host "Stack starting. Run: .\scripts\fp.ps1 health"
        Write-Host "Dashboard: http://localhost:3000"
        Write-Host "Field app: http://localhost:8085"
        Write-Host "API docs:  http://localhost:8000/docs"
    }
    "dev" {
        Ensure-Env
        docker compose up -d
    }
    "up" { & $PSCommandPath dev }
    "down" { docker compose down }
    "clean" { docker compose down -v --remove-orphans }
    "migrate" {
        Ensure-Env
        docker compose run --rm migrate
    }
    "seed" {
        Ensure-Env
        docker compose run --rm seed
    }
    "test" {
        Ensure-Env
        docker compose run --rm api pytest -q
        docker compose run --rm ai pytest -q
        Push-Location apps\mobile
        try { flutter test } finally { Pop-Location }
    }
    "lint" {
        docker compose run --rm api ruff check app tests
        docker compose run --rm ai ruff check app tests
    }
    "build" {
        docker compose build api ai dashboard mobile
        Write-Host "Built API/worker, AI v14, reviewer dashboard, and Flutter field app images"
    }
    "prune" {
        docker rmi fasalpramaan-worker:latest 2>$null
        docker rmi fasalpramaan-migrate:latest 2>$null
        docker rmi fasalpramaan-seed:latest 2>$null
        Write-Host "Pruned redundant image tags (worker/migrate/seed). Worker process still uses fasalpramaan-api."
        docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | Select-String -Pattern "fasalpramaan|REPOSITORY"
    }
    "logs" { docker compose logs -f --tail=100 }
    "health" {
        try { (Invoke-WebRequest http://localhost:8000/health -UseBasicParsing).Content; "API OK" } catch { "API not ready" }
        try { (Invoke-WebRequest http://localhost:8001/health -UseBasicParsing).Content; "AI OK" } catch { "AI not ready" }
        try { $null = Invoke-WebRequest http://localhost:3000 -UseBasicParsing; "Dashboard OK" } catch { "Dashboard not ready" }
    }
    "demo" {
        Write-Host @"
=== FasalPramaan AI Demo ===
Dashboard: http://localhost:3000
Field app: http://localhost:8085
API:       http://localhost:8000
API docs:  http://localhost:8000/docs
MinIO:     http://localhost:9001  (minioadmin / minioadmin_dev_only)
AI:        http://localhost:8001/health

Demo password for all users: Demo@12345
  admin@fasalpramaan.local      (administrator)
  reviewer@fasalpramaan.local   (reviewer)
  officer@fasalpramaan.local    (field_officer)
  farmer@fasalpramaan.local     (farmer)
"@
    }
    default {
        Write-Error "Unknown command: $Command. Run .\scripts\fp.ps1 help"
    }
}
