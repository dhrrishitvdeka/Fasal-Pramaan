$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (Test-Path (Join-Path $PSScriptRoot ".env")) {
  Copy-Item (Join-Path $PSScriptRoot ".env") (Join-Path $root ".env") -Force
} elseif (-not (Test-Path (Join-Path $root ".env"))) {
  Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
}

Write-Host "Starting local Docker stack from $root"
powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\start-portable.ps1")
