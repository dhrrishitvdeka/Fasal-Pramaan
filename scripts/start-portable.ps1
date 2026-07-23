param(
    [string]$PublicHost = "localhost",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or is not available on PATH."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop/Engine is not running. Start it and run this script again."
}

if (-not (Test-Path -LiteralPath ".env")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
}

function Set-EnvValue([string]$Key, [string]$Value) {
    $lines = @(Get-Content -LiteralPath ".env")
    $replacement = "$Key=$Value"
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^$([regex]::Escape($Key))=") {
            $found = $true
            $replacement
        } else {
            $line
        }
    }
    if (-not $found) {
        $updated += $replacement
    }
    Set-Content -LiteralPath ".env" -Value $updated -Encoding utf8
}

Set-EnvValue "PUBLIC_HOST" $PublicHost
Set-EnvValue "CORS_ORIGINS" (
    "http://localhost:3000,http://127.0.0.1:3000," +
    "http://localhost:8085,http://127.0.0.1:8085," +
    "http://$PublicHost`:3000,http://$PublicHost`:8085"
)
Set-EnvValue "MOBILE_API_BASE_URL" "http://$PublicHost`:8000"

if ($NoBuild) {
    docker compose up -d
} else {
    docker compose up -d --build
}

$checks = @(
    @{ Name = "API"; Url = "http://localhost:8000/health" },
    @{ Name = "AI"; Url = "http://localhost:8001/health" },
    @{ Name = "Dashboard"; Url = "http://localhost:3000" },
    @{ Name = "Field app"; Url = "http://localhost:8085/healthz" }
)

foreach ($check in $checks) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                $ready = $true
                break
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        throw "$($check.Name) did not become ready. Run: docker compose logs --tail=100"
    }
}

Write-Host ""
Write-Host "FasalPramaan is ready:"
Write-Host "  Reviewer dashboard: http://$PublicHost`:3000"
Write-Host "  Farmer/field app:   http://$PublicHost`:8085"
Write-Host "  API health:         http://$PublicHost`:8000/health"
Write-Host "  AI health:          http://$PublicHost`:8001/health"
Write-Host ""
Write-Host "Reviewer: reviewer@fasalpramaan.local / Demo@12345"
Write-Host "Farmer:   farmer@fasalpramaan.local / Demo@12345"
